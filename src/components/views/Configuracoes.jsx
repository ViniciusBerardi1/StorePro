import { Settings } from "lucide-react";

export default function Configuracoes() {
  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Configurações</h1>
      <p className="text-sm text-gray-400 mb-6">Ajustes da sua barbearia</p>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-14 text-center">
        <Settings size={32} className="mx-auto text-gray-300 mb-3" />
        <p className="text-gray-400 text-sm">Nenhuma configuração disponível.</p>
        <p className="text-gray-300 text-xs mt-1">
          Entre em contato com o administrador para ajustes.
        </p>
      </div>
    </div>
  );
}
