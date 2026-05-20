-- Portal do Barbeiro: acesso por código numérico + sessão em tabela própria

ALTER TABLE barbeiros
  ADD COLUMN IF NOT EXISTS codigo_acesso VARCHAR(10) UNIQUE,
  ADD COLUMN IF NOT EXISTS ultimo_login TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS barbeiro_tokens (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  barbeiro_id INT          NOT NULL REFERENCES barbeiros(id) ON DELETE CASCADE,
  loja_id     UUID         NOT NULL REFERENCES lojas(id)     ON DELETE CASCADE,
  token       TEXT         UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  expires_at  TIMESTAMPTZ  NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_barbeiro_tokens_token    ON barbeiro_tokens(token);
CREATE INDEX IF NOT EXISTS idx_barbeiro_tokens_barbeiro ON barbeiro_tokens(barbeiro_id);
