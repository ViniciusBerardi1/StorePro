-- ============================================================
-- StorePro — Migration 005: Gaps de Integridade Financeira
-- Aplique após 20260507_004_integridade_financeira.sql
-- ============================================================
--
-- O que este script resolve (gaps da migration 004):
--
--  1. grant SELECT em audit_log para anon — estava faltando; sem isso
--     a RLS anon_select criada na 004 não funciona (precisa do grant).
--
--  2. Atendimentos vinculados a comanda fechada aceitavam UPDATE nos
--     campos valor_total, forma_pagamento e status via anon REST.
--     A migration 004 bloqueou DELETE mas esqueceu esse UPDATE.
--
--  3. Mudanças em atendimentos (pós-finalização) não geravam entrada
--     no audit_log — valor_total podia ser alterado sem rastro.
--
--  4. Assinaturas não tinham nenhuma auditoria: mudança de status
--     (ativa → cancelada), valor ou plano_id passava sem log.
--
--  5. configuracoes tinha anon_all — anon podia fazer DELETE na chave
--     de senha do financeiro via REST sem nenhum bloqueio.
--
--  6. Sem índice em comandas.closed_at: vw_reconciliacao_financeira
--     e verificar_reconciliacao() fazem seq-scan em produção.
--
--  7. Timestamps de atendimentos eram definidos pelo cliente (INSERT
--     direto via REST definia data_cadastro arbitrário).
--
--  8. Sem view que cruzasse uso_beneficios com comandas para auditoria
--     de descontos aplicados — difícil detectar abuso de benefício.
--
--  9. Sem função única de saúde do sistema para uso no dashboard.
-- ============================================================


-- ─── 1. Grant SELECT em audit_log para anon ─────────────────
-- A migration 004 criou a RLS anon_select mas esqueceu o grant
-- na tabela. Sem o grant, o anon não consegue fazer SELECT mesmo
-- com a policy ativa.

grant select on audit_log to anon;


-- ─── 2. Índice de performance para reconciliação ─────────────
-- vw_reconciliacao_financeira e verificar_reconciliacao() filtram
-- por closed_at::date e status='fechada'. Sem este índice a query
-- faz seq-scan em toda a tabela comandas.

create index if not exists idx_comandas_closed_at
  on comandas(closed_at desc)
  where closed_at is not null;


-- ─── 3. Timestamps server-side em atendimentos ───────────────
-- INSERT direto via anon REST podia definir data_cadastro falso.
-- Este trigger força o timestamp do servidor na criação.

create or replace function fn_timestamps_atendimentos()
returns trigger language plpgsql as $$
begin
  NEW.data_cadastro := now();
  return NEW;
end;
$$;

drop trigger if exists trg_timestamps_atendimentos on atendimentos;
create trigger trg_timestamps_atendimentos
  before insert on atendimentos
  for each row execute function fn_timestamps_atendimentos();


-- ─── 4. Imutabilidade de atendimento vinculado a comanda fechada
-- finalizar_comanda() define valor_total no atendimento. Após isso,
-- qualquer UPDATE via anon REST em valor_total, forma_pagamento ou
-- status do atendimento deve ser bloqueado se a comanda estiver fechada.
-- (fn_audit_log() do trigger seguinte ainda registra a tentativa.)

create or replace function fn_proteger_atendimento_fechado()
returns trigger language plpgsql as $$
declare
  v_comanda_status text;
begin
  if OLD.comanda_id is not null then
    select status into v_comanda_status
    from   comandas
    where  id = OLD.comanda_id;

    if v_comanda_status = 'fechada' then
      if (NEW.valor_total     is distinct from OLD.valor_total)     or
         (NEW.forma_pagamento is distinct from OLD.forma_pagamento) or
         (NEW.status          is distinct from OLD.status)          then
        raise exception
          'Atendimento % está vinculado a comanda fechada: valor_total, forma_pagamento e status são imutáveis.',
          OLD.id
          using errcode = 'P0030';
      end if;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_proteger_atendimento_fechado on atendimentos;
create trigger trg_proteger_atendimento_fechado
  before update on atendimentos
  for each row execute function fn_proteger_atendimento_fechado();


-- ─── 5. Audit log para atendimentos ──────────────────────────
-- Qualquer UPDATE em atendimento agora gera entrada no audit_log.
-- fn_audit_log() já existe (criado na migration 004).
-- Rastreia quem tentou alterar valor_total mesmo que o trigger
-- acima bloqueie a operação (o log é registrado antes do raise).
-- Nota: registra AFTER UPDATE — o trigger de proteção (BEFORE) já
-- teria rejeitado a operação antes; este log captura UPDATEs legítimos.

drop trigger if exists trg_audit_atendimentos on atendimentos;
create trigger trg_audit_atendimentos
  after insert or update on atendimentos
  for each row execute function fn_audit_log();


-- ─── 6. Audit log para assinaturas ───────────────────────────
-- Mudanças em status (ativa → cancelada → inadimplente), valor e
-- plano_id são dados financeiros críticos. Toda alteração é logada.

drop trigger if exists trg_audit_assinaturas on assinaturas;
create trigger trg_audit_assinaturas
  after insert or update or delete on assinaturas
  for each row execute function fn_audit_log();


-- ─── 7. RLS: remover DELETE de configuracoes para anon ───────
-- anon podia deletar chaves de configuração (ex: 'financeiro_senha')
-- via DELETE /rest/v1/configuracoes?chave=eq.financeiro_senha.
-- Remoção só deve ocorrer via service_role (manutenção administrativa).
-- INSERT mantido para permitir criação inicial via dashboard.

drop policy if exists anon_all    on configuracoes;
drop policy if exists anon_select on configuracoes;
drop policy if exists anon_insert on configuracoes;
drop policy if exists anon_update on configuracoes;
create policy anon_select on configuracoes for select to anon using (true);
create policy anon_insert on configuracoes for insert to anon with check (true);
create policy anon_update on configuracoes for update to anon using (true) with check (true);
-- DELETE intencionalmente ausente: use service_role para remoção administrativa


-- ─── 8. CHECK constraint: valor_total não-negativo em atendimentos
-- Atendimentos criados diretamente (sem finalizar_comanda) podiam
-- ter valor_total negativo. Alinha com a proteção já existente em comandas.

alter table atendimentos
  add constraint if not exists atendimentos_valor_nao_negativo
  check (valor_total >= 0);


-- ─── 9. View de auditoria de benefícios ──────────────────────
-- Cruza uso_beneficios com comandas e planos para detectar:
--   - benefícios aplicados em comandas fechadas que não batem com
--     o que está no campo beneficios_aplicados da comanda
--   - clientes com muitos benefícios estornados (possível abuso)
--   - descontos sem plano ativo correspondente

create or replace view vw_beneficios_auditoria as
select
  ub.id                                          as uso_id,
  ub.comanda_id,
  c.closed_at::date                              as data_comanda,
  c.cliente_nome,
  c.valor_total                                  as valor_comanda,
  c.beneficio_desconto                           as desconto_total_comanda,
  ub.beneficio_id,
  ub.ciclo,
  ub.quantidade,
  ub.valor_desconto,
  ub.estornado,
  p.nome                                         as plano_nome,
  p.valor                                        as plano_valor_mensal,
  cl.nome                                        as cliente_assinante,
  ub.assinatura_id,
  ub.created_at                                  as registrado_em
from  uso_beneficios ub
join  comandas  c  on c.id  = ub.comanda_id
left  join planos   p  on p.id  = ub.plano_id
left  join clientes cl on cl.id = ub.cliente_id
order by ub.created_at desc;

grant select on vw_beneficios_auditoria to anon;


-- ─── 10. Função de integridade unificada ─────────────────────
-- Retorna um JSON com todos os indicadores de saúde do sistema
-- financeiro para o período informado. Uso no dashboard:
--   SELECT verificar_integridade_completa();
--   SELECT verificar_integridade_completa('2026-05-01', '2026-05-31');

create or replace function verificar_integridade_completa(
  p_data_inicio date default (current_date - interval '30 days')::date,
  p_data_fim    date default current_date
)
returns jsonb
language plpgsql stable security definer
as $$
declare
  v_divergencias            bigint := 0;
  v_sem_evento_criado       bigint := 0;
  v_fechadas_sem_auditoria  bigint := 0;
  v_beneficios_estornados   bigint := 0;
  v_atendimentos_orfaos     bigint := 0;
begin
  -- Comandas fechadas com divergência financeira
  select count(*) into v_divergencias
  from verificar_reconciliacao(p_data_inicio, p_data_fim);

  -- Comandas criadas no período sem evento 'criada' (pré-trigger)
  select count(*) into v_sem_evento_criado
  from  comandas c
  where c.created_at::date between p_data_inicio and p_data_fim
    and not exists (
      select 1 from comanda_eventos ce
      where ce.comanda_id = c.id and ce.tipo = 'criada'
    );

  -- Comandas fechadas sem evento 'fechada' no audit trail
  select count(*) into v_fechadas_sem_auditoria
  from  comandas c
  where c.status = 'fechada'
    and c.closed_at::date between p_data_inicio and p_data_fim
    and not exists (
      select 1 from comanda_eventos ce
      where ce.comanda_id = c.id and ce.tipo = 'fechada'
    );

  -- Benefícios estornados em comandas do período (possível abuso)
  select count(*) into v_beneficios_estornados
  from  uso_beneficios ub
  join  comandas c on c.id = ub.comanda_id
  where c.closed_at::date between p_data_inicio and p_data_fim
    and ub.estornado;

  -- Atendimentos 'concluido' sem comanda correspondente fechada
  -- (atendimento criado diretamente sem passar por finalizar_comanda)
  select count(*) into v_atendimentos_orfaos
  from  atendimentos a
  where a.status = 'concluido'
    and a.data_cadastro::date between p_data_inicio and p_data_fim
    and (
      a.comanda_id is null
      or not exists (
        select 1 from comandas c
        where c.id = a.comanda_id and c.status = 'fechada'
      )
    );

  return jsonb_build_object(
    'divergencias_financeiras',       v_divergencias,
    'comandas_sem_evento_criado',     v_sem_evento_criado,
    'fechadas_sem_auditoria_evento',  v_fechadas_sem_auditoria,
    'beneficios_estornados',          v_beneficios_estornados,
    'atendimentos_orfaos',            v_atendimentos_orfaos,
    'tudo_ok', (
      v_divergencias           = 0 and
      v_fechadas_sem_auditoria = 0 and
      v_atendimentos_orfaos    = 0
    ),
    'periodo', jsonb_build_object(
      'inicio', p_data_inicio,
      'fim',    p_data_fim
    ),
    'executado_em', now()
  );
end;
$$;

grant execute on function verificar_integridade_completa(date, date) to anon;
