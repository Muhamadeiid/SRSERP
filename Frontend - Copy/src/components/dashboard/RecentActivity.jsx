// src/components/dashboard/RecentActivity.jsx

const TYPE_STYLES = {
  "stock-in":  { bg: "bg-green-50",  text: "text-green-600",  label: "Stock In"   },
  "stock-out": { bg: "bg-red-50",    text: "text-red-600",    label: "Stock Out"  },
  "bad-item":  { bg: "bg-orange-50", text: "text-orange-600", label: "Bad Item"   },
  "import":    { bg: "bg-blue-50",   text: "text-blue-600",   label: "Import"     },
};

export default function RecentActivity({ activities = [], onViewAll }) {
  return (
    <div className="bg-white rounded-xl border border-neutral-100 p-6 flex-1">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-bold text-[15px] text-secondary-700">Recent Activity</h3>
        <button
          onClick={onViewAll}
          className="text-primary text-sm font-semibold hover:text-primary-600 transition-colors"
        >
          View all
        </button>
      </div>

      {/* ── List ── */}
      <div className="space-y-3">
        {activities.map((item, i) => {
          const style = TYPE_STYLES[item.type] ?? { bg: "bg-neutral-50", text: "text-neutral-500", label: item.type };
          return (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-neutral-50 last:border-0">
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ${style.bg} ${style.text}`}>
                {style.label}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-secondary-700 truncate">{item.description}</p>
                <p className="text-xs text-neutral-400">{item.user} • {item.time}</p>
              </div>
              <span className="text-xs text-neutral-300 shrink-0">{item.site}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
