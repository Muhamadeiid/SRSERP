import { useCallback, useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, Eye, Loader2, Pencil, Plus } from 'lucide-react'
import { cleanPrfNumber, getPrfs, PRF_STATUS_LABELS, PRF_STATUS_STYLES } from '../services/prfService'

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
                          <button onClick={() => navigate(`/purchase-request/${request.id}`)} title="View request"
                            className="p-2 border border-neutral-200 rounded-lg text-neutral-500 hover:text-primary hover:border-primary">
                            <Eye className="w-3.5 h-3.5" />
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
    </div>
  )
}
