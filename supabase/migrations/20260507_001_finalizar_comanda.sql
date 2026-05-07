-- ============================================================
-- StorePro — Migration: finalizar_comanda() atômica
-- Aplique uma vez no Supabase SQL Editor.
-- Todos os statements são idempotentes (IF NOT EXISTS / CREATE OR REPLACE).
-- ============================================================

-- ─── 1. Idempotência: ligar atendimento à comanda de origem ──
-- Permite que finalizar_comanda() detecte retry de rede e retorne
-- o resultado original sem re-executar nenhum passo.

alter table atendimentos
  add column if not exists comanda_id integer references comandas(id) on delete set null;

-- Índice parcial: garante 1 atendimento por comanda (quando comanda_id preenchido)
create unique index if not exists idx_atendimentos_comanda
  on atendimentos(comanda_id)
  where comanda_id is not null;

-- ─── 2. Trigger reforçado ─────────────────────────────────────
-- Mudanças em relação à versão anterior:
--   a) Comandas 'fechadas' são completamente imutáveis
--   b) closed_at e updated_at são definidos pelo servidor (não pelo cliente)
--   c) Validação de forma_pagamento mais rigorosa

create or replace function validar_fechamento_comanda()
returns trigger language plpgsql as $$
declare
  v_soma numeric;
begin
  -- (a) Imutabilidade: qualquer UPDATE em comanda já fechada é bloqueado
  if OLD.status = 'fechada' then
    raise exception
      'Comanda % já está fechada e não pode ser modificada', OLD.id
      using errcode = 'P0002';
  end if;

  -- (b) Validações na transição aberta → fechada
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

    -- valor_total não pode ser maior que a soma bruta — desconto só reduz
    if NEW.valor_total > round(v_soma + 0.01, 2) then
      raise exception
        'valor_total (%) superior à soma dos componentes (%). Possível manipulação.',
        NEW.valor_total, v_soma
        using errcode = 'P0005';
    end if;

    -- (c) Timestamps do servidor — nunca do relógio do cliente
    NEW.closed_at  := now();
    NEW.updated_at := now();
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_validar_fechamento_comanda on comandas;
create trigger trg_validar_fechamento_comanda
  before update on comandas
  for each row
  execute function validar_fechamento_comanda();

-- ─── 3. finalizar_comanda(): operação atômica principal ───────
--
-- Arquitetura de transação:
--   BEGIN (implícito — Supabase abre automaticamente para cada RPC)
--     Passo 1: FOR UPDATE na comanda  → lock pessimista, serializa concorrência
--     Passo 2: Idempotência           → retry seguro sem re-execução
--     Passo 3: Validações server-side → segunda barreira (trigger é a terceira)
--     Passo 4: Baixar estoque         → delega para baixar_estoque_comanda()
--     Passo 5: INSERT atendimento     → ANTES de fechar; ON CONFLICT = idempotente
--     Passo 6: UPDATE comanda fechada → dispara trigger (3ª barreira de validação)
--     Passo 7: INSERT uso_beneficios  → ON CONFLICT DO NOTHING = idempotente
--     Passo 8: INSERT comanda_eventos → garantido (dentro da TX, não fire-and-forget)
--   COMMIT (ou ROLLBACK automático em qualquer exceção)

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

  -- Campos extraídos do payload
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
begin
  -- ── 0. Extrair e normalizar payload ────────────────────────
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
  v_data_hora            := coalesce(
                              nullif(p_payload->>'data_hora', '')::timestamptz,
                              now()
                            );
  v_observacoes          := coalesce(p_payload->>'observacoes', '');

  -- ── 1. Lock pessimista + verificação de existência ─────────
  -- FOR UPDATE: se dois operadores tentarem fechar a mesma comanda
  -- simultaneamente, o segundo bloqueia aqui até o COMMIT do primeiro.
  -- Depois encontra status='fechada' e cai na idempotência (passo 2).
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
  -- Retry de rede: comanda já fechada → retorna resultado original.
  -- Nenhum passo é re-executado; nenhuma inconsistência é gerada.
  if v_comanda.status = 'fechada' then
    select id into v_atend_id
    from   atendimentos
    where  comanda_id = p_comanda_id
    limit  1;

    return jsonb_build_object(
      'ok',             true,
      'idempotent',     true,
      'comanda_id',     p_comanda_id,
      'atendimento_id', v_atend_id,
      'message',        'Comanda já fechada — resultado original retornado sem re-execução'
    );
  end if;

  -- ── 3. Validações server-side (1ª barreira) ─────────────────
  -- 2ª barreira = trigger trg_validar_fechamento_comanda no passo 6.
  -- Validar aqui evita que o banco execute passos desnecessários
  -- antes de rejeitar por forma_pagamento ou valor inválido.
  if v_forma_pagamento is null or
     v_forma_pagamento not in ('debito', 'credito', 'pix') then
    raise exception 'forma_pagamento inválida: "%"',
      coalesce(v_forma_pagamento, 'null')
      using errcode = 'P0003';
  end if;

  if v_valor_total < 0 then
    raise exception 'valor_total não pode ser negativo: %', v_valor_total
      using errcode = 'P0004';
  end if;

  v_soma := v_valor_servicos + v_valor_bar + v_valor_loja;
  if v_valor_total > round(v_soma + 0.01, 2) then
    raise exception
      'valor_total (%) superior à soma dos componentes (%). Verifique os cálculos.',
      v_valor_total, v_soma
      using errcode = 'P0005';
  end if;

  -- ── 4. Baixar estoque ───────────────────────────────────────
  -- Agrega itens_bar + itens_loja e chama baixar_estoque_comanda().
  -- Essa função usa FOR UPDATE por produto → atômica dentro desta TX.
  -- Falha aqui = rollback completo; comanda continua 'aberta'.
  v_todos_itens := (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'produto_id', (item->>'produto_id')::integer,
          'quantidade', (item->>'quantidade')::integer
        )
      ),
      '[]'::jsonb
    )
    from jsonb_array_elements(v_itens_bar || v_itens_loja) as item
    where coalesce((item->>'quantidade')::integer, 0) > 0
      and (item->>'produto_id') is not null
      and (item->>'produto_id') <> ''
  );

  if jsonb_array_length(v_todos_itens) > 0 then
    perform baixar_estoque_comanda(v_todos_itens);
  end if;

  -- ── 5. Registrar atendimento (ANTES de marcar fechada) ──────
  -- Sequência crítica: atendimento inserido primeiro.
  -- Se o passo 6 (UPDATE comanda) falhar, a TX faz rollback e o
  -- atendimento também é desfeito — nunca fica órfão.
  -- ON CONFLICT garante idempotência em retry:
  --   • com gcal_event_id  → conflict no unique de gcal_event_id
  --   • sem gcal_event_id  → conflict no idx_atendimentos_comanda (partial)

  if v_comanda.gcal_event_id is not null then
    insert into atendimentos (
      comanda_id, gcal_event_id, data_hora,
      cliente_nome, cliente_id, barbeiro_id,
      servicos, valor_total, forma_pagamento,
      status, observacoes
    ) values (
      p_comanda_id,
      v_comanda.gcal_event_id,
      v_data_hora,
      v_comanda.cliente_nome,
      v_comanda.cliente_id,
      coalesce(v_barbeiro_id, v_comanda.barbeiro_id),
      v_servicos,
      v_valor_total,
      v_forma_pagamento,
      'concluido',
      v_observacoes
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
      comanda_id, data_hora,
      cliente_nome, cliente_id, barbeiro_id,
      servicos, valor_total, forma_pagamento, status
    ) values (
      p_comanda_id,
      v_data_hora,
      v_comanda.cliente_nome,
      v_comanda.cliente_id,
      coalesce(v_barbeiro_id, v_comanda.barbeiro_id),
      v_servicos,
      v_valor_total,
      v_forma_pagamento,
      'concluido'
    )
    on conflict (comanda_id) where comanda_id is not null do update set
      barbeiro_id     = excluded.barbeiro_id,
      servicos        = excluded.servicos,
      valor_total     = excluded.valor_total,
      forma_pagamento = excluded.forma_pagamento,
      status          = excluded.status
    returning id into v_atend_id;
  end if;

  -- ── 6. Fechar comanda ────────────────────────────────────────
  -- O trigger trg_validar_fechamento_comanda dispara aqui e:
  --   • aplica 2ª barreira de validação
  --   • seta closed_at = now() (timestamp do servidor)
  --   • seta updated_at = now() (timestamp do servidor)
  -- closed_at e updated_at do payload do cliente são ignorados.
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

  -- ── 7. Registrar uso de benefícios ──────────────────────────
  -- ON CONFLICT DO NOTHING = idempotente via idx_uso_beneficios_comanda_unico.
  -- Falha aqui = rollback completo de todos os passos anteriores.
  if jsonb_array_length(v_beneficio_registros) > 0 then
    insert into uso_beneficios (
      assinatura_id, cliente_id, plano_id, comanda_id,
      ciclo, beneficio_id, quantidade, valor_desconto
    )
    select
      nullif(r->>'assinatura_id', '')::bigint,
      nullif(r->>'cliente_id',    '')::bigint,
      nullif(r->>'plano_id',      '')::bigint,
      p_comanda_id,
      r->>'ciclo',
      r->>'beneficio_id',
      coalesce(nullif(r->>'quantidade', '')::integer, 1),
      nullif(r->>'valor_desconto', '')::numeric
    from jsonb_array_elements(v_beneficio_registros) r
    where (r->>'beneficio_id') is not null
      and (r->>'beneficio_id') <> ''
    on conflict do nothing;
  end if;

  -- ── 8. Evento de auditoria (garantido — dentro da TX) ───────
  -- Nunca é fire-and-forget. Se o INSERT falhar, toda a TX reverte.
  -- Se não falhar, o evento sempre existirá quando a comanda existir como fechada.
  insert into comanda_eventos (comanda_id, tipo, descricao, payload)
  values (
    p_comanda_id,
    'fechada',
    format(
      'Fechada — R$ %s via %s',
      to_char(v_valor_total, 'FM999999990.00'),
      v_forma_pagamento
    ),
    jsonb_build_object(
      'valor_total',        v_valor_total,
      'valor_servicos',     v_valor_servicos,
      'valor_bar',          v_valor_bar,
      'valor_loja',         v_valor_loja,
      'forma_pagamento',    v_forma_pagamento,
      'beneficio_desconto', v_beneficio_desconto,
      'servicos_count',     jsonb_array_length(v_servicos),
      'itens_bar_count',    jsonb_array_length(v_itens_bar),
      'itens_loja_count',   jsonb_array_length(v_itens_loja),
      'atendimento_id',     v_atend_id
    )
  );

  -- ── Retorno ──────────────────────────────────────────────────
  return jsonb_build_object(
    'ok',             true,
    'idempotent',     false,
    'comanda_id',     p_comanda_id,
    'atendimento_id', v_atend_id,
    'valor_total',    v_valor_total
  );

exception
  when others then
    -- Toda exception propaga rollback automático do PostgreSQL.
    -- Re-lança com código SQLSTATE para o frontend distinguir
    -- erros de negócio (P00xx) de erros de infraestrutura (outros).
    raise exception 'Erro ao finalizar comanda %: % (SQLSTATE %)',
      p_comanda_id, sqlerrm, sqlstate;
end;
$$;

-- ─── 4. cancelar_comanda(): cancelamento atômico ──────────────
-- Garante que estorno de benefícios e cancelamento da comanda
-- são atômicos — ou os dois acontecem, ou nenhum.

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
  -- Lock pessimista: serializa cancelamento concorrente
  select * into v_comanda
  from   comandas
  where  id = p_comanda_id
  for    update;

  if not found then
    raise exception 'Comanda % não encontrada', p_comanda_id
      using errcode = 'P0001';
  end if;

  -- Comandas fechadas não podem ser canceladas
  if v_comanda.status = 'fechada' then
    raise exception
      'Comanda % já foi fechada e não pode ser cancelada. Use estorno.', p_comanda_id
      using errcode = 'P0007';
  end if;

  -- Idempotência: já cancelada → retorna sucesso sem re-executar
  if v_comanda.status = 'cancelada' or v_comanda.deleted_at is not null then
    return jsonb_build_object(
      'ok',         true,
      'idempotent', true,
      'message',    'Comanda já estava cancelada'
    );
  end if;

  -- Estornar uso de benefícios (atômico: dentro da mesma TX)
  update uso_beneficios
  set    estornado = true
  where  comanda_id = p_comanda_id
    and  not estornado;

  -- Cancelar comanda
  -- O trigger trg_validar_fechamento_comanda NÃO bloqueia esta transição
  -- (OLD.status = 'aberta', NEW.status = 'cancelada' — nenhuma condição dispara)
  update comandas set
    status         = 'cancelada',
    deleted_at     = now(),
    deleted_reason = p_motivo,
    updated_at     = now()
  where id = p_comanda_id;

  -- Auditoria garantida (dentro da TX)
  insert into comanda_eventos (comanda_id, tipo, descricao, payload)
  values (
    p_comanda_id,
    'cancelada',
    coalesce(nullif(trim(p_motivo), ''), 'Cancelada sem motivo registrado'),
    jsonb_build_object('motivo', p_motivo)
  );

  return jsonb_build_object(
    'ok',         true,
    'idempotent', false,
    'comanda_id', p_comanda_id
  );

exception
  when others then
    raise exception 'Erro ao cancelar comanda %: % (SQLSTATE %)',
      p_comanda_id, sqlerrm, sqlstate;
end;
$$;

-- ─── 5. Permissões ───────────────────────────────────────────
grant execute on function finalizar_comanda(integer, jsonb) to anon;
grant execute on function cancelar_comanda(integer, text)   to anon;
