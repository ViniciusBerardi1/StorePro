-- ============================================================
-- StorePro — Schema Supabase (fonte única de verdade)
-- Execute este arquivo para criar o banco do zero.
-- Para bancos existentes, rode os ALTER TABLE no final.
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
  data_hora       timestamptz not null,
  cliente_nome    text,
  cliente_id      integer references clientes(id) on delete set null,
  barbeiro_id     integer references barbeiros(id) on delete set null,
  servicos        jsonb default '[]',
  valor_total     numeric(10,2) default 0,
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
  id            bigserial primary key,
  assinatura_id bigint references assinaturas(id) on delete cascade,
  cliente_id    bigint references clientes(id)    on delete set null,
  plano_id      bigint references planos(id)      on delete set null,
  comanda_id    bigint,
  ciclo         text not null,         -- 'YYYY-MM'
  beneficio_id  text not null,         -- UUID do planos.beneficios[].id
  quantidade    integer not null default 1,
  valor_desconto numeric(10,2),
  estornado     boolean not null default false,
  created_at    timestamptz default now()
);

create index if not exists idx_uso_beneficios_lookup
  on uso_beneficios(assinatura_id, ciclo);

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
  deleted_reason       text
);

create index if not exists idx_comandas_status    on comandas(status, created_at desc);
create index if not exists idx_comandas_cliente   on comandas(cliente_id);

-- ─── Eventos de auditoria das comandas ───────────────────────
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

-- ─── Row Level Security ───────────────────────────────────────
-- App single-tenant sem Supabase Auth: toda operação usa a anon key.
-- As políticas permitem CRUD completo ao role 'anon' para tabelas
-- operacionais, e apenas SELECT+INSERT para tabelas de auditoria
-- (historico, comanda_eventos, webhook_logs — imutáveis por design).
-- A service_role key nunca aparece no frontend; RLS é contornado só
-- internamente via Edge Functions quando necessário.

-- ── Tabelas operacionais (CRUD completo para anon) ─────────────
alter table categorias         enable row level security;
alter table produtos           enable row level security;
alter table clientes           enable row level security;
alter table servicos           enable row level security;
alter table barbeiros          enable row level security;
alter table configuracoes      enable row level security;
alter table atendimentos       enable row level security;
alter table planos             enable row level security;
alter table assinaturas        enable row level security;
alter table uso_beneficios     enable row level security;
alter table comandas           enable row level security;
alter table horarios_especiais enable row level security;

create policy "anon_all" on categorias         for all to anon using (true) with check (true);
create policy "anon_all" on produtos           for all to anon using (true) with check (true);
create policy "anon_all" on clientes           for all to anon using (true) with check (true);
create policy "anon_all" on servicos           for all to anon using (true) with check (true);
create policy "anon_all" on barbeiros          for all to anon using (true) with check (true);
create policy "anon_all" on configuracoes      for all to anon using (true) with check (true);
create policy "anon_all" on atendimentos       for all to anon using (true) with check (true);
create policy "anon_all" on planos             for all to anon using (true) with check (true);
create policy "anon_all" on assinaturas        for all to anon using (true) with check (true);
create policy "anon_all" on uso_beneficios     for all to anon using (true) with check (true);
create policy "anon_all" on comandas           for all to anon using (true) with check (true);
create policy "anon_all" on horarios_especiais for all to anon using (true) with check (true);

-- ── Tabelas de auditoria (apenas SELECT + INSERT para anon) ────
-- Registros nunca são atualizados nem deletados pelo frontend.
alter table historico       enable row level security;
alter table comanda_eventos enable row level security;
alter table webhook_logs    enable row level security;

create policy "anon_select" on historico       for select to anon using (true);
create policy "anon_insert" on historico       for insert to anon with check (true);
create policy "anon_select" on comanda_eventos for select to anon using (true);
create policy "anon_insert" on comanda_eventos for insert to anon with check (true);
create policy "anon_select" on webhook_logs    for select to anon using (true);
create policy "anon_insert" on webhook_logs    for insert to anon with check (true);

-- ============================================================
-- ALTER TABLE para bancos EXISTENTES (idempotentes, podem
-- ser re-executados sem erro em bancos novos).
-- ============================================================

-- Produtos
alter table produtos add column if not exists tipo text default 'loja'
  check (tipo in ('bar', 'loja'));

-- Serviços
alter table servicos add column if not exists duracao_minutos integer default 30;

-- Atendimentos
alter table atendimentos add column if not exists barbeiro_id integer references barbeiros(id) on delete set null;

-- Historico
alter table historico add column if not exists tipo               text default 'zerado';
alter table historico add column if not exists quantidade_anterior integer;
alter table historico add column if not exists quantidade_nova    integer;
alter table historico add column if not exists data_reposto       timestamptz;
alter table historico add column if not exists quantidade_reposta integer;

-- Planos
alter table planos add column if not exists checkout_url text;
alter table planos add column if not exists beneficios   jsonb not null default '[]';

-- Assinaturas
alter table assinaturas add column if not exists barbeiro_id integer references barbeiros(id) on delete set null;

-- Uso de benefícios
alter table uso_beneficios add column if not exists estornado boolean not null default false;

-- Comandas (colunas incrementais)
alter table comandas add column if not exists cliente_nome         text;
alter table comandas add column if not exists cliente_id           integer references clientes(id) on delete set null;
alter table comandas add column if not exists barbeiro_id          integer references barbeiros(id) on delete set null;
alter table comandas add column if not exists evento_gcal          jsonb;
alter table comandas add column if not exists desconto             jsonb;
alter table comandas add column if not exists beneficio_desconto   numeric(10,2) default 0;
alter table comandas add column if not exists beneficios_aplicados jsonb default '[]';
alter table comandas add column if not exists updated_at           timestamptz default now();
alter table comandas add column if not exists closed_at            timestamptz;
alter table comandas add column if not exists deleted_at           timestamptz;
alter table comandas add column if not exists deleted_reason       text;

-- Expandir status da comanda para incluir 'cancelada'
alter table comandas drop constraint if exists comandas_status_check;
alter table comandas add constraint comandas_status_check
  check (status in ('aberta', 'fechada', 'cancelada'));

-- Índices de performance para comandas
create index if not exists idx_comandas_status  on comandas(status, created_at desc);
create index if not exists idx_comandas_cliente on comandas(cliente_id);

-- Tabelas de auditoria (idempotentes)
create table if not exists comanda_eventos (
  id          bigserial primary key,
  comanda_id  integer not null references comandas(id) on delete cascade,
  tipo        text not null,
  descricao   text,
  payload     jsonb,
  created_at  timestamptz default now()
);
create index if not exists idx_comanda_eventos_comanda
  on comanda_eventos(comanda_id, created_at desc);

-- ─── Stored procedure: baixar estoque em batch atômico ──────────
-- Recebe um array JSON de {produto_id, quantidade} e executa todos
-- os decrementos + inserções no historico em uma única transação.
create or replace function baixar_estoque_comanda(items jsonb)
returns void language plpgsql as $$
declare
  item_rec  jsonb;
  v_pid     int;
  v_qtd     int;
  v_ant     int;
  v_nov     int;
  v_nome    text;
  v_cor     text;
  v_cat     text;
  v_foto    text;
  v_tipo    text;
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
      when v_nov = 0         then 'zerado'
      when v_nov > v_ant     then 'entrada'
      else                        'saida'
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

-- ─── RLS para bancos EXISTENTES (idempotente) ───────────────────
-- Habilita RLS e cria políticas para o role anon.
-- "drop policy if exists" garante idempotência ao re-executar.

-- Tabelas operacionais
alter table categorias         enable row level security;
alter table produtos           enable row level security;
alter table clientes           enable row level security;
alter table servicos           enable row level security;
alter table barbeiros          enable row level security;
alter table configuracoes      enable row level security;
alter table atendimentos       enable row level security;
alter table planos             enable row level security;
alter table assinaturas        enable row level security;
alter table uso_beneficios     enable row level security;
alter table comandas           enable row level security;
alter table horarios_especiais enable row level security;

-- Políticas CRUD completo para anon (statements explícitos — EXECUTE aceita 1 por vez)
drop policy if exists anon_all on categorias;         create policy anon_all on categorias         for all to anon using (true) with check (true);
drop policy if exists anon_all on produtos;           create policy anon_all on produtos           for all to anon using (true) with check (true);
drop policy if exists anon_all on clientes;           create policy anon_all on clientes           for all to anon using (true) with check (true);
drop policy if exists anon_all on servicos;           create policy anon_all on servicos           for all to anon using (true) with check (true);
drop policy if exists anon_all on barbeiros;          create policy anon_all on barbeiros          for all to anon using (true) with check (true);
drop policy if exists anon_all on configuracoes;      create policy anon_all on configuracoes      for all to anon using (true) with check (true);
drop policy if exists anon_all on atendimentos;       create policy anon_all on atendimentos       for all to anon using (true) with check (true);
drop policy if exists anon_all on planos;             create policy anon_all on planos             for all to anon using (true) with check (true);
drop policy if exists anon_all on assinaturas;        create policy anon_all on assinaturas        for all to anon using (true) with check (true);
drop policy if exists anon_all on uso_beneficios;     create policy anon_all on uso_beneficios     for all to anon using (true) with check (true);
drop policy if exists anon_all on comandas;           create policy anon_all on comandas           for all to anon using (true) with check (true);
drop policy if exists anon_all on horarios_especiais; create policy anon_all on horarios_especiais for all to anon using (true) with check (true);

-- Tabelas de auditoria (somente SELECT + INSERT)
alter table historico       enable row level security;
alter table comanda_eventos enable row level security;
alter table webhook_logs    enable row level security;

drop policy if exists anon_select on historico;       create policy anon_select on historico       for select to anon using (true);
drop policy if exists anon_insert on historico;       create policy anon_insert on historico       for insert to anon with check (true);
drop policy if exists anon_select on comanda_eventos; create policy anon_select on comanda_eventos for select to anon using (true);
drop policy if exists anon_insert on comanda_eventos; create policy anon_insert on comanda_eventos for insert to anon with check (true);
drop policy if exists anon_select on webhook_logs;    create policy anon_select on webhook_logs    for select to anon using (true);
drop policy if exists anon_insert on webhook_logs;    create policy anon_insert on webhook_logs    for insert to anon with check (true);

-- ─── Trigger item 13: validação de valor_total ao fechar comanda ─
create or replace function validar_fechamento_comanda()
returns trigger language plpgsql as $$
declare v_soma numeric;
begin
  -- Só dispara ao transitar para 'fechada'
  if NEW.status = 'fechada' and (OLD.status is distinct from 'fechada') then
    if coalesce(NEW.valor_total, -1) < 0 then
      raise exception 'valor_total não pode ser negativo';
    end if;

    v_soma := coalesce(NEW.valor_servicos, 0)
            + coalesce(NEW.valor_bar, 0)
            + coalesce(NEW.valor_loja, 0);

    -- Total nunca pode superar a soma bruta (descontos só reduzem)
    if NEW.valor_total > round(v_soma + 0.01, 2) then
      raise exception
        'valor_total (%) superior à soma dos componentes (%). Possível manipulação.',
        NEW.valor_total, v_soma;
    end if;

    if NEW.forma_pagamento is null then
      raise exception 'forma_pagamento obrigatória ao fechar comanda';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_validar_fechamento_comanda on comandas;
create trigger trg_validar_fechamento_comanda
  before update on comandas
  for each row
  execute function validar_fechamento_comanda();
