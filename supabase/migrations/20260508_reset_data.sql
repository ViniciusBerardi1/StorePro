-- ============================================================
-- RESET COMPLETO DOS DADOS (mantém schema, triggers e funções)
-- Execute no Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Desabilitar triggers de usuário (não os de sistema/FK)
ALTER TABLE historico        DISABLE TRIGGER USER;
ALTER TABLE comanda_eventos  DISABLE TRIGGER USER;
ALTER TABLE audit_log        DISABLE TRIGGER USER;
ALTER TABLE movimentos_caixa DISABLE TRIGGER USER;
ALTER TABLE sessoes_caixa    DISABLE TRIGGER USER;

-- 2. Limpar todos os dados (CASCADE resolve FKs + RESTART IDENTITY reseta os IDs)
TRUNCATE TABLE
  comanda_eventos,
  audit_log,
  webhook_logs,
  historico,
  movimentos_caixa,
  sessoes_caixa,
  uso_beneficios,
  assinaturas,
  atendimentos,
  comandas,
  clientes,
  servicos,
  barbeiros,
  planos,
  produtos,
  horarios_especiais,
  configuracoes,
  categorias
RESTART IDENTITY CASCADE;

-- 3. Re-inserir categorias padrão
INSERT INTO categorias (nome) VALUES
  ('Eletrônicos'), ('Roupas'), ('Calçados'),
  ('Alimentos'), ('Higiene'), ('Outros');

-- 4. Reabilitar triggers
ALTER TABLE historico        ENABLE TRIGGER USER;
ALTER TABLE comanda_eventos  ENABLE TRIGGER USER;
ALTER TABLE audit_log        ENABLE TRIGGER USER;
ALTER TABLE movimentos_caixa ENABLE TRIGGER USER;
ALTER TABLE sessoes_caixa    ENABLE TRIGGER USER;

-- Confirmação
SELECT 'Reset concluído. Banco limpo.' AS resultado;
