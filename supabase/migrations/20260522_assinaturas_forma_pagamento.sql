-- Adiciona forma_pagamento à tabela assinaturas para registro de como o cliente pagou na ativação manual
ALTER TABLE assinaturas
  ADD COLUMN IF NOT EXISTS forma_pagamento TEXT
  CHECK (forma_pagamento IN ('dinheiro','pix','credito','debito','boleto'));
