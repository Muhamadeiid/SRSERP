import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { Loader2, ArrowLeft, ClipboardCheck, Printer } from 'lucide-react'
import { getIgi, updateIgi, IGI_STATUS_LABELS, IGI_STATUS_STYLES } from '../services/igiService'
import { generateIGI } from '../utils/generateIGI'

const fmtShort = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const BOOL_BADGE = {
  true:  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-50 text-green-700 border border-green-200">Y</span>,
  false: <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">N</span>,
  null:  <span className="text-neutral-300">—</span>,
}

export default function IgiDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { user } = useSelector(s => s.auth)

  const [igi,     setIgi]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [err,     setErr]     = useState('')
  const [busy,    setBusy]    = useState(false)

  const canEdit = ['admin', 'depot_manager', 'purchasing'].includes(user?.role)

  const load = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const res = await getIgi(id)
      setIgi(res?.data ?? null)
    } catch (e) {
      setErr(e.message || 'Failed to load IGI')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const changeStatus = async (status) => {
    setBusy(true)
    try {
      const res = await updateIgi(id, { status })
      setIgi(res?.data ?? null)
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

  if (err || !igi) return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
        <p className="text-sm font-bold text-red-700">{err || 'IGI not found'}</p>
        <button onClick={() => navigate('/procurement')} className="mt-3 text-xs font-bold text-primary hover:underline">← Back</button>
      </div>
    </div>
  )

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
              <ClipboardCheck className="w-6 h-6 text-primary shrink-0" />
              {igi.igi_number}
            </h1>
            <p className="text-sm text-neutral-400 mt-1">
              PO: <span className="font-semibold text-primary">{igi.po?.po_number}</span>
              <span className="mx-2 opacity-40">·</span>
              PRF: <span className="font-semibold text-primary">{igi.po?.prf?.prf_number}</span>
              <span className="mx-2 opacity-40">·</span>
              Created {fmtShort(igi.created_at)} by {igi.creator?.name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className={`inline-flex items-center px-3 py-1 text-xs font-bold rounded-full border ${IGI_STATUS_STYLES[igi.status]}`}>
            {IGI_STATUS_LABELS[igi.status]}
          </span>
          <button onClick={() => generateIGI(igi)}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-xs font-bold rounded-lg transition-colors">
            <Printer className="w-3.5 h-3.5" /> Print (.docx)
          </button>
        </div>
      </div>

      {/* Info cards */}
      <div className="bg-white rounded-2xl border border-neutral-100 overflow-hidden">
        <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-neutral-100">
          {[
            ['IGI Date',      fmtShort(igi.date)],
            ['Supplier Name', igi.supplier_name || '—'],
            ['PR Number',     igi.po?.prf?.prf_number || '—'],
            ['PO Number',     igi.po?.po_number || '—'],
          ].map(([k, v]) => (
            <div key={k} className="px-5 py-4">
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">{k}</p>
              <p className="text-xs font-semibold text-secondary-700">{v}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-neutral-100 border-t border-neutral-100">
          {[
            ['PO Date',          fmtShort(igi.po?.date)],
            ['Delivery Note No', igi.delivery_note_no || '—'],
            ['Doc No',           'SRS-PRC-P01-F06 Rev.05'],
          ].map(([k, v]) => (
            <div key={k} className="px-5 py-4">
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">{k}</p>
              <p className="text-xs font-semibold text-secondary-700">{v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Items table */}
      <div className="bg-white rounded-2xl border border-neutral-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-neutral-100 bg-neutral-50/50">
          <p className="text-xs font-bold text-secondary-700">Items ({igi.items?.length ?? 0})</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: 900 }}>
            <thead className="bg-neutral-50 border-b border-neutral-100">
              <tr>
                {['#', 'Description of Goods', 'System', 'Batch No / Heat No', 'Qty Received', 'Unit', 'Shelf Life (Yrs)', 'PO?', 'Tech?', 'EHS?', 'Remarks'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-neutral-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {(igi.items ?? []).map(it => (
                <tr key={it.id} className="hover:bg-neutral-50/50">
                  <td className="px-4 py-3 font-bold text-neutral-400">{it.no}</td>
                  <td className="px-4 py-3 font-semibold text-secondary-700">{it.description || '—'}</td>
                  <td className="px-4 py-3 text-neutral-500">{it.system || '—'}</td>
                  <td className="px-4 py-3 text-neutral-500">{it.batch_no || '—'}</td>
                  <td className="px-4 py-3 font-mono text-secondary-700">{it.qty_received ?? '—'}</td>
                  <td className="px-4 py-3 text-neutral-500">{it.unit || '—'}</td>
                  <td className="px-4 py-3 font-mono text-neutral-600">{it.shelf_life ?? '—'}</td>
                  <td className="px-4 py-3">{BOOL_BADGE[String(it.compliant_po)] ?? BOOL_BADGE['null']}</td>
                  <td className="px-4 py-3">{BOOL_BADGE[String(it.compliant_technical)] ?? BOOL_BADGE['null']}</td>
                  <td className="px-4 py-3">{BOOL_BADGE[String(it.compliant_ehs)] ?? BOOL_BADGE['null']}</td>
                  <td className="px-4 py-3 text-neutral-500">{it.remarks || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Photos */}
      {(igi.photos?.length > 0 || igi.photos_notes) && (
        <div className="bg-white rounded-2xl border border-neutral-100 p-5 space-y-4">
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Photos of Goods Received</p>
          {igi.photos?.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {igi.photos.map((src, idx) => (
                <a key={idx} href={src} target="_blank" rel="noreferrer"
                  className="block rounded-xl overflow-hidden border border-neutral-200 bg-neutral-50 aspect-video hover:opacity-90 transition-opacity relative">
                  <img src={src} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                  <span className="absolute bottom-1.5 left-1.5 bg-black/50 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                    {idx + 1}
                  </span>
                </a>
              ))}
            </div>
          )}
          {igi.photos_notes && (
            <p className="text-xs text-secondary-700 whitespace-pre-wrap">{igi.photos_notes}</p>
          )}
        </div>
      )}

      {/* Signatures */}
      <div className="bg-white rounded-2xl border border-neutral-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-neutral-100 bg-neutral-50/50">
          <p className="text-xs font-bold text-secondary-700">Signatures</p>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-6 divide-y md:divide-y-0 md:divide-x divide-neutral-100">
          {[
            ['Requester',        igi.po?.prf?.requester?.name],
            ['Inventory (INV)',   null],
            ['EHS',              null],
            ['Quality Control',  null],
            ['Procurement',      igi.creator?.name],
            ['Management (D.M)', null],
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
      {canEdit && igi.status !== 'approved' && igi.status !== 'rejected' && (
        <div className="bg-white rounded-2xl border border-neutral-100 p-5 flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs font-bold text-secondary-700">Update Status</p>
          <div className="flex gap-2 flex-wrap">
            {igi.status === 'draft' && (
              <button onClick={() => changeStatus('submitted')} disabled={busy}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50">
                Mark as Submitted
              </button>
            )}
            {igi.status === 'submitted' && (
              <button onClick={() => changeStatus('approved')} disabled={busy}
                className="px-4 py-2 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50">
                Mark as Approved
              </button>
            )}
            {igi.status !== 'rejected' && (
              <button onClick={() => changeStatus('rejected')} disabled={busy}
                className="px-4 py-2 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors disabled:opacity-50">
                Reject IGI
              </button>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
