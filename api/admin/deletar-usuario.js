import { requireAdmin, serviceClient } from "./_auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ erro: "Método não permitido" });

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { userId } = req.body;
  if (!userId) return res.status(400).json({ erro: "userId é obrigatório" });

  const { error } = await serviceClient.auth.admin.deleteUser(userId);
  if (error) return res.status(400).json({ erro: error.message });

  return res.status(200).json({ ok: true });
}
