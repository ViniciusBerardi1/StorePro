import { requireAdmin, serviceClient } from "./_auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ erro: "Método não permitido" });

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { lojaId, novaSenha } = req.body;
  if (!lojaId || !novaSenha) return res.status(400).json({ erro: "lojaId e novaSenha são obrigatórios" });
  if (novaSenha.length < 6) return res.status(400).json({ erro: "Senha deve ter pelo menos 6 caracteres" });

  const { data: profile, error: profileErr } = await serviceClient
    .from("profiles")
    .select("id")
    .eq("loja_id", lojaId)
    .single();
  if (profileErr) return res.status(400).json({ erro: profileErr.message });

  const { error } = await serviceClient.auth.admin.updateUserById(profile.id, { password: novaSenha });
  if (error) return res.status(400).json({ erro: error.message });

  return res.status(200).json({ ok: true });
}
