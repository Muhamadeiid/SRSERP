import { useCallback, useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { CheckCircle, ClipboardList, Eye, Loader2, Pencil, Plus, X } from 'lucide-react'
import { cleanPrfNumber, getPrf, getPrfs, PRF_STATUS_LABELS, PRF_STATUS_STYLES } from '../services/prfService'

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

export default function MyPrfRequestsPage() {
  const navigate = useNavigate()
  const { user } = useSelector(state => state.auth)
  const canReviewAll = ['admin', 'material_controller', 'procurement', 'purchasing', 'ehs_manager', 'depot_manager'].includes(user?.role)
    || ['prf.approve_material', 'prf.approve_procurement', 'prf.approve_ehs', 'prf.approve_depot'].some(permission => user?.permissions?.includes(permission))
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const openPreview = async id => {
    setPreviewLoading(true)
    try {
      const res = await getPrf(id)
      setPreview(res?.data ?? res)
    } catch (e) {
      setError(e.message || 'Failed to load purchase request details')
    } finally {
      setPreviewLoading(false)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await getPrfs(canReviewAll ? {} : { mine: 1 })
      setRequests(res?.data ?? [])
    } catch (e) {
      setError(e.message || 'Failed to load purchase requests')
    } finally {
      setLoading(false)
    }
  }, [canReviewAll])

  useEffect(() => { load() }, [load])

  return (
    <div className="w-full p-4 sm:p-6 lg:p-7 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold text-secondary-700 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" /> {canReviewAll ? 'Purchase Requests' : 'My Purchase Requests'}
          </h1>
          <p className="text-sm text-neutral-400 mt-0.5">
            {canReviewAll ? 'Track submitted PRFs and their current approval stage' : 'Track approvals and updates for your submitted PRFs'}
          </p>
        </div>
        <button onClick={() => navigate('/purchase-request/new')}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90">
          <Plus className="w-4 h-4" /> New Request
        </button>
      </div>

      <div className="bg-white border border-neutral-100 rounded-lg overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-20 flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-red-600">{error}</div>
        ) : requests.length === 0 ? (
          <div className="py-20 text-center">
            <ClipboardList className="w-9 h-9 text-neutral-200 mx-auto mb-3" />
            <p className="text-sm font-bold text-secondary-700">No purchase requests yet</p>
            <p className="text-xs text-neutral-400 mt-1">Your submitted requests will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-xs">
              <thead className="bg-neutral-50 border-b border-neutral-100">
                <tr>
                  {['PRF Number', 'Requested By', 'Submitted', 'Delivery', 'Current Stage', 'Last Updated', 'Items', 'Actions'].map(label => (
                    <th key={label} className="px-4 py-3 text-left text-[10px] font-bold uppercase text-neutral-400">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {requests.map(request => {
                  const canEdit = String(request.requested_by) === String(user?.id)
                    && request.status === 'pending_material'
                    && (request.approvals ?? []).length === 0
                  return (
                    <tr key={request.id} className="hover:bg-neutral-50/70">
                      <td className="px-4 py-3 font-mono font-bold text-secondary-700">{cleanPrfNumber(request.prf_number)}</td>
                      <td className="px-4 py-3 text-neutral-600 font-semibold">{request.requester?.name || '—'}</td>
                      <td className="px-4 py-3 text-neutral-600">{fmt(request.created_at)}</td>
                      <td className="px-4 py-3 text-neutral-600">{request.delivery_location || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-1 rounded-full border text-[10px] font-bold ${PRF_STATUS_STYLES[request.status]}`}>
                          {PRF_STATUS_LABELS[request.status]}
                        </span>
                        <p className="text-[10px] text-neutral-400 mt-1">{stageText[request.status] || request.status}</p>
                      </td>
                      <td className="px-4 py-3 text-neutral-600">{fmt(request.updated_at)}</td>
                      <td className="px-4 py-3 text-neutral-600">{request.items?.length ?? 0}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => openPreview(request.id)} title="Quick view"
                            className="p-2 border border-neutral-200 rounded-lg text-neutral-500 hover:text-primary hover:border-primary">
                            {previewLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                          {canEdit && (
                            <button onClick={() => navigate(`/purchase-request/${request.id}/edit`)} title="Edit request"
                              className="p-2 border border-neutral-200 rounded-lg text-neutral-500 hover:text-primary hover:border-primary">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {preview && <PrfPreviewModal prf={preview} onClose={() => setPreview(null)} onOpen={() => navigate(`/purchase-request/${preview.id}`)} />}
    </div>
  )
}

const approvalStages = [
  ['material_controller', 'Material Controller'],
  ['procurement', 'Procurement'],
  ['ehs_manager', 'EHS Manager'],
  ['depot_manager', 'Depot Manager'],
]

function PrfPreviewModal({ prf, onClose, onOpen }) {
  const approvals = Object.fromEntries((prf.approvals ?? []).filter(a => a.action === 'approved').map(a => [a.role, a]))
  if (approvals.ehs && !approvals.ehs_manager) approvals.ehs_manager = approvals.ehs

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-label="Close preview" />
      <div className="relative max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-lg bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-100 bg-white px-5 py-4">
          <div>
            <p className="font-mono text-sm font-extrabold text-secondary-700">{cleanPrfNumber(prf.prf_number)}</p>
            <p className="mt-0.5 text-xs text-neutral-400">Quick PRF details and approval progress</p>
          </div>
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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-xs">
                <thead className="bg-neutral-50 text-[10px] uppercase text-neutral-400"><tr><th className="px-4 py-2 text-left">Description</th><th className="px-4 py-2 text-left">Specs</th><th className="px-4 py-2 text-left">Qty</th><th className="px-4 py-2 text-left">Unit</th><th className="px-4 py-2 text-left">EHS Req.</th></tr></thead>
                <tbody className="divide-y divide-neutral-100">{(prf.items ?? []).map(item => <tr key={item.id}><td className="px-4 py-3 font-semibold">{item.description}</td><td className="px-4 py-3 text-neutral-500">{item.specs || '—'}</td><td className="px-4 py-3">{item.qty ?? item.quantity}</td><td className="px-4 py-3">{item.unit || '—'}</td><td className="px-4 py-3">{item.ehs_requirement || item.ehs_req || '—'}</td></tr>)}</tbody>
              </table>
            </div>
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
