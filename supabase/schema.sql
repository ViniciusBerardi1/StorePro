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
  id            serial primary key,
  data_hora     timestamptz not null,
  cliente_nome  text,
  cliente_id    integer references clientes(id) on delete set null,
  servicos      jsonb default '[]',
  valor_total   numeric(10,2) default 0,
  status        text default 'agendado'
                  check (status in ('agendado','em_andamento','concluido','cancelado')),
  forma_pagamento text check (forma_pagamento in ('debito','credito','pix')),
  observacoes   text,
  data_cadastro timestamptz default now()
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

-- ─── Row Level Security (RLS) ────────────────────────────────
-- Por padrão desabilitado para desenvolvimento.
-- Habilite e configure policies antes de ir para produção.

alter table categorias   disable row level security;
alter table produtos      disable row level security;
alter table clientes      disable row level security;
alter table atendimentos  disable row level security;
alter table historico     disable row level security;
alter table servicos      disable row level security;
