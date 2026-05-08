-- ============================================================
-- StorePro — Schema Supabase (fonte única de verdade)
-- Execute este arquivo para criar o banco do zero.
-- Para bancos existentes, rode as migrations em ordem:
--   supabase/migrations/20260507_00X_*.sql
-- ============================================================

-- ─── Categorias ──────────────────────────────────────────────
create table if not exists categorias (
  id         serial primary key,
  nome       text not null,
  created_at timestamptz default now()
);

insert into categorias (nome) values
  ('Eletrônicos'), ('Roupas'), ('Calçados'),
  ('Alimentos'), ('Higiene'), ('Outros')
on conflict do nothing;

-- ─── Produtos ────────────────────────────────────────────────
create table if not exists produtos (
  id                 serial primary key,
  nome               text not null,
  categoria_id       integer references categorias(id) on delete set null,
  quantidade         integer default 0,
  estoque_minimo     integer default 1,
  preco_custo        numeric(10,2),
  preco_venda        numeric(10,2),
  tem_cor            boolean default false,
  cor                text,
  tem_tamanho        boolean default false,
  tamanho_quantidade text,
  tamanho_unidade    text,
  foto               text,
  tipo               text default 'loja' check (tipo in ('bar', 'loja')),
  data_cadastro      timestamptz default now()
);

create index if not exists produtos_categoria_idx on produtos(categoria_id);

-- ─── Clientes ────────────────────────────────────────────────
create table if not exists clientes (
  id            serial primary key,
  nome          text not null,
  telefone      text,
  email         text,
  observacoes   text,
  data_cadastro timestamptz default now()
);

create index if not exists clientes_nome_idx on clientes(nome);

-- ─── Serviços ────────────────────────────────────────────────
create table if not exists servicos (
  id               bigserial primary key,
  nome             text not null,
  valor            numeric(10,2) not null default 0,
  ativo            boolean not null default true,
  duracao_minutos  integer default 30,
  created_at       timestamptz default now()
);

-- ─── Barbeiros ───────────────────────────────────────────────
create table if not exists barbeiros (
  id            serial primary key,
  nome          text not null,
  gcal_color_id text not null default '9',
  ativo         boolean not null default true,
  created_at    timestamptz default now()
);

-- ─── Configurações ───────────────────────────────────────────
-- Senhas: INSERT INTO configuracoes (chave, valor) VALUES ('financeiro_senha', 'xxx');
create table if not exists configuracoes (
  chave text primary key,
  valor text not null
);

-- ─── Atendimentos ────────────────────────────────────────────
create table if not exists atendimentos (
  id              serial primary key,
  gcal_event_id   text unique,
  comanda_id      integer,   -- FK adicionada após comandas (ver abaixo)
  data_hora       timestamptz not null,
  cliente_nome    text,
  cliente_id      integer references clientes(id) on delete set null,
  barbeiro_id     integer references barbeiros(id) on delete set null,
  servicos        jsonb default '[]',
  valor_total     numeric(10,2) default 0 check (valor_total >= 0),
  status          text default 'agendado'
                    check (status in ('agendado','em_andamento','concluido','cancelado')),
  forma_pagamento text check (forma_pagamento in ('debito','credito','pix')),
  observacoes     text,
  data_cadastro   timestamptz default now()
);

create index if not exists atendimentos_data_idx    on atendimentos(data_hora);
create index if not exists atendimentos_status_idx  on atendimentos(status);
create index if not exists atendimentos_cliente_idx on atendimentos(cliente_id);

-- ─── Histórico de estoque ────────────────────────────────────
create table if not exists historico (
  id                  serial primary key,
  produto_id          integer,
  produto_nome        text,
  produto_cor         text,
  categoria_nome      text,
  foto                text,
  tipo                text default 'zerado',
  quantidade_anterior integer,
  quantidade_nova     integer,
  data_zerado         timestamptz default now(),
  data_reposto        timestamptz,
  quantidade_reposta  integer
);

-- ─── Planos de assinatura ────────────────────────────────────
create table if not exists planos (
  id           serial primary key,
  nome         text not null,
  valor        numeric(10,2) not null default 0,
  intervalo    text not null default 'mensal'
               check (intervalo in ('semanal','mensal','trimestral','anual')),
  descricao    text,
  checkout_url text,
  beneficios   jsonb not null default '[]',
  ativo        boolean not null default true,
  created_at   timestamptz default now()
);

-- ─── Assinaturas ─────────────────────────────────────────────
create table if not exists assinaturas (
  id                      serial primary key,
  cliente_id              integer references clientes(id) on delete cascade,
  plano_id                integer references planos(id) on delete set null,
  barbeiro_id             integer references barbeiros(id) on delete set null,
  status                  text not null default 'pendente'
                          check (status in ('ativa','pendente','cancelada','inadimplente','expirada')),
  gateway                 text,
  gateway_customer_id     text,
  gateway_subscription_id text,
  data_inicio             date,
  data_renovacao          date,
  valor                   numeric(10,2),
  observacoes             text,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

create index if not exists assinaturas_cliente_idx on assinaturas(cliente_id);
create index if not exists assinaturas_status_idx  on assinaturas(status);

-- ─── Uso de benefícios (controle mensal) ─────────────────────
create table if not exists uso_beneficios (
  id             bigserial primary key,
  assinatura_id  bigint references assinaturas(id) on delete cascade,
  cliente_id     bigint references clientes(id)    on delete set null,
  plano_id       bigint references planos(id)      on delete set null,
  comanda_id     bigint,
  ciclo          text not null,         -- 'YYYY-MM'
  beneficio_id   text not null,         -- UUID do planos.beneficios[].id
  quantidade     integer not null default 1,
  valor_desconto numeric(10,2),
  estornado      boolean not null default false,
  created_at     timestamptz default now()
);

create index if not exists idx_uso_beneficios_lookup
  on uso_beneficios(assinatura_id, ciclo);

-- Impede que o mesmo benefício seja aplicado duas vezes na mesma comanda
create unique index if not exists idx_uso_beneficios_comanda_unico
  on uso_beneficios(comanda_id, beneficio_id)
  where comanda_id is not null and not estornado;

-- ─── Comandas ────────────────────────────────────────────────
create table if not exists comandas (
  id                   serial primary key,
  atendimento_id       integer references atendimentos(id) on delete set null,
  gcal_event_id        text unique,
  cliente_nome         text,
  cliente_id           integer references clientes(id) on delete set null,
  barbeiro_id          integer references barbeiros(id) on delete set null,
  evento_gcal          jsonb,
  servicos             jsonb default '[]',
  itens_bar            jsonb default '[]',
  itens_loja           jsonb default '[]',
  valor_servicos       numeric(10,2) default 0,
  valor_bar            numeric(10,2) default 0,
  valor_loja           numeric(10,2) default 0,
  valor_total          numeric(10,2) default 0,
  desconto             jsonb,
  beneficio_desconto   numeric(10,2) default 0,
  beneficios_aplicados jsonb default '[]',
  forma_pagamento      text check (forma_pagamento in ('debito','credito','pix')),
  status               text default 'aberta'
                       check (status in ('aberta','fechada','cancelada')),
  created_at           timestamptz default now(),
  updated_at           timestamptz default now(),
  closed_at            timestamptz,
  deleted_at           timestamptz,
  deleted_reason       text,
  version              integer not null default 1
);

create index if not exists idx_comandas_status    on comandas(status, created_at desc);
create index if not exists idx_comandas_cliente   on comandas(cliente_id);
create index if not exists idx_comandas_closed_at on comandas(closed_at desc)
  where closed_at is not null;

-- FK circular: atendimentos.comanda_id → comandas.id
alter table atendimentos
  add constraint if not exists atendimentos_comanda_fk
  foreign key (comanda_id) references comandas(id) on delete set null;

create unique index if not exists idx_atendimentos_comanda
  on atendimentos(comanda_id)
  where comanda_id is not null;

-- ─── Eventos de auditoria das comandas ───────────────────────
-- Append-only. Trigger fn_bloquear_mutacao_auditoria() impede UPDATE/DELETE.
create table if not exists comanda_eventos (
  id          bigserial primary key,
  comanda_id  integer not null references comandas(id) on delete cascade,
  tipo        text not null,   -- 'criada' | 'fechada' | 'cancelada'
  descricao   text,
  payload     jsonb,
  created_at  timestamptz default now()
);

create index if not exists idx_comanda_eventos_comanda
  on comanda_eventos(comanda_id, created_at desc);

-- ─── Log de webhooks de pagamento ────────────────────────────
create table if not exists webhook_logs (
  id         serial primary key,
  gateway    text,
  evento     text,
  payload    jsonb,
  processado boolean default false,
  erro       text,
  created_at timestamptz default now()
);

-- ─── Audit log geral ─────────────────────────────────────────
-- Registra INSERT/UPDATE/DELETE em tabelas financeiras sensíveis.
-- Append-only: trigger fn_bloquear_mutacao_auditoria() bloqueia UPDATE/DELETE.
create table if not exists audit_log (
  id           bigserial primary key,
  tabela       text not null,
  operacao     text not null check (operacao in ('INSERT','UPDATE','DELETE')),
  registro_id  text,
  dados_antes  jsonb,
  dados_depois jsonb,
  created_at   timestamptz default now()
);

create index if not exists idx_audit_log_tabela   on audit_log(tabela, created_at desc);
create index if not exists idx_audit_log_registro on audit_log(registro_id, tabela);

-- ─── Horários especiais ───────────────────────────────────────
create table if not exists horarios_especiais (
  id              serial primary key,
  data            date not null unique,
  hora_abertura   text not null default '09:00',
  hora_fechamento text not null default '20:00',
  fechado         boolean not null default false,
  motivo          text,
  created_at      timestamptz default now()
);


-- ============================================================
-- FUNÇÕES E TRIGGERS
-- ============================================================

-- ─── Stored procedure: baixar estoque em batch atômico ──────
create or replace function baixar_estoque_comanda(items jsonb)
returns void language plpgsql as $$
declare
  item_rec jsonb;
  v_pid    int;
  v_qtd    int;
  v_ant    int;
  v_nov    int;
  v_nome   text;
  v_cor    text;
  v_cat    text;
  v_foto   text;
  v_tipo   text;
begin
  for item_rec in select * from jsonb_array_elements(items)
  loop
    v_pid := (item_rec->>'produto_id')::int;
    v_qtd := (item_rec->>'quantidade')::int;

    select p.quantidade, p.nome, p.cor, coalesce(c.nome,''), p.foto
    into   v_ant, v_nome, v_cor, v_cat, v_foto
    from   produtos p
    left   join categorias c on c.id = p.categoria_id
    where  p.id = v_pid
    for    update of p;

    if not found then continue; end if;

    v_ant := coalesce(v_ant, 0);
    v_nov := greatest(0, v_ant - v_qtd);

    if v_ant = v_nov then continue; end if;

    update produtos set quantidade = v_nov where id = v_pid;

    v_tipo := case
      when v_nov = 0     then 'zerado'
      when v_nov > v_ant then 'entrada'
      else                    'saida'
    end;

    insert into historico(
      produto_id, produto_nome, produto_cor, categoria_nome, foto,
      tipo, quantidade_anterior, quantidade_nova
    ) values (
      v_pid, v_nome, coalesce(v_cor,''), v_cat, v_foto,
      v_tipo, v_ant, v_nov
    );
  end loop;
end;
$$;


-- ─── Trigger BEFORE INSERT: normaliza e valida nova comanda ──
-- Garante timestamps e version server-side.
-- Bloqueia criação direta com status != 'aberta'.

create or replace function fn_normalizar_comanda_insert()
returns trigger language plpgsql as $$
begin
  NEW.created_at := now();
  NEW.updated_at := now();
  NEW.version    := 1;

  if NEW.status is distinct from 'aberta' then
    raise exception
      'Comanda só pode ser criada com status "aberta". Use finalizar_comanda() ou cancelar_comanda().'
      using errcode = 'P0008';
  end if;

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


-- ─── Trigger BEFORE UPDATE: imutabilidade de comanda fechada ─
-- Bloco A: comanda JÁ estava 'fechada' — único campo mutável é
--   gcal_event_id → null (para reagendamento via Agenda).
-- Bloco B: transição para 'fechada' — valida forma_pagamento,
--   valor_total e soma dos componentes; define timestamps server-side.
-- Bloco C: comanda 'aberta' — apenas atualiza updated_at e version.

create or replace function validar_fechamento_comanda()
returns trigger language plpgsql as $$
declare v_soma numeric;
begin

  -- ── Bloco A: já estava 'fechada' ─────────────────────────────
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
        'Comanda % já está fechada: campos financeiros e de status são imutáveis.',
        OLD.id using errcode = 'P0002';
    end if;
    -- Preserva version/updated_at — gcal_event_id pode ser nulificado
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
    -- Timestamps server-side — nunca do cliente
    NEW.closed_at  := now();
    NEW.updated_at := now();
  else
    NEW.updated_at := now();
  end if;

  NEW.version := coalesce(OLD.version, 0) + 1;
  return NEW;
end;
$$;

drop trigger if exists trg_validar_fechamento_comanda on comandas;
create trigger trg_validar_fechamento_comanda
  before update on comandas
  for each row
  execute function validar_fechamento_comanda();


-- ─── Trigger AFTER INSERT: auditoria de criação de comanda ───
-- Garante que toda criação gere evento 'criada' — sem depender
-- de chamadas explícitas no código da aplicação.

create or replace function fn_auditar_comanda_criada()
returns trigger language plpgsql security definer as $$
begin
  insert into comanda_eventos (comanda_id, tipo, descricao, payload)
  values (
    NEW.id,
    'criada',
    format('Comanda criada para %s', coalesce(NEW.cliente_nome, 'desconhecido')),
    jsonb_build_object(
      'fonte',         case when NEW.gcal_event_id is not null then 'agenda' else 'manual' end,
      'gcal_event_id', NEW.gcal_event_id,
      'cliente_id',    NEW.cliente_id,
      'barbeiro_id',   NEW.barbeiro_id,
      'status_inicial',NEW.status
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


-- ─── Triggers de imutabilidade para tabelas de auditoria ─────
-- historico, comanda_eventos e audit_log são append-only.
-- Nenhum role — incluindo service_role — pode alterar ou deletar.

create or replace function fn_bloquear_mutacao_auditoria()
returns trigger language plpgsql as $$
begin
  raise exception
    'Tabela de auditoria "%" é append-only. Registro id=% não pode ser alterado nem deletado.',
    TG_TABLE_NAME, coalesce(OLD.id::text, '?')
    using errcode = 'P0020';
end;
$$;

drop trigger if exists trg_imutavel_historico       on historico;
drop trigger if exists trg_imutavel_comanda_eventos on comanda_eventos;
drop trigger if exists trg_imutavel_audit_log       on audit_log;

create trigger trg_imutavel_historico
  before update or delete on historico
  for each row execute function fn_bloquear_mutacao_auditoria();

create trigger trg_imutavel_comanda_eventos
  before update or delete on comanda_eventos
  for each row execute function fn_bloquear_mutacao_auditoria();

create trigger trg_imutavel_audit_log
  before update or delete on audit_log
  for each row execute function fn_bloquear_mutacao_auditoria();


-- ─── Audit log para tabelas financeiras críticas ─────────────
-- configuracoes: valor mascarado (nunca persiste a senha em texto claro).
-- planos: mudança de preço de assinatura.
-- barbeiros: cadastro/remoção de operadores.
-- atendimentos: qualquer UPDATE pós-finalização.
-- assinaturas: mudança de status, valor ou plano.

create or replace function fn_audit_log()
returns trigger language plpgsql security definer as $$
declare
  v_antes    jsonb;
  v_depois   jsonb;
  v_registro text;
begin
  if TG_TABLE_NAME = 'configuracoes' then
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

drop trigger if exists trg_audit_configuracoes on configuracoes;
create trigger trg_audit_configuracoes
  after insert or update or delete on configuracoes
  for each row execute function fn_audit_log();

drop trigger if exists trg_audit_planos on planos;
create trigger trg_audit_planos
  after insert or update or delete on planos
  for each row execute function fn_audit_log();

drop trigger if exists trg_audit_barbeiros on barbeiros;
create trigger trg_audit_barbeiros
  after insert or update or delete on barbeiros
  for each row execute function fn_audit_log();

drop trigger if exists trg_audit_atendimentos on atendimentos;
create trigger trg_audit_atendimentos
  after insert or update on atendimentos
  for each row execute function fn_audit_log();

drop trigger if exists trg_audit_assinaturas on assinaturas;
create trigger trg_audit_assinaturas
  after insert or update or delete on assinaturas
  for each row execute function fn_audit_log();


-- ─── Timestamps server-side em atendimentos ──────────────────
-- INSERT direto via anon REST podia definir data_cadastro falso.

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


-- ─── Imutabilidade de atendimento vinculado a comanda fechada ─
-- Após finalizar_comanda() definir o atendimento, valor_total,
-- forma_pagamento e status não podem mais ser alterados via REST.

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
          'Atendimento % vinculado a comanda fechada: valor_total, forma_pagamento e status são imutáveis.',
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


-- ─── RPC: finalizar_comanda() — operação atômica ─────────────
-- 9 passos em uma única transação PostgreSQL:
-- lock pessimista → idempotência → optimistic locking → validações
-- → estoque → atendimento → fechar comanda → benefícios → auditoria

create or replace function finalizar_comanda(
  p_comanda_id  integer,
  p_payload     jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_comanda              comandas%rowtype;
  v_atend_id             integer;
  v_todos_itens          jsonb;
  v_servicos             jsonb;
  v_itens_bar            jsonb;
  v_itens_loja           jsonb;
  v_valor_servicos       numeric;
  v_valor_bar            numeric;
  v_valor_loja           numeric;
  v_valor_total          numeric;
  v_forma_pagamento      text;
  v_desconto             jsonb;
  v_barbeiro_id          integer;
  v_beneficio_desconto   numeric;
  v_beneficios_aplicados jsonb;
  v_beneficio_registros  jsonb;
  v_data_hora            timestamptz;
  v_observacoes          text;
  v_soma                 numeric;
  v_client_version       integer;
begin
  v_servicos             := coalesce(p_payload->'servicos',             '[]');
  v_itens_bar            := coalesce(p_payload->'itens_bar',            '[]');
  v_itens_loja           := coalesce(p_payload->'itens_loja',           '[]');
  v_valor_servicos       := coalesce((p_payload->>'valor_servicos')::numeric, 0);
  v_valor_bar            := coalesce((p_payload->>'valor_bar')::numeric,      0);
  v_valor_loja           := coalesce((p_payload->>'valor_loja')::numeric,     0);
  v_valor_total          := coalesce((p_payload->>'valor_total')::numeric,    0);
  v_forma_pagamento      := p_payload->>'forma_pagamento';
  v_desconto             := p_payload->'desconto';
  v_barbeiro_id          := nullif(p_payload->>'barbeiro_id', '')::integer;
  v_beneficio_desconto   := coalesce((p_payload->>'beneficio_desconto')::numeric, 0);
  v_beneficios_aplicados := coalesce(p_payload->'beneficios_aplicados', '[]');
  v_beneficio_registros  := coalesce(p_payload->'beneficio_registros',  '[]');
  v_data_hora            := coalesce(nullif(p_payload->>'data_hora', '')::timestamptz, now());
  v_observacoes          := coalesce(p_payload->>'observacoes', '');
  v_client_version       := nullif(p_payload->>'version', '')::integer;

  -- Passo 1: lock pessimista
  select * into v_comanda from comandas where id = p_comanda_id for update;

  if not found then
    raise exception 'Comanda % não encontrada', p_comanda_id using errcode = 'P0001';
  end if;
  if v_comanda.deleted_at is not null then
    raise exception 'Comanda % está cancelada', p_comanda_id using errcode = 'P0006';
  end if;

  -- Passo 2: idempotência
  if v_comanda.status = 'fechada' then
    select id into v_atend_id from atendimentos where comanda_id = p_comanda_id limit 1;
    return jsonb_build_object(
      'ok', true, 'idempotent', true, 'comanda_id', p_comanda_id,
      'atendimento_id', v_atend_id,
      'message', 'Comanda já fechada — resultado original retornado'
    );
  end if;

  -- Passo 3: optimistic locking
  if v_client_version is not null and v_comanda.version != v_client_version then
    raise exception
      'Conflito: comanda % foi modificada por outra sessão (version banco=%, version cliente=%). Recarregue e tente novamente.',
      p_comanda_id, v_comanda.version, v_client_version
      using errcode = 'P0010';
  end if;

  -- Passo 4: validações server-side
  if v_forma_pagamento is null or v_forma_pagamento not in ('debito','credito','pix') then
    raise exception 'forma_pagamento inválida: "%"', coalesce(v_forma_pagamento,'null')
      using errcode = 'P0003';
  end if;
  if v_valor_total < 0 then
    raise exception 'valor_total não pode ser negativo: %', v_valor_total using errcode = 'P0004';
  end if;
  v_soma := v_valor_servicos + v_valor_bar + v_valor_loja;
  if v_valor_total > round(v_soma + 0.01, 2) then
    raise exception 'valor_total (%) superior à soma dos componentes (%).',
      v_valor_total, v_soma using errcode = 'P0005';
  end if;

  -- Passo 5: baixar estoque
  v_todos_itens := (
    select coalesce(jsonb_agg(jsonb_build_object(
      'produto_id', (item->>'produto_id')::integer,
      'quantidade', (item->>'quantidade')::integer
    )), '[]'::jsonb)
    from jsonb_array_elements(v_itens_bar || v_itens_loja) as item
    where coalesce((item->>'quantidade')::integer, 0) > 0
      and (item->>'produto_id') is not null and (item->>'produto_id') <> ''
  );
  if jsonb_array_length(v_todos_itens) > 0 then
    perform baixar_estoque_comanda(v_todos_itens);
  end if;

  -- Passo 6: registrar atendimento (ON CONFLICT = idempotente)
  if v_comanda.gcal_event_id is not null then
    insert into atendimentos (
      comanda_id, gcal_event_id, data_hora, cliente_nome, cliente_id, barbeiro_id,
      servicos, valor_total, forma_pagamento, status, observacoes
    ) values (
      p_comanda_id, v_comanda.gcal_event_id, v_data_hora,
      v_comanda.cliente_nome, v_comanda.cliente_id,
      coalesce(v_barbeiro_id, v_comanda.barbeiro_id),
      v_servicos, v_valor_total, v_forma_pagamento, 'concluido', v_observacoes
    )
    on conflict (gcal_event_id) do update set
      comanda_id      = excluded.comanda_id,
      barbeiro_id     = excluded.barbeiro_id,
      servicos        = excluded.servicos,
      valor_total     = excluded.valor_total,
      forma_pagamento = excluded.forma_pagamento,
      status          = excluded.status,
      observacoes     = excluded.observacoes
    returning id into v_atend_id;
  else
    insert into atendimentos (
      comanda_id, data_hora, cliente_nome, cliente_id, barbeiro_id,
      servicos, valor_total, forma_pagamento, status
    ) values (
      p_comanda_id, v_data_hora, v_comanda.cliente_nome, v_comanda.cliente_id,
      coalesce(v_barbeiro_id, v_comanda.barbeiro_id),
      v_servicos, v_valor_total, v_forma_pagamento, 'concluido'
    )
    on conflict (comanda_id) where comanda_id is not null do update set
      barbeiro_id     = excluded.barbeiro_id,
      servicos        = excluded.servicos,
      valor_total     = excluded.valor_total,
      forma_pagamento = excluded.forma_pagamento,
      status          = excluded.status
    returning id into v_atend_id;
  end if;

  -- Passo 7: fechar comanda (trigger valida + seta closed_at/updated_at + incrementa version)
  update comandas set
    status               = 'fechada',
    atendimento_id       = v_atend_id,
    servicos             = v_servicos,
    itens_bar            = v_itens_bar,
    itens_loja           = v_itens_loja,
    valor_servicos       = v_valor_servicos,
    valor_bar            = v_valor_bar,
    valor_loja           = v_valor_loja,
    valor_total          = v_valor_total,
    forma_pagamento      = v_forma_pagamento,
    desconto             = v_desconto,
    beneficio_desconto   = v_beneficio_desconto,
    beneficios_aplicados = v_beneficios_aplicados,
    barbeiro_id          = coalesce(v_barbeiro_id, barbeiro_id)
  where id = p_comanda_id;

  -- Passo 8: uso de benefícios (ON CONFLICT DO NOTHING = idempotente)
  if jsonb_array_length(v_beneficio_registros) > 0 then
    insert into uso_beneficios (
      assinatura_id, cliente_id, plano_id, comanda_id,
      ciclo, beneficio_id, quantidade, valor_desconto
    )
    select
      nullif(r->>'assinatura_id','')::bigint,
      nullif(r->>'cliente_id','')::bigint,
      nullif(r->>'plano_id','')::bigint,
      p_comanda_id,
      r->>'ciclo',
      r->>'beneficio_id',
      coalesce(nullif(r->>'quantidade','')::integer, 1),
      nullif(r->>'valor_desconto','')::numeric
    from jsonb_array_elements(v_beneficio_registros) r
    where (r->>'beneficio_id') is not null and (r->>'beneficio_id') <> ''
    on conflict do nothing;
  end if;

  -- Passo 9: auditoria garantida (dentro da TX — nunca fire-and-forget)
  insert into comanda_eventos (comanda_id, tipo, descricao, payload)
  values (
    p_comanda_id, 'fechada',
    format('Fechada — R$ %s via %s', to_char(v_valor_total,'FM999999990.00'), v_forma_pagamento),
    jsonb_build_object(
      'valor_total',        v_valor_total,
      'valor_servicos',     v_valor_servicos,
      'valor_bar',          v_valor_bar,
      'valor_loja',         v_valor_loja,
      'forma_pagamento',    v_forma_pagamento,
      'beneficio_desconto', v_beneficio_desconto,
      'atendimento_id',     v_atend_id,
      'version_finalizado', v_comanda.version
    )
  );

  return jsonb_build_object(
    'ok', true, 'idempotent', false,
    'comanda_id', p_comanda_id, 'atendimento_id', v_atend_id, 'valor_total', v_valor_total
  );
exception
  when others then
    raise exception 'Erro ao finalizar comanda %: % (SQLSTATE %)', p_comanda_id, sqlerrm, sqlstate;
end;
$$;


-- ─── RPC: cancelar_comanda() — cancelamento atômico ──────────
create or replace function cancelar_comanda(
  p_comanda_id  integer,
  p_motivo      text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_comanda comandas%rowtype;
begin
  select * into v_comanda from comandas where id = p_comanda_id for update;

  if not found then
    raise exception 'Comanda % não encontrada', p_comanda_id using errcode = 'P0001';
  end if;
  if v_comanda.status = 'fechada' then
    raise exception 'Comanda % já foi fechada e não pode ser cancelada', p_comanda_id
      using errcode = 'P0007';
  end if;
  if v_comanda.status = 'cancelada' or v_comanda.deleted_at is not null then
    return jsonb_build_object('ok', true, 'idempotent', true, 'message', 'Comanda já cancelada');
  end if;

  update uso_beneficios set estornado = true
  where  comanda_id = p_comanda_id and not estornado;

  update comandas set
    status         = 'cancelada',
    deleted_at     = now(),
    deleted_reason = p_motivo,
    updated_at     = now()
  where id = p_comanda_id;

  insert into comanda_eventos (comanda_id, tipo, descricao, payload)
  values (
    p_comanda_id, 'cancelada',
    coalesce(nullif(trim(p_motivo), ''), 'Cancelada sem motivo registrado'),
    jsonb_build_object('motivo', p_motivo)
  );

  return jsonb_build_object('ok', true, 'idempotent', false, 'comanda_id', p_comanda_id);
exception
  when others then
    raise exception 'Erro ao cancelar comanda %: % (SQLSTATE %)', p_comanda_id, sqlerrm, sqlstate;
end;
$$;


-- ─── View: reconciliação financeira ──────────────────────────
-- Detecta divergências entre comandas fechadas e atendimentos.
-- Casos: SEM_ATENDIMENTO | VALOR_DIVERGENTE | SOMA_INVALIDA | OK

create or replace view vw_reconciliacao_financeira as
select
  c.id                                                          as comanda_id,
  c.closed_at::date                                             as data,
  c.cliente_nome,
  c.barbeiro_id,
  c.forma_pagamento,
  c.valor_servicos,
  c.valor_bar,
  c.valor_loja,
  round(c.valor_servicos + c.valor_bar + c.valor_loja, 2)       as soma_componentes,
  c.beneficio_desconto,
  c.valor_total                                                 as valor_total_comanda,
  a.valor_total                                                 as valor_total_atendimento,
  a.id                                                          as atendimento_id,
  round(c.valor_total - coalesce(a.valor_total, 0), 2)          as delta_atendimento,
  round(c.valor_total
        - (c.valor_servicos + c.valor_bar + c.valor_loja), 2)   as delta_soma,
  case
    when a.id is null
      then 'SEM_ATENDIMENTO'
    when abs(c.valor_total - a.valor_total) > 0.01
      then 'VALOR_DIVERGENTE'
    when c.valor_total > round(c.valor_servicos + c.valor_bar + c.valor_loja + 0.01, 2)
      then 'SOMA_INVALIDA'
    else 'OK'
  end                                                           as status_reconciliacao
from  comandas c
left  join atendimentos a on a.comanda_id = c.id
where c.status = 'fechada'
order by c.closed_at desc;


-- ─── View: resumo financeiro diário ──────────────────────────
-- Fonte única de verdade para relatórios de caixa diário.

create or replace view vw_resumo_financeiro_diario as
select
  c.closed_at::date                                             as data,
  count(*)                                                      as total_comandas,
  sum(c.valor_total)                                            as receita_bruta,
  sum(coalesce(c.beneficio_desconto, 0))                        as total_descontos,
  sum(c.valor_total - coalesce(c.beneficio_desconto, 0))        as receita_liquida,
  sum(case when c.forma_pagamento = 'pix'     then c.valor_total else 0 end) as total_pix,
  sum(case when c.forma_pagamento = 'debito'  then c.valor_total else 0 end) as total_debito,
  sum(case when c.forma_pagamento = 'credito' then c.valor_total else 0 end) as total_credito,
  sum(c.valor_servicos)                                         as total_servicos,
  sum(c.valor_bar)                                              as total_bar,
  sum(c.valor_loja)                                             as total_loja
from  comandas c
where c.status = 'fechada'
group by c.closed_at::date
order by data desc;


-- ─── View: auditoria de benefícios aplicados ─────────────────
-- Cruza uso_beneficios com comandas para detectar abusos,
-- estornos suspeitos e descontos sem plano ativo.

create or replace view vw_beneficios_auditoria as
select
  ub.id                                       as uso_id,
  ub.comanda_id,
  c.closed_at::date                           as data_comanda,
  c.cliente_nome,
  c.valor_total                               as valor_comanda,
  c.beneficio_desconto                        as desconto_total_comanda,
  ub.beneficio_id,
  ub.ciclo,
  ub.quantidade,
  ub.valor_desconto,
  ub.estornado,
  p.nome                                      as plano_nome,
  p.valor                                     as plano_valor_mensal,
  cl.nome                                     as cliente_assinante,
  ub.assinatura_id,
  ub.created_at                               as registrado_em
from  uso_beneficios ub
join  comandas  c  on c.id  = ub.comanda_id
left  join planos   p  on p.id  = ub.plano_id
left  join clientes cl on cl.id = ub.cliente_id
order by ub.created_at desc;


-- ─── Função: reconciliação por período ───────────────────────
-- Retorna apenas registros com divergência no período informado.
-- Uso: SELECT * FROM verificar_reconciliacao('2026-05-01', '2026-05-31');

create or replace function verificar_reconciliacao(
  p_data_inicio date default (current_date - interval '30 days')::date,
  p_data_fim    date default current_date
)
returns table (
  comanda_id           integer,
  data                 date,
  cliente_nome         text,
  status_reconciliacao text,
  delta_atendimento    numeric,
  delta_soma           numeric,
  valor_total_comanda  numeric
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


-- ─── Função: integridade unificada ───────────────────────────
-- Retorna JSON com todos os indicadores de saúde do sistema.
-- Uso: SELECT verificar_integridade_completa();

create or replace function verificar_integridade_completa(
  p_data_inicio date default (current_date - interval '30 days')::date,
  p_data_fim    date default current_date
)
returns jsonb
language plpgsql stable security definer
as $$
declare
  v_divergencias           bigint := 0;
  v_sem_evento_criado      bigint := 0;
  v_fechadas_sem_auditoria bigint := 0;
  v_beneficios_estornados  bigint := 0;
  v_atendimentos_orfaos    bigint := 0;
begin
  select count(*) into v_divergencias
  from verificar_reconciliacao(p_data_inicio, p_data_fim);

  select count(*) into v_sem_evento_criado
  from  comandas c
  where c.created_at::date between p_data_inicio and p_data_fim
    and not exists (
      select 1 from comanda_eventos ce
      where ce.comanda_id = c.id and ce.tipo = 'criada'
    );

  select count(*) into v_fechadas_sem_auditoria
  from  comandas c
  where c.status = 'fechada'
    and c.closed_at::date between p_data_inicio and p_data_fim
    and not exists (
      select 1 from comanda_eventos ce
      where ce.comanda_id = c.id and ce.tipo = 'fechada'
    );

  select count(*) into v_beneficios_estornados
  from  uso_beneficios ub
  join  comandas c on c.id = ub.comanda_id
  where c.closed_at::date between p_data_inicio and p_data_fim
    and ub.estornado;

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
    'divergencias_financeiras',      v_divergencias,
    'comandas_sem_evento_criado',    v_sem_evento_criado,
    'fechadas_sem_auditoria_evento', v_fechadas_sem_auditoria,
    'beneficios_estornados',         v_beneficios_estornados,
    'atendimentos_orfaos',           v_atendimentos_orfaos,
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


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- App single-tenant sem Supabase Auth: toda operação usa a anon key.
-- Princípio: anon pode ler e escrever dados operacionais, mas NÃO
-- pode deletar registros financeiros nem alterar tabelas de auditoria.
-- service_role é reservado para manutenção administrativa.

-- ── Tabelas operacionais ──────────────────────────────────────
alter table categorias         enable row level security;
alter table produtos           enable row level security;
alter table clientes           enable row level security;
alter table servicos           enable row level security;
alter table barbeiros          enable row level security;
alter table planos             enable row level security;
alter table horarios_especiais enable row level security;

drop policy if exists anon_all on categorias;         create policy anon_all on categorias         for all to anon using (true) with check (true);
drop policy if exists anon_all on produtos;           create policy anon_all on produtos           for all to anon using (true) with check (true);
drop policy if exists anon_all on clientes;           create policy anon_all on clientes           for all to anon using (true) with check (true);
drop policy if exists anon_all on servicos;           create policy anon_all on servicos           for all to anon using (true) with check (true);
drop policy if exists anon_all on barbeiros;          create policy anon_all on barbeiros          for all to anon using (true) with check (true);
drop policy if exists anon_all on planos;             create policy anon_all on planos             for all to anon using (true) with check (true);
drop policy if exists anon_all on horarios_especiais; create policy anon_all on horarios_especiais for all to anon using (true) with check (true);

-- ── Configurações: sem DELETE para anon ──────────────────────
-- DELETE em configuracoes (ex: chave 'financeiro_senha') só via service_role.
alter table configuracoes enable row level security;
drop policy if exists anon_all    on configuracoes;
drop policy if exists anon_select on configuracoes;
drop policy if exists anon_insert on configuracoes;
drop policy if exists anon_update on configuracoes;
create policy anon_select on configuracoes for select to anon using (true);
create policy anon_insert on configuracoes for insert to anon with check (true);
create policy anon_update on configuracoes for update to anon using (true) with check (true);

-- ── Tabelas financeiras: SELECT + INSERT + UPDATE, sem DELETE ─
-- Deleção deve passar pelas RPCs (soft-delete) ou service_role.
alter table atendimentos   enable row level security;
alter table assinaturas    enable row level security;
alter table uso_beneficios enable row level security;
alter table comandas       enable row level security;

drop policy if exists anon_all    on atendimentos;
drop policy if exists anon_select on atendimentos;
drop policy if exists anon_insert on atendimentos;
drop policy if exists anon_update on atendimentos;
create policy anon_select on atendimentos for select to anon using (true);
create policy anon_insert on atendimentos for insert to anon with check (true);
create policy anon_update on atendimentos for update to anon using (true) with check (true);

drop policy if exists anon_all    on assinaturas;
drop policy if exists anon_select on assinaturas;
drop policy if exists anon_insert on assinaturas;
drop policy if exists anon_update on assinaturas;
create policy anon_select on assinaturas for select to anon using (true);
create policy anon_insert on assinaturas for insert to anon with check (true);
create policy anon_update on assinaturas for update to anon using (true) with check (true);

drop policy if exists anon_all    on uso_beneficios;
drop policy if exists anon_select on uso_beneficios;
drop policy if exists anon_insert on uso_beneficios;
drop policy if exists anon_update on uso_beneficios;
create policy anon_select on uso_beneficios for select to anon using (true);
create policy anon_insert on uso_beneficios for insert to anon with check (true);
create policy anon_update on uso_beneficios for update to anon using (true) with check (true);

drop policy if exists anon_all    on comandas;
drop policy if exists anon_select on comandas;
drop policy if exists anon_insert on comandas;
drop policy if exists anon_update on comandas;
create policy anon_select on comandas for select to anon using (true);
create policy anon_insert on comandas for insert to anon with check (true);
create policy anon_update on comandas for update to anon using (true) with check (true);

-- ── Tabelas de auditoria: apenas SELECT + INSERT ──────────────
-- Append-only por design. Triggers bloqueiam UPDATE/DELETE.
alter table historico       enable row level security;
alter table comanda_eventos enable row level security;
alter table webhook_logs    enable row level security;
alter table audit_log       enable row level security;

drop policy if exists anon_select on historico;       create policy anon_select on historico       for select to anon using (true);
drop policy if exists anon_insert on historico;       create policy anon_insert on historico       for insert to anon with check (true);
drop policy if exists anon_select on comanda_eventos; create policy anon_select on comanda_eventos for select to anon using (true);
drop policy if exists anon_insert on comanda_eventos; create policy anon_insert on comanda_eventos for insert to anon with check (true);
drop policy if exists anon_select on webhook_logs;    create policy anon_select on webhook_logs    for select to anon using (true);
drop policy if exists anon_insert on webhook_logs;    create policy anon_insert on webhook_logs    for insert to anon with check (true);
drop policy if exists anon_select on audit_log;       create policy anon_select on audit_log       for select to anon using (true);
drop policy if exists anon_insert on audit_log;       create policy anon_insert on audit_log       for insert to anon with check (true);


-- ============================================================
-- GRANTS
-- ============================================================

grant execute on function baixar_estoque_comanda(jsonb)           to anon;
grant execute on function finalizar_comanda(integer, jsonb)       to anon;
grant execute on function cancelar_comanda(integer, text)         to anon;
grant execute on function verificar_reconciliacao(date, date)     to anon;
grant execute on function verificar_integridade_completa(date, date) to anon;
grant select  on vw_reconciliacao_financeira                      to anon;
grant select  on vw_resumo_financeiro_diario                      to anon;
grant select  on vw_beneficios_auditoria                          to anon;
grant select  on audit_log                                        to anon;
