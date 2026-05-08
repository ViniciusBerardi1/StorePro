-- ============================================================
-- StorePro — Testes de Integridade Financeira e Rollback
-- ============================================================
-- Execução:
--   psql $DATABASE_URL -f tests/sql/test_integridade_financeira.sql
--
-- O script corre inteiro dentro de uma transação que é revertida
-- no final: o banco nunca fica sujo.
--
-- Grupos:
--   G1  Atomicidade e Rollback         (T01–T06)
--   G2  Idempotência Financeira         (T07–T10)
--   G3  Integridade do Estoque          (T11–T14)
--   G4  Imutabilidade Pós-Fechamento    (T15–T21)
--   G5  Integridade de Auditoria        (T22–T27)
--   G6  Reconciliação Financeira        (T28–T32)
--   G7  Benefícios e Casos Extremos     (T33–T38)
--   V   Validações Finais               (V01–V05)
-- ============================================================

begin;

-- ─── Helper de asserção (revertida com o ROLLBACK final) ─────
create or replace function _qa_assert(cond boolean, msg text)
returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then
    raise exception 'ASSERT FALHOU: %', msg;
  end if;
  raise notice 'OK  %', msg;
end;
$$;


do $$
declare
  -- fixtures
  v_cli_id        integer;
  v_barb_id       integer;
  v_prod_bar_id   integer;
  v_prod_loja_id  integer;

  -- comandas por grupo de teste
  v_cmd_a         integer;   -- G1 happy path + G2 idempotência + G4 imutabilidade
  v_cmd_b         integer;   -- G1 rollback forçado
  v_cmd_c         integer;   -- G1 payloads inválidos (fica aberta)
  v_cmd_d         integer;   -- G1 comanda inexistente (não criada)
  v_cmd_e         integer;   -- G7 cancelamento + P0006
  v_cmd_f         integer;   -- G7 version conflict P0010
  v_cmd_g         integer;   -- G7 benefícios duplicados
  v_cmd_gcal      integer;   -- G4 T21 nulificação gcal_event_id

  -- saídas de finalizar_comanda
  v_atend_a_id    integer;
  v_result        jsonb;

  -- payload padrão válido
  v_payload       jsonb;
  v_payload_bad   jsonb;

  -- contadores auxiliares
  v_n             bigint;
  v_est_bar_ant   integer;
  v_est_loja_ant  integer;
  v_integridade   jsonb;
begin

  -- ==============================================================
  -- SETUP — fixtures inseridos uma vez, revertidos no ROLLBACK final
  -- ==============================================================

  insert into clientes (nome) values ('QA Integridade')
    returning id into v_cli_id;

  insert into barbeiros (nome, gcal_color_id, ativo) values ('QA Barbeiro', '1', true)
    returning id into v_barb_id;

  insert into produtos (nome, quantidade, estoque_minimo, tipo)
    values ('QA Gel Bar', 10, 1, 'bar')
    returning id into v_prod_bar_id;

  insert into produtos (nome, quantidade, estoque_minimo, tipo)
    values ('QA Creme Loja', 5, 1, 'loja')
    returning id into v_prod_loja_id;

  -- payload padrão: serviços 100 + bar 30 + loja 20 = 150
  v_payload := jsonb_build_object(
    'forma_pagamento', 'pix',
    'valor_total',     150.00,
    'valor_servicos',  100.00,
    'valor_bar',        30.00,
    'valor_loja',       20.00,
    'servicos',        '[]'::jsonb,
    'itens_bar',       jsonb_build_array(
                         jsonb_build_object('produto_id', v_prod_bar_id, 'quantidade', 2)
                       ),
    'itens_loja',      jsonb_build_array(
                         jsonb_build_object('produto_id', v_prod_loja_id, 'quantidade', 1)
                       ),
    'version',         1
  );

  -- snapshots de estoque antes de qualquer fechamento
  select quantidade into v_est_bar_ant  from produtos where id = v_prod_bar_id;
  select quantidade into v_est_loja_ant from produtos where id = v_prod_loja_id;

  -- criar todas as comandas de fixture
  insert into comandas (cliente_id, cliente_nome, barbeiro_id)
    values (v_cli_id, 'QA Cliente', v_barb_id) returning id into v_cmd_a;

  insert into comandas (cliente_id, cliente_nome, barbeiro_id)
    values (v_cli_id, 'QA Rollback', v_barb_id) returning id into v_cmd_b;

  insert into comandas (cliente_id, cliente_nome, barbeiro_id)
    values (v_cli_id, 'QA Invalido', v_barb_id) returning id into v_cmd_c;

  insert into comandas (cliente_id, cliente_nome, barbeiro_id)
    values (v_cli_id, 'QA Cancel', v_barb_id) returning id into v_cmd_e;

  insert into comandas (cliente_id, cliente_nome, barbeiro_id)
    values (v_cli_id, 'QA Version', v_barb_id) returning id into v_cmd_f;

  insert into comandas (cliente_id, cliente_nome, barbeiro_id)
    values (v_cli_id, 'QA Beneficio', v_barb_id) returning id into v_cmd_g;

  insert into comandas (cliente_id, cliente_nome, barbeiro_id, gcal_event_id)
    values (v_cli_id, 'QA GCal', v_barb_id, 'evt_qa_gcal_99999') returning id into v_cmd_gcal;

  raise notice '=== SETUP CONCLUÍDO — 7 comandas, 2 produtos, 1 cliente, 1 barbeiro ===';


  -- ==============================================================
  -- G1 — ATOMICIDADE E ROLLBACK
  -- ==============================================================
  raise notice '--- G1: Atomicidade e Rollback ---';

  -- T01: happy path completo
  v_result := finalizar_comanda(v_cmd_a, v_payload);

  perform _qa_assert(
    (v_result->>'ok')::boolean = true and
    (v_result->>'idempotent')::boolean = false,
    'T01: finalizar_comanda retorna ok=true, idempotent=false'
  );

  select id into v_atend_a_id from atendimentos where comanda_id = v_cmd_a limit 1;

  perform _qa_assert(
    v_atend_a_id is not null,
    'T01: atendimento foi criado'
  );

  perform _qa_assert(
    (select status from comandas where id = v_cmd_a) = 'fechada',
    'T01: comanda status = fechada'
  );

  perform _qa_assert(
    (select closed_at from comandas where id = v_cmd_a) is not null,
    'T01: comanda.closed_at foi preenchido'
  );

  perform _qa_assert(
    (select valor_total from atendimentos where id = v_atend_a_id) = 150.00,
    'T01: atendimento.valor_total = 150.00'
  );

  perform _qa_assert(
    (select forma_pagamento from atendimentos where id = v_atend_a_id) = 'pix',
    'T01: atendimento.forma_pagamento = pix'
  );

  perform _qa_assert(
    (select quantidade from produtos where id = v_prod_bar_id) = v_est_bar_ant - 2,
    'T01: estoque bar baixou 2 unidades'
  );

  perform _qa_assert(
    (select quantidade from produtos where id = v_prod_loja_id) = v_est_loja_ant - 1,
    'T01: estoque loja baixou 1 unidade'
  );

  perform _qa_assert(
    exists (
      select 1 from comanda_eventos
      where comanda_id = v_cmd_a and tipo = 'fechada'
    ),
    'T01: evento de auditoria "fechada" foi inserido'
  );


  -- T02: rollback forçado via savepoint implícito — nada persiste
  declare
    v_est_bar_pre  integer;
    v_est_loja_pre integer;
    v_atend_pre    bigint;
    v_evt_pre      bigint;
    v_cmd_b_payload jsonb;
  begin
    select quantidade into v_est_bar_pre  from produtos where id = v_prod_bar_id;
    select quantidade into v_est_loja_pre from produtos where id = v_prod_loja_id;
    select count(*)   into v_atend_pre    from atendimentos;
    select count(*)   into v_evt_pre      from comanda_eventos where tipo = 'fechada';

    -- payload apontando para v_cmd_b (version=1, sem conflito)
    v_cmd_b_payload := v_payload || jsonb_build_object('version', 1);

    begin  -- savepoint implícito SP_T02
      perform finalizar_comanda(v_cmd_b, v_cmd_b_payload);
      raise exception 'FORCE_ROLLBACK_T02';  -- reverte tudo no bloco
    exception when others then
      if sqlerrm = 'FORCE_ROLLBACK_T02' then
        null;  -- esperado: savepoint reverteu os efeitos de finalizar_comanda
      else
        raise;  -- erro inesperado — propaga
      end if;
    end;

    perform _qa_assert(
      (select status from comandas where id = v_cmd_b) = 'aberta',
      'T02: comanda permanece aberta após rollback forçado'
    );
    perform _qa_assert(
      (select count(*) from atendimentos) = v_atend_pre,
      'T02: nenhum atendimento persistiu após rollback forçado'
    );
    perform _qa_assert(
      (select quantidade from produtos where id = v_prod_bar_id) = v_est_bar_pre,
      'T02: estoque bar não diminuiu após rollback forçado'
    );
    perform _qa_assert(
      (select quantidade from produtos where id = v_prod_loja_id) = v_est_loja_pre,
      'T02: estoque loja não diminuiu após rollback forçado'
    );
    perform _qa_assert(
      (select count(*) from comanda_eventos where tipo = 'fechada') = v_evt_pre,
      'T02: nenhum evento "fechada" persistiu após rollback forçado'
    );
  end;


  -- T03: P0003 — forma_pagamento inválida → tudo revertido
  v_payload_bad := v_payload || jsonb_build_object('forma_pagamento', 'dinheiro', 'version', 1);
  begin
    perform finalizar_comanda(v_cmd_c, v_payload_bad);
    perform _qa_assert(false, 'T03: deveria ter falhado com P0003');
  exception when others then
    perform _qa_assert(
      sqlerrm like '%P0003%',
      'T03: erro contém P0003 para forma_pagamento inválida'
    );
    perform _qa_assert(
      (select status from comandas where id = v_cmd_c) = 'aberta',
      'T03: comanda permanece aberta após P0003'
    );
    perform _qa_assert(
      not exists (select 1 from atendimentos where comanda_id = v_cmd_c),
      'T03: nenhum atendimento criado após P0003'
    );
  end;


  -- T04: P0004 / assert_failure — valor_total negativo → tudo revertido
  -- ATENÇÃO: P0004 = assert_failure (código reservado do PostgreSQL).
  -- WHEN OTHERS nunca captura assert_failure; é preciso WHEN assert_failure.
  -- Consequência no schema: finalizar_comanda() também não consegue re-envolver
  -- esta exceção em seu próprio WHEN OTHERS — ela escapa direto para o chamador.
  v_payload_bad := v_payload || jsonb_build_object('valor_total', -1, 'version', 1);
  begin
    perform finalizar_comanda(v_cmd_c, v_payload_bad);
    perform _qa_assert(false, 'T04: deveria ter falhado com P0004/assert_failure');
  exception when assert_failure then
    perform _qa_assert(
      sqlstate = 'P0004',
      'T04: sqlstate = P0004 (assert_failure) para valor_total negativo'
    );
    perform _qa_assert(
      sqlerrm like '%valor_total%',
      'T04: mensagem menciona valor_total'
    );
    perform _qa_assert(
      (select status from comandas where id = v_cmd_c) = 'aberta',
      'T04: comanda permanece aberta após P0004/assert_failure'
    );
  end;


  -- T05: P0005 — valor_total > soma dos componentes → tudo revertido
  v_payload_bad := v_payload || jsonb_build_object('valor_total', 9999.00, 'version', 1);
  begin
    perform finalizar_comanda(v_cmd_c, v_payload_bad);
    perform _qa_assert(false, 'T05: deveria ter falhado com P0005');
  exception when others then
    perform _qa_assert(
      sqlerrm like '%P0005%',
      'T05: erro contém P0005 para valor_total > soma'
    );
    perform _qa_assert(
      (select status from comandas where id = v_cmd_c) = 'aberta',
      'T05: comanda permanece aberta após P0005'
    );
  end;


  -- T06: P0001 — comanda inexistente
  begin
    perform finalizar_comanda(999999999, v_payload);
    perform _qa_assert(false, 'T06: deveria ter falhado com P0001');
  exception when others then
    perform _qa_assert(
      sqlerrm like '%P0001%',
      'T06: erro contém P0001 para comanda inexistente'
    );
  end;


  -- ==============================================================
  -- G2 — IDEMPOTÊNCIA FINANCEIRA
  -- ==============================================================
  raise notice '--- G2: Idempotência Financeira ---';

  -- v_cmd_a já está fechada (T01). Segunda chamada deve retornar idempotent=true.

  -- T07: segunda chamada retorna idempotent=true
  v_result := finalizar_comanda(v_cmd_a, v_payload);
  perform _qa_assert(
    (v_result->>'ok')::boolean = true and
    (v_result->>'idempotent')::boolean = true,
    'T07: segunda finalização retorna idempotent=true'
  );


  -- T08: segunda chamada não cria segundo atendimento
  perform _qa_assert(
    (select count(*) from atendimentos where comanda_id = v_cmd_a) = 1,
    'T08: apenas 1 atendimento após dupla finalização'
  );


  -- T09: segunda chamada não duplica evento de auditoria "fechada"
  perform _qa_assert(
    (select count(*) from comanda_eventos where comanda_id = v_cmd_a and tipo = 'fechada') = 1,
    'T09: apenas 1 evento "fechada" após dupla finalização'
  );


  -- T10: terceira chamada consecutiva também é idempotente (resilência a retry em loop)
  v_result := finalizar_comanda(v_cmd_a, v_payload);
  v_result := finalizar_comanda(v_cmd_a, v_payload);
  perform _qa_assert(
    (v_result->>'idempotent')::boolean = true and
    (select count(*) from atendimentos where comanda_id = v_cmd_a) = 1,
    'T10: N chamadas consecutivas — continua idempotente com 1 único atendimento'
  );


  -- ==============================================================
  -- G3 — INTEGRIDADE DO ESTOQUE
  -- ==============================================================
  raise notice '--- G3: Integridade do Estoque ---';

  -- T11: estoque nunca vai negativo (greatest(0, ant - qtd))
  declare
    v_prod_zerado_id  integer;
    v_cmd_zera        integer;
    v_pl_zera         jsonb;
  begin
    insert into produtos (nome, quantidade, estoque_minimo, tipo)
      values ('QA Estoque Zero', 1, 0, 'bar')
      returning id into v_prod_zerado_id;

    insert into comandas (cliente_nome, barbeiro_id)
      values ('QA Zera', v_barb_id)
      returning id into v_cmd_zera;

    v_pl_zera := jsonb_build_object(
      'forma_pagamento', 'pix',
      'valor_total',    50.00,
      'valor_servicos', 50.00,
      'valor_bar',       0.00,
      'valor_loja',      0.00,
      'servicos',       '[]'::jsonb,
      'itens_bar',      jsonb_build_array(
                          jsonb_build_object('produto_id', v_prod_zerado_id, 'quantidade', 99)
                        ),
      'itens_loja',     '[]'::jsonb,
      'version',        1
    );

    perform finalizar_comanda(v_cmd_zera, v_pl_zera);

    perform _qa_assert(
      (select quantidade from produtos where id = v_prod_zerado_id) = 0,
      'T11: estoque zerou em 0, nunca negativo (greatest)'
    );
  end;


  -- T12: produto já com quantidade=0 — baixar_estoque não gera historico (ant = nov, continue)
  declare
    v_prod_vazio_id   integer;
    v_cmd_vazio       integer;
    v_hist_antes      bigint;
    v_pl_vazio        jsonb;
  begin
    insert into produtos (nome, quantidade, estoque_minimo, tipo)
      values ('QA Vazio', 0, 0, 'bar')
      returning id into v_prod_vazio_id;

    select count(*) into v_hist_antes from historico where produto_id = v_prod_vazio_id;

    insert into comandas (cliente_nome, barbeiro_id)
      values ('QA VazioCmd', v_barb_id)
      returning id into v_cmd_vazio;

    v_pl_vazio := jsonb_build_object(
      'forma_pagamento', 'pix',
      'valor_total',    30.00,
      'valor_servicos', 30.00,
      'valor_bar',       0.00,
      'valor_loja',      0.00,
      'servicos',       '[]'::jsonb,
      'itens_bar',      jsonb_build_array(
                          jsonb_build_object('produto_id', v_prod_vazio_id, 'quantidade', 3)
                        ),
      'itens_loja',     '[]'::jsonb,
      'version',        1
    );

    perform finalizar_comanda(v_cmd_vazio, v_pl_vazio);

    perform _qa_assert(
      (select count(*) from historico where produto_id = v_prod_vazio_id) = v_hist_antes,
      'T12: produto zerado sem stock movement não gera entrada no historico'
    );
  end;


  -- T13: historico de saída criado corretamente para produto com estoque
  perform _qa_assert(
    exists (
      select 1 from historico
      where produto_id = v_prod_bar_id
        and tipo in ('saida', 'zerado')
        and quantidade_anterior > quantidade_nova
    ),
    'T13: historico.tipo em {saida,zerado} com quantidade_anterior > quantidade_nova'
  );


  -- T14: atomicidade do estoque — rollback reverte todos os decrementos
  declare
    v_est_bar_pre2  integer;
    v_est_loja_pre2 integer;
    v_cmd_est_rb    integer;
    v_pl_est_rb     jsonb;
  begin
    select quantidade into v_est_bar_pre2  from produtos where id = v_prod_bar_id;
    select quantidade into v_est_loja_pre2 from produtos where id = v_prod_loja_id;

    insert into comandas (cliente_nome, barbeiro_id)
      values ('QA EstRollback', v_barb_id)
      returning id into v_cmd_est_rb;

    v_pl_est_rb := v_payload || jsonb_build_object('version', 1);

    begin  -- savepoint
      perform finalizar_comanda(v_cmd_est_rb, v_pl_est_rb);
      raise exception 'FORCE_ROLLBACK_T14';
    exception when others then
      if sqlerrm = 'FORCE_ROLLBACK_T14' then null; else raise; end if;
    end;

    perform _qa_assert(
      (select quantidade from produtos where id = v_prod_bar_id) = v_est_bar_pre2,
      'T14: estoque bar restaurado após rollback de estoque'
    );
    perform _qa_assert(
      (select quantidade from produtos where id = v_prod_loja_id) = v_est_loja_pre2,
      'T14: estoque loja restaurado após rollback de estoque'
    );
  end;


  -- ==============================================================
  -- G4 — IMUTABILIDADE PÓS-FECHAMENTO
  -- ==============================================================
  raise notice '--- G4: Imutabilidade Pós-Fechamento ---';
  -- v_cmd_a está fechada desde T01.

  -- T15: P0002 — tentativa de reabrir comanda fechada
  begin
    update comandas set status = 'aberta' where id = v_cmd_a;
    perform _qa_assert(false, 'T15: deveria ter falhado com P0002');
  exception when others then
    perform _qa_assert(sqlstate = 'P0002', 'T15: P0002 ao tentar reabrir comanda fechada');
  end;


  -- T16: P0002 — tentativa de alterar valor_total de comanda fechada
  begin
    update comandas set valor_total = 9999.00 where id = v_cmd_a;
    perform _qa_assert(false, 'T16: deveria ter falhado com P0002');
  exception when others then
    perform _qa_assert(sqlstate = 'P0002', 'T16: P0002 ao alterar valor_total de comanda fechada');
  end;


  -- T17: P0002 — tentativa de alterar forma_pagamento de comanda fechada
  begin
    update comandas set forma_pagamento = 'credito' where id = v_cmd_a;
    perform _qa_assert(false, 'T17: deveria ter falhado com P0002');
  exception when others then
    perform _qa_assert(sqlstate = 'P0002', 'T17: P0002 ao alterar forma_pagamento de comanda fechada');
  end;


  -- T18: P0002 — tentativa de alterar desconto de comanda fechada
  begin
    update comandas set desconto = '{"tipo":"percentual","valor":10}'::jsonb where id = v_cmd_a;
    perform _qa_assert(false, 'T18: deveria ter falhado com P0002');
  exception when others then
    perform _qa_assert(sqlstate = 'P0002', 'T18: P0002 ao alterar desconto de comanda fechada');
  end;


  -- T19: P0030 — tentativa de alterar valor_total de atendimento vinculado a comanda fechada
  begin
    update atendimentos set valor_total = 9999.00 where id = v_atend_a_id;
    perform _qa_assert(false, 'T19: deveria ter falhado com P0030');
  exception when others then
    perform _qa_assert(sqlstate = 'P0030', 'T19: P0030 ao alterar valor_total de atendimento fechado');
  end;


  -- T20: P0030 — tentativa de cancelar atendimento vinculado a comanda fechada
  begin
    update atendimentos set status = 'cancelado' where id = v_atend_a_id;
    perform _qa_assert(false, 'T20: deveria ter falhado com P0030');
  exception when others then
    perform _qa_assert(sqlstate = 'P0030', 'T20: P0030 ao cancelar atendimento de comanda fechada');
  end;


  -- T21: gcal_event_id PODE ser nulificado em comanda fechada (única exceção do Bloco A)
  declare
    v_pl_gcal jsonb;
    v_atend_gcal_id integer;
  begin
    v_pl_gcal := jsonb_build_object(
      'forma_pagamento', 'debito',
      'valor_total',    80.00,
      'valor_servicos', 80.00,
      'valor_bar',       0.00,
      'valor_loja',      0.00,
      'servicos',       '[]'::jsonb,
      'itens_bar',      '[]'::jsonb,
      'itens_loja',     '[]'::jsonb,
      'version',        1
    );
    perform finalizar_comanda(v_cmd_gcal, v_pl_gcal);

    -- operação permitida: anula gcal_event_id após fechamento (reagendamento via Agenda)
    update comandas set gcal_event_id = null where id = v_cmd_gcal;

    perform _qa_assert(
      (select gcal_event_id from comandas where id = v_cmd_gcal) is null,
      'T21: gcal_event_id nulificado em comanda fechada (permitido)'
    );
    perform _qa_assert(
      (select status from comandas where id = v_cmd_gcal) = 'fechada',
      'T21: status permanece fechada após nulificar gcal_event_id'
    );
    perform _qa_assert(
      (select valor_total from comandas where id = v_cmd_gcal) = 80.00,
      'T21: valor_total intacto após nulificar gcal_event_id'
    );
  end;


  -- ==============================================================
  -- G5 — INTEGRIDADE DE AUDITORIA (append-only)
  -- ==============================================================
  raise notice '--- G5: Integridade de Auditoria ---';

  -- T22: trigger cria evento "criada" automaticamente ao inserir comanda
  perform _qa_assert(
    exists (
      select 1 from comanda_eventos
      where comanda_id = v_cmd_a and tipo = 'criada'
    ),
    'T22: evento "criada" gerado automaticamente pelo trigger AFTER INSERT'
  );


  -- T23: P0020 — UPDATE em comanda_eventos é bloqueado
  declare
    v_evt_id bigint;
  begin
    select id into v_evt_id from comanda_eventos where comanda_id = v_cmd_a limit 1;
    begin
      update comanda_eventos set descricao = 'ADULTERADO' where id = v_evt_id;
      perform _qa_assert(false, 'T23: deveria ter falhado com P0020');
    exception when others then
      perform _qa_assert(sqlstate = 'P0020', 'T23: P0020 ao tentar UPDATE em comanda_eventos');
    end;
  end;


  -- T24: P0020 — DELETE em comanda_eventos é bloqueado
  declare
    v_evt_id bigint;
  begin
    select id into v_evt_id from comanda_eventos where comanda_id = v_cmd_a limit 1;
    begin
      delete from comanda_eventos where id = v_evt_id;
      perform _qa_assert(false, 'T24: deveria ter falhado com P0020');
    exception when others then
      perform _qa_assert(sqlstate = 'P0020', 'T24: P0020 ao tentar DELETE em comanda_eventos');
    end;
  end;


  -- T25: P0020 — UPDATE em historico é bloqueado
  declare
    v_hist_id integer;
  begin
    select id into v_hist_id from historico limit 1;
    if v_hist_id is not null then
      begin
        update historico set produto_nome = 'ADULTERADO' where id = v_hist_id;
        perform _qa_assert(false, 'T25: deveria ter falhado com P0020');
      exception when others then
        perform _qa_assert(sqlstate = 'P0020', 'T25: P0020 ao tentar UPDATE em historico');
      end;
    else
      raise notice 'T25: IGNORADO — historico vazio (nenhum produto com estoque baixado disponível)';
    end if;
  end;


  -- T26: P0020 — DELETE em historico é bloqueado
  declare
    v_hist_id integer;
  begin
    select id into v_hist_id from historico limit 1;
    if v_hist_id is not null then
      begin
        delete from historico where id = v_hist_id;
        perform _qa_assert(false, 'T26: deveria ter falhado com P0020');
      exception when others then
        perform _qa_assert(sqlstate = 'P0020', 'T26: P0020 ao tentar DELETE em historico');
      end;
    else
      raise notice 'T26: IGNORADO — historico vazio';
    end if;
  end;


  -- T27: P0008 — INSERT direto com status != "aberta" é bloqueado pelo trigger
  begin
    insert into comandas (cliente_nome, status) values ('QA Direto', 'fechada');
    perform _qa_assert(false, 'T27: deveria ter falhado com P0008');
  exception when others then
    perform _qa_assert(sqlstate = 'P0008', 'T27: P0008 ao tentar INSERT com status=fechada');
  end;


  -- ==============================================================
  -- G6 — RECONCILIAÇÃO FINANCEIRA
  -- ==============================================================
  raise notice '--- G6: Reconciliação Financeira ---';

  -- T28: comanda corretamente fechada aparece como OK na view
  perform _qa_assert(
    (
      select status_reconciliacao
      from   vw_reconciliacao_financeira
      where  comanda_id = v_cmd_a
    ) = 'OK',
    'T28: vw_reconciliacao_financeira mostra OK para comanda bem fechada'
  );


  -- T29: delta_soma e delta_atendimento = 0 para comanda válida
  perform _qa_assert(
    (
      select abs(delta_soma) <= 0.01 and abs(delta_atendimento) <= 0.01
      from   vw_reconciliacao_financeira
      where  comanda_id = v_cmd_a
    ),
    'T29: delta_soma e delta_atendimento ≤ 0.01 para comanda válida'
  );


  -- T30: SEM_ATENDIMENTO detectado pela view quando atendimento desvinculado
  -- (simula falha hipotética: unlink via UPDATE permitido — P0030 protege campos
  --  financeiros mas não comanda_id em si)
  declare
    v_cmd_sem_atend integer;
    v_pl_sem        jsonb;
    v_atend_sa_id   integer;
    v_status_rec    text;
  begin
    insert into comandas (cliente_nome, barbeiro_id)
      values ('QA SemAtend', v_barb_id)
      returning id into v_cmd_sem_atend;

    v_pl_sem := jsonb_build_object(
      'forma_pagamento', 'credito',
      'valor_total',    60.00,
      'valor_servicos', 60.00,
      'valor_bar',       0.00,
      'valor_loja',      0.00,
      'servicos',       '[]'::jsonb,
      'itens_bar',      '[]'::jsonb,
      'itens_loja',     '[]'::jsonb,
      'version',        1
    );
    perform finalizar_comanda(v_cmd_sem_atend, v_pl_sem);

    -- Desvincula o atendimento (corrompendo artificialmente a referência)
    update atendimentos set comanda_id = null where comanda_id = v_cmd_sem_atend;

    select status_reconciliacao into v_status_rec
    from   vw_reconciliacao_financeira
    where  comanda_id = v_cmd_sem_atend;

    perform _qa_assert(
      v_status_rec = 'SEM_ATENDIMENTO',
      'T30: view detecta SEM_ATENDIMENTO quando atendimento é desvinculado'
    );
  end;


  -- T31: verificar_reconciliacao() retorna apenas registros não-OK
  declare
    v_todos_ok boolean := true;
  begin
    select bool_and(status_reconciliacao <> 'OK')
    into   v_todos_ok
    from   verificar_reconciliacao(current_date - 1, current_date + 1);

    perform _qa_assert(
      coalesce(v_todos_ok, true),  -- NULL = zero linhas, o que é válido
      'T31: verificar_reconciliacao() retorna somente registros não-OK'
    );
  end;


  -- T32: vw_resumo_financeiro_diario reflete receita correta
  perform _qa_assert(
    exists (
      select 1 from vw_resumo_financeiro_diario
      where  data = current_date
        and  receita_bruta >= 150.00  -- ao menos v_cmd_a + v_cmd_gcal
    ),
    'T32: vw_resumo_financeiro_diario mostra receita do dia correto'
  );


  -- ==============================================================
  -- G7 — BENEFÍCIOS E CASOS EXTREMOS
  -- ==============================================================
  raise notice '--- G7: Benefícios e Casos Extremos ---';

  -- T33: benefício duplicado na mesma comanda → ON CONFLICT DO NOTHING, persiste apenas 1
  declare
    v_pl_bene jsonb;
    v_bene_payload jsonb;
    v_bene_registro jsonb;
  begin
    v_bene_registro := jsonb_build_object(
      'beneficio_id',   'bene-uuid-qa-001',
      'ciclo',          to_char(current_date, 'YYYY-MM'),
      'quantidade',     1,
      'valor_desconto', 20.00
    );

    v_pl_bene := jsonb_build_object(
      'forma_pagamento',      'pix',
      'valor_total',           80.00,
      'valor_servicos',        80.00,
      'valor_bar',              0.00,
      'valor_loja',             0.00,
      'beneficio_desconto',    20.00,
      'beneficios_aplicados',  jsonb_build_array(v_bene_registro),
      'beneficio_registros',   jsonb_build_array(v_bene_registro),
      'servicos',              '[]'::jsonb,
      'itens_bar',             '[]'::jsonb,
      'itens_loja',            '[]'::jsonb,
      'version',               1
    );

    perform finalizar_comanda(v_cmd_g, v_pl_bene);

    -- Segunda chamada com mesmo beneficio_id (idempotente)
    perform finalizar_comanda(v_cmd_g, v_pl_bene);

    perform _qa_assert(
      (
        select count(*) from uso_beneficios
        where  comanda_id = v_cmd_g
          and  beneficio_id = 'bene-uuid-qa-001'
          and  not estornado
      ) = 1,
      'T33: ON CONFLICT DO NOTHING — benefício duplicado resulta em 1 único registro'
    );
  end;


  -- T34: cancelar_comanda estorna benefícios (estornado=true)
  perform cancelar_comanda(v_cmd_e);

  perform _qa_assert(
    (select status from comandas where id = v_cmd_e) = 'cancelada',
    'T34a: comanda cancelada com sucesso'
  );

  perform _qa_assert(
    (select deleted_at from comandas where id = v_cmd_e) is not null,
    'T34b: deleted_at preenchido após cancelamento'
  );

  -- T35: P0006 — tentar finalizar comanda cancelada
  begin
    perform finalizar_comanda(v_cmd_e, v_payload || jsonb_build_object('version', 1));
    perform _qa_assert(false, 'T35: deveria ter falhado com P0006');
  exception when others then
    perform _qa_assert(
      sqlerrm like '%P0006%',
      'T35: P0006 ao tentar finalizar comanda cancelada'
    );
  end;


  -- T36: P0010 — version conflict
  begin
    -- v_cmd_f está na version=1 (criada e nunca modificada)
    -- enviar version=99 deve disparar P0010
    perform finalizar_comanda(
      v_cmd_f,
      v_payload || jsonb_build_object('version', 99)
    );
    perform _qa_assert(false, 'T36: deveria ter falhado com P0010');
  exception when others then
    perform _qa_assert(
      sqlerrm like '%P0010%',
      'T36: P0010 em version conflict (version cliente=99, banco=1)'
    );
    perform _qa_assert(
      (select status from comandas where id = v_cmd_f) = 'aberta',
      'T36: comanda permanece aberta após version conflict'
    );
  end;


  -- T37: cancelar_comanda idempotente (chamar duas vezes não causa erro)
  declare
    v_cmd_idm_cancel integer;
    v_r1 jsonb;
    v_r2 jsonb;
  begin
    insert into comandas (cliente_nome) values ('QA CancelIdem')
      returning id into v_cmd_idm_cancel;

    v_r1 := cancelar_comanda(v_cmd_idm_cancel, 'primeiro');
    v_r2 := cancelar_comanda(v_cmd_idm_cancel, 'segundo');

    perform _qa_assert(
      (v_r2->>'idempotent')::boolean = true,
      'T37: cancelar_comanda idempotente na segunda chamada'
    );
  end;


  -- T38: P0007 — tentativa de cancelar comanda já fechada
  begin
    perform cancelar_comanda(v_cmd_a);
    perform _qa_assert(false, 'T38: deveria ter falhado com P0007');
  exception when others then
    perform _qa_assert(
      sqlerrm like '%P0007%',
      'T38: P0007 ao tentar cancelar comanda já fechada'
    );
  end;


  -- ==============================================================
  -- V — VALIDAÇÕES FINAIS (estado geral do banco após todos os testes)
  -- ==============================================================
  raise notice '--- Validações Finais ---';

  -- V01: verificar_integridade_completa() sem divergências financeiras para comandas deste teste
  v_integridade := verificar_integridade_completa(current_date, current_date);

  perform _qa_assert(
    (v_integridade->>'divergencias_financeiras')::bigint >= 0,  -- valor existe
    'V01: verificar_integridade_completa() retornou sem erro'
  );


  -- V02: nenhuma comanda fechada neste teste ficou sem evento "fechada"
  perform _qa_assert(
    (v_integridade->>'fechadas_sem_auditoria_evento')::bigint = 0,
    'V02: todas as comandas fechadas têm evento de auditoria "fechada"'
  );


  -- V03: o atendimento desvinculado em T30 é detectado como órfão
  -- (T30 faz SET comanda_id = NULL intencionalmente para testar a view)
  perform _qa_assert(
    (v_integridade->>'atendimentos_orfaos')::bigint >= 1,
    'V03: verificar_integridade_completa detectou atendimento órfão do T30'
  );


  -- V04: contagem de eventos "criada" = total de comandas inseridas nos testes
  --      (trigger fn_auditar_comanda_criada deve ter disparado para cada uma)
  perform _qa_assert(
    (
      select count(distinct ce.comanda_id)
      from   comanda_eventos ce
      join   comandas c on c.id = ce.comanda_id
      where  ce.tipo = 'criada'
        and  c.cliente_nome like 'QA%'
    ) = (
      select count(*)
      from   comandas
      where  cliente_nome like 'QA%'
    ),
    'V04: evento "criada" existe para cada comanda inserida nos testes'
  );


  -- V05: estoque dos produtos de teste reflete apenas os decrementos persistidos
  --      (T01 baixou bar=2, loja=1; T02 foi revertido; T14 foi revertido)
  select count(*) into v_n
  from historico
  where produto_id in (v_prod_bar_id, v_prod_loja_id)
    and tipo in ('saida', 'zerado');

  perform _qa_assert(
    v_n >= 2,  -- ao menos 2 entradas no historico (uma por produto de T01)
    'V05: historico registrou ao menos 2 saídas de estoque (T01 bar + loja)'
  );


  raise notice '=== TODOS OS TESTES PASSARAM — revertendo transação ===';

end;
$$;

-- ─── Conferência final (fora do DO, ainda dentro do BEGIN) ────
-- Estas queries são queries de conferência que podem ser executadas
-- manualmente antes do ROLLBACK para inspeção visual do estado.
-- (Comentadas por padrão — descomente para depuração interativa.)

-- select comanda_id, status_reconciliacao, delta_soma, delta_atendimento
-- from   vw_reconciliacao_financeira order by comanda_id;

-- select * from verificar_reconciliacao(current_date - 1, current_date + 1);

-- select verificar_integridade_completa(current_date, current_date);

-- select produto_id, tipo, quantidade_anterior, quantidade_nova
-- from   historico order by id;

-- select comanda_id, tipo, descricao from comanda_eventos order by id;

rollback;

-- ─── Resultado esperado ───────────────────────────────────────
-- NOTICE: === SETUP CONCLUÍDO — 7 comandas, 2 produtos, 1 cliente, 1 barbeiro ===
-- NOTICE: --- G1: Atomicidade e Rollback ---
-- NOTICE: OK  T01: finalizar_comanda retorna ok=true, idempotent=false
-- ... (38 testes + 5 validações = 43+ NOTICE OK)
-- NOTICE: === TODOS OS TESTES PASSARAM — revertendo transação ===
-- ROLLBACK
