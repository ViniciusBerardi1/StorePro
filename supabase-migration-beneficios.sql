-- =============================================================
-- MIGRAÇÃO: Sistema de Benefícios de Assinatura
-- Execute no SQL Editor do painel do Supabase
-- =============================================================

-- 1. Benefícios estruturados nos planos (JSONB array)
ALTER TABLE planos
  ADD COLUMN IF NOT EXISTS beneficios JSONB NOT NULL DEFAULT '[]';

-- 2. Rastrear uso mensal por benefício/cliente
CREATE TABLE IF NOT EXISTS uso_beneficios (
  id               BIGSERIAL PRIMARY KEY,
  assinatura_id    BIGINT REFERENCES assinaturas(id) ON DELETE CASCADE,
  cliente_id       BIGINT REFERENCES clientes(id)   ON DELETE SET NULL,
  plano_id         BIGINT REFERENCES planos(id)      ON DELETE SET NULL,
  ciclo            TEXT NOT NULL,        -- 'YYYY-MM'
  beneficio_id     TEXT NOT NULL,        -- UUID do planos.beneficios[].id
  quantidade       INTEGER NOT NULL DEFAULT 1,
  comanda_id       BIGINT,
  valor_desconto   NUMERIC(10,2),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uso_beneficios_lookup
  ON uso_beneficios(assinatura_id, ciclo);

-- 3. Rastrear desconto de plano aplicado na comanda
ALTER TABLE comandas
  ADD COLUMN IF NOT EXISTS beneficio_desconto    NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS beneficios_aplicados  JSONB         DEFAULT '[]';
