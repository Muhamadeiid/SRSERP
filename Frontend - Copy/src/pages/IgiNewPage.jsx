import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { Loader2, ArrowLeft, ClipboardCheck, Plus, Trash2, ImagePlus, X as XIcon } from 'lucide-react'
import { getPo } from '../services/poService'
import { createIgi } from '../services/igiService'

const fmtShort = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const BOOL_OPTS = [
  { value: '',    label: '—'  },
  { value: 'true',  label: 'Y' },
  { value: 'false', label: 'N' },
]

function BoolSelect({ value, onChange, className = '' }) {
  return (
    <select
      value={value === null || value === undefined ? '' : String(value)}
      onChange={e => onChange(e.target.value === '' ? null : e.target.value === 'true')}
      className={`border border-neutral-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white ${className}`}
    >
      {BOOL_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

const emptyItem = (no = 1) => ({
  no,
  description: '',
  system: '',
  batch_no: '',
  qty_received: '',
  unit: '',
  shelf_life: '',
  compliant_po: null,
  compliant_technical: null,
  compliant_ehs: null,
  remarks: '',
  po_item_id: null,
})

export default function IgiNewPage() {
  const { poId }  = useParams()
  const navigate  = useNavigate()
  const { user }  = useSelector(s => s.auth)

  const [po,      setPo]      = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [err,     setErr]     = useState('')

  const [date,          setDate]          = useState(new Date().toISOString().slice(0, 10))
  const [supplierName,  setSupplierName]  = useState('')
  const [deliveryNoteNo,setDeliveryNoteNo]= useState('')
  const [photosNotes,   setPhotosNotes]   = useState('')
  const [photos,        setPhotos]        = useState([])
  const [items,         setItems]         = useState([emptyItem(1)])
  const fileInputRef = useRef(null)

  // ── Photo helpers ────────────────────────────────────────────────────────
  const readFileAsBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const addPhotos = async (files) => {
    const imgs = await Promise.all(
      Array.from(files)
        .filter(f => f.type.startsWith('image/'))
        .map(readFileAsBase64)
    )
    if (imgs.length) setPhotos(prev => [...prev, ...imgs])
  }

  const handleFileChange = (e) => addPhotos(e.target.files)

  const handlePaste = async (e) => {
    const items = Array.from(e.clipboardData?.items ?? [])
    const imageItems = items.filter(i => i.type.startsWith('image/'))
    if (imageItems.length === 0) return
    e.preventDefault()
    const files = imageItems.map(i => i.getAsFile()).filter(Boolean)
    await addPhotos(files)
  }

  const removePhoto = (idx) => setPhotos(prev => prev.filter((_, i) => i !== idx))

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setErr('')
      const res = await getPo(poId)
      const p   = res?.data ?? null
      setPo(p)
      if (p) {
        setSupplierName(p.vendor ?? '')
        // Pre-fill items from PO items
        if (p.items?.length) {
          setItems(p.items.map((it, i) => ({
            ...emptyItem(i + 1),
            description: it.item_description ?? '',
            qty_received: it.qty ?? '',
            unit: it.unit ?? '',
            po_item_id: it.id,
          })))
        }
      }
    } catch (e) {
      setErr(e.message || 'Failed to load PO')
    } finally {
      setLoading(false)
    }
  }, [poId])

  useEffect(() => { load() }, [load])

  const updateItem = (idx, field, value) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))

  const addItem = () =>
    setItems(prev => [...prev, emptyItem(prev.length + 1)])

  const removeItem = (idx) =>
    setItems(prev => prev.filter((_, i) => i !== idx).map((it, i) => ({ ...it, no: i + 1 })))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErr('')
    try {
      const payload = {
        po_id:           parseInt(poId),
        date,
        supplier_name:   supplierName,
        delivery_note_no: deliveryNoteNo || null,
        photos_notes:    photosNotes || null,
        photos:          photos.length ? photos : [],
        items: items.map(it => ({
          po_item_id:          it.po_item_id ?? null,
          description:         it.description || null,
          system:              it.system || null,
          batch_no:            it.batch_no || null,
          qty_received:        it.qty_received !== '' ? parseFloat(it.qty_received) : null,
          unit:                it.unit || null,
          shelf_life:          it.shelf_life !== '' ? parseFloat(it.shelf_life) : null,
          compliant_po:        it.compliant_po,
          compliant_technical: it.compliant_technical,
          compliant_ehs:       it.compliant_ehs,
          remarks:             it.remarks || null,
        })),
      }
      const res = await createIgi(payload)
      navigate(`/procurement/igi/${res.data.id}`)
    } catch (e) {
      setErr(e.message || 'Failed to create IGI')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  )

  if (err && !po) return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
        <p className="text-sm font-bold text-red-700">{err}</p>
        <button onClick={() => navigate(-1)} className="mt-3 text-xs font-bold text-primary hover:underline">← Back</button>
      </div>
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="p-4 sm:p-6 lg:p-7 space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)}
          className="p-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-neutral-400 transition-colors shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-2xl sm:text-[28px] font-extrabold text-secondary-700 leading-tight flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-primary shrink-0" />
            New IGI
          </h1>
          <p className="text-sm text-neutral-400 mt-0.5">
            PO: <span className="font-semibold text-primary">{po?.po_number}</span>
            <span className="mx-2 opacity-40">·</span>
            PRF: <span className="font-semibold text-primary">{po?.prf?.prf_number}</span>
          </p>
        </div>
      </div>

      {/* Error */}
      {err && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-red-700">{err}</p>
        </div>
      )}

      {/* Header info */}
      <div className="bg-white rounded-2xl border border-neutral-100 p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">IGI Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Supplier Name</label>
          <input type="text" value={supplierName} onChange={e => setSupplierName(e.target.value)}
            placeholder={po?.vendor ?? ''}
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Delivery Note No.</label>
          <input type="text" value={deliveryNoteNo} onChange={e => setDeliveryNoteNo(e.target.value)}
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Reference Info</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ['PR Number',  po?.prf?.prf_number],
              ['PO Number',  po?.po_number],
              ['PO Date',    fmtShort(po?.date)],
              ['PO Vendor',  po?.vendor],
            ].map(([k, v]) => (
              <div key={k} className="bg-neutral-50 rounded-xl px-3 py-2.5">
                <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">{k}</p>
                <p className="text-xs font-semibold text-secondary-700 mt-0.5">{v || '—'}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="bg-white rounded-2xl border border-neutral-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-neutral-100 bg-neutral-50/50 flex items-center justify-between">
          <p className="text-xs font-bold text-secondary-700">Items ({items.length})</p>
          <button type="button" onClick={addItem}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-bold rounded-lg transition-colors">
            <Plus className="w-3 h-3" /> Add Row
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: 1100 }}>
            <thead className="bg-neutral-50 border-b border-neutral-100">
              <tr>
                {['#', 'Description of Goods', 'System', 'Batch No / Heat No', 'Qty Received', 'Unit', 'Shelf Life (Yrs)', 'PO?', 'Tech?', 'EHS?', 'Remarks', ''].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold text-neutral-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {items.map((it, idx) => (
                <tr key={idx} className="hover:bg-neutral-50/50">
                  <td className="px-3 py-2 text-neutral-400 font-bold w-8">{it.no}</td>
                  <td className="px-3 py-2 w-52">
                    <input value={it.description} onChange={e => updateItem(idx, 'description', e.target.value)}
                      className="w-full border border-neutral-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                  </td>
                  <td className="px-3 py-2 w-28">
                    <input value={it.system} onChange={e => updateItem(idx, 'system', e.target.value)}
                      className="w-full border border-neutral-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                  </td>
                  <td className="px-3 py-2 w-36">
                    <input value={it.batch_no} onChange={e => updateItem(idx, 'batch_no', e.target.value)}
                      className="w-full border border-neutral-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                  </td>
                  <td className="px-3 py-2 w-24">
                    <input type="number" min="0" step="any" value={it.qty_received} onChange={e => updateItem(idx, 'qty_received', e.target.value)}
                      className="w-full border border-neutral-200 rounded-lg px-2 py-1.5 text-xs text-right font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                  </td>
                  <td className="px-3 py-2 w-20">
                    <input value={it.unit} onChange={e => updateItem(idx, 'unit', e.target.value)}
                      className="w-full border border-neutral-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                  </td>
                  <td className="px-3 py-2 w-24">
                    <input type="number" min="0" step="any" value={it.shelf_life} onChange={e => updateItem(idx, 'shelf_life', e.target.value)}
                      className="w-full border border-neutral-200 rounded-lg px-2 py-1.5 text-xs text-right font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                  </td>
                  <td className="px-3 py-2 w-16">
                    <BoolSelect value={it.compliant_po} onChange={v => updateItem(idx, 'compliant_po', v)} className="w-full" />
                  </td>
                  <td className="px-3 py-2 w-16">
                    <BoolSelect value={it.compliant_technical} onChange={v => updateItem(idx, 'compliant_technical', v)} className="w-full" />
                  </td>
                  <td className="px-3 py-2 w-16">
                    <BoolSelect value={it.compliant_ehs} onChange={v => updateItem(idx, 'compliant_ehs', v)} className="w-full" />
                  </td>
                  <td className="px-3 py-2 w-36">
                    <input value={it.remarks} onChange={e => updateItem(idx, 'remarks', e.target.value)}
                      className="w-full border border-neutral-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                  </td>
                  <td className="px-3 py-2 w-8">
                    {items.length > 1 && (
                      <button type="button" onClick={() => removeItem(idx)}
                        className="p-1 text-red-400 hover:text-red-600 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Photos section */}
      <div
        className="bg-white rounded-2xl border border-neutral-100 p-5 space-y-4"
        onPaste={handlePaste}
      >
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Photos of Goods Received</label>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-neutral-400">or paste (Ctrl+V) anywhere in this box</span>
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-bold rounded-lg transition-colors">
              <ImagePlus className="w-3.5 h-3.5" /> Upload
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
              onChange={handleFileChange} />
          </div>
        </div>

        {/* Photo thumbnails */}
        {photos.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {photos.map((src, idx) => (
              <div key={idx} className="relative group rounded-xl overflow-hidden border border-neutral-200 bg-neutral-50 aspect-video">
                <img src={src} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                <button type="button" onClick={() => removePhoto(idx)}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow">
                  <XIcon className="w-3 h-3" />
                </button>
                <span className="absolute bottom-1.5 left-1.5 bg-black/50 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                  {idx + 1}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="border-2 border-dashed border-neutral-200 rounded-xl py-8 text-center text-neutral-300">
            <ImagePlus className="w-8 h-8 mx-auto mb-2" />
            <p className="text-xs">Upload or paste images here</p>
          </div>
        )}

        <div>
          <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Notes</label>
          <textarea value={photosNotes} onChange={e => setPhotosNotes(e.target.value)} rows={2}
            placeholder="Describe condition of received goods…"
            className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none" />
        </div>
      </div>

      {/* Signatures preview */}
      <div className="bg-white rounded-2xl border border-neutral-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-neutral-100 bg-neutral-50/50">
          <p className="text-xs font-bold text-secondary-700">Signatures</p>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-6 divide-y md:divide-y-0 md:divide-x divide-neutral-100">
          {['Requester', 'Inventory (INV)', 'EHS', 'Quality Control', 'Procurement', 'Management (D.M)'].map(label => (
            <div key={label} className="px-4 py-5 text-center">
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2">{label}</p>
              <div className="h-10 border-b border-dashed border-neutral-200 mx-2 mb-1" />
              <p className="text-[10px] text-neutral-300">Signature &amp; Date</p>
            </div>
          ))}
        </div>
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={() => navigate(-1)}
          className="px-5 py-2.5 text-xs font-bold text-neutral-600 bg-white border border-neutral-200 hover:bg-neutral-50 rounded-xl transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary/90 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-60">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ClipboardCheck className="w-3.5 h-3.5" />}
          {saving ? 'Creating…' : 'Create IGI'}
        </button>
      </div>

    </form>
  )
}
