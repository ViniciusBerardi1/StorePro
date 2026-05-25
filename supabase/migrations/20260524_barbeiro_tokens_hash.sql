-- Migra barbeiro_tokens para armazenar apenas o hash SHA-256 do token.
-- O token cru nunca fica persistido no banco — apenas o hash é guardado.
-- Sessões existentes são invalidadas (barbeiros precisam fazer login novamente).

-- Limpa sessões antigas (tokens plaintext não são mais válidos após esta migration)
TRUNCATE TABLE barbeiro_tokens;

-- Remove coluna e índice antigos
DROP INDEX IF EXISTS idx_barbeiro_tokens_token;
ALTER TABLE barbeiro_tokens DROP COLUMN IF EXISTS token;

-- Adiciona coluna de hash
ALTER TABLE barbeiro_tokens
  ADD COLUMN token_hash TEXT NOT NULL UNIQUE;

-- Índice para lookup eficiente por hash
CREATE INDEX idx_barbeiro_tokens_token_hash ON barbeiro_tokens(token_hash);
