import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { Loader2, ArrowLeft, FileText, Printer, ClipboardCheck, Pencil, Check, X, FileSpreadsheet } from 'lucide-react'
import { getPo, updatePo, PO_STATUS_LABELS, PO_STATUS_STYLES } from '../services/poService'
import { generatePO } from '../utils/generatePO'
import { generatePO_Excel } from '../utils/generatePO_Excel'
import { IGI_STATUS_LABELS, IGI_STATUS_STYLES } from '../services/igiService'

const fmt      = (n) => (n == null ? '—' : Number(n).toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const fmtShort = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const STATUS_FLOW = ['draft', 'issued', 'received', 'cancelled']

export default function PoDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { user } = useSelector(s => s.auth)

  const [po,          setPo]          = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [err,         setErr]         = useState('')
  const [busy,        setBusy]        = useState(false)
  const [editingNo,   setEditingNo]   = useState(false)
  const [poNoDraft,   setPoNoDraft]   = useState('')
  const [savingNo,    setSavingNo]    = useState(false)

  const canEdit       = ['admin', 'depot_manager', 'purchasing'].includes(user?.role)
  const hasLinkedIgi  = !!po?.igi
  const canCreateIgi  = canEdit && po?.status !== 'cancelled' && !hasLinkedIgi

  const load = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const res = await getPo(id)
      setPo(res?.data ?? null)
    } catch (e) {
      setErr(e.message || 'Failed to load PO')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const startEditNo = () => {
    setPoNoDraft(po.po_number ?? '')
    setEditingNo(true)
  }

  const savePoNumber = async () => {
    if (!poNoDraft.trim() || poNoDraft.trim() === po.po_number) { setEditingNo(false); return }
    setSavingNo(true)
    try {
      const res = await updatePo(id, { po_number: poNoDraft.trim() })
      setPo(res?.data ?? null)
      setEditingNo(false)
    } catch (e) {
      alert(e.message)
    } finally {
      setSavingNo(false)
    }
  }

  const changeStatus = async (status) => {
    setBusy(true)
    try {
      const res = await updatePo(id, { status })
      setPo(res?.data ?? null)
    } catch (e) {
      alert(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  )

  if (err || !po) return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
        <p className="text-sm font-bold text-red-700">{err || 'PO not found'}</p>
        <button onClick={() => navigate('/procurement')} className="mt-3 text-xs font-bold text-primary hover:underline">← Back</button>
      </div>
    </div>
  )

  const subtotal       = (po.items ?? []).reduce((s, it) => s + (it.total ?? 0), 0)
  const grandTotal     = subtotal + (po.tax ?? 0) - (po.withholding_tax ?? 0)

  return (
    <div className="p-4 sm:p-6 lg:p-7 space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate(-1)}
            className="p-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-neutral-400 transition-colors shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl sm:text-[28px] font-extrabold text-secondary-700 leading-tight flex items-center gap-2">
              <FileText className="w-6 h-6 text-primary shrink-0" />
              {editingNo ? (
                <span className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={poNoDraft}
                    onChange={e => setPoNoDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') savePoNumber(); if (e.key === 'Escape') setEditingNo(false) }}
                    className="text-base font-bold border border-primary rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/30 w-52"
                  />
                  <button onClick={savePoNumber} disabled={savingNo}
                    className="p-1.5 rounded-lg bg-green-50 hover:bg-green-100 text-green-600 border border-green-200 transition-colors disabled:opacity-50">
                    {savingNo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => setEditingNo(false)} disabled={savingNo}
                    className="p-1.5 rounded-lg bg-neutral-50 hover:bg-neutral-100 text-neutral-500 border border-neutral-200 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  {po.po_number}
                  {canEdit && (
                    <button onClick={startEditNo}
                      className="p-1 rounded-md text-neutral-300 hover:text-primary hover:bg-primary/10 transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </span>
              )}
            </h1>
            <p className="text-sm text-neutral-400 mt-1">
              PRF: <span className="font-semibold text-primary">{po.prf?.prf_number}</span>
              <span className="mx-2 opacity-40">·</span>
              Created {fmtShort(po.created_at)} by {po.creator?.name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <span className={`inline-flex items-center px-3 py-1 text-xs font-bold rounded-full border ${PO_STATUS_STYLES[po.status]}`}>
            {PO_STATUS_LABELS[po.status]}
          </span>
          {hasLinkedIgi && (
            <button onClick={() => navigate(`/procurement/igi/${po.igi.id}`)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors ${IGI_STATUS_STYLES[po.igi.status]}`}>
              <ClipboardCheck className="w-3.5 h-3.5" />
              IGI: {IGI_STATUS_LABELS[po.igi.status]}
            </button>
          )}
          {canCreateIgi && (
            <button onClick={() => navigate(`/procurement/igi/new/${po.id}`)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary-700 hover:bg-secondary-700/90 text-white text-xs font-bold rounded-lg transition-colors">
              <ClipboardCheck className="w-3.5 h-3.5" /> Create IGI
            </button>
          )}
          <button onClick={() => generatePO_Excel(po)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg transition-colors">
            <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
          </button>
          <button onClick={() => generatePO(po)}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-xs font-bold rounded-lg transition-colors">
            <Printer className="w-3.5 h-3.5" /> Word (.docx)
          </button>
        </div>
      </div>

      {/* Info cards */}
      <div className="bg-white rounded-2xl border border-neutral-100 overflow-hidden">
        <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-neutral-100">
          {[
            ['Date',     fmtShort(po.date)],
            ['Category', po.category || '—'],
            ['Vendor',   po.vendor   || '—'],
            ['Ship To',  'Rotem SRS — 250 ST-Degla'],
          ].map(([k, v]) => (
            <div key={k} className="px-5 py-4">
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">{k}</p>
              <p className="text-xs font-semibold text-secondary-700">{v}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-neutral-100 border-t border-neutral-100">
          {[
            ['Delivery Terms',   po.delivery_terms   || '—'],
            ['Delivery Period',  po.delivery_period  || '—'],
            ['Payment Terms',    po.payment_terms    || '—'],
            ['Receipt Location', po.receipt_location || '—'],
          ].map(([k, v]) => (
            <div key={k} className="px-5 py-4">
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">{k}</p>
              <p className="text-xs font-semibold text-secondary-700">{v}</p>
            </div>
          ))}
        </div>
        {po.comments && (
          <div className="px-5 py-4 border-t border-neutral-100 bg-neutral-50/50">
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Comments</p>
            <p className="text-xs text-secondary-700">{po.comments}</p>
          </div>
        )}
      </div>

      {/* Items table */}
      <div className="bg-white rounded-2xl border border-neutral-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-neutral-100 bg-neutral-50/50 flex items-center justify-between">
          <p className="text-xs font-bold text-secondary-700">Items ({po.items?.length ?? 0})</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: 700 }}>
            <thead className="bg-neutral-50 border-b border-neutral-100">
              <tr>
                {['NO', 'Item Description', 'Stock', 'Avg Con', 'QTY', 'Unit', 'Unit Price', 'Total', 'Remark'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-neutral-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {(po.items ?? []).map(it => (
                <tr key={it.id} className="hover:bg-neutral-50/50">
                  <td className="px-4 py-3 font-bold text-neutral-400">{it.no}</td>
                  <td className="px-4 py-3 font-semibold text-secondary-700">{it.item_description}</td>
                  <td className="px-4 py-3 text-neutral-500">{it.stock || '—'}</td>
                  <td className="px-4 py-3 text-neutral-500">{it.average_con || '—'}</td>
                  <td className="px-4 py-3 font-mono text-secondary-700">{it.qty}</td>
                  <td className="px-4 py-3 text-neutral-500">{it.unit}</td>
                  <td className="px-4 py-3 text-right text-neutral-600">EGP {fmt(it.unit_price)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-secondary-700">EGP {fmt(it.total)}</td>
                  <td className="px-4 py-3 text-neutral-500">{it.remark || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="border-t border-neutral-100 px-5 py-4 flex justify-end">
          <div className="space-y-1.5 min-w-[240px] text-xs">
            <div className="flex justify-between">
              <span className="text-neutral-500">Subtotal</span>
              <span className="font-semibold text-secondary-700">EGP {fmt(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">TAX</span>
              <span className="text-neutral-600">EGP {fmt(po.tax)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Withholding Tax</span>
              <span className="text-neutral-600">EGP {fmt(po.withholding_tax)}</span>
            </div>
            <div className="flex justify-between text-sm font-extrabold border-t border-neutral-200 pt-2">
              <span className="text-secondary-700">TOTAL</span>
              <span className="text-primary">EGP {fmt(grandTotal)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Signatures */}
      <div className="bg-white rounded-2xl border border-neutral-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-neutral-100 bg-neutral-50/50">
          <p className="text-xs font-bold text-secondary-700">Signatures</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-neutral-100">
          {[
            ['Requester',        po.prf?.requester?.name],
            ['Procurement',      po.creator?.name],
            ['Logistics Manager', null],
            ['Depot Manager',    null],
            ['MD',               null],
          ].map(([label, name]) => (
            <div key={label} className="px-4 py-6 text-center">
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2">{label}</p>
              <div className="h-12 flex items-end justify-center border-b border-dashed border-neutral-200 mx-4 mb-2">
                {name && <p className="text-[10px] text-neutral-400 pb-1">{name}</p>}
              </div>
              <p className="text-[10px] text-neutral-300">Signature &amp; Date</p>
            </div>
          ))}
        </div>
      </div>

      {/* Status actions */}
      {canEdit && po.status !== 'cancelled' && po.status !== 'received' && (
        <div className="bg-white rounded-2xl border border-neutral-100 p-5 flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs font-bold text-secondary-700">Update Status</p>
          <div className="flex gap-2 flex-wrap">
            {po.status === 'draft' && (
              <button onClick={() => changeStatus('issued')} disabled={busy}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50">
                Mark as Issued
              </button>
            )}
            {po.status === 'issued' && (
              <button onClick={() => changeStatus('received')} disabled={busy}
                className="px-4 py-2 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50">
                Mark as Received
              </button>
            )}
            <button onClick={() => changeStatus('cancelled')} disabled={busy}
              className="px-4 py-2 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors disabled:opacity-50">
              Cancel PO
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
