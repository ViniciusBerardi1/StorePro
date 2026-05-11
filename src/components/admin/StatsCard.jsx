/**
 * Reusable metric card for the admin dashboard.
 * Props:
 *   title    — card label
 *   value    — primary number / string
 *   icon     — Lucide icon component
 *   color    — "indigo" | "emerald" | "amber" | "rose" | "sky"
 *   loading  — shows skeleton when true
 *   subtitle — optional secondary line
 */
export default function StatsCard({
  title,
  value,
  icon: Icon,
  color = "indigo",
  loading = false,
  subtitle,
}) {
  const palette = {
    indigo:  { bg: "bg-indigo-50",  icon: "bg-indigo-100 text-indigo-600"  },
    emerald: { bg: "bg-emerald-50", icon: "bg-emerald-100 text-emerald-600" },
    amber:   { bg: "bg-amber-50",   icon: "bg-amber-100  text-amber-600"   },
    rose:    { bg: "bg-rose-50",    icon: "bg-rose-100   text-rose-600"    },
    sky:     { bg: "bg-sky-50",     icon: "bg-sky-100    text-sky-600"     },
  };
  const { bg, icon: iconCls } = palette[color] ?? palette.indigo;

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm animate-pulse">
        <div className="flex items-center justify-between mb-4">
          <div className="h-3 w-24 bg-gray-200 rounded-full" />
          <div className="w-9 h-9 rounded-xl bg-gray-200" />
        </div>
        <div className="h-7 w-16 bg-gray-200 rounded-lg mb-1.5" />
        <div className="h-3 w-20 bg-gray-100 rounded-full" />
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow`}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconCls}`}>
          {Icon && <Icon size={17} strokeWidth={2} />}
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900 leading-none">
        {value ?? "—"}
      </p>
      {subtitle && (
        <p className="text-xs text-gray-400 mt-1.5">{subtitle}</p>
      )}
    </div>
  );
}
