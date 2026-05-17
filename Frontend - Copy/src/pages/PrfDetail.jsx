import { useState, useEffect, useCallback } from 'react'
import { useSelector } from 'react-redux'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Loader2, X, Check, Printer, ArrowLeft, FileText, MessageSquare,
  CheckCircle, XCircle, Clock,
} from 'lucide-react'
import {
  getPrf, approvePrf, rejectPrf, updatePrfNumber,
  PRF_STATUS_LABELS, PRF_STATUS_STYLES, canActOnStage, cleanPrfNumber,
} from '../services/prfService'
import { generatePRF } from '../utils/generatePRF'

const fmtShort   = d => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtFullDay = d => d ? new Date(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '—'

const STAGE_LABEL = {
  procurement:   'Procurement',
  ehs:           'EHS / Safety',
  depot_manager: 'Depot Manager',
}

export default function PrfDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { user } = useSelector(s => s.auth)

  const [prf,     setPrf]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [err,     setErr]     = useState('')
  const [busy,    setBusy]    = useState(false)
  const [comment, setComment] = useState('')
  const [showRejectModal, setShowRejectModal] = useState(false)

  // Inline PRF-number editor (procurement / admin only)
  const [editingNumber, setEditingNumber] = useState(false)
  const [numberDraft,   setNumberDraft]   = useState('')
  const [savingNumber,  setSavingNumber]  = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const res = await getPrf(id)
      setPrf(res?.data ?? null)
    } catch (e) {
      setErr(e.message || 'Failed to load PRF')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const canAct           = prf && canActOnStage(user, prf.status)
  const isApproved       = prf?.status === 'approved'
  const isProcurementUser = user?.role === 'purchasing' || user?.role === 'admin'
  const canCreatePO      = isApproved && ['admin', 'depot_manager', 'purchasing'].includes(user?.role)
  const hasLinkedPO      = !!prf?.purchase_order

  const saveNumber = async () => {
    const value = numberDraft.trim()
    if (!value) { alert('PRF number cannot be empty'); return }
    setSavingNumber(true)
    try {
      const res = await updatePrfNumber(id, value)
      setPrf(res?.data ?? null)
      setEditingNumber(false)
    } catch (e) {
      alert(e.message || 'Failed to update PRF number')
    } finally {
      setSavingNumber(false)
    }
  }

  // Build approval map: role -> { name, date }
  const approvalsByRole = (prf?.approvals ?? []).reduce((acc, a) => {
    if (a.action !== 'approved') return acc
    if (!acc[a.role]) acc[a.role] = a
    return acc
  }, {})

  const handleApprove = async () => {
    setBusy(true)
    try {
      await approvePrf(id, comment)
      setComment('')
      await load()
    } catch (e) {
      alert(e.message)
    } finally {
      setBusy(false)
    }
  }

  const handleReject = async () => {
    if (!comment.trim()) {
      alert('Please provide a reason for rejection')
      return
    }
    setBusy(true)
    try {
      await rejectPrf(id, comment)
      setComment('')
      setShowRejectModal(false)
      await load()
    } catch (e) {
      alert(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (err || !prf) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <p className="text-sm font-bold text-red-700">{err || 'PRF not found'}</p>
          <button onClick={() => navigate('/procurement')} className="mt-3 text-xs font-bold text-primary hover:underline">
            ← Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button onClick={() => navigate('/procurement')}
            className="p-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-neutral-400 transition-colors shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            {editingNumber ? (
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary shrink-0" />
                <input
                  value={numberDraft}
                  onChange={e => setNumberDraft(e.target.value)}
                  placeholder="PRF-EG1-2026-0001"
                  autoFocus
                  className="text-base font-bold px-3 py-1 border-2 border-primary rounded-lg outline-none focus:ring-2 focus:ring-primary/30 w-64"
                  onKeyDown={e => { if (e.key === 'Enter') saveNumber(); if (e.key === 'Escape') { setEditingNumber(false); setNumberDraft(prf.prf_number || '') } }}
                />
                <button onClick={saveNumber} disabled={savingNumber}
                  className="px-3 py-1 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50">
                  {savingNumber ? '…' : 'Save'}
                </button>
                <button onClick={() => { setEditingNumber(false); setNumberDraft(prf.prf_number || '') }}
                  className="px-3 py-1 text-xs font-bold text-neutral-500 hover:bg-neutral-100 rounded-lg">
                  Cancel
                </button>
              </div>
            ) : (
              <h1 className="text-xl font-extrabold text-secondary-700 flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                {cleanPrfNumber(prf.prf_number)}
                {isProcurementUser && (
                  <button onClick={() => { setEditingNumber(true); setNumberDraft(cleanPrfNumber(prf.prf_number)) }}
                    className="text-[10px] font-bold text-primary hover:underline ml-1">
                    Edit
                  </button>
                )}
              </h1>
            )}
            <p className="text-xs text-neutral-400 mt-0.5">Submitted on {fmtFullDay(prf.created_at)}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className={`inline-flex items-center px-3 py-1 text-xs font-bold rounded-full border ${PRF_STATUS_STYLES[prf.status]}`}>
            {PRF_STATUS_LABELS[prf.status]}
          </span>
          {isApproved && isProcurementUser && (
            <button onClick={() => generatePRF(prf)}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-xs font-bold rounded-lg transition-all">
              <Printer className="w-3.5 h-3.5" /> Print (.docx)
            </button>
          )}
          {canCreatePO && !hasLinkedPO && (
            <button onClick={() => navigate(`/procurement/po/new/${prf.id}`)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg transition-all">
              <FileText className="w-3.5 h-3.5" /> Create PO
            </button>
          )}
          {hasLinkedPO && (
            <button onClick={() => navigate(`/procurement/po/${prf.purchase_order.id}`)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-neutral-200 text-secondary text-xs font-bold rounded-lg hover:bg-neutral-50 transition-all">
              <FileText className="w-3.5 h-3.5" /> View PO
            </button>
          )}
        </div>
      </div>

      {/* Top info */}
      <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-neutral-100">
          {[
            ['Requested By', prf.requester?.name ?? '—'],
            ['Date',         fmtShort(prf.date)],
            ['Phone',        prf.requester_phone || '—'],
            ['Email',        prf.requester_email || '—'],
          ].map(([k, v]) => (
            <div key={k} className="px-4 py-3">
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-1">{k}</p>
              <p className="text-xs text-secondary-700 font-semibold break-all">{v}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-neutral-100 border-t border-neutral-100">
          <div className="px-4 py-3">
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-1">Delivery Location</p>
            <p className="text-xs text-secondary-700 font-semibold">{prf.delivery_location || '—'}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-1">Delivery Contact</p>
            <p className="text-xs text-secondary-700 font-semibold">{prf.delivery_contact || '—'}</p>
          </div>
        </div>
        {Array.isArray(prf.material_category) && prf.material_category.length > 0 && (
          <div className="px-4 py-3 border-t border-neutral-100 bg-neutral-50/50">
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-2">Material Category</p>
            <div className="flex flex-wrap gap-1.5">
              {prf.material_category.map(cat => (
                <span key={cat} className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-bold rounded-full">{cat}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Items table */}
      <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-100 bg-neutral-50/50">
          <p className="text-xs font-bold text-secondary-700">Items ({prf.items?.length ?? 0})</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[900px]">
            <thead className="bg-neutral-100">
              <tr>
                {['S/N', 'Description', 'Specs', 'Qty', 'Unit', 'EHS Req.', 'Required By'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] font-bold text-neutral-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {(prf.items ?? []).map(it => (
                <tr key={it.id} className="hover:bg-neutral-50">
                  <td className="px-3 py-2 font-bold text-neutral-400">{it.sn}</td>
                  <td className="px-3 py-2 text-secondary-700 font-semibold">{it.description}</td>
                  <td className="px-3 py-2 text-neutral-500">{it.technical_specifications || '—'}</td>
                  <td className="px-3 py-2 font-mono text-secondary-700">{it.quantity}</td>
                  <td className="px-3 py-2 text-neutral-500">{it.unit}</td>
                  <td className="px-3 py-2 text-neutral-500">{it.ehs_requirements || '—'}</td>
                  <td className="px-3 py-2 text-neutral-500 whitespace-nowrap">{fmtShort(it.required_by_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Notes (text + optional image) */}
      {(prf.notes || prf.notes_image) && (
        <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-4 space-y-3">
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide">Additional Notes</p>
          {prf.notes && (
            <p className="text-xs text-secondary-700 whitespace-pre-wrap leading-relaxed">{prf.notes}</p>
          )}
          {prf.notes_image && (
            <img src={prf.notes_image} alt="Notes attachment"
              className="max-h-96 max-w-full rounded-lg border border-neutral-200 shadow-sm" />
          )}
        </div>
      )}

      {/* Approval timeline */}
      <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-100 bg-neutral-50/50">
          <p className="text-xs font-bold text-secondary-700">Approval Flow</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-neutral-100">
          <ApprovalBox
            label="Requester"
            name={prf.requester?.name}
            date={prf.created_at}
            sig={prf.requester?.e_signature}
            done
          />
          <ApprovalBox
            label="Procurement"
            name={approvalsByRole.procurement?.approver?.name}
            date={approvalsByRole.procurement?.acted_at}
            sig={approvalsByRole.procurement?.approver?.e_signature}
            done={!!approvalsByRole.procurement}
            current={prf.status === 'pending_procurement'}
            rejected={prf.status === 'rejected' && !approvalsByRole.procurement}
          />
          <ApprovalBox
            label="EHS / Safety"
            name={approvalsByRole.ehs?.approver?.name}
            date={approvalsByRole.ehs?.acted_at}
            sig={approvalsByRole.ehs?.approver?.e_signature}
            done={!!approvalsByRole.ehs}
            current={prf.status === 'pending_ehs'}
            rejected={prf.status === 'rejected' && !!approvalsByRole.procurement && !approvalsByRole.ehs}
          />
          <ApprovalBox
            label="Depot Manager"
            name={approvalsByRole.depot_manager?.approver?.name}
            date={approvalsByRole.depot_manager?.acted_at}
            sig={approvalsByRole.depot_manager?.approver?.e_signature}
            done={!!approvalsByRole.depot_manager}
            current={prf.status === 'pending_depot'}
            rejected={prf.status === 'rejected' && !!approvalsByRole.ehs && !approvalsByRole.depot_manager}
          />
        </div>
      </div>

      {/* Past comments */}
      {(prf.approvals ?? []).filter(a => a.comment).length > 0 && (
        <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm">
          <div className="px-4 py-3 border-b border-neutral-100 bg-neutral-50/50">
            <p className="text-xs font-bold text-secondary-700 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" /> Comments
            </p>
          </div>
          <div className="divide-y divide-neutral-50">
            {(prf.approvals ?? []).filter(a => a.comment).map(a => (
              <div key={a.id} className="px-4 py-3 flex items-start gap-3">
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                  a.action === 'approved' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                }`}>
                  {a.action === 'approved' ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-secondary-700">
                    {a.approver?.name} <span className="font-normal text-neutral-400">· {STAGE_LABEL[a.role]}</span>
                  </p>
                  <p className="text-xs text-neutral-600 mt-0.5">{a.comment}</p>
                  <p className="text-[10px] text-neutral-400 mt-1">{fmtShort(a.acted_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action panel — only when current user can act */}
      {canAct && (
        <div className="bg-white rounded-2xl border-2 border-primary/30 shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            <p className="text-sm font-bold text-secondary-700">Awaiting your decision</p>
          </div>
          <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3}
            placeholder="Add a comment (required for rejection, optional for approval)…"
            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none focus:border-primary resize-none" />
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => setShowRejectModal(true)} disabled={busy}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-all disabled:opacity-50">
              <XCircle className="w-3.5 h-3.5" /> Reject
            </button>
            <button onClick={handleApprove} disabled={busy}
              className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-all disabled:opacity-50">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
              Approve
            </button>
          </div>
        </div>
      )}

      {/* Reject confirmation modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowRejectModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-red-700">Reject this PRF?</p>
              <button onClick={() => setShowRejectModal(false)} className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-400"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-neutral-500">A reason is required so the requester knows what went wrong. This action cannot be undone.</p>
            <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3}
              placeholder="Reason for rejection…"
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none focus:border-red-400 resize-none" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 text-xs font-bold text-neutral-500 hover:bg-neutral-100 rounded-lg">Cancel</button>
              <button onClick={handleReject} disabled={busy || !comment.trim()}
                className="px-5 py-2 text-xs font-bold text-white bg-red-500 hover:bg-red-600 rounded-lg disabled:opacity-50">
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Approval box mini-component (signature image only — no date below) ────
function ApprovalBox({ label, sig, done, current, rejected }) {
  let cls       = 'border-dashed border-neutral-200 bg-neutral-50/40'
  let badgeCls  = 'text-neutral-400'
  let badgeText = 'Pending'
  let icon      = <Clock className="w-3.5 h-3.5" />

  if (done) {
    cls = 'border-green-200 bg-green-50/30'
    badgeCls = 'text-green-600'
    badgeText = 'Approved'
    icon = <CheckCircle className="w-3.5 h-3.5" />
  } else if (current) {
    cls = 'border-blue-300 bg-blue-50/40'
    badgeCls = 'text-blue-600'
    badgeText = 'Reviewing'
    icon = <Clock className="w-3.5 h-3.5 animate-pulse" />
  } else if (rejected) {
    cls = 'border-red-200 bg-red-50/30'
    badgeCls = 'text-red-600'
    badgeText = 'Rejected'
    icon = <XCircle className="w-3.5 h-3.5" />
  }

  return (
    <div className={`px-4 py-3 border-2 rounded-none ${cls} text-center`}>
      <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide">{label}</p>

      {/* E-signature image (fixed area — keeps all four boxes aligned) */}
      <div className="mt-2 h-14 flex items-center justify-center">
        {done && sig ? (
          <img src={sig} alt={`${label} signature`} className="max-h-14 max-w-full object-contain" />
        ) : (
          <span className="text-[10px] text-neutral-300 italic">—</span>
        )}
      </div>

      <div className={`mt-2 flex items-center justify-center gap-1 text-[10px] font-bold ${badgeCls}`}>
        {icon} {badgeText}
      </div>
    </div>
  )
}
