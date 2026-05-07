-- =============================================================
-- MIGRAÇÃO: Auditoria de Comandas
-- Execute no SQL Editor do painel do Supabase
-- =============================================================

-- 1. Log imutável de eventos da comanda
CREATE TABLE IF NOT EXISTS comanda_eventos (
  id          BIGSERIAL PRIMARY KEY,
  comanda_id  INTEGER NOT NULL REFERENCES comandas(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL,   -- 'criada' | 'fechada' | 'cancelada'
  descricao   TEXT,
  payload     JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comanda_eventos_comanda
  ON comanda_eventos(comanda_id, created_at DESC);

-- 2. Colunas de auditoria na tabela comandas
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS closed_at      TIMESTAMPTZ;
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS deleted_at     TIMESTAMPTZ;
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS deleted_reason TEXT;

-- 3. Expandir status para incluir 'cancelada'
ALTER TABLE comandas DROP CONSTRAINT IF EXISTS comandas_status_check;
ALTER TABLE comandas ADD CONSTRAINT comandas_status_check
  CHECK (status IN ('aberta', 'fechada', 'cancelada'));

-- 4. Flag de estorno nos registros de uso de benefícios
ALTER TABLE uso_beneficios
  ADD COLUMN IF NOT EXISTS estornado BOOLEAN NOT NULL DEFAULT FALSE;
