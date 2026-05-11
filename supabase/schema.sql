-- ============================================================
-- StorePro — Schema Supabase completo (fonte única de verdade)
-- Execute este arquivo inteiro para criar o banco do zero.
-- Incorpora: admin_system + multi_tenant + lojas_slug
-- ============================================================


-- ============================================================
-- TABELAS
-- ============================================================

-- ─── Lojas ───────────────────────────────────────────────────
create table if not exists lojas (
  id         uuid        primary key default gen_random_uuid(),
  nome       text        not null,
  slug       text,
  ativo      boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists lojas_slug_uq on lojas(slug);

-- ─── Profiles ────────────────────────────────────────────────
create table if not exists profiles (
  id         uuid        primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  avatar_url text,
  role       text        not null default 'user' check (role in ('user', 'admin')),
  is_active  boolean     not null default true,
  loja_id    uuid        references lojas(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Categorias ──────────────────────────────────────────────
-- Global: compartilhada entre todas as lojas
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
  loja_id            uuid references lojas(id) on delete cascade,
  data_cadastro      timestamptz default now()
);

create index if not exists produtos_categoria_idx on produtos(categoria_id);
create index if not exists produtos_loja_idx      on produtos(loja_id);

-- ─── Clientes ────────────────────────────────────────────────
create table if not exists clientes (
  id            serial primary key,
  nome          text not null,
  telefone      text,
  email         text,
  observacoes   text,
  loja_id       uuid references lojas(id) on delete cascade,
  data_cadastro timestamptz default now()
);

create index if not exists clientes_nome_idx on clientes(nome);
create index if not exists clientes_loja_idx on clientes(loja_id);

-- ─── Serviços ────────────────────────────────────────────────
create table if not exists servicos (
  id              bigserial primary key,
  nome            text not null,
  valor           numeric(10,2) not null default 0,
  ativo           boolean not null default true,
  duracao_minutos integer default 30,
  loja_id         uuid references lojas(id) on delete cascade,
  created_at      timestamptz default now()
);

-- ─── Barbeiros ───────────────────────────────────────────────
create table if not exists barbeiros (
  id            serial primary key,
  nome          text not null,
  gcal_color_id text not null default '9',
  ativo         boolean not null default true,
  loja_id       uuid references lojas(id) on delete cascade,
  created_at    timestamptz default now()
);

-- ─── Configurações ───────────────────────────────────────────
-- id SERIAL PK + unique(chave, loja_id) para suportar uma config por loja
create table if not exists configuracoes (
  id      serial primary key,
  chave   text not null,
  valor   text not null,
  loja_id uuid references lojas(id) on delete cascade
);

create unique index if not exists configuracoes_chave_loja_uq
  on configuracoes(chave, loja_id);

-- ─── Atendimentos ────────────────────────────────────────────
create table if not exists atendimentos (
  id              serial primary key,
  gcal_event_id   text unique,
  comanda_id      integer,   -- FK adicionada após comandas
  data_hora       timestamptz not null,
  cliente_nome    text,
  cliente_id      integer references clientes(id) on delete set null,
  barbeiro_id     integer references barbeiros(id) on delete set null,
  servicos        jsonb default '[]',
  valor_total     numeric(10,2) default 0 check (valor_total >= 0),
  status          text default 'agendado'
                    check (status in ('agendado','em_andamento','concluido','cancelado')),
  forma_pagamento text check (forma_pagamento in ('debito','credito','pix','dinheiro')),
  observacoes     text,
  loja_id         uuid references lojas(id) on delete cascade,
  data_cadastro   timestamptz default now()
);

create index if not exists atendimentos_data_idx    on atendimentos(data_hora);
create index if not exists atendimentos_status_idx  on atendimentos(status);
create index if not exists atendimentos_cliente_idx on atendimentos(cliente_id);
create index if not exists atendimentos_loja_idx    on atendimentos(loja_id);

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
  loja_id             uuid references lojas(id) on delete cascade,
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
  loja_id      uuid references lojas(id) on delete cascade,
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
  loja_id                 uuid references lojas(id) on delete cascade,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

create index if not exists assinaturas_cliente_idx on assinaturas(cliente_id);
create index if not exists assinaturas_status_idx  on assinaturas(status);

-- ─── Uso de benefícios ───────────────────────────────────────
create table if not exists uso_beneficios (
  id             bigserial primary key,
  assinatura_id  bigint references assinaturas(id) on delete cascade,
  cliente_id     bigint references clientes(id)    on delete set null,
  plano_id       bigint references planos(id)      on delete set null,
  comanda_id     bigint,
  ciclo          text not null,
  beneficio_id   text not null,
  quantidade     integer not null default 1,
  valor_desconto numeric(10,2),
  estornado      boolean not null default false,
  loja_id        uuid references lojas(id) on delete cascade,
  created_at     timestamptz default now()
);

create index if not exists idx_uso_beneficios_lookup
  on uso_beneficios(assinatura_id, ciclo);

create unique index if not exists idx_uso_beneficios_comanda_unico
  on uso_beneficios(comanda_id, beneficio_id)
  where comanda_id is not null and not estornado;

-- ─── Sessões de caixa ────────────────────────────────────────
-- Uma sessão aberta por loja (idx_sessoes_caixa_uma_aberta).
create table if not exists sessoes_caixa (
  id               bigserial primary key,
  status           text not null default 'aberta'
                   check (status in ('aberta','fechada')),
  valor_abertura   numeric(10,2) not null default 0,
  valor_fechamento numeric(10,2),
  valor_esperado   numeric(10,2),
  diferenca        numeric(10,2),
  aberto_por       text,
  fechado_por      text,
  loja_id          uuid references lojas(id) on delete cascade,
  opened_at        timestamptz not null default now(),
  closed_at        timestamptz,
  snapshot         jsonb,
  created_at       timestamptz not null default now()
);

create unique index if not exists idx_sessoes_caixa_uma_aberta
  on sessoes_caixa(loja_id, status) where status = 'aberta';

create index if not exists idx_sessoes_caixa_opened
  on sessoes_caixa(opened_at desc);

-- ─── Movimentos de caixa ─────────────────────────────────────
create table if not exists movimentos_caixa (
  id              bigserial primary key,
  sessao_id       bigint not null references sessoes_caixa(id),
  tipo            text not null
                  check (tipo in ('abertura','entrada_comanda','sangria','suprimento','ajuste')),
  valor           numeric(10,2) not null,
  motivo          text,
  referencia_tipo text,
  referencia_id   bigint,
  criado_por      text,
  loja_id         uuid references lojas(id) on delete cascade,
  created_at      timestamptz not null default now()
);

create index if not exists idx_movimentos_caixa_sessao
  on movimentos_caixa(sessao_id, created_at);

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
  forma_pagamento      text check (forma_pagamento in ('debito','credito','pix','dinheiro')),
  sessao_caixa_id      bigint references sessoes_caixa(id),
  status               text default 'aberta'
                       check (status in ('aberta','fechada','cancelada')),
  loja_id              uuid references lojas(id) on delete cascade,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now(),
  closed_at            timestamptz,
  deleted_at           timestamptz,
  deleted_reason       text,
  version              integer not null default 1
);

create index if not exists idx_comandas_status    on comandas(status, created_at desc);
create index if not exists idx_comandas_cliente   on comandas(cliente_id);
create index if not exists idx_comandas_loja      on comandas(loja_id);
create index if not exists idx_comandas_closed_at on comandas(closed_at desc)
  where closed_at is not null;
create index if not exists idx_comandas_sessao_caixa on comandas(sessao_caixa_id)
  where sessao_caixa_id is not null;

-- FK circular: atendimentos.comanda_id → comandas.id
alter table atendimentos
  add constraint if not exists atendimentos_comanda_fk
  foreign key (comanda_id) references comandas(id) on delete set null;

create unique index if not exists idx_atendimentos_comanda
  on atendimentos(comanda_id)
  where comanda_id is not null;

-- ─── Eventos de auditoria das comandas ───────────────────────
create table if not exists comanda_eventos (
  id         bigserial primary key,
  comanda_id integer not null references comandas(id) on delete cascade,
  tipo       text not null,
  descricao  text,
  payload    jsonb,
  loja_id    uuid references lojas(id) on delete cascade,
  created_at timestamptz default now()
);

create index if not exists idx_comanda_eventos_comanda
  on comanda_eventos(comanda_id, created_at desc);

-- ─── Log de webhooks ─────────────────────────────────────────
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
-- Append-only. Não tem loja_id — é global/administrativo.
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
  data            date not null,
  hora_abertura   text not null default '09:00',
  hora_fechamento text not null default '20:00',
  fechado         boolean not null default false,
  motivo          text,
  loja_id         uuid references lojas(id) on delete cascade,
  created_at      timestamptz default now()
);

-- Uma configuração por data por loja
create unique index if not exists idx_horarios_especiais_data_loja
  on horarios_especiais(data, loja_id);


-- ============================================================
-- FUNÇÕES AUXILIARES
-- ============================================================

-- ─── updated_at automático ───────────────────────────────────
create or replace function handle_updated_at()
returns trigger language plpgsql as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$;

-- ─── Role do usuário atual (evita recursão RLS) ──────────────
create or replace function get_my_role()
returns text language sql security definer stable as $$
  select role from profiles where id = auth.uid();
$$;

-- ─── loja_id do usuário atual ────────────────────────────────
create or replace function get_my_loja_id()
returns uuid language sql security definer stable as $$
  select loja_id from profiles where id = auth.uid();
$$;

-- ─── Auto-cria profile ao criar usuário no Supabase Auth ─────
create or replace function handle_new_auth_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email, full_name, role, loja_id)
  values (
    NEW.id,
    NEW.email,
    coalesce(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    coalesce(NEW.raw_user_meta_data->>'role', 'user'),
    case
      when NEW.raw_user_meta_data->>'loja_id' is not null
        and NEW.raw_user_meta_data->>'loja_id' != ''
      then (NEW.raw_user_meta_data->>'loja_id')::uuid
      else null
    end
  )
  on conflict (id) do nothing;
  return NEW;
end;
$$;

-- ─── Auto-preenche loja_id no INSERT ─────────────────────────
create or replace function auto_set_loja_id()
returns trigger language plpgsql as $$
begin
  if NEW.loja_id is null then
    NEW.loja_id := get_my_loja_id();
  end if;
  return NEW;
end;
$$;


-- ============================================================
-- TRIGGERS DE INFRAESTRUTURA
-- ============================================================

-- ─── updated_at automático ───────────────────────────────────
drop trigger if exists lojas_updated_at on lojas;
create trigger lojas_updated_at
  before update on lojas
  for each row execute function handle_updated_at();

drop trigger if exists profiles_updated_at on profiles;
create trigger profiles_updated_at
  before update on profiles
  for each row execute function handle_updated_at();

drop trigger if exists assinaturas_updated_at on assinaturas;
create trigger assinaturas_updated_at
  before update on assinaturas
  for each row execute function handle_updated_at();

-- ─── Auth: auto-cria profile ao registrar usuário ────────────
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- ─── Auto-set loja_id em todas as tabelas de dados ───────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'produtos','clientes','servicos','barbeiros','planos',
    'atendimentos','comandas','assinaturas','uso_beneficios',
    'sessoes_caixa','movimentos_caixa','historico','comanda_eventos',
    'horarios_especiais','configuracoes'
  ] loop
    execute format('drop trigger if exists trg_auto_loja_id on %I', t);
    execute format(
      'create trigger trg_auto_loja_id
         before insert on %I
         for each row execute function auto_set_loja_id()',
      t
    );
  end loop;
end;
$$;


-- ============================================================
-- FUNÇÕES E TRIGGERS DE NEGÓCIO
-- ============================================================

-- ─── BEFORE INSERT: normaliza e valida nova comanda ──────────
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
  for each row execute function fn_normalizar_comanda_insert();


-- ─── BEFORE UPDATE: imutabilidade de comanda fechada ─────────
create or replace function validar_fechamento_comanda()
returns trigger language plpgsql as $$
declare v_soma numeric;
begin

  -- Bloco A: já estava fechada — somente gcal_event_id pode ser nulificado
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
    NEW.version    := OLD.version;
    NEW.updated_at := OLD.updated_at;
    return NEW;
  end if;

  -- Bloco B: transição para fechada — valida e seta timestamps
  if NEW.status = 'fechada' then
    if NEW.forma_pagamento is null or
       NEW.forma_pagamento not in ('debito', 'credito', 'pix', 'dinheiro') then
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
  for each row execute function validar_fechamento_comanda();


-- ─── AFTER INSERT: auditoria de criação de comanda ───────────
create or replace function fn_auditar_comanda_criada()
returns trigger language plpgsql security definer as $$
begin
  insert into comanda_eventos (comanda_id, tipo, descricao, payload, loja_id)
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
    ),
    NEW.loja_id
  );
  return NEW;
end;
$$;

drop trigger if exists trg_auditar_comanda_criada on comandas;
create trigger trg_auditar_comanda_criada
  after insert on comandas
  for each row execute function fn_auditar_comanda_criada();


-- ─── Tabelas append-only: bloqueia UPDATE e DELETE ───────────
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

drop trigger if exists trg_imutavel_movimentos_caixa on movimentos_caixa;
create trigger trg_imutavel_movimentos_caixa
  before update or delete on movimentos_caixa
  for each row execute function fn_bloquear_mutacao_auditoria();


-- ─── Audit log para tabelas financeiras ──────────────────────
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

drop trigger if exists trg_audit_sessoes_caixa on sessoes_caixa;
create trigger trg_audit_sessoes_caixa
  after insert or update on sessoes_caixa
  for each row execute function fn_audit_log();


-- ─── Timestamps server-side em atendimentos ──────────────────
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


-- ─── Proteger sessão de caixa fechada ────────────────────────
create or replace function fn_proteger_sessao_fechada()
returns trigger language plpgsql as $$
begin
  if OLD.status = 'fechada' then
    raise exception
      'Sessão de caixa % já está fechada e é imutável.', OLD.id
      using errcode = 'P0043';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_proteger_sessao_fechada on sessoes_caixa;
create trigger trg_proteger_sessao_fechada
  before update on sessoes_caixa
  for each row execute function fn_proteger_sessao_fechada();


-- ─── Baixar estoque em batch atômico ─────────────────────────
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
    -- loja_id auto-preenchido pelo trg_auto_loja_id
  end loop;
end;
$$;


-- ============================================================
-- RPCs
-- ============================================================

-- ─── finalizar_comanda() ─────────────────────────────────────
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
  v_sessao_id            bigint;
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
  if v_forma_pagamento is null or
     v_forma_pagamento not in ('debito','credito','pix','dinheiro') then
    raise exception 'forma_pagamento inválida: "%"', coalesce(v_forma_pagamento,'null')
      using errcode = 'P0003';
  end if;

  -- Passo 4b: dinheiro exige sessão de caixa aberta
  if v_forma_pagamento = 'dinheiro' then
    select id into v_sessao_id
    from   sessoes_caixa
    where  status = 'aberta'
    limit  1
    for    update;
    if not found then
      raise exception
        'Pagamento em dinheiro requer caixa aberto. Abra o caixa antes de finalizar a comanda.'
        using errcode = 'P0040';
    end if;
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

  -- Passo 7: fechar comanda
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
    barbeiro_id          = coalesce(v_barbeiro_id, barbeiro_id),
    sessao_caixa_id      = v_sessao_id
  where id = p_comanda_id;

  -- Passo 7b: registrar entrada no caixa (apenas dinheiro)
  if v_forma_pagamento = 'dinheiro' then
    insert into movimentos_caixa (
      sessao_id, tipo, valor, motivo, referencia_tipo, referencia_id
    ) values (
      v_sessao_id,
      'entrada_comanda',
      v_valor_total,
      format('Comanda #%s — %s', p_comanda_id, coalesce(v_comanda.cliente_nome, 'cliente')),
      'comanda',
      p_comanda_id
    );
  end if;

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

  -- Passo 9: auditoria
  insert into comanda_eventos (comanda_id, tipo, descricao, payload, loja_id)
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
      'version_finalizado', v_comanda.version,
      'sessao_caixa_id',    v_sessao_id
    ),
    v_comanda.loja_id
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


-- ─── cancelar_comanda() ──────────────────────────────────────
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

  insert into comanda_eventos (comanda_id, tipo, descricao, payload, loja_id)
  values (
    p_comanda_id, 'cancelada',
    coalesce(nullif(trim(p_motivo), ''), 'Cancelada sem motivo registrado'),
    jsonb_build_object('motivo', p_motivo),
    v_comanda.loja_id
  );

  return jsonb_build_object('ok', true, 'idempotent', false, 'comanda_id', p_comanda_id);
exception
  when others then
    raise exception 'Erro ao cancelar comanda %: % (SQLSTATE %)', p_comanda_id, sqlerrm, sqlstate;
end;
$$;


-- ─── abrir_caixa() ───────────────────────────────────────────
create or replace function abrir_caixa(
  p_valor_abertura numeric default 0,
  p_aberto_por     text    default null
)
returns jsonb
language plpgsql
as $$
declare
  v_sessao_id bigint;
  v_existente bigint;
begin
  select id into v_existente from sessoes_caixa where status = 'aberta' limit 1;
  if found then
    raise exception
      'Já existe uma sessão de caixa aberta (id: %). Feche-a antes de abrir outra.',
      v_existente
      using errcode = 'P0041';
  end if;

  insert into sessoes_caixa (valor_abertura, aberto_por)
  values (coalesce(p_valor_abertura, 0), p_aberto_por)
  returning id into v_sessao_id;

  insert into movimentos_caixa (sessao_id, tipo, valor, motivo)
  values (v_sessao_id, 'abertura', coalesce(p_valor_abertura, 0), 'Fundo inicial de caixa');

  return jsonb_build_object(
    'ok',             true,
    'sessao_id',      v_sessao_id,
    'valor_abertura', coalesce(p_valor_abertura, 0),
    'opened_at',      now()
  );
exception
  when others then
    raise exception 'Erro ao abrir caixa: % (SQLSTATE %)', sqlerrm, sqlstate;
end;
$$;


-- ─── fechar_caixa() ──────────────────────────────────────────
create or replace function fechar_caixa(
  p_sessao_id        bigint,
  p_valor_fechamento numeric  default 0,
  p_fechado_por      text     default null
)
returns jsonb
language plpgsql
as $$
declare
  v_sessao          sessoes_caixa%rowtype;
  v_esperado        numeric(10,2);
  v_diferenca       numeric(10,2);
  v_snapshot        jsonb;
  v_tot_dinheiro    numeric(10,2);
  v_tot_pix         numeric(10,2);
  v_tot_debito      numeric(10,2);
  v_tot_credito     numeric(10,2);
  v_tot_sangrias    numeric(10,2);
  v_tot_suprimentos numeric(10,2);
  v_qtd_comandas    bigint;
begin
  select * into v_sessao from sessoes_caixa where id = p_sessao_id for update;
  if not found then
    raise exception 'Sessão de caixa % não encontrada', p_sessao_id using errcode = 'P0042';
  end if;
  if v_sessao.status = 'fechada' then
    raise exception 'Sessão de caixa % já está fechada', p_sessao_id using errcode = 'P0043';
  end if;

  select coalesce(sum(
    case
      when tipo in ('abertura','entrada_comanda','suprimento') then  valor
      when tipo = 'sangria'                                    then -valor
      else 0
    end
  ), 0)
  into v_esperado
  from movimentos_caixa
  where sessao_id = p_sessao_id;

  v_diferenca := coalesce(p_valor_fechamento, 0) - v_esperado;

  select coalesce(sum(valor), 0) into v_tot_dinheiro
  from movimentos_caixa where sessao_id = p_sessao_id and tipo = 'entrada_comanda';

  select coalesce(sum(valor), 0) into v_tot_sangrias
  from movimentos_caixa where sessao_id = p_sessao_id and tipo = 'sangria';

  select coalesce(sum(valor), 0) into v_tot_suprimentos
  from movimentos_caixa where sessao_id = p_sessao_id and tipo = 'suprimento';

  select
    coalesce(sum(case when forma_pagamento = 'pix'     then valor_total else 0 end), 0),
    coalesce(sum(case when forma_pagamento = 'debito'  then valor_total else 0 end), 0),
    coalesce(sum(case when forma_pagamento = 'credito' then valor_total else 0 end), 0),
    count(*)
  into v_tot_pix, v_tot_debito, v_tot_credito, v_qtd_comandas
  from comandas
  where status = 'fechada'
    and closed_at between v_sessao.opened_at and now();

  v_snapshot := jsonb_build_object(
    'valor_abertura',    v_sessao.valor_abertura,
    'total_dinheiro',    v_tot_dinheiro,
    'total_pix',         v_tot_pix,
    'total_debito',      v_tot_debito,
    'total_credito',     v_tot_credito,
    'total_sangrias',    v_tot_sangrias,
    'total_suprimentos', v_tot_suprimentos,
    'qtd_comandas',      v_qtd_comandas
  );

  update sessoes_caixa set
    status           = 'fechada',
    valor_fechamento = coalesce(p_valor_fechamento, 0),
    valor_esperado   = v_esperado,
    diferenca        = v_diferenca,
    snapshot         = v_snapshot,
    closed_at        = now(),
    fechado_por      = p_fechado_por
  where id = p_sessao_id;

  return jsonb_build_object(
    'ok',               true,
    'sessao_id',        p_sessao_id,
    'valor_esperado',   v_esperado,
    'valor_fechamento', coalesce(p_valor_fechamento, 0),
    'diferenca',        v_diferenca,
    'snapshot',         v_snapshot
  );
exception
  when others then
    raise exception 'Erro ao fechar caixa: % (SQLSTATE %)', sqlerrm, sqlstate;
end;
$$;


-- ─── registrar_movimento_caixa() ─────────────────────────────
create or replace function registrar_movimento_caixa(
  p_sessao_id  bigint,
  p_tipo       text,
  p_valor      numeric,
  p_motivo     text    default null,
  p_criado_por text    default null
)
returns jsonb
language plpgsql
as $$
declare
  v_sessao  sessoes_caixa%rowtype;
  v_mov_id  bigint;
begin
  if p_tipo not in ('sangria', 'suprimento', 'ajuste') then
    raise exception
      'tipo inválido para operação manual: "%". Use "sangria", "suprimento" ou "ajuste".',
      p_tipo using errcode = 'P0044';
  end if;
  if coalesce(p_valor, 0) <= 0 then
    raise exception 'valor deve ser positivo (recebido: %)', coalesce(p_valor, 0)
      using errcode = 'P0045';
  end if;

  select * into v_sessao from sessoes_caixa where id = p_sessao_id for update;
  if not found then
    raise exception 'Sessão de caixa % não encontrada', p_sessao_id using errcode = 'P0042';
  end if;
  if v_sessao.status = 'fechada' then
    raise exception
      'Sessão de caixa % está fechada. Movimentos não permitidos.', p_sessao_id
      using errcode = 'P0043';
  end if;

  insert into movimentos_caixa (sessao_id, tipo, valor, motivo, criado_por)
  values (p_sessao_id, p_tipo, p_valor, p_motivo, p_criado_por)
  returning id into v_mov_id;

  return jsonb_build_object(
    'ok', true, 'movimento_id', v_mov_id,
    'sessao_id', p_sessao_id, 'tipo', p_tipo, 'valor', p_valor
  );
exception
  when others then
    raise exception 'Erro ao registrar movimento: % (SQLSTATE %)', sqlerrm, sqlstate;
end;
$$;


-- ============================================================
-- VIEWS
-- ============================================================

-- ─── Reconciliação financeira ─────────────────────────────────
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


-- ─── Resumo financeiro diário ─────────────────────────────────
create or replace view vw_resumo_financeiro_diario as
select
  c.closed_at::date                                             as data,
  count(*)                                                      as total_comandas,
  sum(c.valor_total)                                            as receita_bruta,
  sum(coalesce(c.beneficio_desconto, 0))                        as total_descontos,
  sum(c.valor_total - coalesce(c.beneficio_desconto, 0))        as receita_liquida,
  sum(case when c.forma_pagamento = 'pix'      then c.valor_total else 0 end) as total_pix,
  sum(case when c.forma_pagamento = 'debito'   then c.valor_total else 0 end) as total_debito,
  sum(case when c.forma_pagamento = 'credito'  then c.valor_total else 0 end) as total_credito,
  sum(case when c.forma_pagamento = 'dinheiro' then c.valor_total else 0 end) as total_dinheiro,
  sum(c.valor_servicos)                                          as total_servicos,
  sum(c.valor_bar)                                              as total_bar,
  sum(c.valor_loja)                                             as total_loja
from  comandas c
where c.status = 'fechada'
group by c.closed_at::date
order by data desc;


-- ─── Auditoria de benefícios ──────────────────────────────────
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


-- ─── Reconciliação por período ────────────────────────────────
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


-- ─── Integridade unificada ────────────────────────────────────
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

-- ─── Lojas ────────────────────────────────────────────────────
alter table lojas enable row level security;
drop policy if exists lojas_admin on lojas;
drop policy if exists lojas_read  on lojas;
create policy lojas_admin on lojas for all to authenticated
  using (get_my_role() = 'admin') with check (get_my_role() = 'admin');
create policy lojas_read on lojas for select to authenticated
  using (id = get_my_loja_id() or get_my_role() = 'admin');

-- ─── Profiles ─────────────────────────────────────────────────
alter table profiles enable row level security;
drop policy if exists "profiles_select_own_or_admin"     on profiles;
drop policy if exists "profiles_update_own_or_admin"     on profiles;
drop policy if exists "profiles_insert_admin"            on profiles;
drop policy if exists "profiles_insert_trigger_or_admin" on profiles;
drop policy if exists "profiles_delete_admin"            on profiles;

create policy "profiles_select_own_or_admin" on profiles
  for select using (auth.uid() = id or get_my_role() = 'admin');

create policy "profiles_update_own_or_admin" on profiles
  for update using (auth.uid() = id or get_my_role() = 'admin');

-- Permite: admin, service_role (API admin) e trigger SECURITY DEFINER
create policy "profiles_insert_trigger_or_admin" on profiles
  for insert with check (
    get_my_role() = 'admin'
    or auth.role() = 'service_role'
    or auth.uid() is null
  );

create policy "profiles_delete_admin" on profiles
  for delete using (get_my_role() = 'admin');

-- ─── Categorias: global, qualquer autenticado lê ──────────────
alter table categorias enable row level security;
drop policy if exists anon_all      on categorias;
drop policy if exists cat_read      on categorias;
drop policy if exists cat_write     on categorias;
drop policy if exists cat_anon_read on categorias;
create policy cat_read      on categorias for select to authenticated using (true);
create policy cat_anon_read on categorias for select to anon using (true);
create policy cat_write     on categorias for all to authenticated
  using (get_my_role() = 'admin') with check (get_my_role() = 'admin');

-- ─── Tabelas de dados: isolamento por loja ────────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'produtos','clientes','servicos','barbeiros','planos',
    'atendimentos','comandas','assinaturas','uso_beneficios',
    'sessoes_caixa','movimentos_caixa','historico','comanda_eventos',
    'horarios_especiais','configuracoes'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists anon_all      on %I', t);
    execute format('drop policy if exists anon_select   on %I', t);
    execute format('drop policy if exists anon_insert   on %I', t);
    execute format('drop policy if exists anon_update   on %I', t);
    execute format('drop policy if exists loja_isolation on %I', t);
    execute format(
      'create policy loja_isolation on %I
         for all to authenticated
         using (
           get_my_role() = ''admin''
           or loja_id = get_my_loja_id()
         )
         with check (
           get_my_role() = ''admin''
           or loja_id = get_my_loja_id()
         )',
      t
    );
  end loop;
end;
$$;

-- ─── Audit log e webhook_logs: append-only global ─────────────
alter table audit_log    enable row level security;
alter table webhook_logs enable row level security;

drop policy if exists anon_select          on audit_log;
drop policy if exists anon_insert          on audit_log;
drop policy if exists authenticated_select on audit_log;
drop policy if exists authenticated_insert on audit_log;
create policy authenticated_select on audit_log for select to authenticated using (true);
create policy authenticated_insert on audit_log for insert to authenticated with check (true);

drop policy if exists anon_select          on webhook_logs;
drop policy if exists anon_insert          on webhook_logs;
drop policy if exists authenticated_select on webhook_logs;
drop policy if exists authenticated_insert on webhook_logs;
create policy authenticated_select on webhook_logs for select to authenticated using (true);
create policy authenticated_insert on webhook_logs for insert to authenticated with check (true);


-- ============================================================
-- GRANTS
-- ============================================================

grant execute on function get_my_role()                                                to authenticated;
grant execute on function get_my_loja_id()                                             to authenticated;
grant execute on function baixar_estoque_comanda(jsonb)                                to authenticated;
grant execute on function finalizar_comanda(integer, jsonb)                            to authenticated;
grant execute on function cancelar_comanda(integer, text)                              to authenticated;
grant execute on function verificar_reconciliacao(date, date)                          to authenticated;
grant execute on function verificar_integridade_completa(date, date)                   to authenticated;
grant execute on function abrir_caixa(numeric, text)                                   to authenticated;
grant execute on function fechar_caixa(bigint, numeric, text)                          to authenticated;
grant execute on function registrar_movimento_caixa(bigint, text, numeric, text, text) to authenticated;
grant select  on vw_reconciliacao_financeira                                            to authenticated;
grant select  on vw_resumo_financeiro_diario                                            to authenticated;
grant select  on vw_beneficios_auditoria                                                to authenticated;
grant select  on audit_log                                                              to authenticated;
grant select, insert, update on sessoes_caixa                                           to authenticated;
grant select, insert         on movimentos_caixa                                        to authenticated;
grant usage, select on sequence sessoes_caixa_id_seq                                    to authenticated;
grant usage, select on sequence movimentos_caixa_id_seq                                 to authenticated;


-- ============================================================
-- SETUP INICIAL (rodar uma vez após criar o banco)
-- ============================================================
--
-- 1. Criar o primeiro admin no Supabase Dashboard:
--    Authentication → Users → Add user
--
-- 2. Promover para admin:
--    UPDATE profiles SET role = 'admin' WHERE email = 'seu-email@exemplo.com';
--
-- 3. Para bancos com dados existentes, fazer backfill de profiles:
--    INSERT INTO profiles (id, email, full_name, role)
--    SELECT u.id, u.email,
--           COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1)),
--           'user'
--    FROM auth.users u
--    LEFT JOIN profiles p ON p.id = u.id
--    WHERE p.id IS NULL;
--
-- ============================================================
