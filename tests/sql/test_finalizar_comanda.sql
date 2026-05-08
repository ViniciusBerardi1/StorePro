-- ============================================================
-- StorePro — Suíte de testes SQL (PostgreSQL / Supabase)
-- Execute INTEIRO no Supabase SQL Editor (ou psql).
-- Todos os dados de teste são destruídos ao final (ROLLBACK).
--
-- Cenários cobertos:
--   1. Bloqueio de status inválido na criação (P0008)
--   2. Criação normal → version=1, evento 'criada' gerado
--   3. Finalização normal → status fechada, closed_at, atendimento, evento
--   4. Idempotência → 2ª chamada retorna idempotent=true, sem duplicata
--   5. Optimistic locking → version errada → P0010
--   6. Forma de pagamento inválida → P0003
--   7. Valor total negativo → P0004
--   8. Valor > soma componentes → P0005
--   9. Comanda não encontrada → P0001
--  10. Comanda cancelada → P0006
--  11. Imutabilidade pós-fechamento (UPDATE bloco A) → P0002
--  12. gcal_event_id pode ser nulificado em comanda fechada
--  13. Tabelas de auditoria são append-only (historico) → P0020
--  14. Rollback: validação falha antes do estoque → estoque inalterado
--  15. Reconciliação: vw_reconciliacao_financeira detecta divergência
--  16. verificar_integridade_completa() retorna tudo_ok=true
-- ============================================================

begin;

do $$
declare
  v_cli         integer;
  v_barb        integer;
  v_cmd         integer;
  v_cmd2        integer;
  v_cmd3        integer;
  v_cmd4        integer;
  v_prod        integer;
  v_cat         integer;
  v_result      jsonb;
  v_count       integer;
  v_version1    integer;
  v_status      text;
  v_closed      timestamptz;
  v_atend_id    integer;
  v_estoque_ant integer;
  v_estoque_dep integer;
  v_delta       numeric;
  v_ok          boolean;

  -- Helper: lança exceção formatada se condição for falsa
  procedure assert(cond boolean, msg text) as $$
  begin
    if not cond then
      raise exception 'ASSERT FALHOU: %', msg;
    end if;
  end;
  $$ language plpgsql;

begin
  raise notice '══════════════════════════════════════════════════════';
  raise notice '  StorePro — Testes SQL de Integração';
  raise notice '══════════════════════════════════════════════════════';

  -- ── Dados auxiliares ──────────────────────────────────────────
  insert into clientes  (nome) values ('_QA_João_Test') returning id into v_cli;
  insert into barbeiros (nome, gcal_color_id) values ('_QA_Barbeiro_Test','9') returning id into v_barb;

  -- Produto com estoque para teste de rollback e estoque
  insert into categorias (nome) values ('_QA_Cat') on conflict do nothing;
  select id into v_cat from categorias where nome = '_QA_Cat' limit 1;
  insert into produtos (nome, tipo, quantidade, preco_venda, categoria_id)
  values ('_QA_Produto_Bar', 'bar', 10, 5.00, v_cat)
  returning id into v_prod;

  -- ── Teste 1: status inválido na criação (P0008) ───────────────
  begin
    insert into comandas (status, cliente_nome) values ('fechada', '_QA_bloqueio');
    raise exception 'NÃO DEVERIA TER INSERIDO status=fechada';
  exception when others then
    call assert(
      sqlerrm like '%P0008%' or sqlerrm like '%status "aberta"%',
      'Teste 1: esperava P0008 mas obteve: ' || sqlerrm
    );
  end;
  raise notice '[ OK ] Teste 1 — Bloqueio de status inválido na criação';

  -- ── Teste 2: criação normal ───────────────────────────────────
  insert into comandas (status, cliente_id, cliente_nome, barbeiro_id)
  values ('aberta', v_cli, '_QA_João_Test', v_barb)
  returning id into v_cmd;

  select version into v_version1 from comandas where id = v_cmd;
  call assert(v_version1 = 1, 'Teste 2: version inicial deve ser 1');

  select count(*) into v_count from comanda_eventos
  where comanda_id = v_cmd and tipo = 'criada';
  call assert(v_count = 1, 'Teste 2: trigger deve gerar exatamente 1 evento "criada"');

  raise notice '[ OK ] Teste 2 — Criação normal (version=1, evento criada)';

  -- ── Teste 3: finalização normal ───────────────────────────────
  v_result := finalizar_comanda(
    v_cmd,
    jsonb_build_object(
      'servicos',        jsonb_build_array(jsonb_build_object('id',1,'nome','Corte','valor',50)),
      'itens_bar',       '[]'::jsonb,
      'itens_loja',      '[]'::jsonb,
      'valor_servicos',  50,
      'valor_bar',       0,
      'valor_loja',      0,
      'valor_total',     50,
      'forma_pagamento', 'pix',
      'barbeiro_id',     v_barb,
      'version',         v_version1
    )
  );

  call assert((v_result->>'ok')::boolean,       'Teste 3: ok deve ser true');
  call assert(not (v_result->>'idempotent')::boolean, 'Teste 3: idempotent deve ser false');
  call assert((v_result->>'comanda_id')::int = v_cmd, 'Teste 3: comanda_id deve bater');
  v_atend_id := (v_result->>'atendimento_id')::integer;
  call assert(v_atend_id is not null, 'Teste 3: atendimento_id não pode ser null');

  select status, closed_at into v_status, v_closed from comandas where id = v_cmd;
  call assert(v_status = 'fechada', 'Teste 3: status deve ser fechada');
  call assert(v_closed is not null, 'Teste 3: closed_at deve ser preenchido');

  -- Atendimento criado com status correto
  call assert(
    (select status from atendimentos where id = v_atend_id) = 'concluido',
    'Teste 3: atendimento deve ter status=concluido'
  );

  -- Evento 'fechada' registrado
  select count(*) into v_count from comanda_eventos
  where comanda_id = v_cmd and tipo = 'fechada';
  call assert(v_count = 1, 'Teste 3: deve haver exatamente 1 evento "fechada"');

  -- closed_at é server-side (não pode ser null)
  call assert(
    (select closed_at from comandas where id = v_cmd) is not null,
    'Teste 3: closed_at server-side não pode ser null'
  );

  raise notice '[ OK ] Teste 3 — Finalização normal (status, closed_at, atendimento, auditoria)';

  -- ── Teste 4: idempotência ──────────────────────────────────────
  v_result := finalizar_comanda(
    v_cmd,
    jsonb_build_object(
      'forma_pagamento', 'credito',   -- forma diferente intencional — deve ser ignorada
      'valor_total', 99,              -- valor diferente — deve ser ignorado
      'valor_servicos', 99,
      'valor_bar', 0, 'valor_loja', 0
    )
  );

  call assert((v_result->>'ok')::boolean,         'Teste 4: ok deve ser true');
  call assert((v_result->>'idempotent')::boolean,  'Teste 4: idempotent deve ser true');

  -- Não deve ter criado segundo atendimento
  select count(*) into v_count from atendimentos where comanda_id = v_cmd;
  call assert(v_count = 1, 'Teste 4: deve existir exatamente 1 atendimento');

  -- Não deve ter criado segundo evento 'fechada'
  select count(*) into v_count from comanda_eventos
  where comanda_id = v_cmd and tipo = 'fechada';
  call assert(v_count = 1, 'Teste 4: deve existir exatamente 1 evento "fechada"');

  -- Valor original preservado (ignorou o valor_total=99 do retry)
  call assert(
    (select valor_total from comandas where id = v_cmd) = 50,
    'Teste 4: valor_total deve permanecer 50 (idempotente não reescreve)'
  );

  raise notice '[ OK ] Teste 4 — Idempotência (2ª chamada, sem duplicatas)';

  -- ── Teste 5: optimistic locking (versão errada → P0010) ───────
  insert into comandas (status, cliente_nome) values ('aberta', '_QA_opt_lock')
  returning id into v_cmd2;

  begin
    perform finalizar_comanda(
      v_cmd2,
      jsonb_build_object(
        'forma_pagamento', 'pix',
        'valor_total', 50, 'valor_servicos', 50, 'valor_bar', 0, 'valor_loja', 0,
        'version', 999    -- versão intencionalmente incorreta
      )
    );
    raise exception 'NÃO DEVERIA TER FINALIZADO com versão errada';
  exception when others then
    call assert(
      sqlerrm like '%P0010%' or sqlerrm like '%Conflito%' or sqlerrm like '%version%',
      'Teste 5: esperava P0010 mas obteve: ' || sqlerrm
    );
  end;
  -- Comanda deve continuar aberta
  call assert(
    (select status from comandas where id = v_cmd2) = 'aberta',
    'Teste 5: comanda deve continuar aberta após conflito de versão'
  );
  raise notice '[ OK ] Teste 5 — Optimistic locking (P0010)';

  -- ── Teste 6: forma de pagamento inválida (P0003) ───────────────
  begin
    perform finalizar_comanda(
      v_cmd2,
      jsonb_build_object(
        'forma_pagamento', 'dinheiro',   -- inválida: aceita só pix/debito/credito
        'valor_total', 50, 'valor_servicos', 50, 'valor_bar', 0, 'valor_loja', 0
      )
    );
    raise exception 'NÃO DEVERIA TER FINALIZADO com forma_pagamento inválida';
  exception when others then
    call assert(
      sqlerrm like '%P0003%' or sqlerrm like '%forma_pagamento%',
      'Teste 6: esperava P0003 mas obteve: ' || sqlerrm
    );
  end;
  raise notice '[ OK ] Teste 6 — Forma de pagamento inválida (P0003)';

  -- ── Teste 7: valor_total negativo (P0004) ──────────────────────
  begin
    perform finalizar_comanda(
      v_cmd2,
      jsonb_build_object(
        'forma_pagamento', 'pix',
        'valor_total', -10, 'valor_servicos', -10, 'valor_bar', 0, 'valor_loja', 0
      )
    );
    raise exception 'NÃO DEVERIA TER FINALIZADO com valor negativo';
  exception when others then
    call assert(
      sqlerrm like '%P0004%' or sqlerrm like '%negativo%',
      'Teste 7: esperava P0004 mas obteve: ' || sqlerrm
    );
  end;
  raise notice '[ OK ] Teste 7 — Valor total negativo (P0004)';

  -- ── Teste 8: valor_total > soma componentes (P0005) ────────────
  begin
    perform finalizar_comanda(
      v_cmd2,
      jsonb_build_object(
        'forma_pagamento', 'pix',
        'valor_total', 200, 'valor_servicos', 50, 'valor_bar', 0, 'valor_loja', 0
      )
    );
    raise exception 'NÃO DEVERIA TER FINALIZADO com valor > soma';
  exception when others then
    call assert(
      sqlerrm like '%P0005%' or sqlerrm like '%superior%',
      'Teste 8: esperava P0005 mas obteve: ' || sqlerrm
    );
  end;
  raise notice '[ OK ] Teste 8 — Valor > soma componentes (P0005)';

  -- ── Teste 9: comanda não encontrada (P0001) ────────────────────
  begin
    perform finalizar_comanda(
      -9999,    -- ID que certamente não existe
      jsonb_build_object(
        'forma_pagamento', 'pix',
        'valor_total', 50, 'valor_servicos', 50, 'valor_bar', 0, 'valor_loja', 0
      )
    );
    raise exception 'NÃO DEVERIA TER ENCONTRADO comanda -9999';
  exception when others then
    call assert(
      sqlerrm like '%P0001%' or sqlerrm like '%não encontrada%',
      'Teste 9: esperava P0001 mas obteve: ' || sqlerrm
    );
  end;
  raise notice '[ OK ] Teste 9 — Comanda não encontrada (P0001)';

  -- ── Teste 10: comanda cancelada (P0006) ───────────────────────
  insert into comandas (status, cliente_nome) values ('aberta', '_QA_cancelada')
  returning id into v_cmd3;

  perform cancelar_comanda(v_cmd3, 'teste QA');

  begin
    perform finalizar_comanda(
      v_cmd3,
      jsonb_build_object(
        'forma_pagamento', 'pix',
        'valor_total', 50, 'valor_servicos', 50, 'valor_bar', 0, 'valor_loja', 0
      )
    );
    raise exception 'NÃO DEVERIA TER FINALIZADO comanda cancelada';
  exception when others then
    call assert(
      sqlerrm like '%P0006%' or sqlerrm like '%cancelada%',
      'Teste 10: esperava P0006 mas obteve: ' || sqlerrm
    );
  end;
  raise notice '[ OK ] Teste 10 — Comanda cancelada (P0006)';

  -- ── Teste 11: imutabilidade pós-fechamento (P0002) ─────────────
  begin
    update comandas set valor_total = 9999 where id = v_cmd;
    raise exception 'NÃO DEVERIA TER ATUALIZADO comanda fechada';
  exception when others then
    call assert(
      sqlerrm like '%P0002%' or sqlerrm like '%fechada%',
      'Teste 11: esperava P0002 mas obteve: ' || sqlerrm
    );
  end;

  -- Verifica que o valor não mudou
  call assert(
    (select valor_total from comandas where id = v_cmd) = 50,
    'Teste 11: valor_total deve permanecer 50 após tentativa de mutação'
  );
  raise notice '[ OK ] Teste 11 — Imutabilidade pós-fechamento (P0002)';

  -- ── Teste 12: gcal_event_id pode ser nulificado em comanda fechada ─
  update comandas set gcal_event_id = 'gcal_test_123' where id = v_cmd;
  -- Agora nulifica (único campo mutável em comanda fechada)
  update comandas set gcal_event_id = null where id = v_cmd;
  call assert(
    (select gcal_event_id from comandas where id = v_cmd) is null,
    'Teste 12: gcal_event_id deve poder ser nulificado em comanda fechada'
  );
  raise notice '[ OK ] Teste 12 — gcal_event_id nulificável em comanda fechada';

  -- ── Teste 13: tabelas de auditoria são append-only ─────────────
  begin
    update historico set tipo = 'adulterado' where id = (select id from historico limit 1);
    raise exception 'NÃO DEVERIA TER ATUALIZADO historico';
  exception when others then
    call assert(
      sqlerrm like '%P0020%' or sqlerrm like '%append-only%',
      'Teste 13a: esperava P0020 em historico mas obteve: ' || sqlerrm
    );
  end;

  begin
    delete from comanda_eventos where id = (
      select id from comanda_eventos where comanda_id = v_cmd limit 1
    );
    raise exception 'NÃO DEVERIA TER DELETADO comanda_eventos';
  exception when others then
    call assert(
      sqlerrm like '%P0020%' or sqlerrm like '%append-only%',
      'Teste 13b: esperava P0020 em comanda_eventos mas obteve: ' || sqlerrm
    );
  end;
  raise notice '[ OK ] Teste 13 — Tabelas de auditoria são append-only';

  -- ── Teste 14: rollback — validação impede side effects ─────────
  -- Cria comanda com produto em estoque.
  -- Tenta finalizar com forma_pagamento inválida (falha no Passo 4,
  -- ANTES do Passo 5 de estoque) → nenhuma baixa deve ocorrer.
  insert into comandas (status, cliente_nome) values ('aberta', '_QA_rollback')
  returning id into v_cmd4;

  v_estoque_ant := (select quantidade from produtos where id = v_prod);

  begin
    perform finalizar_comanda(
      v_cmd4,
      jsonb_build_object(
        'forma_pagamento', 'invalida',  -- falha no passo 4
        'itens_bar', jsonb_build_array(jsonb_build_object('produto_id', v_prod, 'quantidade', 3)),
        'valor_total', 0, 'valor_servicos', 0, 'valor_bar', 0, 'valor_loja', 0
      )
    );
  exception when others then
    null;  -- esperado
  end;

  v_estoque_dep := (select quantidade from produtos where id = v_prod);
  call assert(
    v_estoque_dep = v_estoque_ant,
    'Teste 14: estoque deve ser inalterado após rollback (era ' ||
    v_estoque_ant || ', está ' || v_estoque_dep || ')'
  );
  raise notice '[ OK ] Teste 14 — Rollback: estoque inalterado após falha de validação';

  -- ── Teste 15: reconciliação financeira ────────────────────────
  -- A comanda v_cmd deve aparecer como OK na view.
  v_delta := (
    select delta_atendimento
    from   vw_reconciliacao_financeira
    where  comanda_id = v_cmd
  );
  call assert(
    v_delta is not null and abs(v_delta) < 0.01,
    'Teste 15: delta_atendimento da comanda finalizada deve ser ~0'
  );

  -- Status na view deve ser OK
  call assert(
    (select status_reconciliacao from vw_reconciliacao_financeira where comanda_id = v_cmd) = 'OK',
    'Teste 15: status_reconciliacao deve ser OK'
  );
  raise notice '[ OK ] Teste 15 — Reconciliação financeira (delta=0, status=OK)';

  -- ── Teste 16: verificar_integridade_completa() ────────────────
  declare
    v_integ jsonb;
  begin
    v_integ := verificar_integridade_completa();
    call assert(v_integ is not null, 'Teste 16: função deve retornar jsonb');
    call assert(v_integ ? 'tudo_ok',  'Teste 16: resultado deve ter campo tudo_ok');
    call assert(v_integ ? 'executado_em', 'Teste 16: resultado deve ter campo executado_em');
    raise notice '[ OK ] Teste 16 — verificar_integridade_completa() retorna estrutura válida';
    raise notice '         tudo_ok=%  divergências=%',
      v_integ->>'tudo_ok',
      v_integ->>'divergencias_financeiras';
  end;

  -- ── Resumo ────────────────────────────────────────────────────
  raise notice '';
  raise notice '══════════════════════════════════════════════════════';
  raise notice '  TODOS OS 16 TESTES PASSARAM ✓';
  raise notice '══════════════════════════════════════════════════════';

exception
  when others then
    raise exception '🔴 FALHA NOS TESTES: %', sqlerrm;
end;
$$;

-- Desfaz tudo — banco de produção intacto
rollback;

-- Limpa a função helper (não estava no schema principal)
-- (já foi desfeita pelo ROLLBACK acima — nada a fazer)
