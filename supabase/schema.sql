-- ============================================================
-- StorePro — Schema Supabase
-- Execute este arquivo no SQL Editor do Supabase
-- ============================================================

-- ─── Categorias ──────────────────────────────────────────────
create table if not exists categorias (
  id   serial primary key,
  nome text not null,
  created_at timestamptz default now()
);

-- Categorias padrão
insert into categorias (nome) values
  ('Eletrônicos'),
  ('Roupas'),
  ('Calçados'),
  ('Alimentos'),
  ('Higiene'),
  ('Outros')
on conflict do nothing;

-- ─── Produtos ────────────────────────────────────────────────
create table if not exists produtos (
  id                serial primary key,
  nome              text not null,
  categoria_id      integer references categorias(id) on delete set null,
  quantidade        integer default 0,
  estoque_minimo    integer default 1,
  preco_custo       numeric(10,2),
  preco_venda       numeric(10,2),
  tem_cor           boolean default false,
  cor               text,
  tem_tamanho       boolean default false,
  tamanho_quantidade text,
  tamanho_unidade   text,
  foto              text,
  data_cadastro     timestamptz default now()
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

-- ─── Atendimentos ────────────────────────────────────────────
-- servicos: [{ nome: string, valor: number }]
create table if not exists atendimentos (
  id              serial primary key,
  gcal_event_id   text unique,
  data_hora       timestamptz not null,
  cliente_nome    text,
  cliente_id      integer references clientes(id) on delete set null,
  servicos        jsonb default '[]',
  valor_total     numeric(10,2) default 0,
  status          text default 'agendado'
                    check (status in ('agendado','em_andamento','concluido','cancelado')),
  forma_pagamento text check (forma_pagamento in ('debito','credito','pix')),
  observacoes     text,
  data_cadastro   timestamptz default now()
);

create index if not exists atendimentos_data_idx   on atendimentos(data_hora);
create index if not exists atendimentos_status_idx on atendimentos(status);
create index if not exists atendimentos_cliente_idx on atendimentos(cliente_id);

-- ─── Histórico de estoque ────────────────────────────────────
create table if not exists historico (
  id             serial primary key,
  produto_id     integer,
  produto_nome   text,
  produto_cor    text,
  categoria_nome text,
  foto           text,
  data_zerado    timestamptz default now()
);

-- ─── Serviços ────────────────────────────────────────────────
create table if not exists servicos (
  id         bigserial primary key,
  nome       text not null,
  valor      numeric(10,2) not null default 0,
  ativo      boolean not null default true,
  created_at timestamptz default now()
);

-- ─── Configurações ───────────────────────────────────────────
-- Insira a senha do financeiro manualmente:
-- INSERT INTO configuracoes (chave, valor) VALUES ('financeiro_senha', 'sua_senha');
create table if not exists configuracoes (
  chave text primary key,
  valor text not null
);
alter table configuracoes disable row level security;

-- ─── Barbeiros ───────────────────────────────────────────────
create table if not exists barbeiros (
  id            serial primary key,
  nome          text not null,
  gcal_color_id text not null default '9',
  ativo         boolean not null default true,
  created_at    timestamptz default now()
);

-- ─── Tipo de produto (bar = consumo local, loja = venda) ─────
-- Execute este alter se a tabela produtos já existir:
alter table produtos add column if not exists tipo text default 'loja'
  check (tipo in ('bar', 'loja'));

-- ─── Comandas ────────────────────────────────────────────────
create table if not exists comandas (
  id              serial primary key,
  atendimento_id  integer references atendimentos(id) on delete set null,
  gcal_event_id   text unique,
  cliente_nome    text,
  evento_gcal     jsonb,
  servicos        jsonb default '[]',
  itens_bar       jsonb default '[]',
  itens_loja      jsonb default '[]',
  valor_servicos  numeric(10,2) default 0,
  valor_bar       numeric(10,2) default 0,
  valor_loja      numeric(10,2) default 0,
  valor_total     numeric(10,2) default 0,
  forma_pagamento text check (forma_pagamento in ('debito','credito','pix')),
  status          text default 'aberta' check (status in ('aberta','fechada')),
  created_at      timestamptz default now()
);

-- Execute se a tabela já existir sem as novas colunas:
alter table comandas add column if not exists cliente_nome text;
alter table comandas add column if not exists evento_gcal jsonb;
alter table comandas add column if not exists cliente_id integer references clientes(id) on delete set null;
alter table comandas add column if not exists desconto jsonb;
alter table servicos add column if not exists duracao_minutos integer default 30;
alter table planos add column if not exists checkout_url text;

-- ─── Planos de assinatura ────────────────────────────────────────
create table if not exists planos (
  id         serial primary key,
  nome       text not null,
  valor      numeric(10,2) not null default 0,
  intervalo  text not null default 'mensal'
             check (intervalo in ('semanal','mensal','trimestral','anual')),
  descricao  text,
  ativo      boolean not null default true,
  created_at timestamptz default now()
);

-- ─── Assinaturas ─────────────────────────────────────────────────
create table if not exists assinaturas (
  id                      serial primary key,
  cliente_id              integer references clientes(id) on delete cascade,
  plano_id                integer references planos(id) on delete set null,
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

-- ─── Log de webhooks de pagamento ────────────────────────────────
create table if not exists webhook_logs (
  id         serial primary key,
  gateway    text,
  evento     text,
  payload    jsonb,
  processado boolean default false,
  erro       text,
  created_at timestamptz default now()
);

-- ─── Horários especiais ───────────────────────────────────────────
create table if not exists horarios_especiais (
  id              serial primary key,
  data            date not null unique,
  hora_abertura   text not null default '09:00',
  hora_fechamento text not null default '20:00',
  fechado         boolean not null default false,
  motivo          text,
  created_at      timestamptz default now()
);

-- ─── Row Level Security (RLS) ────────────────────────────────
-- Por padrão desabilitado para desenvolvimento.
-- Habilite e configure policies antes de ir para produção.

alter table categorias   disable row level security;
alter table produtos      disable row level security;
alter table clientes      disable row level security;
alter table atendimentos  disable row level security;
alter table historico     disable row level security;
alter table servicos      disable row level security;
alter table barbeiros            disable row level security;
alter table comandas             disable row level security;
alter table planos               disable row level security;
alter table assinaturas          disable row level security;
alter table webhook_logs         disable row level security;
alter table horarios_especiais   disable row level security;
