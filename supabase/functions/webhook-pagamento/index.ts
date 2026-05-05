import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const gateway = new URL(req.url).searchParams.get("gateway") ?? "generico";
  let payload: Record<string, unknown>;

  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const eventoRaw = String(payload.event ?? payload.type ?? payload.evento ?? "desconhecido");

  const { data: logEntry } = await supabase
    .from("webhook_logs")
    .insert({ gateway, evento: eventoRaw, payload, processado: false })
    .select()
    .single();

  try {
    let subscriptionId: string | null = null;
    let novoStatus: string | null = null;
    let dataRenovacao: string | null = null;

    // ─── Asaas ─────────────────────────────────────────────────────
    if (gateway === "asaas") {
      subscriptionId = String(payload.subscription ?? payload.id ?? "");
      if (["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"].includes(eventoRaw)) {
        novoStatus = "ativa";
        const dueDate = (payload.payment as Record<string, unknown>)?.dueDate;
        if (dueDate) dataRenovacao = String(dueDate);
      }
      if (eventoRaw === "PAYMENT_OVERDUE") novoStatus = "inadimplente";
      if (["SUBSCRIPTION_DELETED", "PAYMENT_DELETED"].includes(eventoRaw)) novoStatus = "cancelada";
    }

    // ─── Mercado Pago ───────────────────────────────────────────────
    else if (gateway === "mercadopago") {
      const dataObj = payload.data as Record<string, unknown>;
      subscriptionId = String(dataObj?.id ?? "");
      const tipo = String(payload.type ?? "");
      const action = String(payload.action ?? "");
      if (tipo === "payment" && action === "payment.created") novoStatus = "ativa";
      if (tipo === "subscription_preapproval") {
        if (action.includes("cancelled")) novoStatus = "cancelada";
        else novoStatus = "ativa";
      }
      if (tipo === "subscription_authorized_payment") novoStatus = "ativa";
    }

    // ─── Stripe ─────────────────────────────────────────────────────
    else if (gateway === "stripe") {
      const dataObj = (payload.data as Record<string, unknown>)?.object as Record<string, unknown>;
      subscriptionId = String(dataObj?.subscription ?? dataObj?.id ?? "");
      if (eventoRaw === "invoice.payment_succeeded") {
        novoStatus = "ativa";
        const periodEnd = dataObj?.current_period_end;
        if (periodEnd) {
          dataRenovacao = new Date(Number(periodEnd) * 1000).toISOString().slice(0, 10);
        }
      }
      if (eventoRaw === "invoice.payment_failed") novoStatus = "inadimplente";
      if (eventoRaw === "customer.subscription.deleted") novoStatus = "cancelada";
    }

    if (subscriptionId && novoStatus) {
      const { data: assinatura } = await supabase
        .from("assinaturas")
        .select("id")
        .eq("gateway_subscription_id", subscriptionId)
        .maybeSingle();

      if (assinatura) {
        const updates: Record<string, unknown> = {
          status: novoStatus,
          updated_at: new Date().toISOString(),
        };
        if (dataRenovacao) updates.data_renovacao = dataRenovacao;

        await supabase.from("assinaturas").update(updates).eq("id", assinatura.id);
        if (logEntry) {
          await supabase.from("webhook_logs").update({ processado: true }).eq("id", logEntry.id);
        }
      }
    }
  } catch (err) {
    if (logEntry) {
      await supabase.from("webhook_logs").update({ erro: String(err) }).eq("id", logEntry.id);
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});
