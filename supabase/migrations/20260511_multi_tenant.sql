-- ============================================================
-- MULTI-TENANT — StorePro
-- Cada barbearia tem seus próprios dados isolados por loja_id.
-- Pré-requisito: 20260511_admin_system.sql já executado.
-- ============================================================

-- ── 1. Tabela lojas ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lojas (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT        NOT NULL,
  ativo      BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS lojas_updated_at ON lojas;
CREATE TRIGGER lojas_updated_at
  BEFORE UPDATE ON lojas
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ── 2. loja_id em profiles ──────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS loja_id UUID REFERENCES lojas(id) ON DELETE SET NULL;

-- ── 3. loja_id em todas as tabelas de dados ─────────────────
ALTER TABLE produtos          ADD COLUMN IF NOT EXISTS loja_id UUID REFERENCES lojas(id) ON DELETE CASCADE;
ALTER TABLE clientes          ADD COLUMN IF NOT EXISTS loja_id UUID REFERENCES lojas(id) ON DELETE CASCADE;
ALTER TABLE servicos          ADD COLUMN IF NOT EXISTS loja_id UUID REFERENCES lojas(id) ON DELETE CASCADE;
ALTER TABLE barbeiros         ADD COLUMN IF NOT EXISTS loja_id UUID REFERENCES lojas(id) ON DELETE CASCADE;
ALTER TABLE planos            ADD COLUMN IF NOT EXISTS loja_id UUID REFERENCES lojas(id) ON DELETE CASCADE;
ALTER TABLE atendimentos      ADD COLUMN IF NOT EXISTS loja_id UUID REFERENCES lojas(id) ON DELETE CASCADE;
ALTER TABLE comandas          ADD COLUMN IF NOT EXISTS loja_id UUID REFERENCES lojas(id) ON DELETE CASCADE;
ALTER TABLE assinaturas       ADD COLUMN IF NOT EXISTS loja_id UUID REFERENCES lojas(id) ON DELETE CASCADE;
ALTER TABLE uso_beneficios    ADD COLUMN IF NOT EXISTS loja_id UUID REFERENCES lojas(id) ON DELETE CASCADE;
ALTER TABLE sessoes_caixa     ADD COLUMN IF NOT EXISTS loja_id UUID REFERENCES lojas(id) ON DELETE CASCADE;
ALTER TABLE movimentos_caixa  ADD COLUMN IF NOT EXISTS loja_id UUID REFERENCES lojas(id) ON DELETE CASCADE;
ALTER TABLE historico         ADD COLUMN IF NOT EXISTS loja_id UUID REFERENCES lojas(id) ON DELETE CASCADE;
ALTER TABLE comanda_eventos   ADD COLUMN IF NOT EXISTS loja_id UUID REFERENCES lojas(id) ON DELETE CASCADE;
ALTER TABLE horarios_especiais ADD COLUMN IF NOT EXISTS loja_id UUID REFERENCES lojas(id) ON DELETE CASCADE;

-- ── 4. configuracoes: troca PK para suportar uma por loja ────
-- Mantém compatibilidade: registros sem loja_id = globais/admin
ALTER TABLE configuracoes DROP CONSTRAINT IF EXISTS configuracoes_pkey;
ALTER TABLE configuracoes ADD COLUMN IF NOT EXISTS id SERIAL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'configuracoes_pkey_new'
  ) THEN
    ALTER TABLE configuracoes ADD PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE configuracoes ADD COLUMN IF NOT EXISTS loja_id UUID REFERENCES lojas(id) ON DELETE CASCADE;
DROP INDEX IF EXISTS configuracoes_chave_loja_uq;
CREATE UNIQUE INDEX IF NOT EXISTS configuracoes_chave_loja_uq ON configuracoes(chave, loja_id);

-- ── 5. sessoes_caixa: uma sessão aberta por LOJA ─────────────
DROP INDEX IF EXISTS idx_sessoes_caixa_uma_aberta;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessoes_caixa_uma_aberta
  ON sessoes_caixa(loja_id, status) WHERE status = 'aberta';

-- ── 6. horarios_especiais: unique por (data, loja) ──────────
-- Tenta dropar o índice antigo se existir
DROP INDEX IF EXISTS horarios_especiais_data_key;
DROP INDEX IF EXISTS idx_horarios_especiais_data;
CREATE UNIQUE INDEX IF NOT EXISTS idx_horarios_especiais_data_loja
  ON horarios_especiais(data, loja_id);

-- ── 7. Helper: retorna loja_id do usuário atual ──────────────
CREATE OR REPLACE FUNCTION get_my_loja_id()
RETURNS UUID AS $$
  SELECT loja_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── 8. Trigger: auto-preenche loja_id no INSERT ─────────────
CREATE OR REPLACE FUNCTION auto_set_loja_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.loja_id IS NULL THEN
    NEW.loja_id := get_my_loja_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Cria trigger em cada tabela de dados
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'produtos','clientes','servicos','barbeiros','planos',
    'atendimentos','comandas','assinaturas','uso_beneficios',
    'sessoes_caixa','movimentos_caixa','historico','comanda_eventos',
    'horarios_especiais','configuracoes'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_auto_loja_id ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_auto_loja_id
         BEFORE INSERT ON %I
         FOR EACH ROW EXECUTE FUNCTION auto_set_loja_id()',
      t
    );
  END LOOP;
END;
$$;

-- ── 9. Trigger: auto-preenche loja_id no profile do novo user
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role, loja_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
    CASE
      WHEN NEW.raw_user_meta_data->>'loja_id' IS NOT NULL
        AND NEW.raw_user_meta_data->>'loja_id' != ''
      THEN (NEW.raw_user_meta_data->>'loja_id')::UUID
      ELSE NULL
    END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 10. RLS: remove políticas antigas, cria isolamento por loja

-- categorias: globais — qualquer autenticado lê, só admin escreve
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_all       ON categorias;
DROP POLICY IF EXISTS cat_read       ON categorias;
DROP POLICY IF EXISTS cat_write      ON categorias;
CREATE POLICY cat_read  ON categorias FOR SELECT TO authenticated USING (true);
CREATE POLICY cat_write ON categorias FOR ALL    TO authenticated
  USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');
-- anon ainda pode ler (app público de assinatura)
CREATE POLICY cat_anon_read ON categorias FOR SELECT TO anon USING (true);

-- Macro: cria políticas de isolamento por loja para as demais tabelas
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'produtos','clientes','servicos','barbeiros','planos',
    'atendimentos','comandas','assinaturas','uso_beneficios',
    'sessoes_caixa','movimentos_caixa','historico','comanda_eventos',
    'horarios_especiais','configuracoes'
  ] LOOP
    -- habilita RLS
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    -- remove políticas legadas (anon_all, anon_select, anon_insert, anon_update)
    EXECUTE format('DROP POLICY IF EXISTS anon_all    ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS anon_select ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS anon_insert ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS anon_update ON %I', t);
    -- política única: admin vê tudo, user vê só sua loja
    EXECUTE format(
      'CREATE POLICY loja_isolation ON %I
         FOR ALL TO authenticated
         USING (
           get_my_role() = ''admin''
           OR loja_id = get_my_loja_id()
         )
         WITH CHECK (
           get_my_role() = ''admin''
           OR loja_id = get_my_loja_id()
         )',
      t
    );
  END LOOP;
END;
$$;

-- profiles: admin vê todos, user vê só o próprio (já tinha essas políticas)
-- Garante que admin pode ver todos os profiles com loja_id
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON profiles;
CREATE POLICY "profiles_select_own_or_admin" ON profiles
  FOR SELECT USING (auth.uid() = id OR get_my_role() = 'admin');

-- lojas: admin gerencia tudo, users autenticados podem ler a própria loja
ALTER TABLE lojas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lojas_admin ON lojas;
DROP POLICY IF EXISTS lojas_read  ON lojas;
CREATE POLICY lojas_admin ON lojas FOR ALL TO authenticated
  USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');
CREATE POLICY lojas_read  ON lojas FOR SELECT TO authenticated
  USING (id = get_my_loja_id() OR get_my_role() = 'admin');

-- ── 11. Políticas para authenticated no admin panel ──────────
-- (authenticated_select/insert/update para configuracoes — adicionadas pela
--  migration anterior; substituídas pela loja_isolation acima)
DROP POLICY IF EXISTS authenticated_select ON configuracoes;
DROP POLICY IF EXISTS authenticated_insert ON configuracoes;
DROP POLICY IF EXISTS authenticated_update ON configuracoes;
