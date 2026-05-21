-- ============================================================
-- STOREPRO — SCHEMA COMPLETO
-- Roda do zero em qualquer projeto Supabase novo.
-- Ordem: extensões → tabelas → índices → funções → triggers → RLS
-- ============================================================

-- ── Extensões ────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. LOJAS (tabela raiz do multi-tenant)
-- ============================================================
CREATE TABLE IF NOT EXISTS lojas (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT        NOT NULL,
  slug       TEXT        UNIQUE,
  ativo      BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. PROFILES (espelho de auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id           UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT,
  full_name    TEXT,
  avatar_url   TEXT,
  role         TEXT        NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  loja_id      UUID        REFERENCES lojas(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. CATEGORIAS (global — sem loja_id)
-- ============================================================
CREATE TABLE IF NOT EXISTS categorias (
  id         SERIAL      PRIMARY KEY,
  nome       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 4. PRODUTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS produtos (
  id             SERIAL        PRIMARY KEY,
  nome           TEXT          NOT NULL,
  cor            TEXT          DEFAULT '',
  foto           TEXT          DEFAULT '',
  categoria_id   INT           REFERENCES categorias(id) ON DELETE SET NULL,
  quantidade     INT           NOT NULL DEFAULT 0,
  estoque_minimo INT           NOT NULL DEFAULT 1,
  tipo           TEXT          NOT NULL DEFAULT 'loja' CHECK (tipo IN ('loja', 'bar')),
  custo          NUMERIC(10,2),
  preco          NUMERIC(10,2),
  loja_id        UUID          REFERENCES lojas(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 5. HISTÓRICO DE ESTOQUE (append-only)
-- ============================================================
CREATE TABLE IF NOT EXISTS historico (
  id                  SERIAL      PRIMARY KEY,
  produto_id          INT,
  produto_nome        TEXT,
  produto_cor         TEXT        DEFAULT '',
  categoria_nome      TEXT        DEFAULT '',
  foto                TEXT        DEFAULT '',
  tipo                TEXT        CHECK (tipo IN ('entrada','saida','zerado','reposto')),
  quantidade_anterior INT         NOT NULL DEFAULT 0,
  quantidade_nova     INT         NOT NULL DEFAULT 0,
  data_zerado         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  loja_id             UUID        REFERENCES lojas(id) ON DELETE CASCADE
);

-- ============================================================
-- 6. CLIENTES
-- ============================================================
CREATE TABLE IF NOT EXISTS clientes (
  id            SERIAL      PRIMARY KEY,
  nome          TEXT        NOT NULL,
  telefone      TEXT,
  email         TEXT,
  data_cadastro DATE        DEFAULT CURRENT_DATE,
  observacoes   TEXT,
  foto          TEXT,
  loja_id       UUID        REFERENCES lojas(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 7. SERVIÇOS
-- ============================================================
CREATE TABLE IF NOT EXISTS servicos (
  id         SERIAL        PRIMARY KEY,
  nome       TEXT          NOT NULL,
  duracao    INT           DEFAULT 30,
  valor      NUMERIC(10,2) NOT NULL DEFAULT 0,
  ativo      BOOLEAN       NOT NULL DEFAULT true,
  loja_id    UUID          REFERENCES lojas(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 8. BARBEIROS
-- ============================================================
CREATE TABLE IF NOT EXISTS barbeiros (
  id            SERIAL      PRIMARY KEY,
  nome          TEXT        NOT NULL,
  foto          TEXT,
  ativo         BOOLEAN     NOT NULL DEFAULT true,
  gcal_color_id TEXT,
  codigo_acesso VARCHAR(10) UNIQUE,
  ultimo_login  TIMESTAMPTZ,
  loja_id       UUID        REFERENCES lojas(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 9. ATENDIMENTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS atendimentos (
  id             SERIAL        PRIMARY KEY,
  gcal_event_id  TEXT,
  cliente_id     INT           REFERENCES clientes(id) ON DELETE SET NULL,
  cliente_nome   TEXT,
  barbeiro_id    INT           REFERENCES barbeiros(id) ON DELETE SET NULL,
  servicos       JSONB         DEFAULT '[]',
  status         TEXT          NOT NULL DEFAULT 'agendado'
                               CHECK (status IN ('agendado','concluido','cancelado')),
  data_hora      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  valor_total    NUMERIC(10,2) DEFAULT 0,
  valor_servicos NUMERIC(10,2) DEFAULT 0,
  valor_bar      NUMERIC(10,2) DEFAULT 0,
  valor_loja     NUMERIC(10,2) DEFAULT 0,
  itens_bar      JSONB         DEFAULT '[]',
  itens_loja     JSONB         DEFAULT '[]',
  evento_gcal    JSONB,
  loja_id        UUID          REFERENCES lojas(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 10. COMANDAS
-- ============================================================
CREATE TABLE IF NOT EXISTS comandas (
  id             SERIAL        PRIMARY KEY,
  gcal_event_id  TEXT          UNIQUE,
  cliente_id     INT           REFERENCES clientes(id) ON DELETE SET NULL,
  cliente_nome   TEXT,
  barbeiro_id    INT           REFERENCES barbeiros(id) ON DELETE SET NULL,
  servicos       JSONB         DEFAULT '[]',
  status         TEXT          NOT NULL DEFAULT 'aberta'
                               CHECK (status IN ('aberta','fechada','cancelada')),
  valor_total    NUMERIC(10,2) DEFAULT 0,
  valor_servicos NUMERIC(10,2) DEFAULT 0,
  valor_bar      NUMERIC(10,2) DEFAULT 0,
  valor_loja     NUMERIC(10,2) DEFAULT 0,
  itens_bar      JSONB         DEFAULT '[]',
  itens_loja     JSONB         DEFAULT '[]',
  evento_gcal    JSONB,
  deleted_at     TIMESTAMPTZ,
  version        INT           NOT NULL DEFAULT 1,
  loja_id        UUID          REFERENCES lojas(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 11. COMANDA_EVENTOS (append-only)
-- ============================================================
CREATE TABLE IF NOT EXISTS comanda_eventos (
  id         SERIAL      PRIMARY KEY,
  comanda_id INT         REFERENCES comandas(id) ON DELETE CASCADE,
  tipo       TEXT        NOT NULL,
  descricao  TEXT,
  payload    JSONB       DEFAULT '{}',
  loja_id    UUID        REFERENCES lojas(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 12. PLANOS
-- ============================================================
CREATE TABLE IF NOT EXISTS planos (
  id         SERIAL        PRIMARY KEY,
  nome       TEXT          NOT NULL,
  valor      NUMERIC(10,2) NOT NULL DEFAULT 0,
  intervalo  TEXT          NOT NULL DEFAULT 'mensal'
             CHECK (intervalo IN ('mensal','trimestral','semestral','anual')),
  beneficios JSONB         DEFAULT '[]',
  ativo      BOOLEAN       NOT NULL DEFAULT true,
  loja_id    UUID          REFERENCES lojas(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 13. ASSINATURAS
-- ============================================================
CREATE TABLE IF NOT EXISTS assinaturas (
  id                      SERIAL        PRIMARY KEY,
  cliente_id              INT           REFERENCES clientes(id) ON DELETE SET NULL,
  plano_id                INT           REFERENCES planos(id) ON DELETE SET NULL,
  barbeiro_id             INT           REFERENCES barbeiros(id) ON DELETE SET NULL,
  status                  TEXT          NOT NULL DEFAULT 'ativa'
                          CHECK (status IN ('ativa','pendente','inadimplente','cancelada','expirada')),
  data_inicio             DATE,
  data_renovacao          DATE,
  valor                   NUMERIC(10,2),
  gateway                 TEXT,
  gateway_subscription_id TEXT,
  observacoes             TEXT,
  loja_id                 UUID          REFERENCES lojas(id) ON DELETE CASCADE,
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 14. USO_BENEFICIOS
-- ============================================================
CREATE TABLE IF NOT EXISTS uso_beneficios (
  id            SERIAL      PRIMARY KEY,
  assinatura_id INT         REFERENCES assinaturas(id) ON DELETE CASCADE,
  comanda_id    INT         REFERENCES comandas(id) ON DELETE CASCADE,
  ciclo         TEXT        NOT NULL,
  beneficio_id  TEXT,
  estornado     BOOLEAN     NOT NULL DEFAULT false,
  loja_id       UUID        REFERENCES lojas(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 15. SESSOES_CAIXA
-- ============================================================
CREATE TABLE IF NOT EXISTS sessoes_caixa (
  id               SERIAL        PRIMARY KEY,
  status           TEXT          NOT NULL DEFAULT 'aberta'
                   CHECK (status IN ('aberta','fechada')),
  valor_abertura   NUMERIC(10,2) NOT NULL DEFAULT 0,
  valor_fechamento NUMERIC(10,2),
  aberto_por       TEXT,
  fechado_por      TEXT,
  opened_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  closed_at        TIMESTAMPTZ,
  loja_id          UUID          REFERENCES lojas(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 16. MOVIMENTOS_CAIXA (append-only)
-- ============================================================
CREATE TABLE IF NOT EXISTS movimentos_caixa (
  id         SERIAL        PRIMARY KEY,
  sessao_id  INT           NOT NULL REFERENCES sessoes_caixa(id) ON DELETE CASCADE,
  tipo       TEXT          NOT NULL CHECK (tipo IN ('sangria','suprimento','pagamento','recebimento','ajuste')),
  valor      NUMERIC(10,2) NOT NULL,
  motivo     TEXT,
  loja_id    UUID          REFERENCES lojas(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 17. HORÁRIOS ESPECIAIS
-- ============================================================
CREATE TABLE IF NOT EXISTS horarios_especiais (
  id              SERIAL      PRIMARY KEY,
  data            DATE        NOT NULL,
  aberto          BOOLEAN     NOT NULL DEFAULT false,
  hora_abertura   TIME,
  hora_fechamento TIME,
  motivo          TEXT,
  loja_id         UUID        REFERENCES lojas(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 18. CONFIGURAÇÕES
-- ============================================================
CREATE TABLE IF NOT EXISTS configuracoes (
  id         SERIAL      PRIMARY KEY,
  chave      TEXT        NOT NULL,
  valor      TEXT,
  loja_id    UUID        REFERENCES lojas(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 19. WEBHOOK_LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS webhook_logs (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway    TEXT,
  evento     TEXT,
  processado BOOLEAN     NOT NULL DEFAULT false,
  erro       TEXT,
  payload    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 20. AUDIT_LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id          SERIAL      PRIMARY KEY,
  tabela      TEXT,
  operacao    TEXT,
  registro_id TEXT,
  dados       JSONB,
  usuario_id  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 21. BARBEIRO_TOKENS (sessões do portal do barbeiro)
-- ============================================================
CREATE TABLE IF NOT EXISTS barbeiro_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  barbeiro_id INT         NOT NULL REFERENCES barbeiros(id) ON DELETE CASCADE,
  loja_id     UUID        NOT NULL REFERENCES lojas(id)     ON DELETE CASCADE,
  token       TEXT        UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS lojas_slug_uq
  ON lojas(slug) WHERE slug IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS configuracoes_chave_loja_uq
  ON configuracoes(chave, loja_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessoes_caixa_uma_aberta
  ON sessoes_caixa(loja_id, status) WHERE status = 'aberta';

CREATE UNIQUE INDEX IF NOT EXISTS idx_horarios_especiais_data_loja
  ON horarios_especiais(data, loja_id);

CREATE INDEX IF NOT EXISTS idx_atendimentos_data_hora   ON atendimentos(data_hora);
CREATE INDEX IF NOT EXISTS idx_atendimentos_cliente_id  ON atendimentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_atendimentos_loja_id     ON atendimentos(loja_id);
CREATE INDEX IF NOT EXISTS idx_comandas_status          ON comandas(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_comandas_loja_id         ON comandas(loja_id);
CREATE INDEX IF NOT EXISTS idx_assinaturas_cliente_id   ON assinaturas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_assinaturas_status       ON assinaturas(status);
CREATE INDEX IF NOT EXISTS idx_profiles_loja_id         ON profiles(loja_id);
CREATE INDEX IF NOT EXISTS idx_barbeiro_tokens_token    ON barbeiro_tokens(token);
CREATE INDEX IF NOT EXISTS idx_barbeiro_tokens_barbeiro ON barbeiro_tokens(barbeiro_id);

-- ============================================================
-- FUNÇÕES AUXILIARES
-- ============================================================

-- Atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Retorna o role do usuário atual (SECURITY DEFINER evita loop de RLS)
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Retorna o loja_id do usuário atual
CREATE OR REPLACE FUNCTION get_my_loja_id()
RETURNS UUID AS $$
  SELECT loja_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Preenche loja_id automaticamente em INSERT quando não informado
CREATE OR REPLACE FUNCTION auto_set_loja_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.loja_id IS NULL THEN
    NEW.loja_id := get_my_loja_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Cria profile automaticamente após signup no Supabase Auth
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, loja_id)
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Guard append-only para tabelas de auditoria.
-- Respeita a variável de sessão app.admin_delete_override para
-- permitir deleção em cascata quando admin_delete_loja é chamado.
CREATE OR REPLACE FUNCTION fn_bloquear_mutacao_auditoria()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.admin_delete_override', true) = 'true' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION
    'Tabela de auditoria "%" é append-only. Registro id=% não pode ser alterado nem deletado.',
    TG_TABLE_NAME, COALESCE(OLD.id::text, '?')
    USING ERRCODE = 'P0020';
END;
$$;

-- Exclui uma loja e todos os seus dados em cascata.
-- Usa SET LOCAL para permitir que os triggers append-only cedam durante
-- o delete administrativo; reverte automaticamente ao fim da transação.
CREATE OR REPLACE FUNCTION admin_delete_loja(p_loja_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SET LOCAL app.admin_delete_override = 'true';
  DELETE FROM lojas WHERE id = p_loja_id;
END;
$$;

-- ============================================================
-- TRIGGERS
-- ============================================================

-- updated_at
DROP TRIGGER IF EXISTS lojas_updated_at       ON lojas;
DROP TRIGGER IF EXISTS profiles_updated_at    ON profiles;
DROP TRIGGER IF EXISTS comandas_updated_at    ON comandas;
DROP TRIGGER IF EXISTS assinaturas_updated_at ON assinaturas;

CREATE TRIGGER lojas_updated_at
  BEFORE UPDATE ON lojas       FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER comandas_updated_at
  BEFORE UPDATE ON comandas    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER assinaturas_updated_at
  BEFORE UPDATE ON assinaturas FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- auto_set_loja_id em todas as tabelas de dados
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'produtos','clientes','servicos','barbeiros','planos',
    'atendimentos','comandas','assinaturas','uso_beneficios',
    'sessoes_caixa','movimentos_caixa','historico','comanda_eventos',
    'horarios_especiais','configuracoes'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_auto_loja_id ON %I', t);
    EXECUTE format('
      CREATE TRIGGER trg_auto_loja_id
        BEFORE INSERT ON %I
        FOR EACH ROW EXECUTE FUNCTION auto_set_loja_id()', t);
  END LOOP;
END $$;

-- Append-only: impede UPDATE/DELETE em tabelas de auditoria
DROP TRIGGER IF EXISTS trg_append_only ON historico;
DROP TRIGGER IF EXISTS trg_append_only ON comanda_eventos;
DROP TRIGGER IF EXISTS trg_append_only ON movimentos_caixa;

CREATE TRIGGER trg_append_only
  BEFORE UPDATE OR DELETE ON historico
  FOR EACH ROW EXECUTE FUNCTION fn_bloquear_mutacao_auditoria();
CREATE TRIGGER trg_append_only
  BEFORE UPDATE OR DELETE ON comanda_eventos
  FOR EACH ROW EXECUTE FUNCTION fn_bloquear_mutacao_auditoria();
CREATE TRIGGER trg_append_only
  BEFORE UPDATE OR DELETE ON movimentos_caixa
  FOR EACH ROW EXECUTE FUNCTION fn_bloquear_mutacao_auditoria();

-- Cria profile após novo usuário no Auth
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_select_own_or_admin"      ON profiles;
DROP POLICY IF EXISTS "profiles_update_own_or_admin"      ON profiles;
DROP POLICY IF EXISTS "profiles_insert_trigger_or_admin"  ON profiles;
DROP POLICY IF EXISTS "profiles_delete_admin"             ON profiles;

CREATE POLICY "profiles_select_own_or_admin" ON profiles
  FOR SELECT USING (auth.uid() = id OR get_my_role() = 'admin');
CREATE POLICY "profiles_update_own_or_admin" ON profiles
  FOR UPDATE USING (auth.uid() = id OR get_my_role() = 'admin');
CREATE POLICY "profiles_insert_trigger_or_admin" ON profiles
  FOR INSERT WITH CHECK (
    auth.role() = 'service_role'
    OR get_my_role() = 'admin'
    OR auth.uid() IS NULL
  );
CREATE POLICY "profiles_delete_admin" ON profiles
  FOR DELETE USING (get_my_role() = 'admin');

-- lojas
ALTER TABLE lojas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lojas_admin ON lojas;
DROP POLICY IF EXISTS lojas_read  ON lojas;

CREATE POLICY lojas_admin ON lojas FOR ALL TO authenticated
  USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');
CREATE POLICY lojas_read ON lojas FOR SELECT TO authenticated
  USING (id = get_my_loja_id() OR get_my_role() = 'admin');

-- categorias (global — qualquer autenticado lê, só admin escreve)
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cat_read      ON categorias;
DROP POLICY IF EXISTS cat_write     ON categorias;
DROP POLICY IF EXISTS cat_anon_read ON categorias;

CREATE POLICY cat_read      ON categorias FOR SELECT TO authenticated USING (true);
CREATE POLICY cat_anon_read ON categorias FOR SELECT TO anon          USING (true);
CREATE POLICY cat_write     ON categorias FOR ALL    TO authenticated
  USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');

-- todas as demais tabelas: isolamento por loja
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'produtos','clientes','servicos','barbeiros','planos',
    'atendimentos','comandas','assinaturas','uso_beneficios',
    'sessoes_caixa','movimentos_caixa','historico','comanda_eventos',
    'horarios_especiais','configuracoes'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS loja_isolation ON %I', t);
    EXECUTE format('
      CREATE POLICY loja_isolation ON %I
        FOR ALL TO authenticated
        USING (get_my_role() = ''admin'' OR loja_id = get_my_loja_id())
        WITH CHECK (get_my_role() = ''admin'' OR loja_id = get_my_loja_id())',
      t
    );
  END LOOP;
END $$;

-- ============================================================
-- PERMISSÕES
-- ============================================================

-- admin_delete_loja: somente service_role (chamado pelas API routes do admin)
REVOKE ALL ON FUNCTION admin_delete_loja(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_delete_loja(UUID) FROM anon;
REVOKE ALL ON FUNCTION admin_delete_loja(UUID) FROM authenticated;
GRANT  EXECUTE ON FUNCTION admin_delete_loja(UUID) TO service_role;

-- ============================================================
-- DADOS INICIAIS
-- ============================================================
INSERT INTO categorias (nome) VALUES
  ('Eletrônicos'), ('Roupas'), ('Calçados'),
  ('Alimentos'), ('Higiene'), ('Outros')
ON CONFLICT DO NOTHING;

-- ============================================================
-- STORED PROCEDURES (RPCs usadas pelo app)
-- ============================================================
-- As seguintes funções precisam ser criadas no banco:
--   cancelar_comanda(p_comanda_id INT, p_motivo TEXT)
--   baixar_estoque_comanda(items JSONB)
--   abrir_caixa(p_valor_abertura NUMERIC, p_aberto_por TEXT)
--   fechar_caixa(p_sessao_id INT, p_valor_fechamento NUMERIC, p_fechado_por TEXT)
--   registrar_movimento_caixa(p_sessao_id INT, p_tipo TEXT, p_valor NUMERIC, p_motivo TEXT)
-- O app usa fallback em JavaScript quando essas RPCs não existem.
