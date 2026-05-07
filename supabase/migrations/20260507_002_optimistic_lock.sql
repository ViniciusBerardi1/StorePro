-- ============================================================
-- StorePro — Migration: Optimistic locking + controle de concorrência
-- Aplique após 20260507_001_finalizar_comanda.sql
-- ============================================================

-- ─── 1. Coluna version (counter de edições) ───────────────────
-- Inteiro monotonicamente crescente, nunca nulo.
-- Mais confiável que updated_at para optimistic locking:
--   • Sem colisão de timestamps em requests simultâneos
--   • Imune à dessincronização de relógios entre servidores
alter table comandas
  add column if not exists version integer not null default 1;

-- ─── 2. Trigger reforçado: incrementa version + timestamps ────
-- Toda atualização bem-sucedida em uma comanda 'aberta' incrementa
-- a version. O frontend usa esse valor como "token de edição":
--   cliente carrega version=3 → edita → envia version=3 → ok
--   outro operador editou antes → banco tem version=4 → conflito detectado
create or replace function validar_fechamento_comanda()
returns trigger language plpgsql as $$
declare v_soma numeric;
begin
  -- Imutabilidade total: bloqueia qualquer UPDATE em comanda já fechada
  if OLD.status = 'fechada' then
    raise exception
      'Comanda % já está fechada e não pode ser modificada', OLD.id
      using errcode = 'P0002';
  end if;

  -- Validações na transição para 'fechada'
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
    -- Timestamps do servidor — cliente não pode definir esses valores
    NEW.closed_at  := now();
    NEW.updated_at := now();
  else
    -- Autosave: apenas atualiza updated_at
    NEW.updated_at := now();
  end if;

  -- Incrementa version em TODA atualização bem-sucedida
  NEW.version := coalesce(OLD.version, 0) + 1;

  return NEW;
end;
$$;

drop trigger if exists trg_validar_fechamento_comanda on comandas;
create trigger trg_validar_fechamento_comanda
  before update on comandas
  for each row
  execute function validar_fechamento_comanda();

-- ─── 3. finalizar_comanda(): adiciona verificação de version ──
-- Se o cliente enviar p_payload.version, o banco verifica se a
-- comanda não foi modificada por outro operador desde que o
-- cliente a carregou.
--
-- Cenário protegido:
--   Operador A abre comanda (version=3)
--   Operador B autosave → version vira 4 no banco
--   Operador A tenta finalizar com version=3 → CONFLITO detectado
--   "Esta comanda foi modificada em outra sessão. Recarregue."

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
  -- ── 0. Extrair payload ──────────────────────────────────────
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

  -- ── 1. Lock pessimista ──────────────────────────────────────
  -- FOR UPDATE: serializa qualquer acesso concorrente a esta comanda.
  -- Segundo operador bloqueia aqui até o COMMIT do primeiro,
  -- depois encontra status='fechada' e cai na idempotência (passo 2).
  select * into v_comanda
  from   comandas
  where  id = p_comanda_id
  for    update;

  if not found then
    raise exception 'Comanda % não encontrada', p_comanda_id
      using errcode = 'P0001';
  end if;
  if v_comanda.deleted_at is not null then
    raise exception 'Comanda % está cancelada e não pode ser fechada', p_comanda_id
      using errcode = 'P0006';
  end if;

  -- ── 2. Idempotência ─────────────────────────────────────────
  -- Retry de rede, double-submit ou segundo operador:
  -- se já está fechada, retorna o resultado original sem re-executar.
  if v_comanda.status = 'fechada' then
    select id into v_atend_id
    from   atendimentos
    where  comanda_id = p_comanda_id
    limit  1;
    return jsonb_build_object(
      'ok', true, 'idempotent', true,
      'comanda_id', p_comanda_id, 'atendimento_id', v_atend_id,
      'message', 'Comanda já fechada — resultado original retornado'
    );
  end if;

  -- ── 3. Optimistic locking ───────────────────────────────────
  -- Verifica se o cliente tem a versão mais recente da comanda.
  -- Protege contra: duas abas, dois operadores editando simultaneamente.
  -- Opcional: se version não for enviado, pula a verificação (backward compat).
  if v_client_version is not null and v_comanda.version != v_client_version then
    raise exception
      'Conflito: comanda % foi modificada por outra sessão (version banco=%, version cliente=%). Recarregue e tente novamente.',
      p_comanda_id, v_comanda.version, v_client_version
      using errcode = 'P0010';
  end if;

  -- ── 4. Validações server-side ───────────────────────────────
  if v_forma_pagamento is null or v_forma_pagamento not in ('debito','credito','pix') then
    raise exception 'forma_pagamento inválida: "%"',
      coalesce(v_forma_pagamento,'null') using errcode = 'P0003';
  end if;
  if v_valor_total < 0 then
    raise exception 'valor_total não pode ser negativo: %', v_valor_total
      using errcode = 'P0004';
  end if;
  v_soma := v_valor_servicos + v_valor_bar + v_valor_loja;
  if v_valor_total > round(v_soma + 0.01, 2) then
    raise exception 'valor_total (%) superior à soma dos componentes (%).',
      v_valor_total, v_soma using errcode = 'P0005';
  end if;

  -- ── 5. Baixar estoque ───────────────────────────────────────
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

  -- ── 6. Registrar atendimento (ANTES de fechar comanda) ──────
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

  -- ── 7. Fechar comanda ────────────────────────────────────────
  -- Trigger dispara: valida + seta closed_at/updated_at + incrementa version
  update comandas set
    status = 'fechada', atendimento_id = v_atend_id,
    servicos = v_servicos, itens_bar = v_itens_bar, itens_loja = v_itens_loja,
    valor_servicos = v_valor_servicos, valor_bar = v_valor_bar, valor_loja = v_valor_loja,
    valor_total = v_valor_total, forma_pagamento = v_forma_pagamento,
    desconto = v_desconto, beneficio_desconto = v_beneficio_desconto,
    beneficios_aplicados = v_beneficios_aplicados,
    barbeiro_id = coalesce(v_barbeiro_id, barbeiro_id)
  where id = p_comanda_id;

  -- ── 8. Uso de benefícios ─────────────────────────────────────
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

  -- ── 9. Evento de auditoria (garantido — dentro da TX) ────────
  insert into comanda_eventos (comanda_id, tipo, descricao, payload)
  values (
    p_comanda_id, 'fechada',
    format('Fechada — R$ %s via %s', to_char(v_valor_total,'FM999999990.00'), v_forma_pagamento),
    jsonb_build_object(
      'valor_total', v_valor_total, 'forma_pagamento', v_forma_pagamento,
      'valor_servicos', v_valor_servicos, 'valor_bar', v_valor_bar,
      'valor_loja', v_valor_loja, 'beneficio_desconto', v_beneficio_desconto,
      'atendimento_id', v_atend_id, 'version_finalizado', v_comanda.version
    )
  );

  return jsonb_build_object(
    'ok', true, 'idempotent', false,
    'comanda_id', p_comanda_id, 'atendimento_id', v_atend_id,
    'valor_total', v_valor_total
  );

exception
  when others then
    raise exception 'Erro ao finalizar comanda %: % (SQLSTATE %)',
      p_comanda_id, sqlerrm, sqlstate;
end;
$$;

grant execute on function finalizar_comanda(integer, jsonb) to anon;
