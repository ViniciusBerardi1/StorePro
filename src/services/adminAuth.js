/**
 * adminAuth — Supabase Auth + profiles CRUD for the admin area.
 * Only imported by admin components; never used in the barbershop app.
 *
 * Operações que requerem service_role são delegadas às Vercel API routes
 * em /api/admin/* para que a service key nunca chegue ao bundle do browser.
 */
import { adminAuthClient } from "./adminAuthClient";

// ── Helper: obtém o JWT do admin para autenticar nas API routes ──

async function getAdminToken() {
  const { data: { session } } = await adminAuthClient.auth.getSession();
  if (!session?.access_token) throw new Error("Sessão expirada. Faça login novamente.");
  return session.access_token;
}

async function adminFetch(path, body) {
  const token = await getAdminToken();
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.erro || "Erro na requisição");
  return data;
}

// ── Auth ────────────────────────────────────────────────────────

export async function adminSignIn(email, password) {
  const { data, error } = await adminAuthClient.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function resetPasswordForEmail(email) {
  const { error } = await adminAuthClient.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw error;
}

export async function adminSignOut() {
  const { error } = await adminAuthClient.auth.signOut();
  if (error) throw error;
}

export async function getAdminSession() {
  const { data: { session }, error } = await adminAuthClient.auth.getSession();
  if (error) throw error;
  return session;
}

// ── Profile queries ─────────────────────────────────────────────

export async function getMyProfile(userId) {
  const { data, error } = await adminAuthClient
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data;
}

export async function getAllProfiles() {
  const { data, error } = await adminAuthClient
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getProfilesCount() {
  const [total, admins, inactive] = await Promise.all([
    adminAuthClient.from("profiles").select("*", { count: "exact", head: true }),
    adminAuthClient.from("profiles").select("*", { count: "exact", head: true }).eq("role", "admin"),
    adminAuthClient.from("profiles").select("*", { count: "exact", head: true }).eq("is_active", false),
  ]);
  return {
    total:    total.count ?? 0,
    admins:   admins.count ?? 0,
    inactive: inactive.count ?? 0,
  };
}

export async function updateUserRole(userId, role) {
  if (!["user", "admin"].includes(role)) throw new Error("Invalid role");
  const { error } = await adminAuthClient
    .from("profiles")
    .update({ role })
    .eq("id", userId);
  if (error) throw error;
}

export async function setUserActive(userId, isActive) {
  const { error } = await adminAuthClient
    .from("profiles")
    .update({ is_active: isActive })
    .eq("id", userId);
  if (error) throw error;
}

// ── Barbershop app stats (read-only, for the admin dashboard) ────

export async function getAppStats() {
  const [clients, subs] = await Promise.all([
    adminAuthClient.from("clientes").select("*", { count: "exact", head: true }),
    adminAuthClient.from("assinaturas").select("*", { count: "exact", head: true }).eq("ativa", true),
  ]);
  return {
    totalClients:        clients.count ?? 0,
    activeSubscriptions: subs.count ?? 0,
  };
}

export async function getRecentProfiles(limit = 8) {
  const { data, error } = await adminAuthClient
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getAllSubscriptions() {
  const { data, error } = await adminAuthClient
    .from("assinaturas")
    .select("*, planos(nome, valor_mensal), clientes(nome, telefone, email)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ── Lojas ────────────────────────────────────────────────────────

export async function createLojaComUsuario(nome, slug, senha) {
  return adminFetch("/api/admin/criar-loja", { nome, slug, senha });
}

export async function getAllLojas() {
  const { data, error } = await adminAuthClient
    .from("lojas")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createLoja(nome) {
  const { data, error } = await adminAuthClient
    .from("lojas")
    .insert({ nome })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function toggleLojaAtivo(lojaId, ativo) {
  const { error } = await adminAuthClient
    .from("lojas")
    .update({ ativo })
    .eq("id", lojaId);
  if (error) throw error;
}

export async function deleteLoja(lojaId) {
  return adminFetch("/api/admin/deletar-loja", { lojaId });
}

export async function updateLojaInfo(lojaId, nome) {
  const { error } = await adminAuthClient
    .from("lojas")
    .update({ nome })
    .eq("id", lojaId);
  if (error) throw error;

  await adminAuthClient
    .from("profiles")
    .update({ full_name: nome })
    .eq("loja_id", lojaId);
}

export async function updateLojaSenha(lojaId, novaSenha) {
  return adminFetch("/api/admin/atualizar-senha", { lojaId, novaSenha });
}

export async function deleteUser(userId) {
  return adminFetch("/api/admin/deletar-usuario", { userId });
}

export async function assignUserToLoja(userId, lojaId) {
  const { error } = await adminAuthClient
    .from("profiles")
    .update({ loja_id: lojaId })
    .eq("id", userId);
  if (error) throw error;
}

export async function getAllConfiguracoes() {
  const { data, error } = await adminAuthClient
    .from("configuracoes")
    .select("*")
    .order("chave");
  if (error) throw error;
  return data ?? [];
}

export async function upsertConfiguracao(chave, valor) {
  const { error } = await adminAuthClient
    .from("configuracoes")
    .upsert({ chave, valor }, { onConflict: "chave" });
  if (error) throw error;
}
