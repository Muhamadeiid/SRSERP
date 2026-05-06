// src/components/dashboard/StatCard.jsx

export default function StatCard({ label, value, sub, subColor = "text-neutral-400" }) {
  return (
    <div className="bg-white rounded-xl border border-neutral-100 px-6 py-5 flex-1">
      <p className="text-[11px] text-neutral-400 uppercase tracking-widest mb-3">{label}</p>
      <p className="text-4xl font-extrabold text-secondary-700 leading-none mb-2">{value}</p>
      <p className={`text-xs font-medium ${subColor}`}>{sub}</p>
    </div>
  );
}
