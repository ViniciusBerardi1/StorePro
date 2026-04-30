import { motion } from "framer-motion";

const MODULOS = {
  agenda: {
    icon: "📅",
    titulo: "Agenda",
    descricao: "Gerencie os agendamentos da sua loja — visualize por dia, semana ou mês e controle a disponibilidade.",
  },
  novo_atendimento: {
    icon: "✂️",
    titulo: "Novo Atendimento",
    descricao: "Registre atendimentos em tempo real, associe a um cliente e controle os serviços realizados.",
  },
  clientes_lista: {
    icon: "👥",
    titulo: "Clientes",
    descricao: "Cadastro completo de clientes com histórico de compras, preferências e dados de contato.",
  },
  clientes_historico: {
    icon: "🕑",
    titulo: "Histórico de Clientes",
    descricao: "Visualize todo o histórico de atendimentos e compras por cliente.",
  },
  caixa: {
    icon: "🏧",
    titulo: "Caixa",
    descricao: "Controle de entradas e saídas do dia, abertura e fechamento de caixa.",
  },
  financeiro_movimentacoes: {
    icon: "🔄",
    titulo: "Movimentações",
    descricao: "Histórico detalhado de todas as movimentações financeiras da loja.",
  },
  financeiro_relatorios: {
    icon: "📈",
    titulo: "Relatórios Financeiros",
    descricao: "Receitas, despesas e margem de lucro consolidados por período.",
  },
  relatorios: {
    icon: "📊",
    titulo: "Relatórios",
    descricao: "Relatórios completos de vendas, estoque, clientes e desempenho geral da loja.",
  },
  configuracoes: {
    icon: "⚙️",
    titulo: "Configurações",
    descricao: "Personalize o sistema — dados da loja, categorias, usuários e preferências gerais.",
  },
};

export default function EmBreve({ modulo }) {
  const info = MODULOS[modulo] ?? {
    icon: "🚧",
    titulo: "Em breve",
    descricao: "Este módulo está sendo desenvolvido.",
  };

  return (
    <div className="max-w-md mx-auto mt-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-white border border-gray-200 rounded-2xl p-10 text-center"
      >
        <div className="text-5xl mb-4">{info.icon}</div>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">{info.titulo}</h2>
        <p className="text-sm text-gray-500 leading-relaxed mb-6">{info.descricao}</p>
        <span className="inline-block text-xs font-semibold text-indigo-500 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-full">
          Em desenvolvimento
        </span>
      </motion.div>
    </div>
  );
}
