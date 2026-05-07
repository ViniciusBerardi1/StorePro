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

-- Impede que o mesmo benefício seja aplicado duas vezes na mesma comanda
-- (ex: retry de rede em finalizarComanda). Partial index exclui estornos.
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

-- Uso de benefícios — unique index anti-duplicata por comanda
create unique index if not exists idx_uso_beneficios_comanda_unico
  on uso_beneficios(comanda_id, beneficio_id)
  where comanda_id is not null and not estornado;

-- Produtos
alter table produtos add column if not exists tipo text default 'loja'
  check (tipo in ('bar', 'loja'));

-- Serviços
alter table servicos add column if not exists duracao_minutos integer default 30;

-- Atendimentos
alter table atendimentos add column if not exists barbeiro_id integer references barbeiros(id) on delete set null;
alter table atendimentos add column if not exists comanda_id  integer references comandas(id)  on delete set null;

create unique index if not exists idx_atendimentos_comanda
  on atendimentos(comanda_id)
  where comanda_id is not null;

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
alter table comandas add column if not exists version              integer not null default 1;
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

-- ─── Trigger: imutabilidade + timestamps server-side ────────────
create or replace function validar_fechamento_comanda()
returns trigger language plpgsql as $$
declare v_soma numeric;
begin
  -- Bloqueia apenas mudanças de status a partir de 'fechada'
  -- (permite atualizar outros campos, ex: gcal_event_id = null ao reabrir agenda)
  if OLD.status = 'fechada' and NEW.status is distinct from OLD.status then
    raise exception
      'Comanda % já está fechada e não pode ser reaberta', OLD.id
      using errcode = 'P0002';
  end if;

  if NEW.status = 'fechada' then
    if NEW.forma_pagamento is null or
       NEW.forma_pagamento not in ('debito', 'credito', 'pix') then
      raise exception
        'forma_pagamento inválida ou ausente: "%"',
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

    -- Timestamps definidos pelo banco — nunca pelo relógio do cliente
    NEW.closed_at  := now();
    NEW.updated_at := now();
  else
    NEW.updated_at := now();
  end if;

  -- Incrementa version em todo UPDATE bem-sucedido (optimistic locking)
  NEW.version := coalesce(OLD.version, 0) + 1;

  return NEW;
end;
$$;

drop trigger if exists trg_validar_fechamento_comanda on comandas;
create trigger trg_validar_fechamento_comanda
  before update on comandas
  for each row
  execute function validar_fechamento_comanda();

-- ─── RPC: finalizar_comanda() — operação atômica ────────────────
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
  v_comanda    comandas%rowtype;
  v_atend_id   integer;
  v_todos_itens jsonb;
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
  v_itens_bar            := coalesce(p_payload->'itens_bar',           '[]');
  v_itens_loja           := coalesce(p_payload->'itens_loja',          '[]');
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

  -- Passo 1: lock pessimista — serializa concorrência na mesma comanda
  select * into v_comanda from comandas where id = p_comanda_id for update;

  if not found then
    raise exception 'Comanda % não encontrada', p_comanda_id using errcode = 'P0001';
  end if;
  if v_comanda.deleted_at is not null then
    raise exception 'Comanda % está cancelada', p_comanda_id using errcode = 'P0006';
  end if;

  -- Passo 2: idempotência — retry de rede retorna resultado original
  if v_comanda.status = 'fechada' then
    select id into v_atend_id from atendimentos where comanda_id = p_comanda_id limit 1;
    return jsonb_build_object(
      'ok', true, 'idempotent', true, 'comanda_id', p_comanda_id,
      'atendimento_id', v_atend_id,
      'message', 'Comanda já fechada — resultado original retornado'
    );
  end if;

  -- Passo 3: optimistic locking — detecta edição concorrente entre operadores
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

  -- Passo 5: baixar estoque (FOR UPDATE por produto, dentro da mesma TX)
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

  -- Passo 6: registrar atendimento ANTES de fechar comanda (ON CONFLICT = idempotente)
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
      comanda_id = excluded.comanda_id, barbeiro_id = excluded.barbeiro_id,
      servicos = excluded.servicos, valor_total = excluded.valor_total,
      forma_pagamento = excluded.forma_pagamento, status = excluded.status,
      observacoes = excluded.observacoes
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
      barbeiro_id = excluded.barbeiro_id, servicos = excluded.servicos,
      valor_total = excluded.valor_total, forma_pagamento = excluded.forma_pagamento,
      status = excluded.status
    returning id into v_atend_id;
  end if;

  -- Passo 7: fechar comanda (trigger valida + seta closed_at/updated_at + incrementa version)
  update comandas set
    status = 'fechada', atendimento_id = v_atend_id,
    servicos = v_servicos, itens_bar = v_itens_bar, itens_loja = v_itens_loja,
    valor_servicos = v_valor_servicos, valor_bar = v_valor_bar, valor_loja = v_valor_loja,
    valor_total = v_valor_total, forma_pagamento = v_forma_pagamento,
    desconto = v_desconto, beneficio_desconto = v_beneficio_desconto,
    beneficios_aplicados = v_beneficios_aplicados,
    barbeiro_id = coalesce(v_barbeiro_id, barbeiro_id)
  where id = p_comanda_id;

  -- Passo 8: uso de benefícios (ON CONFLICT DO NOTHING = idempotente)
  if jsonb_array_length(v_beneficio_registros) > 0 then
    insert into uso_beneficios (
      assinatura_id, cliente_id, plano_id, comanda_id,
      ciclo, beneficio_id, quantidade, valor_desconto
    )
    select
      nullif(r->>'assinatura_id','')::bigint, nullif(r->>'cliente_id','')::bigint,
      nullif(r->>'plano_id','')::bigint, p_comanda_id,
      r->>'ciclo', r->>'beneficio_id',
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
      'valor_total', v_valor_total, 'valor_servicos', v_valor_servicos,
      'valor_bar', v_valor_bar, 'valor_loja', v_valor_loja,
      'forma_pagamento', v_forma_pagamento, 'beneficio_desconto', v_beneficio_desconto,
      'atendimento_id', v_atend_id, 'version_finalizado', v_comanda.version
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

-- ─── RPC: cancelar_comanda() — cancelamento atômico ─────────────
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
  where comanda_id = p_comanda_id and not estornado;

  update comandas set
    status = 'cancelada', deleted_at = now(),
    deleted_reason = p_motivo, updated_at = now()
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

grant execute on function finalizar_comanda(integer, jsonb) to anon;
grant execute on function cancelar_comanda(integer, text)   to anon;
