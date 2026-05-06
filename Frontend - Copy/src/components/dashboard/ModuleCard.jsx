// src/components/dashboard/ModuleCard.jsx

const STATUS_STYLES = {
  "Coming Soon": "bg-orange-50 text-orange-500",
  "Live":        "bg-green-50  text-green-600",
};

export default function ModuleCard({ icon, title, description, badge, badgeLabel, stats = [], onClick, highlight = false }) {
  const isLive = badge === "Live";

  return (
    <div
      onClick={isLive ? onClick : undefined}
      className={`
        relative bg-white rounded-xl border p-6 flex flex-col gap-4 transition-all duration-200
        ${isLive ? "border-primary/20 cursor-pointer hover:shadow-md hover:border-primary/40" : "border-neutral-100 cursor-default opacity-90"}
        ${highlight ? "ring-2 ring-primary/20" : ""}
      `}
    >
      {/* ── Badge ── */}
      <div className="absolute top-4 right-4">
        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${STATUS_STYLES[badge] ?? "bg-neutral-100 text-neutral-500"}`}>
          <span className={`w-1.5 h-1.5 rounded-full inline-block ${isLive ? "bg-green-500" : "bg-orange-400"}`} />
          {isLive ? `Live — ${badgeLabel}` : badge}
        </span>
      </div>

      {/* ── Icon ── */}
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl
        ${isLive ? "bg-primary-50 text-primary" : "bg-neutral-50 text-neutral-400"}
      `}>
        {icon}
      </div>

      {/* ── Content ── */}
      <div>
        <h3 className="font-bold text-[15px] text-secondary-700 mb-1.5">{title}</h3>
        <p className="text-sm text-neutral-400 leading-relaxed">{description}</p>
      </div>

      {/* ── Divider ── */}
      <div className="border-t border-neutral-100" />

      {/* ── Stats + Arrow ── */}
      <div className="flex items-center justify-between">
        <div className="flex gap-5">
          {stats.map((s, i) => (
            <div key={i}>
              <p className="text-xl font-extrabold text-secondary-700 leading-none">{s.value}</p>
              <p className="text-[11px] text-neutral-400 uppercase tracking-widest mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-colors
          ${isLive ? "bg-primary text-white" : "bg-neutral-100 text-neutral-400"}
        `}>
          →
        </div>
      </div>
    </div>
  );
}
