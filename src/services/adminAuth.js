/**
 * adminAuth — Supabase Auth + profiles CRUD for the admin area.
 * Only imported by admin components; never used in the barbershop app.
 */
import { supabase } from "./supabase";

// ── Auth ────────────────────────────────────────────────────────

export async function adminSignIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function resetPasswordForEmail(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw error;
}

export async function adminSignOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getAdminSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  return session;
}

// ── Profile queries ─────────────────────────────────────────────

export async function getMyProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data;
}

export async function getAllProfiles() {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getProfilesCount() {
  const [total, admins, inactive] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "admin"),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("is_active", false),
  ]);
  return {
    total:    total.count ?? 0,
    admins:   admins.count ?? 0,
    inactive: inactive.count ?? 0,
  };
}

export async function updateUserRole(userId, role) {
  if (!["user", "admin"].includes(role)) throw new Error("Invalid role");
  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId);
  if (error) throw error;
}

export async function setUserActive(userId, isActive) {
  const { error } = await supabase
    .from("profiles")
    .update({ is_active: isActive })
    .eq("id", userId);
  if (error) throw error;
}

// ── Barbershop app stats (read-only, for the admin dashboard) ────

export async function getAppStats() {
  const [clients, subs, configs] = await Promise.all([
    supabase.from("clientes").select("*", { count: "exact", head: true }),
    supabase.from("assinaturas").select("*", { count: "exact", head: true }).eq("ativa", true),
    supabase.from("configuracoes").select("chave, valor").in("chave", ["app_senha"]),
  ]);
  return {
    totalClients:      clients.count ?? 0,
    activeSubscriptions: subs.count ?? 0,
    hasAppPassword:    (configs.data ?? []).some((c) => c.chave === "app_senha" && c.valor),
  };
}

export async function getRecentProfiles(limit = 8) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getAllSubscriptions() {
  const { data, error } = await supabase
    .from("assinaturas")
    .select("*, planos(nome, valor_mensal), clientes(nome, telefone, email)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ── Lojas ────────────────────────────────────────────────────────

export async function getAllLojas() {
  const { data, error } = await supabase
    .from("lojas")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createLoja(nome) {
  const { data, error } = await supabase
    .from("lojas")
    .insert({ nome })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function toggleLojaAtivo(lojaId, ativo) {
  const { error } = await supabase
    .from("lojas")
    .update({ ativo })
    .eq("id", lojaId);
  if (error) throw error;
}

export async function assignUserToLoja(userId, lojaId) {
  const { error } = await supabase
    .from("profiles")
    .update({ loja_id: lojaId })
    .eq("id", userId);
  if (error) throw error;
}

export async function getAllConfiguracoes() {
  const { data, error } = await supabase
    .from("configuracoes")
    .select("*")
    .order("chave");
  if (error) throw error;
  return data ?? [];
}

export async function upsertConfiguracao(chave, valor) {
  const { error } = await supabase
    .from("configuracoes")
    .upsert({ chave, valor }, { onConflict: "chave" });
  if (error) throw error;
}
