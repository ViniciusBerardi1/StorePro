-- Adiciona slug único por loja (identificador de acesso no login)
ALTER TABLE lojas ADD COLUMN IF NOT EXISTS slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS lojas_slug_uq ON lojas(slug);
