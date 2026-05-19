import { createClient } from "@supabase/supabase-js";

export const serviceClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function requireAdmin(req, res) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    res.status(401).json({ erro: "Não autenticado" });
    return null;
  }

  const { data: { user }, error } = await serviceClient.auth.getUser(token);
  if (error || !user) {
    res.status(401).json({ erro: "Token inválido" });
    return null;
  }

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    res.status(403).json({ erro: "Sem permissão de administrador" });
    return null;
  }

  return user;
}
