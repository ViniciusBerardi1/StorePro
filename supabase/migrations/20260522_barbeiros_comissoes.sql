-- Armazena percentuais de comissão por tipo de receita, por barbeiro
-- Estrutura: { "servico": 40, "adicional": 30, "produto": 10 }  (valores em %)
ALTER TABLE barbeiros
  ADD COLUMN IF NOT EXISTS comissoes JSONB NOT NULL DEFAULT '{}';
