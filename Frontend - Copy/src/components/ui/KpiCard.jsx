export default function KpiCard({ label, value, delta, type }) {
  const color = type === 'up' ? 'text-[#16a34a]' : type === 'down' ? 'text-[#c41a1a]' : 'text-[#8892ab]'
  return (
    <div className="bg-white border border-[#e2e4ea] rounded-xl p-4">
      <p className="text-[11px] font-medium text-[#8892ab] uppercase tracking-wide mb-2">{label}</p>
      <p className="text-[26px] font-semibold text-[#1a1f36] leading-none mb-1.5">{value}</p>
      <p className={`text-[11px] ${color}`}>{delta}</p>
    </div>
  )
}