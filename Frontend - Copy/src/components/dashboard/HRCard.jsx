// src/components/dashboard/HRCard.jsx

const AVATAR_COLORS = ["bg-primary", "bg-secondary", "bg-tertiary"];

export default function HRCard({ data }) {
  const {
    totalStaff = 0,
    onShift    = 0,
    hrChange   = "",
    safetyCertsExpiring = 0,
    avatars    = [],
  } = data ?? {};

  return (
    <div className="bg-white rounded-xl border border-neutral-100 p-6 flex-1">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <span className="text-lg">👥</span>
          <span className="font-bold text-[15px] text-secondary-700">Human Resources</span>
        </div>
        <span className="bg-green-50 text-green-700 text-xs font-bold px-3 py-1 rounded-full">
          {hrChange}
        </span>
      </div>

      {/* ── Stats ── */}
      <div className="flex gap-8 mb-5">
        <div>
          <p className="text-[11px] text-neutral-400 uppercase tracking-widest mb-1">Total Staff</p>
          <p className="text-3xl font-extrabold text-secondary-700 leading-none">{totalStaff}</p>
        </div>
        <div>
          <p className="text-[11px] text-neutral-400 uppercase tracking-widest mb-1">On Shift</p>
          <p className="text-3xl font-extrabold text-secondary-700 leading-none">{onShift}</p>
          <p className="text-xs text-green-600 mt-1">● Active</p>
        </div>
      </div>

      {/* ── Safety certs ── */}
      <div className="flex items-center gap-3 bg-neutral-50 rounded-lg px-3.5 py-2.5">
        {/* Avatars */}
        <div className="flex">
          {AVATAR_COLORS.map((color, i) => (
            <div
              key={i}
              className={`w-[26px] h-[26px] rounded-full ${color} border-2 border-white flex items-center justify-center text-white text-[10px] font-bold ${i > 0 ? "-ml-2" : ""}`}
            >
              {avatars[i] ?? ["A", "B", "C"][i]}
            </div>
          ))}
          <div className="w-[26px] h-[26px] rounded-full bg-neutral-200 border-2 border-white -ml-2 flex items-center justify-center text-neutral-400 text-[10px] font-bold">
            +8
          </div>
        </div>
        <p className="text-sm text-secondary">
          Safety Certs Expiring:{" "}
          <strong className="text-red-600">{safetyCertsExpiring}</strong>
        </p>
      </div>
    </div>
  );
}
