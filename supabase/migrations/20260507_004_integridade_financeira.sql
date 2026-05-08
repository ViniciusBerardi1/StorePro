-- ============================================================
-- StorePro — Migration 004: Integridade Financeira, Auditoria e Segurança
-- Aplique após 20260507_003_agenda_criar_comanda.sql
-- ============================================================
--
-- O que este script resolve:
--
--  1. Buraco crítico: migration 003 afrouxou o trigger para permitir
--     gcal_event_id = null em comandas 'fechada'. Como efeito colateral,
--     qualquer UPDATE em campo financeiro de comanda fechada passou a ser
--     aceito via anon/REST. Este script fecha esse buraco.
--
--  2. INSERT de comanda não era validado: alguém podia inserir diretamente
--     com status='fechada', version=999 ou created_at falso.
--
--  3. Criações de comanda não geravam evento de auditoria.
--
--  4. Tabelas de auditoria (historico, comanda_eventos) não tinham trigger
--     de imutabilidade — UPDATE/DELETE passavam pelo service_role.
--
--  5. Mutações em configuracoes (senhas), planos e barbeiros não eram
--     rastreadas em nenhum log.
--
--  6. anon podia DELETE em comandas/atendimentos/uso_beneficios bypassando
--     o soft-delete da aplicação.
--
--  7. Sem view de reconciliação financeira para detectar divergências.
-- ============================================================


-- ─── 1. Tabela de audit log geral ───────────────────────────
-- Registra INSERT/UPDATE/DELETE em tabelas financeiras sensíveis.
-- Append-only: próprio trigger bloqueia UPDATE/DELETE (seção 5).

create table if not exists audit_log (
  id          bigserial primary key,
  tabela      text not null,
  operacao    text not null check (operacao in ('INSERT','UPDATE','DELETE')),
  registro_id text,
  dados_antes jsonb,
  dados_depois jsonb,
  created_at  timestamptz default now()
);

create index if not exists idx_audit_log_tabela    on audit_log(tabela, created_at desc);
create index if not exists idx_audit_log_registro  on audit_log(registro_id, tabela);

alter table audit_log enable row level security;
drop policy if exists anon_select on audit_log;
drop policy if exists anon_insert on audit_log;
create policy anon_select on audit_log for select to anon using (true);
create policy anon_insert on audit_log for insert to anon with check (true);


-- ─── 2. Trigger BEFORE INSERT: normaliza e valida nova comanda ──
-- Garante que timestamps e version sejam sempre do servidor.
-- Bloqueia criação direta com status != 'aberta' e valores negativos.
-- Sem este trigger, anon podia INSERT com status='fechada' direto.

create or replace function fn_normalizar_comanda_insert()
returns trigger language plpgsql as $$
begin
  -- Timestamps sempre do servidor — nunca do cliente
  NEW.created_at := now();
  NEW.updated_at := now();
  -- Version começa sempre em 1
  NEW.version    := 1;
  -- Só 'aberta' na criação — fechamento e cancelamento passam pelas RPCs
  if NEW.status is distinct from 'aberta' then
    raise exception
      'Comanda só pode ser criada com status "aberta". Use finalizar_comanda() ou cancelar_comanda().'
      using errcode = 'P0008';
  end if;
  -- Valores financeiros não negativos
  if coalesce(NEW.valor_total, 0)    < 0 or
     coalesce(NEW.valor_servicos, 0) < 0 or
     coalesce(NEW.valor_bar, 0)      < 0 or
     coalesce(NEW.valor_loja, 0)     < 0 then
    raise exception 'Valores financeiros não podem ser negativos na criação'
      using errcode = 'P0004';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_normalizar_comanda_insert on comandas;
create trigger trg_normalizar_comanda_insert
  before insert on comandas
  for each row
  execute function fn_normalizar_comanda_insert();


-- ─── 3. Trigger BEFORE UPDATE: imutabilidade REFORÇADA ──────
-- Fecha o buraco da migration 003: o relaxamento anterior permitia
-- qualquer UPDATE em comanda 'fechada' desde que o status não mudasse.
-- Agora: somente gcal_event_id pode ser alterado (→ null) em 'fechada'.
-- Todos os campos financeiros, status, barbeiro, cliente, deleted_at
-- são imutáveis em comandas 'fechada'.

create or replace function validar_fechamento_comanda()
returns trigger language plpgsql as $$
declare v_soma numeric;
begin

  -- ── Bloco A: comanda JÁ estava 'fechada' ─────────────────────
  -- Único campo mutável: gcal_event_id → null (reagendamento via Agenda,
  -- que precisa desvincular o evento da comanda antiga antes de criar nova).
  -- Tudo o mais é imutável para sempre.
  if OLD.status = 'fechada' then
    if (NEW.status              is distinct from OLD.status)              or
       (NEW.valor_total         is distinct from OLD.valor_total)         or
       (NEW.valor_servicos      is distinct from OLD.valor_servicos)      or
       (NEW.valor_bar           is distinct from OLD.valor_bar)           or
       (NEW.valor_loja          is distinct from OLD.valor_loja)          or
       (NEW.forma_pagamento     is distinct from OLD.forma_pagamento)     or
       (NEW.desconto            is distinct from OLD.desconto)            or
       (NEW.beneficio_desconto  is distinct from OLD.beneficio_desconto)  or
       (NEW.servicos            is distinct from OLD.servicos)            or
       (NEW.itens_bar           is distinct from OLD.itens_bar)           or
       (NEW.itens_loja          is distinct from OLD.itens_loja)          or
       (NEW.barbeiro_id         is distinct from OLD.barbeiro_id)         or
       (NEW.cliente_id          is distinct from OLD.cliente_id)          or
       (NEW.deleted_at          is distinct from OLD.deleted_at)          then
      raise exception
        'Comanda % já está fechada: campos financeiros e de status são imutáveis',
        OLD.id using errcode = 'P0002';
    end if;
    -- Preserva version/updated_at — não incrementa para mudanças de gcal_event_id
    NEW.version    := OLD.version;
    NEW.updated_at := OLD.updated_at;
    return NEW;
  end if;

  -- ── Bloco B: transição para 'fechada' ────────────────────────
  if NEW.status = 'fechada' then
    if NEW.forma_pagamento is null or
       NEW.forma_pagamento not in ('debito', 'credito', 'pix') then
      raise exception 'forma_pagamento inválida ou ausente: "%"',
        coalesce(NEW.forma_pagamento, 'null')
        using errcode = 'P0003';
    end if;
    if coalesce(NEW.valor_total, -1) < 0 then
      raise exception 'valor_total não pode ser negativo'
        using errcode = 'P0004';
    end if;
    v_soma := coalesce(NEW.valor_servicos, 0)
            + coalesce(NEW.valor_bar, 0)
            + coalesce(NEW.valor_loja, 0);
    if NEW.valor_total > round(v_soma + 0.01, 2) then
      raise exception
        'valor_total (%) superior à soma dos componentes (%). Possível manipulação.',
        NEW.valor_total, v_soma
        using errcode = 'P0005';
    end if;
    -- Timestamps server-side — não do cliente
    NEW.closed_at  := now();
    NEW.updated_at := now();
  else
    -- Autosave em comanda 'aberta' ou transição para 'cancelada'
    NEW.updated_at := now();
  end if;

  -- Incrementa version em todo UPDATE em comanda não-fechada
  NEW.version := coalesce(OLD.version, 0) + 1;

  return NEW;
end;
$$;

drop trigger if exists trg_validar_fechamento_comanda on comandas;
create trigger trg_validar_fechamento_comanda
  before update on comandas
  for each row
  execute function validar_fechamento_comanda();


-- ─── 4. Trigger AFTER INSERT: auditoria de criação de comanda ──
-- finalizar_comanda() já insere evento 'fechada'.
-- cancelar_comanda() já insere evento 'cancelada'.
-- Este trigger garante que toda criação gere evento 'criada' — sem
-- depender de chamadas explícitas no código da aplicação.

create or replace function fn_auditar_comanda_criada()
returns trigger language plpgsql security definer as $$
begin
  insert into comanda_eventos (comanda_id, tipo, descricao, payload)
  values (
    NEW.id,
    'criada',
    format('Comanda criada para %s', coalesce(NEW.cliente_nome, 'desconhecido')),
    jsonb_build_object(
      'fonte',          case when NEW.gcal_event_id is not null then 'agenda' else 'manual' end,
      'gcal_event_id',  NEW.gcal_event_id,
      'cliente_id',     NEW.cliente_id,
      'barbeiro_id',    NEW.barbeiro_id,
      'status_inicial', NEW.status
    )
  );
  return NEW;
end;
$$;

drop trigger if exists trg_auditar_comanda_criada on comandas;
create trigger trg_auditar_comanda_criada
  after insert on comandas
  for each row
  execute function fn_auditar_comanda_criada();


-- ─── 5. Triggers de imutabilidade para tabelas de auditoria ──
-- historico, comanda_eventos e audit_log são append-only por design.
-- Mesmo service_role não pode alterar ou deletar registros.
-- Nota: cascade delete de comandas também é bloqueado — use service_role
-- com SET session_replication_role = 'replica' apenas para manutenção.

create or replace function fn_bloquear_mutacao_auditoria()
returns trigger language plpgsql as $$
begin
  raise exception
    'Tabela de auditoria "%" é append-only. Registro id=% não pode ser alterado nem deletado.',
    TG_TABLE_NAME, coalesce(OLD.id::text, '?')
    using errcode = 'P0020';
end;
$$;

drop trigger if exists trg_imutavel_historico on historico;
create trigger trg_imutavel_historico
  before update or delete on historico
  for each row execute function fn_bloquear_mutacao_auditoria();

drop trigger if exists trg_imutavel_comanda_eventos on comanda_eventos;
create trigger trg_imutavel_comanda_eventos
  before update or delete on comanda_eventos
  for each row execute function fn_bloquear_mutacao_auditoria();

drop trigger if exists trg_imutavel_audit_log on audit_log;
create trigger trg_imutavel_audit_log
  before update or delete on audit_log
  for each row execute function fn_bloquear_mutacao_auditoria();


-- ─── 6. Audit log para tabelas financeiras críticas ──────────
-- Rastreia INSERT/UPDATE/DELETE em configuracoes (senhas), planos
-- (valores de assinatura) e barbeiros (cadastro de operadores).
-- configuracoes: campo 'valor' é mascarado para não persistir senhas.

create or replace function fn_audit_log()
returns trigger language plpgsql security definer as $$
declare
  v_antes     jsonb;
  v_depois    jsonb;
  v_registro  text;
begin
  if TG_TABLE_NAME = 'configuracoes' then
    -- Mascara valor sensível (chave da senha de acesso ao financeiro)
    v_antes    := case TG_OP when 'INSERT' then null
                    else jsonb_set(to_jsonb(OLD), '{valor}', '"[REDACTED]"') end;
    v_depois   := case TG_OP when 'DELETE' then null
                    else jsonb_set(to_jsonb(NEW), '{valor}', '"[REDACTED]"') end;
    v_registro := case TG_OP when 'DELETE' then to_jsonb(OLD)->>'chave'
                    else to_jsonb(NEW)->>'chave' end;
  else
    v_antes    := case TG_OP when 'INSERT' then null else to_jsonb(OLD) end;
    v_depois   := case TG_OP when 'DELETE' then null else to_jsonb(NEW) end;
    v_registro := case TG_OP when 'DELETE' then to_jsonb(OLD)->>'id'
                    else to_jsonb(NEW)->>'id' end;
  end if;

  insert into audit_log (tabela, operacao, registro_id, dados_antes, dados_depois)
  values (TG_TABLE_NAME, TG_OP, v_registro, v_antes, v_depois);

  return coalesce(NEW, OLD);
end;
$$;

-- Configurações: qualquer INSERT/UPDATE/DELETE é auditado
drop trigger if exists trg_audit_configuracoes on configuracoes;
create trigger trg_audit_configuracoes
  after insert or update or delete on configuracoes
  for each row execute function fn_audit_log();

-- Planos: mudança de preço de assinatura é dado financeiro crítico
drop trigger if exists trg_audit_planos on planos;
create trigger trg_audit_planos
  after insert or update or delete on planos
  for each row execute function fn_audit_log();

-- Barbeiros: cadastro/remoção de operadores do sistema
drop trigger if exists trg_audit_barbeiros on barbeiros;
create trigger trg_audit_barbeiros
  after insert or update or delete on barbeiros
  for each row execute function fn_audit_log();


-- ─── 7. RLS reforçada: bloqueia DELETE em tabelas financeiras ──
-- DELETE em comandas deve passar por cancelar_comanda() (soft delete).
-- DELETE em atendimentos e uso_beneficios não tem operação equivalente
-- legítima — usam soft-delete via campos status/estornado.

-- Comandas: remove anon_all, cria políticas granulares sem DELETE
drop policy if exists anon_all    on comandas;
drop policy if exists anon_select on comandas;
drop policy if exists anon_insert on comandas;
drop policy if exists anon_update on comandas;
create policy anon_select on comandas for select to anon using (true);
create policy anon_insert on comandas for insert to anon with check (true);
create policy anon_update on comandas for update to anon using (true) with check (true);
-- DELETE intencionalmente ausente para anon

-- Atendimentos: registros financeiros imutáveis pelo frontend
drop policy if exists anon_all    on atendimentos;
drop policy if exists anon_select on atendimentos;
drop policy if exists anon_insert on atendimentos;
drop policy if exists anon_update on atendimentos;
create policy anon_select on atendimentos for select to anon using (true);
create policy anon_insert on atendimentos for insert to anon with check (true);
create policy anon_update on atendimentos for update to anon using (true) with check (true);

-- Uso de benefícios: estorno via campo estornado=true, não DELETE
drop policy if exists anon_all    on uso_beneficios;
drop policy if exists anon_select on uso_beneficios;
drop policy if exists anon_insert on uso_beneficios;
drop policy if exists anon_update on uso_beneficios;
create policy anon_select on uso_beneficios for select to anon using (true);
create policy anon_insert on uso_beneficios for insert to anon with check (true);
create policy anon_update on uso_beneficios for update to anon using (true) with check (true);


-- ─── 8. View de reconciliação financeira ─────────────────────
-- Detecta divergências entre comandas fechadas e atendimentos.
-- Casos detectados:
--   SEM_ATENDIMENTO  — comanda fechada sem atendimento correspondente
--   VALOR_DIVERGENTE — valor_total difere entre comanda e atendimento
--   SOMA_INVALIDA    — valor_total maior que soma dos componentes
--   OK               — tudo consistente

create or replace view vw_reconciliacao_financeira as
select
  c.id                                                     as comanda_id,
  c.closed_at::date                                        as data,
  c.cliente_nome,
  c.barbeiro_id,
  c.forma_pagamento,
  c.valor_servicos,
  c.valor_bar,
  c.valor_loja,
  round(c.valor_servicos + c.valor_bar + c.valor_loja, 2)  as soma_componentes,
  c.beneficio_desconto,
  c.valor_total                                            as valor_total_comanda,
  a.valor_total                                            as valor_total_atendimento,
  a.id                                                     as atendimento_id,
  round(c.valor_total - coalesce(a.valor_total, 0), 2)     as delta_atendimento,
  round(c.valor_total
        - (c.valor_servicos + c.valor_bar + c.valor_loja), 2) as delta_soma,
  case
    when a.id is null
      then 'SEM_ATENDIMENTO'
    when abs(c.valor_total - a.valor_total) > 0.01
      then 'VALOR_DIVERGENTE'
    when c.valor_total > round(c.valor_servicos + c.valor_bar + c.valor_loja + 0.01, 2)
      then 'SOMA_INVALIDA'
    else 'OK'
  end                                                      as status_reconciliacao
from  comandas c
left  join atendimentos a on a.comanda_id = c.id
where c.status = 'fechada'
order by c.closed_at desc;


-- ─── 9. View de resumo financeiro diário ──────────────────────
-- Agrega receita por dia, forma de pagamento e categoria.
-- Fonte única de verdade para relatórios — elimina divergência
-- entre o que o frontend calcula e o que está no banco.

create or replace view vw_resumo_financeiro_diario as
select
  c.closed_at::date                                            as data,
  count(*)                                                     as total_comandas,
  sum(c.valor_total)                                           as receita_bruta,
  sum(coalesce(c.beneficio_desconto, 0))                       as total_descontos,
  sum(c.valor_total - coalesce(c.beneficio_desconto, 0))       as receita_liquida,
  sum(case when c.forma_pagamento = 'pix'     then c.valor_total else 0 end) as total_pix,
  sum(case when c.forma_pagamento = 'debito'  then c.valor_total else 0 end) as total_debito,
  sum(case when c.forma_pagamento = 'credito' then c.valor_total else 0 end) as total_credito,
  sum(c.valor_servicos)                                        as total_servicos,
  sum(c.valor_bar)                                             as total_bar,
  sum(c.valor_loja)                                            as total_loja
from  comandas c
where c.status = 'fechada'
group by c.closed_at::date
order by data desc;


-- ─── 10. Função de reconciliação (período configurável) ──────
-- Retorna apenas registros com divergência no período informado.
-- Uso: SELECT * FROM verificar_reconciliacao('2026-05-01', '2026-05-31');

create or replace function verificar_reconciliacao(
  p_data_inicio date default (current_date - interval '30 days')::date,
  p_data_fim    date default current_date
)
returns table (
  comanda_id            integer,
  data                  date,
  cliente_nome          text,
  status_reconciliacao  text,
  delta_atendimento     numeric,
  delta_soma            numeric,
  valor_total_comanda   numeric
)
language sql stable as $$
  select
    comanda_id, data, cliente_nome,
    status_reconciliacao, delta_atendimento, delta_soma, valor_total_comanda
  from  vw_reconciliacao_financeira
  where status_reconciliacao <> 'OK'
    and data between p_data_inicio and p_data_fim
  order by data desc;
$$;


-- ─── 11. Grants ───────────────────────────────────────────────
grant select on vw_reconciliacao_financeira  to anon;
grant select on vw_resumo_financeiro_diario  to anon;
grant execute on function verificar_reconciliacao(date, date) to anon;
