import { CheckCircle, X } from 'lucide-react'
import { cleanPrfNumber } from '../../services/prfService'

const fmt = value => value
  ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—'

const stageText = {
  pending_material: 'Waiting for Material Controller',
  pending_procurement: 'Material Controller approved · Waiting for Procurement',
  pending_ehs: 'Procurement approved · Waiting for EHS Manager',
  pending_depot: 'EHS Manager approved · Waiting for Depot Manager',
  approved: 'Fully approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

const approvalStages = [
  ['material_controller', 'Material Controller'],
  ['procurement', 'Procurement'],
  ['ehs_manager', 'EHS Manager'],
  ['depot_manager', 'Depot Manager'],
]

export default function PrfPreviewModal({ prf, onClose, onOpen }) {
  const approvals = Object.fromEntries((prf.approvals ?? []).filter(a => a.action === 'approved').map(a => [a.role, a]))
  if (approvals.ehs && !approvals.ehs_manager) approvals.ehs_manager = approvals.ehs

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-label="Close preview" />
      <div className="relative max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-lg bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-100 bg-white px-5 py-4">
          <div><p className="font-mono text-sm font-extrabold text-secondary-700">{cleanPrfNumber(prf.prf_number)}</p><p className="mt-0.5 text-xs text-neutral-400">Quick PRF details and approval progress</p></div>
          <button onClick={onClose} className="rounded-md p-2 text-neutral-400 hover:bg-neutral-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-5 p-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <PreviewField label="Requested By" value={prf.requester?.name} />
            <PreviewField label="Date" value={fmt(prf.date || prf.created_at)} />
            <PreviewField label="Delivery Location" value={prf.delivery_location} />
            <PreviewField label="Current Stage" value={stageText[prf.status] || prf.status} />
          </div>
          <div className="overflow-hidden rounded-lg border border-neutral-200">
            <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-xs font-bold text-secondary-700">Items ({prf.items?.length ?? 0})</div>
            <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-xs"><thead className="bg-neutral-50 text-[10px] uppercase text-neutral-400"><tr><th className="px-4 py-2 text-left">Description</th><th className="px-4 py-2 text-left">Specs</th><th className="px-4 py-2 text-left">Qty</th><th className="px-4 py-2 text-left">Unit</th><th className="px-4 py-2 text-left">EHS Req.</th></tr></thead><tbody className="divide-y divide-neutral-100">{(prf.items ?? []).map(item => <tr key={item.id}><td className="px-4 py-3 font-semibold">{item.description}</td><td className="px-4 py-3 text-neutral-500">{item.specs || '—'}</td><td className="px-4 py-3">{item.qty ?? item.quantity}</td><td className="px-4 py-3">{item.unit || '—'}</td><td className="px-4 py-3">{item.ehs_requirement || item.ehs_req || '—'}</td></tr>)}</tbody></table></div>
          </div>
          <div>
            <p className="mb-2 text-xs font-bold text-secondary-700">Approval Process</p>
            <div className="grid grid-cols-1 overflow-hidden rounded-lg border border-neutral-200 sm:grid-cols-4">
              {approvalStages.map(([role, label]) => {
                const done = !!approvals[role]
                const current = prf.status === `pending_${role === 'material_controller' ? 'material' : role === 'ehs_manager' ? 'ehs' : role === 'depot_manager' ? 'depot' : role}`
                return <div key={role} className={`border-b border-neutral-200 p-4 text-center last:border-0 sm:border-b-0 sm:border-r ${current ? 'bg-blue-50' : done ? 'bg-green-50' : 'bg-neutral-50'}`}><p className="text-[10px] font-bold uppercase text-neutral-500">{label}</p><p className={`mt-3 flex items-center justify-center gap-1 text-xs font-bold ${current ? 'text-blue-600' : done ? 'text-green-600' : 'text-neutral-400'}`}>{done && <CheckCircle className="h-3.5 w-3.5" />}{done ? 'Approved' : current ? 'Reviewing' : 'Pending'}</p></div>
              })}
            </div>
          </div>
          <div className="flex justify-end"><button onClick={onOpen} className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary/90">Open Full Request</button></div>
        </div>
      </div>
    </div>
  )
}

function PreviewField({ label, value }) {
  return <div className="rounded-lg border border-neutral-100 bg-neutral-50 p-3"><p className="text-[9px] font-bold uppercase text-neutral-400">{label}</p><p className="mt-1 text-xs font-semibold text-secondary-700">{value || '—'}</p></div>
}
