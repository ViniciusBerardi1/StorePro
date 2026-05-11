-- ============================================================
-- DADOS DE DEMONSTRAÇÃO — StorePro
-- Execute APÓS o reset (20260508_reset_data.sql)
-- Dashboard > SQL Editor > Run
-- ============================================================

-- Desabilitar triggers de usuário (não os de sistema/FK)
ALTER TABLE configuracoes    DISABLE TRIGGER USER;
ALTER TABLE barbeiros        DISABLE TRIGGER USER;
ALTER TABLE comandas         DISABLE TRIGGER USER;
ALTER TABLE atendimentos     DISABLE TRIGGER USER;
ALTER TABLE sessoes_caixa    DISABLE TRIGGER USER;
ALTER TABLE movimentos_caixa DISABLE TRIGGER USER;
ALTER TABLE historico        DISABLE TRIGGER USER;
ALTER TABLE comanda_eventos  DISABLE TRIGGER USER;
ALTER TABLE audit_log        DISABLE TRIGGER USER;
ALTER TABLE uso_beneficios   DISABLE TRIGGER USER;

-- ─── Configurações ───────────────────────────────────────────
INSERT INTO configuracoes (chave, valor) VALUES
  ('financeiro_senha', '1234');

-- ─── Barbeiros ───────────────────────────────────────────────
INSERT INTO barbeiros (nome, gcal_color_id, ativo) VALUES
  ('João Silva',    '9', true),   -- id 1
  ('Pedro Santos',  '6', true),   -- id 2
  ('Ana Costa',     '3', true);   -- id 3

-- ─── Serviços ────────────────────────────────────────────────
INSERT INTO servicos (nome, valor, duracao_minutos, ativo) VALUES
  ('Corte Masculino',    35.00, 30, true),   -- id 1
  ('Barba',              25.00, 20, true),   -- id 2
  ('Corte + Barba',      55.00, 45, true),   -- id 3
  ('Hidratação Capilar', 45.00, 40, true),   -- id 4
  ('Sobrancelha',        15.00, 15, true);   -- id 5

-- ─── Clientes ────────────────────────────────────────────────
INSERT INTO clientes (nome, telefone, email) VALUES
  ('Carlos Oliveira', '(11) 99999-1111', 'carlos@email.com'),   -- id 1
  ('Rafael Mendes',   '(11) 98888-2222', null),                 -- id 2
  ('Bruno Ferreira',  '(11) 97777-3333', null),                 -- id 3
  ('Lucas Almeida',   '(11) 96666-4444', 'lucas@email.com'),    -- id 4
  ('Marcos Souza',    '(11) 95555-5555', null),                 -- id 5
  ('Fernanda Lima',   '(11) 94444-6666', 'fernanda@email.com'), -- id 6 (VIP)
  ('Diego Costa',     '(11) 93333-7777', null);                 -- id 7

-- ─── Produtos — Bar ──────────────────────────────────────────
INSERT INTO produtos (nome, quantidade, estoque_minimo, preco_custo, preco_venda, tipo) VALUES
  ('Cerveja Heineken',  22, 6,  5.00,  8.00, 'bar'),  -- id 1
  ('Refrigerante Lata', 18, 6,  3.00,  5.00, 'bar'),  -- id 2
  ('Água Mineral',      30, 10, 1.50,  3.00, 'bar'),  -- id 3
  ('Red Bull',          11, 4,  8.00, 12.00, 'bar');  -- id 4

-- ─── Produtos — Loja ─────────────────────────────────────────
INSERT INTO produtos (nome, quantidade, estoque_minimo, preco_custo, preco_venda, tipo) VALUES
  ('Pomada Modeladora', 8, 3, 20.00, 35.00, 'loja'),  -- id 5
  ('Shampoo Masculino', 4, 2, 15.00, 28.00, 'loja'),  -- id 6
  ('Pós Barba Nivea',  10, 3, 12.00, 22.00, 'loja'),  -- id 7
  ('Óleo para Barba',   6, 2, 18.00, 30.00, 'loja');  -- id 8

-- ─── Planos ──────────────────────────────────────────────────
INSERT INTO planos (nome, valor, intervalo, descricao, beneficios, ativo) VALUES
  ('Clube VIP Mensal', 89.90, 'mensal',
   'Corte ilimitado + 20% desconto na barba todo mês',
   '[{"id":"b1","tipo":"corte_gratis","descricao":"1 corte grátis por mês"},{"id":"b2","tipo":"desconto_percent","valor":20,"descricao":"20% de desconto na barba"}]',
   true);

-- ─── Assinatura — Fernanda Lima (VIP) ────────────────────────
INSERT INTO assinaturas (cliente_id, plano_id, barbeiro_id, status, data_inicio, data_renovacao, valor) VALUES
  (6, 1, 2, 'ativa', '2026-04-08', '2026-06-08', 89.90);

-- ─── Sessão de caixa — ontem (fechada) ───────────────────────
INSERT INTO sessoes_caixa (id, status, valor_abertura, valor_fechamento, valor_esperado,
  diferenca, aberto_por, fechado_por, opened_at, closed_at, snapshot) VALUES
  (1, 'fechada', 200.00, 451.00, 451.00, 0.00,
   'João Silva', 'João Silva',
   '2026-05-07 09:00:00-03', '2026-05-07 20:00:00-03',
   '{"valor_abertura":200,"total_dinheiro":51,"total_pix":112,"total_debito":53,"total_credito":55,"total_sangrias":50,"total_suprimentos":0,"qtd_comandas":5}');

INSERT INTO movimentos_caixa (sessao_id, tipo, valor, motivo, created_at) VALUES
  (1, 'abertura',        200.00, 'Fundo inicial de caixa',      '2026-05-07 09:00:00-03'),
  (1, 'entrada_comanda',  51.00, 'Comanda #2 — Rafael Mendes',  '2026-05-07 11:35:00-03'),
  (1, 'sangria',          50.00, 'Retirada para troco do banco', '2026-05-07 16:00:00-03');

-- ─── Sessão de caixa — hoje (aberta) ─────────────────────────
INSERT INTO sessoes_caixa (id, status, valor_abertura, aberto_por, opened_at) VALUES
  (2, 'aberta', 150.00, 'Pedro Santos', '2026-05-08 09:00:00-03');

INSERT INTO movimentos_caixa (sessao_id, tipo, valor, motivo, created_at) VALUES
  (2, 'abertura', 150.00, 'Fundo inicial de caixa', '2026-05-08 09:00:00-03');

-- ─── Comandas fechadas ────────────────────────────────────────
-- 1) Carlos Oliveira — Corte + Barba — Pix — João — 05/05
INSERT INTO comandas (id, cliente_nome, cliente_id, barbeiro_id,
  servicos, itens_bar, itens_loja,
  valor_servicos, valor_bar, valor_loja, valor_total, forma_pagamento,
  status, created_at, updated_at, closed_at, version) VALUES
(1, 'Carlos Oliveira', 1, 1,
 '[{"id":3,"nome":"Corte + Barba","valor":55}]', '[]', '[]',
 55.00, 0.00, 0.00, 55.00, 'pix',
 'fechada', '2026-05-05 10:00:00-03', '2026-05-05 10:47:00-03', '2026-05-05 10:47:00-03', 2);

-- 2) Rafael Mendes — Corte + 2 cervejas — Dinheiro — Pedro — 05/05
INSERT INTO comandas (id, cliente_nome, cliente_id, barbeiro_id,
  servicos, itens_bar, itens_loja,
  valor_servicos, valor_bar, valor_loja, valor_total, forma_pagamento,
  sessao_caixa_id, status, created_at, updated_at, closed_at, version) VALUES
(2, 'Rafael Mendes', 2, 2,
 '[{"id":1,"nome":"Corte Masculino","valor":35}]',
 '[{"produto_id":1,"nome":"Cerveja Heineken","quantidade":2,"preco_venda":8}]',
 '[]',
 35.00, 16.00, 0.00, 51.00, 'dinheiro',
 1, 'fechada', '2026-05-05 11:00:00-03', '2026-05-05 11:35:00-03', '2026-05-05 11:35:00-03', 2);

-- 3) Bruno Ferreira — Corte + Barba — Crédito — João — 06/05
INSERT INTO comandas (id, cliente_nome, cliente_id, barbeiro_id,
  servicos, itens_bar, itens_loja,
  valor_servicos, valor_bar, valor_loja, valor_total, forma_pagamento,
  status, created_at, updated_at, closed_at, version) VALUES
(3, 'Bruno Ferreira', 3, 1,
 '[{"id":3,"nome":"Corte + Barba","valor":55}]', '[]', '[]',
 55.00, 0.00, 0.00, 55.00, 'credito',
 'fechada', '2026-05-06 09:30:00-03', '2026-05-06 10:17:00-03', '2026-05-06 10:17:00-03', 2);

-- 4) Lucas Almeida — Barba + Shampoo — Débito — Ana — 06/05
INSERT INTO comandas (id, cliente_nome, cliente_id, barbeiro_id,
  servicos, itens_bar, itens_loja,
  valor_servicos, valor_bar, valor_loja, valor_total, forma_pagamento,
  status, created_at, updated_at, closed_at, version) VALUES
(4, 'Lucas Almeida', 4, 3,
 '[{"id":2,"nome":"Barba","valor":25}]',
 '[]',
 '[{"produto_id":6,"nome":"Shampoo Masculino","quantidade":1,"preco_venda":28}]',
 25.00, 0.00, 28.00, 53.00, 'debito',
 'fechada', '2026-05-06 14:00:00-03', '2026-05-06 14:26:00-03', '2026-05-06 14:26:00-03', 2);

-- 5) Fernanda Lima — Corte grátis (plano VIP) — Pix — Pedro — 07/05
INSERT INTO comandas (id, cliente_nome, cliente_id, barbeiro_id,
  servicos, itens_bar, itens_loja,
  valor_servicos, valor_bar, valor_loja, beneficio_desconto, valor_total, forma_pagamento,
  status, created_at, updated_at, closed_at, version) VALUES
(5, 'Fernanda Lima', 6, 2,
 '[{"id":1,"nome":"Corte Masculino","valor":35}]', '[]', '[]',
 35.00, 0.00, 0.00, 35.00, 0.00, 'pix',
 'fechada', '2026-05-07 10:00:00-03', '2026-05-07 10:33:00-03', '2026-05-07 10:33:00-03', 2);

-- 6) Diego Costa — Hidratação + Red Bull — Pix — João — 07/05
INSERT INTO comandas (id, cliente_nome, cliente_id, barbeiro_id,
  servicos, itens_bar, itens_loja,
  valor_servicos, valor_bar, valor_loja, valor_total, forma_pagamento,
  status, created_at, updated_at, closed_at, version) VALUES
(6, 'Diego Costa', 7, 1,
 '[{"id":4,"nome":"Hidratação Capilar","valor":45}]',
 '[{"produto_id":4,"nome":"Red Bull","quantidade":1,"preco_venda":12}]',
 '[]',
 45.00, 12.00, 0.00, 57.00, 'pix',
 'fechada', '2026-05-07 15:00:00-03', '2026-05-07 15:48:00-03', '2026-05-07 15:48:00-03', 2);

-- ─── Comandas abertas (hoje) ──────────────────────────────────
-- 7) Marcos Souza — em atendimento — João
INSERT INTO comandas (id, cliente_nome, cliente_id, barbeiro_id,
  servicos, itens_bar, itens_loja,
  valor_servicos, valor_bar, valor_loja, valor_total,
  status, created_at, updated_at, version) VALUES
(7, 'Marcos Souza', 5, 1,
 '[{"id":3,"nome":"Corte + Barba","valor":55}]', '[]', '[]',
 55.00, 0.00, 0.00, 55.00,
 'aberta', '2026-05-08 10:00:00-03', '2026-05-08 10:00:00-03', 1);

-- 8) Carlos Oliveira — em atendimento — Ana
INSERT INTO comandas (id, cliente_nome, cliente_id, barbeiro_id,
  servicos, itens_bar, itens_loja,
  valor_servicos, valor_bar, valor_loja, valor_total,
  status, created_at, updated_at, version) VALUES
(8, 'Carlos Oliveira', 1, 3,
 '[{"id":1,"nome":"Corte Masculino","valor":35}]',
 '[{"produto_id":2,"nome":"Refrigerante Lata","quantidade":1,"preco_venda":5}]',
 '[]',
 35.00, 5.00, 0.00, 40.00,
 'aberta', '2026-05-08 10:30:00-03', '2026-05-08 10:30:00-03', 1);

-- ─── Atendimentos (vinculados às 6 comandas fechadas) ─────────
INSERT INTO atendimentos (id, comanda_id, cliente_nome, cliente_id, barbeiro_id,
  servicos, valor_total, forma_pagamento, status, data_hora, data_cadastro) VALUES
(1, 1, 'Carlos Oliveira', 1, 1, '[{"id":3,"nome":"Corte + Barba","valor":55}]',    55.00, 'pix',      'concluido', '2026-05-05 10:00:00-03', '2026-05-05 10:47:00-03'),
(2, 2, 'Rafael Mendes',   2, 2, '[{"id":1,"nome":"Corte Masculino","valor":35}]',  51.00, 'dinheiro', 'concluido', '2026-05-05 11:00:00-03', '2026-05-05 11:35:00-03'),
(3, 3, 'Bruno Ferreira',  3, 1, '[{"id":3,"nome":"Corte + Barba","valor":55}]',    55.00, 'credito',  'concluido', '2026-05-06 09:30:00-03', '2026-05-06 10:17:00-03'),
(4, 4, 'Lucas Almeida',   4, 3, '[{"id":2,"nome":"Barba","valor":25}]',            53.00, 'debito',   'concluido', '2026-05-06 14:00:00-03', '2026-05-06 14:26:00-03'),
(5, 5, 'Fernanda Lima',   6, 2, '[{"id":1,"nome":"Corte Masculino","valor":35}]',   0.00, 'pix',      'concluido', '2026-05-07 10:00:00-03', '2026-05-07 10:33:00-03'),
(6, 6, 'Diego Costa',     7, 1, '[{"id":4,"nome":"Hidratação Capilar","valor":45}]',57.00,'pix',      'concluido', '2026-05-07 15:00:00-03', '2026-05-07 15:48:00-03');

-- Vincular atendimento_id nas comandas fechadas
UPDATE comandas SET atendimento_id = 1 WHERE id = 1;
UPDATE comandas SET atendimento_id = 2 WHERE id = 2;
UPDATE comandas SET atendimento_id = 3 WHERE id = 3;
UPDATE comandas SET atendimento_id = 4 WHERE id = 4;
UPDATE comandas SET atendimento_id = 5 WHERE id = 5;
UPDATE comandas SET atendimento_id = 6 WHERE id = 6;

-- ─── Uso de benefício — Fernanda Lima ─────────────────────────
INSERT INTO uso_beneficios (assinatura_id, cliente_id, plano_id, comanda_id,
  ciclo, beneficio_id, quantidade, valor_desconto) VALUES
  (1, 6, 1, 5, '2026-05', 'b1', 1, 35.00);

-- ─── Histórico de estoque (saídas pelas comandas fechadas) ────
INSERT INTO historico (produto_id, produto_nome, tipo, quantidade_anterior, quantidade_nova, data_zerado) VALUES
  (1, 'Cerveja Heineken',  'saida', 24, 22, '2026-05-05 11:35:00-03'),
  (6, 'Shampoo Masculino', 'saida',  5,  4, '2026-05-06 14:26:00-03'),
  (4, 'Red Bull',          'saida', 12, 11, '2026-05-07 15:48:00-03');

-- ─── Eventos de auditoria das comandas ────────────────────────
INSERT INTO comanda_eventos (comanda_id, tipo, descricao, created_at) VALUES
  (1, 'criada',  'Comanda criada para Carlos Oliveira',  '2026-05-05 10:00:00-03'),
  (1, 'fechada', 'Fechada — R$ 55,00 via pix',           '2026-05-05 10:47:00-03'),
  (2, 'criada',  'Comanda criada para Rafael Mendes',    '2026-05-05 11:00:00-03'),
  (2, 'fechada', 'Fechada — R$ 51,00 via dinheiro',      '2026-05-05 11:35:00-03'),
  (3, 'criada',  'Comanda criada para Bruno Ferreira',   '2026-05-06 09:30:00-03'),
  (3, 'fechada', 'Fechada — R$ 55,00 via credito',       '2026-05-06 10:17:00-03'),
  (4, 'criada',  'Comanda criada para Lucas Almeida',    '2026-05-06 14:00:00-03'),
  (4, 'fechada', 'Fechada — R$ 53,00 via debito',        '2026-05-06 14:26:00-03'),
  (5, 'criada',  'Comanda criada para Fernanda Lima',    '2026-05-07 10:00:00-03'),
  (5, 'fechada', 'Fechada — R$ 0,00 via pix',            '2026-05-07 10:33:00-03'),
  (6, 'criada',  'Comanda criada para Diego Costa',      '2026-05-07 15:00:00-03'),
  (6, 'fechada', 'Fechada — R$ 57,00 via pix',           '2026-05-07 15:48:00-03'),
  (7, 'criada',  'Comanda criada para Marcos Souza',     '2026-05-08 10:00:00-03'),
  (8, 'criada',  'Comanda criada para Carlos Oliveira',  '2026-05-08 10:30:00-03');

-- ─── Ajustar sequences ────────────────────────────────────────
SELECT setval('barbeiros_id_seq',        (SELECT MAX(id) FROM barbeiros));
SELECT setval('servicos_id_seq',         (SELECT MAX(id) FROM servicos));
SELECT setval('clientes_id_seq',         (SELECT MAX(id) FROM clientes));
SELECT setval('produtos_id_seq',         (SELECT MAX(id) FROM produtos));
SELECT setval('planos_id_seq',           (SELECT MAX(id) FROM planos));
SELECT setval('assinaturas_id_seq',      (SELECT MAX(id) FROM assinaturas));
SELECT setval('sessoes_caixa_id_seq',    (SELECT MAX(id) FROM sessoes_caixa));
SELECT setval('movimentos_caixa_id_seq', (SELECT MAX(id) FROM movimentos_caixa));
SELECT setval('comandas_id_seq',         (SELECT MAX(id) FROM comandas));
SELECT setval('atendimentos_id_seq',     (SELECT MAX(id) FROM atendimentos));

-- ─── Reabilitar triggers ──────────────────────────────────────
ALTER TABLE configuracoes    ENABLE TRIGGER USER;
ALTER TABLE barbeiros        ENABLE TRIGGER USER;
ALTER TABLE comandas         ENABLE TRIGGER USER;
ALTER TABLE atendimentos     ENABLE TRIGGER USER;
ALTER TABLE sessoes_caixa    ENABLE TRIGGER USER;
ALTER TABLE movimentos_caixa ENABLE TRIGGER USER;
ALTER TABLE historico        ENABLE TRIGGER USER;
ALTER TABLE comanda_eventos  ENABLE TRIGGER USER;
ALTER TABLE audit_log        ENABLE TRIGGER USER;
ALTER TABLE uso_beneficios   ENABLE TRIGGER USER;

-- Confirmação
SELECT
  (SELECT COUNT(*) FROM barbeiros)    AS barbeiros,
  (SELECT COUNT(*) FROM servicos)     AS servicos,
  (SELECT COUNT(*) FROM clientes)     AS clientes,
  (SELECT COUNT(*) FROM produtos)     AS produtos,
  (SELECT COUNT(*) FROM planos)       AS planos,
  (SELECT COUNT(*) FROM comandas)     AS comandas,
  (SELECT COUNT(*) FROM atendimentos) AS atendimentos;
