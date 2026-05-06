// src/components/dashboard/Alerts.jsx

const SEVERITY_STYLES = {
  critical: { bar: "bg-red-500",    badge: "bg-red-50 text-red-600",    label: "Critical" },
  warning:  { bar: "bg-orange-400", badge: "bg-orange-50 text-orange-600", label: "Warning" },
  info:     { bar: "bg-blue-400",   badge: "bg-blue-50 text-blue-600",   label: "Info"     },
};

export default function Alerts({ alerts = [], onViewAll }) {
  const criticalCount = alerts.filter((a) => a.severity === "critical").length;

  return (
    <div className="bg-white rounded-xl border border-neutral-100 p-6 w-[340px] shrink-0">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-bold text-[15px] text-secondary-700">Alerts</h3>
        {criticalCount > 0 && (
          <span className="text-xs font-bold text-red-600 bg-red-50 px-2.5 py-1 rounded-full">
            {criticalCount} critical
          </span>
        )}
      </div>

      {/* ── List ── */}
      <div className="space-y-3">
        {alerts.map((alert, i) => {
          const style = SEVERITY_STYLES[alert.severity] ?? SEVERITY_STYLES.info;
          return (
            <div key={i} className="flex gap-3 items-start py-2 border-b border-neutral-50 last:border-0">
              <div className={`w-1 h-full min-h-[40px] rounded-full shrink-0 ${style.bar}`} />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${style.badge}`}>
                    {style.label}
                  </span>
                  <span className="text-xs text-neutral-400">{alert.time}</span>
                </div>
                <p className="text-sm font-medium text-secondary-700">{alert.message}</p>
                <p className="text-xs text-neutral-400 mt-0.5">{alert.site}</p>
              </div>
            </div>
          );
        })}
      </div>

      {alerts.length === 0 && (
        <p className="text-sm text-neutral-400 text-center py-6">No active alerts</p>
      )}
    </div>
  );
}
