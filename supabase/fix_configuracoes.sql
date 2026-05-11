-- Fix: garante que configuracoes tem id SERIAL PK e unique(chave, loja_id)
-- Execute no Supabase Dashboard → SQL Editor

-- 1. Remove primary key antiga (chave TEXT PRIMARY KEY)
ALTER TABLE configuracoes DROP CONSTRAINT IF EXISTS configuracoes_pkey;

-- 2. Adiciona coluna id se não existir
ALTER TABLE configuracoes ADD COLUMN IF NOT EXISTS id SERIAL;

-- 3. Adiciona primary key no id se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'configuracoes'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE configuracoes ADD PRIMARY KEY (id);
  END IF;
END $$;

-- 4. Adiciona loja_id se não existir
ALTER TABLE configuracoes
  ADD COLUMN IF NOT EXISTS loja_id UUID REFERENCES lojas(id) ON DELETE CASCADE;

-- 5. Recria índice único em (chave, loja_id)
DROP INDEX IF EXISTS configuracoes_chave_loja_uq;
CREATE UNIQUE INDEX configuracoes_chave_loja_uq
  ON configuracoes(chave, loja_id);

-- 6. Garante trigger de auto-set loja_id
DROP TRIGGER IF EXISTS trg_auto_loja_id ON configuracoes;
CREATE TRIGGER trg_auto_loja_id
  BEFORE INSERT ON configuracoes
  FOR EACH ROW EXECUTE FUNCTION auto_set_loja_id();

-- Confirma estrutura final
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'configuracoes'
ORDER BY ordinal_position;
