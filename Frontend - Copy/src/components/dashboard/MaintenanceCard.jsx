// src/components/dashboard/MaintenanceCard.jsx

export default function MaintenanceCard({ data }) {
  const {
    openTickets      = 0,
    criticalTickets  = 0,
    mttr             = "0h",
    mttrChange       = "",
    weeklyProgress   = 0,
    recentTasks      = [],
  } = data ?? {};

  return (
    <div className="bg-white rounded-xl border border-neutral-100 p-6 flex-[1.4]">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔧</span>
          <span className="font-bold text-[15px] text-secondary-700">
            Corrective & Preventive Maintenance
          </span>
        </div>
        <div className="flex gap-4 text-xs text-neutral-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-primary inline-block" />
            Corrective
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-neutral-200 inline-block" />
            Preventive
          </span>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="flex gap-4 mb-5">

        {/* Open Tickets */}
        <div className="flex-1 bg-neutral-50 rounded-xl p-4">
          <p className="text-[11px] text-neutral-400 uppercase tracking-widest mb-1.5">Open Tickets</p>
          <p className="text-[32px] font-extrabold text-secondary-700 leading-none">{openTickets}</p>
          <p className="text-xs text-red-600 mt-1.5">⚠ {criticalTickets} Critical</p>
        </div>

        {/* MTTR */}
        <div className="flex-1 bg-neutral-50 rounded-xl p-4">
          <p className="text-[11px] text-neutral-400 uppercase tracking-widest mb-1.5">MTTR (Avg)</p>
          <p className="text-[32px] font-extrabold text-secondary-700 leading-none">{mttr}</p>
          <p className="text-xs text-green-600 mt-1.5">↘ {mttrChange}</p>
        </div>

        {/* Recent Tasks */}
        <div className="flex-[1.4]">
          <p className="text-[11px] text-neutral-400 uppercase tracking-widest mb-3">Recent Tasks</p>
          <div className="space-y-3">
            {recentTasks.map((task, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <div
                  className="w-[3px] h-8 rounded-full shrink-0"
                  style={{ background: task.color }}
                />
                <div>
                  <p className="text-[13px] font-semibold text-secondary-700 leading-tight">{task.title}</p>
                  <p className="text-[11px] text-neutral-400">{task.urgency} • {task.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Weekly progress ── */}
      <div>
        <div className="flex justify-between text-xs text-neutral-400 mb-1.5">
          <span className="uppercase tracking-widest">Weekly Progress</span>
          <span className="font-bold text-secondary-700">{weeklyProgress}%</span>
        </div>
        <div className="bg-neutral-100 rounded-full h-2">
          <div
            className="h-full bg-gradient-to-r from-primary to-primary-300 rounded-full transition-all duration-700"
            style={{ width: `${weeklyProgress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
