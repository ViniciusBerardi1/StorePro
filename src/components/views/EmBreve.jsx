import { motion } from "framer-motion";
import { Construction } from "lucide-react";

export default function EmBreve() {
  return (
    <div className="max-w-md mx-auto mt-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-white border border-gray-200 rounded-2xl p-10 text-center"
      >
        <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
          <Construction size={30} strokeWidth={1.5} className="text-indigo-500" />
        </div>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Em breve</h2>
        <p className="text-sm text-gray-500 leading-relaxed mb-6">
          Este módulo está sendo desenvolvido.
        </p>
        <span className="inline-block text-xs font-semibold text-indigo-500 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-full">
          Em desenvolvimento
        </span>
      </motion.div>
    </div>
  );
}
