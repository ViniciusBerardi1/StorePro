import { QrCode, CreditCard, Banknote } from "lucide-react";

export const PAGAMENTOS = [
  { id: "pix",      label: "Pix",      Icon: QrCode     },
  { id: "debito",   label: "Débito",   Icon: CreditCard },
  { id: "credito",  label: "Crédito",  Icon: CreditCard },
  { id: "dinheiro", label: "Dinheiro", Icon: Banknote   },
];

export const ALVOS_DESCONTO = [
  { id: "total",    label: "Total"    },
  { id: "servicos", label: "Serviços" },
  { id: "bar",      label: "Bar"      },
  { id: "loja",     label: "Loja"     },
];

export function calcDesconto(desc, totSvc, totBar, totLoja) {
  const v = Number(desc.valor || 0);
  if (v <= 0) return 0;
  const bases = { total: totSvc + totBar + totLoja, servicos: totSvc, bar: totBar, loja: totLoja };
  const base = bases[desc.alvo] ?? 0;
  const calc = desc.tipo === "percent" ? base * (v / 100) : Math.min(v, base);
  return Math.round(calc * 100) / 100;
}

export function labelDesconto(desc) {
  const nomes = { total: "Total", servicos: "Serviços", bar: "Bar", loja: "Loja" };
  const nome = nomes[desc.alvo] ?? "Total";
  return desc.tipo === "percent" ? `${nome} −${desc.valor}%` : nome;
}
