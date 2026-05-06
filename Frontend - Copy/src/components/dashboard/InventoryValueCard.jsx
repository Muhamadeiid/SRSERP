// src/components/dashboard/InventoryValueCard.jsx

export default function InventoryValueCard({ data, onApprove }) {
  const {
    inventoryValue   = "$0",
    inventoryChange  = "",
    pendingOrders    = 0,
  } = data ?? {};

  return (
    <div className="bg-primary rounded-xl p-6 text-white min-w-[220px] flex flex-col">

      {/* ── Value ── */}
      <p className="text-[11px] uppercase tracking-widest text-primary-200 mb-2">
        Inventory Value
      </p>
      <p className="text-4xl font-extrabold leading-tight">{inventoryValue}</p>
      <p className="text-xs text-primary-200 mt-1 mb-6">{inventoryChange}</p>

      {/* ── Pending orders ── */}
      <div className="bg-white/10 rounded-lg px-4 py-3.5 flex items-center gap-3 mb-4">
        <span className="text-xl">🛒</span>
        <div>
          <p className="font-bold text-[15px] leading-tight">{pendingOrders} Pending Orders</p>
          <p className="text-xs text-primary-200 mt-0.5">Awaiting approval</p>
        </div>
      </div>

      {/* ── CTA ── */}
      <button
        onClick={onApprove}
        className="w-full py-2.5 bg-white text-primary font-bold text-sm rounded-lg hover:bg-primary-50 transition-colors duration-150 mt-auto"
      >
        Approve Requisitions
      </button>
    </div>
  );
}
