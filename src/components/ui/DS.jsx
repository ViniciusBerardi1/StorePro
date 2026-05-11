import {
  Scissors, Beer, ShoppingBag, Crown,
  QrCode, CreditCard, Banknote,
} from "lucide-react";

// ─── PageHeader ──────────────────────────────────────────────────
export function PageHeader({ eyebrow, title, action }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-1">
      <div>
        {eyebrow && (
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{title}</h1>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ─── ChannelChip ─────────────────────────────────────────────────
const CHANNEL_STYLES = {
  servicos: { bg: "bg-indigo-50",  border: "border-indigo-100",  text: "text-indigo-700",  Icon: Scissors    },
  bar:      { bg: "bg-amber-50",   border: "border-amber-100",   text: "text-amber-700",   Icon: Beer        },
  loja:     { bg: "bg-emerald-50", border: "border-emerald-100", text: "text-emerald-700", Icon: ShoppingBag },
  premium:  { bg: "bg-amber-50",   border: "border-amber-100",   text: "text-amber-700",   Icon: Crown       },
};

export function ChannelChip({ channel, label, size = "md" }) {
  const s = CHANNEL_STYLES[channel] ?? CHANNEL_STYLES.servicos;
  const pad = size === "sm" ? "px-2 py-1 text-[11px] gap-1" : "px-3 py-1.5 text-xs gap-1.5";
  const iconSize = size === "sm" ? 11 : 13;
  return (
    <span className={`inline-flex items-center font-semibold rounded-xl border ${pad} ${s.bg} ${s.border} ${s.text}`}>
      <s.Icon size={iconSize} strokeWidth={2.2} />
      {label}
    </span>
  );
}

// ─── StatusPill ──────────────────────────────────────────────────
const STATUS_STYLES = {
  aberto:       { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", border: "border-emerald-100" },
  concluido:    { bg: "bg-green-50",   text: "text-green-700",   dot: "bg-green-500",   border: "border-green-100"   },
  cancelado:    { bg: "bg-red-50",     text: "text-red-600",     dot: "bg-red-500",     border: "border-red-100"     },
  agendado:     { bg: "bg-blue-50",    text: "text-blue-700",    dot: "bg-blue-500",    border: "border-blue-100"    },
  em_andamento: { bg: "bg-yellow-50",  text: "text-yellow-700",  dot: "bg-yellow-500",  border: "border-yellow-100"  },
  fechado:      { bg: "bg-gray-100",   text: "text-gray-600",    dot: "bg-gray-400",    border: "border-transparent" },
};

export function StatusPill({ status, label }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.fechado;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${s.bg} ${s.text} ${s.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {label}
    </span>
  );
}

// ─── PaymentPill ─────────────────────────────────────────────────
const PAY_STYLES = {
  pix:      { bg: "bg-emerald-50", text: "text-emerald-600", Icon: QrCode,     label: "Pix"      },
  debito:   { bg: "bg-indigo-50",  text: "text-indigo-600",  Icon: CreditCard, label: "Débito"   },
  credito:  { bg: "bg-violet-50",  text: "text-[#7c3aed]",   Icon: CreditCard, label: "Crédito"  },
  dinheiro: { bg: "bg-amber-50",   text: "text-amber-600",   Icon: Banknote,   label: "Dinheiro" },
};

export function PaymentPill({ method, size = "sm" }) {
  const s = PAY_STYLES[method];
  if (!s) return null;
  const pad = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs";
  const iconSize = size === "sm" ? 11 : 13;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold ${pad} ${s.bg} ${s.text}`}>
      <s.Icon size={iconSize} strokeWidth={2.2} />
      {s.label}
    </span>
  );
}

// ─── CaixaBanner ─────────────────────────────────────────────────
export function CaixaBanner({ sessao, onFechar, onAbrir, loading }) {
  if (loading) return null;
  if (sessao) {
    const hora = new Date(sessao.opened_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return (
      <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 sp-pulse" />
          <span className="text-sm font-semibold text-emerald-700">Caixa aberto · hoje {hora}</span>
        </div>
        <button onClick={onFechar} className="text-xs font-semibold text-emerald-700 hover:text-emerald-800">
          Fechar caixa →
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3">
      <div className="flex items-center gap-2.5">
        <span className="w-2 h-2 rounded-full bg-gray-300" />
        <span className="text-sm font-medium text-gray-600">Caixa fechado</span>
      </div>
      <button
        onClick={onAbrir}
        className="bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
      >
        Abrir caixa
      </button>
    </div>
  );
}
