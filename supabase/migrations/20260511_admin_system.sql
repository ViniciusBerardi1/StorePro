-- ============================================================
-- ADMIN SYSTEM — StorePro
-- Creates: profiles table, RLS policies, auto-create trigger
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── profiles table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id           UUID        REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email        TEXT,
  full_name    TEXT,
  avatar_url   TEXT,
  role         TEXT        NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Helper: get current user's role without RLS recursion ────────
-- Criada APÓS a tabela existir.
-- SECURITY DEFINER bypasses RLS — evita loop infinito nas políticas.
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── Auto-update updated_at ───────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ── Auto-create profile on Supabase Auth sign-up ─────────────────
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

-- ── Row Level Security ───────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own_or_admin"  ON profiles;
DROP POLICY IF EXISTS "profiles_update_own_or_admin"  ON profiles;
DROP POLICY IF EXISTS "profiles_insert_admin"         ON profiles;
DROP POLICY IF EXISTS "profiles_delete_admin"         ON profiles;

CREATE POLICY "profiles_select_own_or_admin" ON profiles
  FOR SELECT USING (
    auth.uid() = id
    OR get_my_role() = 'admin'
  );

CREATE POLICY "profiles_update_own_or_admin" ON profiles
  FOR UPDATE USING (
    auth.uid() = id
    OR get_my_role() = 'admin'
  );

CREATE POLICY "profiles_insert_admin" ON profiles
  FOR INSERT WITH CHECK (
    get_my_role() = 'admin'
  );

CREATE POLICY "profiles_delete_admin" ON profiles
  FOR DELETE USING (
    get_my_role() = 'admin'
  );

-- ── Backfill usuários Auth já existentes ─────────────────────────
-- Se já havia usuários no Supabase Auth antes dessa migration,
-- rode isso para criar os perfis deles:
--
--   INSERT INTO profiles (id, email, full_name, role)
--   SELECT
--     u.id,
--     u.email,
--     COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1)),
--     'user'
--   FROM auth.users u
--   LEFT JOIN profiles p ON p.id = u.id
--   WHERE p.id IS NULL;
--
-- ── Promover primeiro admin ───────────────────────────────────────
-- Após rodar essa migration, crie o usuário no Supabase Auth
-- (Dashboard → Authentication → Users → Invite user), depois rode:
--
--   UPDATE profiles SET role = 'admin'
--   WHERE email = 'seu-email@exemplo.com';
--
-- ─────────────────────────────────────────────────────────────────
