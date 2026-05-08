import { useState, memo } from "react";
import {
  Calendar,
  Receipt,
  Banknote,
  Scissors,
  Users,
  User,
  Star,
  TrendingUp,
  BarChart2,
  Package,
  Settings,
  Info,
  Store,
  ChevronDown,
  ChevronRight,
  Home,
} from "lucide-react";

// ── Menu ─────────────────────────────────────────────────────────
const MENU = [
  // ── OPERAÇÃO (núcleo diário) ─────────────────────────────────
  { type: "section", label: "Operação" },
  { type: "item", view: "agenda",   label: "Agenda",   Icon: Calendar  },
  { type: "item", view: "comandas", label: "Comandas", Icon: Receipt   },
  { type: "item", view: "caixa",    label: "Caixa",    Icon: Banknote  },

  // ── CADASTROS ───────────────────────────────────────────────
  { type: "section", label: "Cadastros" },
  { type: "item", view: "servicos",       label: "Serviços", Icon: Scissors },
  { type: "item", view: "barbeiros",      label: "Equipe",   Icon: Users    },
  { type: "item", view: "clientes_lista", label: "Clientes", Icon: User     },
  { type: "item", view: "planos",         label: "Planos",   Icon: Star     },

  // ── GESTÃO ──────────────────────────────────────────────────
  { type: "section", label: "Gestão" },
  { type: "item", view: "financeiro", label: "Financeiro", Icon: TrendingUp },
  { type: "item", view: "relatorios", label: "Relatórios", Icon: BarChart2  },
  {
    type:  "group",
    label: "Estoque",
    Icon:  Package,
    badge: "estoqueBaixo",
    itens: [
      { view: "estoque_loja", label: "Loja" },
      { view: "estoque_bar",  label: "Bar"  },
    ],
  },
];

const BOTTOM_NAV = [
  { view: "configuracoes", label: "Configurações", Icon: Settings },
  { view: "sobre",         label: "Sobre",         Icon: Info     },
];

const VIEWS_ATIVAS = [
  "agenda", "comandas", "caixa",
  "servicos", "barbeiros",
  "clientes_lista", "planos",
  "financeiro", "relatorios",
  "estoque_loja", "estoque_bar",
];

function isAtivo(entrada, view) {
  if (entrada.type === "section") return false;
  if (entrada.type === "item")    return view === entrada.view;
  return entrada.itens.some((i) => i.view === view);
}

// ── Shared style tokens ───────────────────────────────────────────
const itemBase =
  "flex items-center gap-3 w-full px-3 py-[7px] rounded-lg text-[13px] font-medium transition-all duration-150 text-left select-none";
const itemActive = "bg-indigo-600 text-white shadow-sm";
const itemIdle   = "text-gray-600 hover:bg-gray-100 hover:text-gray-900";

// ── Components ────────────────────────────────────────────────────
function Logo() {
  return (
    <div className="flex items-center gap-2.5 px-1">
      <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm">
        <Store size={14} strokeWidth={2.5} className="text-white" />
      </div>
      <span className="font-semibold text-gray-900 text-[15px] tracking-tight">StorePro</span>
    </div>
  );
}

function SectionLabel({ label, first }) {
  return (
    <p className={`px-3 pb-1 text-[10px] font-semibold tracking-widest text-gray-400 uppercase select-none ${first ? "pt-0 mb-0.5" : "pt-4"}`}>
      {label}
    </p>
  );
}

function SubItem({ item, view, navegar }) {
  const ativo   = view === item.view;
  const emBreve = !VIEWS_ATIVAS.includes(item.view);
  return (
    <button
      onClick={() => !emBreve && navegar(item.view)}
      disabled={emBreve}
      className={`flex items-center justify-between w-full pl-9 pr-3 py-[6px] rounded-lg text-[13px] transition-all duration-150 text-left
        ${ativo ? "bg-indigo-600 text-white font-medium" : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"}
        ${emBreve ? "opacity-40 cursor-default" : ""}`}
    >
      <span>{item.label}</span>
      {emBreve && <span className="text-[10px] text-gray-300">em breve</span>}
    </button>
  );
}

function ItemSingle({ entrada, view, navegar, alertas }) {
  const ativo      = view === entrada.view;
  const emBreve    = !VIEWS_ATIVAS.includes(entrada.view);
  const badgeCount = entrada.badge ? (alertas?.[entrada.badge] ?? 0) : 0;
  const Icon       = entrada.Icon;

  return (
    <button
      onClick={() => !emBreve && navegar(entrada.view)}
      disabled={emBreve}
      className={`${itemBase} justify-between ${ativo ? itemActive : itemIdle} ${emBreve ? "opacity-40 cursor-default" : ""}`}
    >
      <span className="flex items-center gap-3">
        <Icon size={16} strokeWidth={ativo ? 2.5 : 2} />
        {entrada.label}
      </span>
      <span className="flex items-center gap-1.5">
        {emBreve && <span className="text-[10px] text-gray-300 font-normal">em breve</span>}
        {badgeCount > 0 && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold leading-none ${ativo ? "bg-white/25 text-white" : "bg-orange-100 text-orange-600"}`}>
            {badgeCount}
          </span>
        )}
      </span>
    </button>
  );
}

function ItemGroup({ entrada, view, navegar, alertas }) {
  const [aberto, setAberto] = useState(isAtivo(entrada, view));
  const ativoNoGrupo        = isAtivo(entrada, view);
  const badgeCount          = entrada.badge ? (alertas?.[entrada.badge] ?? 0) : 0;
  const Icon                = entrada.Icon;

  return (
    <div>
      <button
        onClick={() => setAberto((v) => !v)}
        className={`${itemBase} justify-between ${ativoNoGrupo ? "text-indigo-600 bg-indigo-50" : itemIdle}`}
      >
        <span className="flex items-center gap-3">
          <Icon size={16} strokeWidth={2} />
          {entrada.label}
        </span>
        <span className="flex items-center gap-1.5">
          {badgeCount > 0 && (
            <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-semibold leading-none">
              {badgeCount}
            </span>
          )}
          {aberto
            ? <ChevronDown  size={13} strokeWidth={2} className="text-gray-400" />
            : <ChevronRight size={13} strokeWidth={2} className="text-gray-400" />
          }
        </span>
      </button>
      {aberto && (
        <div className="flex flex-col gap-0.5 mt-0.5">
          {entrada.itens.map((item) => (
            <SubItem key={item.view} item={item} view={view} navegar={navegar} />
          ))}
        </div>
      )}
    </div>
  );
}

function MenuConteudo({ view, navegar, alertas }) {
  let sectionCount = 0;
  return (
    <div className="flex flex-col gap-0.5">
      {MENU.map((entrada, i) => {
        if (entrada.type === "section") {
          const first = sectionCount === 0;
          sectionCount++;
          return <SectionLabel key={entrada.label + i} label={entrada.label} first={first} />;
        }
        if (entrada.type === "group") {
          return (
            <ItemGroup
              key={entrada.label}
              entrada={entrada}
              view={view}
              navegar={navegar}
              alertas={alertas}
            />
          );
        }
        return (
          <ItemSingle
            key={entrada.view}
            entrada={entrada}
            view={view}
            navegar={navegar}
            alertas={alertas}
          />
        );
      })}
    </div>
  );
}

function BottomNavItem({ Icon, label, view: itemView, current, navegar }) {
  const ativo = current === itemView;
  return (
    <button
      onClick={() => navegar(itemView)}
      className={`${itemBase} ${ativo ? itemActive : itemIdle}`}
    >
      <Icon size={16} strokeWidth={ativo ? 2.5 : 2} />
      {label}
    </button>
  );
}

function BottomNav({ view, navegar }) {
  return (
    <div className="pt-2 border-t border-gray-100 flex flex-col gap-0.5">
      {BOTTOM_NAV.map((item) => (
        <BottomNavItem
          key={item.view}
          Icon={item.Icon}
          label={item.label}
          view={item.view}
          current={view}
          navegar={navegar}
        />
      ))}
    </div>
  );
}

function Sidebar({ view, setView, alertas }) {
  const [menuAberto, setMenuAberto] = useState(false);

  const navegar = (v) => {
    setView(v);
    setMenuAberto(false);
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed top-0 left-0 h-full w-60 bg-white border-r border-gray-200 flex-col py-5 px-3 z-40">
        <div className="mb-5 px-1">
          <Logo />
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 -mx-1 px-1">
          <MenuConteudo view={view} navegar={navegar} alertas={alertas} />
        </div>
        <BottomNav view={view} navegar={navegar} />
      </aside>

      {/* Mobile header */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 px-4 h-14 flex items-center justify-between">
        <button
          onClick={() => setMenuAberto(!menuAberto)}
          className="flex items-center gap-2.5"
        >
          <div className="w-6 h-6 bg-indigo-600 rounded-md flex items-center justify-center">
            <Store size={12} strokeWidth={2.5} className="text-white" />
          </div>
          <span className="text-[14px] font-semibold text-gray-800">StorePro</span>
        </button>
        <button
          onClick={() => navegar("agenda")}
          className="text-gray-400 hover:text-indigo-600 transition-colors p-2 h-9 w-9 flex items-center justify-center rounded-lg hover:bg-indigo-50"
        >
          <Home size={20} />
        </button>
      </header>

      {/* Mobile drawer */}
      {menuAberto && (
        <>
          <div
            className="md:hidden fixed inset-0 bg-black/30 z-40"
            onClick={() => setMenuAberto(false)}
          />
          <div className="md:hidden fixed top-0 left-0 h-full w-72 bg-white z-50 flex flex-col py-5 px-3 shadow-xl">
            <div className="flex items-center justify-between mb-5 px-1">
              <Logo />
              <button
                onClick={() => setMenuAberto(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                aria-label="Fechar menu"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M1 1l12 12M13 1L1 13" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 -mx-1 px-1">
              <MenuConteudo view={view} navegar={navegar} alertas={alertas} />
            </div>
            <BottomNav view={view} navegar={navegar} />
          </div>
        </>
      )}
    </>
  );
}

export default memo(Sidebar);
