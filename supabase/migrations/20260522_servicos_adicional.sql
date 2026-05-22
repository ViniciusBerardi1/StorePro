-- Distingue serviços normais de serviços adicionais para futura lógica de comissão por tipo
ALTER TABLE servicos
  ADD COLUMN IF NOT EXISTS adicional BOOLEAN NOT NULL DEFAULT false;
