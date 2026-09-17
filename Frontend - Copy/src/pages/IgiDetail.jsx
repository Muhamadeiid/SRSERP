import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { Loader2, ArrowLeft, ClipboardCheck, Printer, X } from 'lucide-react'
import { decideIgi, getIgi, submitIgiApproval, updateIgi, IGI_STATUS_LABELS, IGI_STATUS_STYLES } from '../services/igiService'
import { createRejectedGood } from '../services/procurementRegistryService'

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
  const [rejectForm, setRejectForm] = useState(null)

  const canEdit = ['admin', 'depot_manager', 'procurement', 'purchasing'].includes(user?.role)

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

  const submitApproval = async () => { setBusy(true); try { const res=await submitIgiApproval(id); setIgi(res?.data??null) } catch(e){alert(e.message)} finally{setBusy(false)} }
  const decideApproval = async action => { setBusy(true); try { const res=await decideIgi(id,{action}); setIgi(res?.data??null) } catch(e){alert(e.message)} finally{setBusy(false)} }

  const handlePrint = async () => {
    const { generateIGI } = await import('../utils/generateIGI')
    return generateIGI(igi)
  }

  const saveRejection = async e => {
    e.preventDefault(); setBusy(true)
    try {
      await createRejectedGood({
        igi_id: Number(id), delivery_date: igi.date, item_description: rejectForm.item_description,
        part_number: rejectForm.part_number || null, quantity_affected: Number(rejectForm.quantity_affected),
        rejecting_date: new Date().toISOString().slice(0,10), reason: rejectForm.reason,
      })
      const res=await updateIgi(id,{status:'rejected'}); setIgi(res?.data ?? null); setRejectForm(null)
    } catch(e2){ alert(e2.message) } finally { setBusy(false) }
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
          <span className="inline-flex items-center px-3 py-1 text-xs font-bold rounded-full border bg-amber-50 text-amber-700 border-amber-200 capitalize">Approval: {(igi.approval_status||'draft').replaceAll('_',' ')}</span>
          <button onClick={handlePrint}
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
            ['Requester','requester'],['Inventory (INV)','inventory'],['EHS','ehs'],['Quality Control','quality_control'],['Procurement','procurement'],['Management (D.M)','management'],
          ].map(([label, stage]) => { const a=igi.approvals?.find(x=>x.stage===stage&&x.action==='approve'); return (
            <div key={label} className="px-4 py-6 text-center">
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2">{label}</p>
              <div className="h-14 flex items-center justify-center mx-2 mb-1">{a?.approver?.e_signature&&<img src={a.approver.e_signature} alt={`${label} signature`} className="max-w-full max-h-full object-contain"/>}</div><p className="text-[10px] text-neutral-500 truncate">{a?.approver?.name||'Pending'}</p><p className="text-[10px] text-neutral-300">{fmtShort(a?.acted_at)}</p>
            </div>
          )})}
        </div>
      </div>

      {/* Status actions */}
      {user && igi.status !== 'approved' && igi.status !== 'rejected' && (
        <div className="bg-white rounded-2xl border border-neutral-100 p-5 flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs font-bold text-secondary-700">Update Status</p>
          <div className="flex gap-2 flex-wrap">
            {canEdit && igi.approval_status === 'draft' && (
              <button onClick={submitApproval} disabled={busy}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50">
                Submit Signature Cycle
              </button>
            )}
            {(() => { const d=(user?.department||'').toLowerCase(); const allowed=(igi.approval_status==='pending_requester'&&igi.po?.prf?.requester?.id===user?.id)||(igi.approval_status==='pending_inventory'&&(user?.role==='store_staff'||d.includes('inventory')||d.includes('store')))||(igi.approval_status==='pending_ehs'&&user?.role==='ehs')||(igi.approval_status==='pending_quality'&&(d.includes('quality')||d==='qc'))||(igi.approval_status==='pending_procurement'&&['procurement','purchasing'].includes(user?.role))||(igi.approval_status==='pending_management'&&user?.role==='depot_manager')||user?.role==='admin'; return allowed&&igi.approval_status?.startsWith('pending_') ? <><button onClick={()=>decideApproval('approve')} disabled={busy} className="px-4 py-2 text-xs font-bold text-white bg-green-600 rounded-lg">Approve & Sign</button><button onClick={()=>decideApproval('reject')} disabled={busy} className="px-4 py-2 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg">Reject Stage</button></>:null })()}
            {canEdit && igi.status !== 'rejected' && (
              <button onClick={() => { const item=(igi.items||[]).find(x=>x.compliant_po===false||x.compliant_technical===false||x.compliant_ehs===false) || (igi.items||[])[0]; setRejectForm({item_description:item?.description||'',part_number:item?.batch_no||'',quantity_affected:item?.qty_received||'',reason:item?.remarks||''}) }} disabled={busy}
                className="px-4 py-2 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors disabled:opacity-50">
                Reject IGI
              </button>
            )}
          </div>
        </div>
      )}

      {rejectForm && <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4"><form onSubmit={saveRejection} className="bg-white rounded-2xl p-6 w-full max-w-xl space-y-4"><div className="flex justify-between"><div><h2 className="font-extrabold text-secondary-700">Rejected Goods Form</h2><p className="text-xs text-neutral-400">SRS-PRC-P01-F08</p></div><button type="button" onClick={()=>setRejectForm(null)}><X/></button></div><select value={rejectForm.item_description} onChange={e=>{const item=(igi.items||[]).find(x=>x.description===e.target.value);setRejectForm({...rejectForm,item_description:e.target.value,part_number:item?.batch_no||'',quantity_affected:item?.qty_received||'',reason:item?.remarks||''})}} className="w-full border rounded-lg px-3 py-2 text-sm">{(igi.items||[]).map(x=><option key={x.id}>{x.description}</option>)}</select><div className="grid grid-cols-2 gap-3"><input value={rejectForm.part_number} onChange={e=>setRejectForm({...rejectForm,part_number:e.target.value})} placeholder="Part / Batch number" className="border rounded-lg px-3 py-2 text-sm"/><input required type="number" step="any" min="0.001" value={rejectForm.quantity_affected} onChange={e=>setRejectForm({...rejectForm,quantity_affected:e.target.value})} placeholder="Quantity affected" className="border rounded-lg px-3 py-2 text-sm"/></div><textarea required value={rejectForm.reason} onChange={e=>setRejectForm({...rejectForm,reason:e.target.value})} rows={6} placeholder="Reason for rejecting the goods" className="w-full border rounded-lg p-3 text-sm"/><button disabled={busy} className="w-full py-3 bg-red-600 text-white rounded-xl font-bold">Reject and Create F08</button></form></div>}

    </div>
  )
}
