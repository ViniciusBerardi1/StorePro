import { requireAdmin, serviceClient } from "./_auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ erro: "Método não permitido" });

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { nome, slug, senha } = req.body;
  if (!nome || !slug || !senha) return res.status(400).json({ erro: "nome, slug e senha são obrigatórios" });
  if (senha.length < 6) return res.status(400).json({ erro: "Senha deve ter pelo menos 6 caracteres" });

  const email = `${slug}@loja.storepro`;

  const { data: loja, error: lojaErr } = await serviceClient
    .from("lojas")
    .insert({ nome, slug })
    .select()
    .single();
  if (lojaErr) return res.status(400).json({ erro: lojaErr.message });

  const { data: authData, error: authErr } = await serviceClient.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { full_name: nome, loja_id: loja.id },
  });

  if (authErr) {
    await serviceClient.from("lojas").delete().eq("id", loja.id);
    return res.status(400).json({ erro: authErr.message });
  }

  if (authData.user) {
    await serviceClient.from("profiles").upsert(
      { id: authData.user.id, email, full_name: nome, role: "user", loja_id: loja.id },
      { onConflict: "id" }
    );
  }

  return res.status(200).json({ loja, usuario: authData.user });
}
