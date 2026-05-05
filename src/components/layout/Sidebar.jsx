import { useState, memo } from "react";
import { Home } from "lucide-react";

const MENU = [
  {
    type: "item",
    view: "agenda",
    label: "Agenda",
    icon: "📅",
  },
  {
    type: "item",
    view: "comandas",
    label: "Comandas",
    icon: "🧾",
  },
  {
    type: "group",
    label: "Atendimento",
    icon: "✂️",
    itens: [
      { view: "servicos", label: "Serviços" },
      { view: "barbeiros", label: "Barbeiros" },
    ],
  },
  {
    type: "group",
    label: "Clientes",
    icon: "👥",
    itens: [
      { view: "clientes_lista", label: "Lista de clientes" },
      { view: "planos",         label: "Planos de assinatura" },
    ],
  },
  {
    type: "item",
    view: "financeiro",
    label: "Financeiro",
    icon: "💰",
  },
  {
    type: "group",
    label: "Estoque",
    icon: "📦",
    badge: "estoqueBaixo",
    itens: [
      { view: "estoque_loja", label: "Loja 🛍️" },
      { view: "estoque_bar", label: "Bar 🍺" },
    ],
  },
  {
    type: "item",
    view: "relatorios",
    label: "Relatórios",
    icon: "📊",
  },
  {
    type: "item",
    view: "configuracoes",
    label: "Configurações",
    icon: "⚙️",
  },
];

const VIEWS_ATIVAS = ["agenda", "comandas", "estoque_loja", "estoque_bar", "financeiro", "servicos", "barbeiros", "clientes_lista", "planos"];

function isAtivo(entrada, view) {
  if (entrada.type === "item") return view === entrada.view;
  return entrada.itens.some((i) => i.view === view);
}

function Logo() {
  return (
    <div className="flex items-center gap-2 px-2">
      <span className="text-2xl">🏪</span>
      <h1 className="font-semibold text-gray-800 text-lg">StorePro</h1>
    </div>
  );
}

function SubItem({ item, view, navegar }) {
  const ativo = view === item.view;
  const emBreve = !VIEWS_ATIVAS.includes(item.view);

  return (
    <button
      onClick={() => !emBreve && navegar(item.view)}
      disabled={emBreve}
      className={`flex items-center justify-between w-full pl-9 pr-3 py-2 rounded-xl text-sm transition-colors text-left
        ${ativo ? "bg-indigo-50 text-indigo-600 font-medium" : "text-gray-500 hover:bg-gray-100"}
        ${emBreve ? "opacity-40 cursor-default" : ""}`}
    >
      <span>{item.label}</span>
      {emBreve && <span className="text-xs text-gray-300 font-normal">em breve</span>}
    </button>
  );
}

function ItemSingle({ entrada, view, navegar, alertas }) {
  const ativo = view === entrada.view;
  const emBreve = !VIEWS_ATIVAS.includes(entrada.view);
  const badgeCount = entrada.badge ? (alertas?.[entrada.badge] ?? 0) : 0;

  return (
    <button
      onClick={() => !emBreve && navegar(entrada.view)}
      disabled={emBreve}
      className={`flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left
        ${ativo ? "bg-indigo-50 text-indigo-600" : "text-gray-600 hover:bg-gray-100"}
        ${emBreve ? "opacity-40 cursor-default" : ""}`}
    >
      <span className="flex items-center gap-3">
        <span className="text-base">{entrada.icon}</span>
        {entrada.label}
      </span>
      {emBreve && <span className="text-xs text-gray-300 font-normal">em breve</span>}
      {badgeCount > 0 && (
        <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-medium">
          {badgeCount}
        </span>
      )}
    </button>
  );
}

function ItemGroup({ entrada, view, navegar, alertas }) {
  const [aberto, setAberto] = useState(isAtivo(entrada, view));
  const ativoNoGrupo = isAtivo(entrada, view);
  const badgeCount = entrada.badge ? (alertas?.[entrada.badge] ?? 0) : 0;

  return (
    <div>
      <button
        onClick={() => setAberto((v) => !v)}
        className={`flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left
          ${ativoNoGrupo ? "text-indigo-600" : "text-gray-600 hover:bg-gray-100"}`}
      >
        <span className="flex items-center gap-3">
          <span className="text-base">{entrada.icon}</span>
          {entrada.label}
        </span>
        <span className="flex items-center gap-1.5">
          {badgeCount > 0 && (
            <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-medium">
              {badgeCount}
            </span>
          )}
          <span className="text-gray-300 text-xs">{aberto ? "▾" : "▸"}</span>
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
  return (
    <div className="flex flex-col gap-0.5">
      {MENU.map((entrada) =>
        entrada.type === "item" ? (
          <ItemSingle key={entrada.view} entrada={entrada} view={view} navegar={navegar} alertas={alertas} />
        ) : (
          <ItemGroup key={entrada.label} entrada={entrada} view={view} navegar={navegar} alertas={alertas} />
        )
      )}
    </div>
  );
}

function BotaoSobre({ view, navegar }) {
  return (
    <div className="pt-3 border-t border-gray-100">
      <button
        onClick={() => navegar("sobre")}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors w-full text-left
          ${view === "sobre" ? "bg-indigo-50 text-indigo-600" : "text-gray-500 hover:bg-gray-100"}`}
      >
        <span className="text-base">ℹ️</span> Sobre
      </button>
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
      <aside className="hidden md:flex fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-200 flex-col py-6 px-4 z-40">
        <div className="mb-6">
          <Logo />
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          <MenuConteudo view={view} navegar={navegar} alertas={alertas} />
        </div>
        <BotaoSobre view={view} navegar={navegar} />
      </aside>

      {/* Mobile header */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 px-4 h-14 flex items-center justify-between">
        <button onClick={() => setMenuAberto(!menuAberto)} className="flex items-center gap-2">
          <span className="text-xl">🏪</span>
          <h1 className="text-base font-semibold text-gray-700">StorePro</h1>
        </button>
        <button
          onClick={() => navegar("agenda")}
          className="text-gray-500 hover:text-indigo-500 transition-colors p-2 h-10 w-10 flex items-center justify-center"
        >
          <Home size={22} />
        </button>
      </header>

      {/* Mobile menu drawer */}
      {menuAberto && (
        <>
          <div className="md:hidden fixed inset-0 bg-black/30 z-40" onClick={() => setMenuAberto(false)} />
          <div className="md:hidden fixed top-0 left-0 h-full w-72 bg-white z-50 flex flex-col py-6 px-4 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <Logo />
              <button onClick={() => setMenuAberto(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              <MenuConteudo view={view} navegar={navegar} alertas={alertas} />
            </div>
            <BotaoSobre view={view} navegar={navegar} />
          </div>
        </>
      )}
    </>
  );
}

export default memo(Sidebar);
