// src/components/dashboard/InventoryTable.jsx

const STATUS_STYLES = {
  "LOW STOCK": "bg-red-50 text-red-700",
  "ORDERED":   "bg-orange-50 text-orange-700",
  "STABLE":    "bg-green-50 text-green-700",
};

export default function InventoryTable({ items = [], onManageAll }) {
  return (
    <div className="bg-white rounded-xl border border-neutral-100 p-6 flex-1">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">📋</span>
          <span className="font-bold text-[15px] text-secondary-700">Material Control</span>
        </div>
        <button
          onClick={onManageAll}
          className="text-primary text-sm font-semibold hover:text-primary-600 transition-colors"
        >
          Manage All →
        </button>
      </div>

      {/* ── Table ── */}
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-neutral-100">
            {["Component ID", "Name", "Status", "Available", "Forecast"].map((h) => (
              <th
                key={h}
                className="text-left text-[11px] text-neutral-400 font-semibold uppercase tracking-widest pb-2.5"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} className="border-b border-neutral-50 last:border-0">
              <td className="py-3.5 text-sm font-bold text-primary">{item.id}</td>
              <td className="py-3.5 px-2 text-sm text-secondary-700">{item.name}</td>
              <td className="py-3.5 px-2">
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${STATUS_STYLES[item.status] ?? "bg-neutral-100 text-neutral-500"}`}>
                  {item.status}
                </span>
              </td>
              <td className="py-3.5 px-2 text-sm font-semibold text-secondary-700">{item.available}</td>
              <td className="py-3.5 text-xs text-neutral-400">{item.forecast ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
