export default function AlertItem({ icon, bg, title, sub, badge, badgeStyle }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#f4f5f7] transition-all">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-[13px]" style={{ background: bg }}>{icon}</div>
      <div className="flex-1">
        <p className="text-xs font-medium text-[#1a1f36]">{title}</p>
        <p className="text-[11px] text-[#8892ab] mt-0.5">{sub}</p>
      </div>
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={badgeStyle}>{badge}</span>
    </div>
  )
}