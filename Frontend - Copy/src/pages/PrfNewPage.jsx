import { useState } from 'react'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Trash2, Loader2, CheckCircle, X, FileText, Image as ImageIcon, Upload, Pencil,
  ChevronDown, ChevronUp, Zap,
} from 'lucide-react'
import { createPrf, MATERIAL_CATEGORIES } from '../services/prfService'
import { PRF_TEMPLATES } from '../utils/prfTemplates'

const today = () => new Date().toISOString().slice(0, 10)
const INPUT = 'w-full px-3 py-2 text-sm bg-white border border-neutral-200 rounded-lg outline-none focus:border-primary transition-colors'

const EMPTY_ITEM = {
  description: '',
  technical_specifications: '',
  quantity: '',
  unit: 'pcs',
  ehs_requirements: '',
  required_by_date: '',
}

export default function PrfNewPage() {
  const { user } = useSelector(s => s.auth)
  const navigate = useNavigate()

  const canSetPrfNumber = user?.role === 'admin' || user?.role === 'procurement'

  const [form, setForm] = useState({
    prf_number: '',
    date: today(),
    delivery_location: '',
    delivery_contact:  '',
    requester_phone:   '',
    requester_email:   user?.email ?? '',
    notes: '',
    notes_image: '',                                // base64 data-URI (optional)
    material_category: [],
    items: [ { ...EMPTY_ITEM }, { ...EMPTY_ITEM }, { ...EMPTY_ITEM } ],   // start with 3 rows
  })
  const [saving, setSaving]         = useState(false)
  const [submitted, setSubmitted]   = useState(null)
  const [err, setErr]               = useState('')
  const [templatesOpen, setTemplatesOpen] = useState(true)
  const [addedTemplates, setAddedTemplates] = useState(new Set())

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const addTemplateItem = (tpl) => {
    const key = tpl.description
    setForm(f => {
      // Replace the first fully-empty row, otherwise append
      const emptyIdx = f.items.findIndex(it => !it.description.trim())
      const newItem = { ...EMPTY_ITEM, ...tpl, quantity: String(tpl.quantity) }
      const items = emptyIdx >= 0
        ? f.items.map((it, i) => i === emptyIdx ? newItem : it)
        : [...f.items, newItem]
      return { ...f, items }
    })
    setAddedTemplates(prev => new Set(prev).add(key))
  }

  const toggleCat = (cat) =>
    setForm(f => ({
      ...f,
      material_category: f.material_category.includes(cat)
        ? f.material_category.filter(c => c !== cat)
        : [...f.material_category, cat],
    }))

  const updateItem = (idx, k, v) => setForm(f => ({
    ...f,
    items: f.items.map((it, i) => i === idx ? { ...it, [k]: v } : it),
  }))

  const addRow    = ()   => setForm(f => ({ ...f, items: [...f.items, { ...EMPTY_ITEM }] }))
  const removeRow = (i)  => setForm(f => ({
    ...f,
    items: f.items.length > 1 ? f.items.filter((_, idx) => idx !== i) : f.items,
  }))

  // ── Notes image upload (file → base64 data-URI) ─────────────────────────
  const handleNotesImage = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG / JPG)')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      alert('Image must be smaller than 2MB')
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => set('notes_image', ev.target.result)
    reader.readAsDataURL(file)
  }

  const submit = async (e) => {
    e.preventDefault()
    setErr('')

    // Trim empty rows (any row whose description is blank)
    const items = form.items
      .filter(it => (it.description || '').trim() !== '')
      .map(it => ({
        ...it,
        quantity: parseFloat(it.quantity) || 0,
      }))

    if (items.length === 0) {
      setErr('Please add at least one item with a description')
      return
    }

    setSaving(true)
    try {
      const payload = { ...form, items }
      if (!payload.prf_number?.trim()) delete payload.prf_number
      const res = await createPrf(payload)
      setSubmitted(res?.data ?? null)
      setTimeout(() => {
        navigate(`/procurement/${res?.data?.id}`)
      }, 900)
    } catch (e2) {
      setErr(e2.message || 'Failed to submit PRF')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-secondary-700 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            New Purchase Request
          </h1>
          <p className="text-sm text-neutral-400 mt-0.5">Submit a new PRF for procurement approval</p>
        </div>
        <button onClick={() => navigate(-1)}
          className="px-4 py-2 text-xs font-bold text-neutral-500 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-all">
          ← Back
        </button>
      </div>

      <form onSubmit={submit} className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">

        {/* ── Top row: PRF Number | Date | Requested By  (matches PDF) ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-neutral-200 border-b-2 border-neutral-200">
          <div className="px-4 py-3">
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide mb-1">PRF Number</p>
            {canSetPrfNumber ? (
              <div className="relative">
                <Pencil className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-400 pointer-events-none" />
                <input
                  value={form.prf_number}
                  onChange={e => set('prf_number', e.target.value)}
                  placeholder="Auto-generated if blank"
                  className="w-full pl-7 pr-3 py-2 text-sm bg-white border border-neutral-200 rounded-lg outline-none focus:border-primary transition-colors"
                />
              </div>
            ) : (
              <p className="text-sm font-bold text-neutral-400 italic">Auto-generated</p>
            )}
          </div>
          <div className="px-4 py-3">
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide mb-1">Date</p>
            <input type="date" value={form.date} onChange={e => set('date', e.target.value)} className={INPUT} />
          </div>
          <div className="px-4 py-3">
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide mb-1">Requested By</p>
            <p className="text-sm font-bold text-secondary-700">{user?.name ?? '—'}</p>
            <p className="text-[10px] text-neutral-400 capitalize">{user?.role?.replace('_', ' ')}</p>
          </div>
        </div>

        {/* ── Material Category (8 options, 2 columns × 4 rows — matches PDF) ── */}
        <div className="px-4 py-4 border-b-2 border-neutral-200">
          <p className="text-xs font-bold text-secondary-700 mb-3">Material Category:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            {MATERIAL_CATEGORIES.map(cat => (
              <label key={cat}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-all ${
                  form.material_category.includes(cat)
                    ? 'bg-primary/10 border-primary text-primary font-bold'
                    : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                }`}>
                <input type="checkbox" checked={form.material_category.includes(cat)}
                  onChange={() => toggleCat(cat)} className="w-3.5 h-3.5 accent-primary" />
                {cat}{cat === 'Others' ? ': ………………' : ''}
              </label>
            ))}
          </div>
        </div>

        {/* ── Quick Add Templates (appears when categories are selected) ── */}
        {form.material_category.filter(c => PRF_TEMPLATES[c]).length > 0 && (
          <div className="border-b-2 border-neutral-200 bg-emerald-50/60">
            <button
              type="button"
              onClick={() => setTemplatesOpen(o => !o)}
              className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-emerald-100/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-xs font-bold text-emerald-800">Quick Add — Common Items</span>
                <span className="text-[10px] text-emerald-600 font-medium">
                  Click any item to add it to the form instantly
                </span>
              </div>
              {templatesOpen
                ? <ChevronUp className="w-4 h-4 text-emerald-600" />
                : <ChevronDown className="w-4 h-4 text-emerald-600" />}
            </button>

            {templatesOpen && (
              <div className="px-4 pb-4 space-y-4">
                {form.material_category.filter(c => PRF_TEMPLATES[c]).map(cat => (
                  <div key={cat}>
                    <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-2">{cat}</p>
                    <div className="flex flex-wrap gap-2">
                      {PRF_TEMPLATES[cat].map(tpl => {
                        const added = addedTemplates.has(tpl.description)
                        return (
                          <button
                            key={tpl.description}
                            type="button"
                            onClick={() => !added && addTemplateItem(tpl)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                              added
                                ? 'bg-green-50 border-green-300 text-green-700 cursor-default'
                                : 'bg-white border-neutral-200 text-neutral-700 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-800 cursor-pointer'
                            }`}
                          >
                            {added
                              ? <CheckCircle className="w-3 h-3 text-green-500 shrink-0" />
                              : <Plus className="w-3 h-3 shrink-0" />}
                            {tpl.description}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Material Detail / Items table ── */}
        <div className="border-b-2 border-neutral-200">
          <div className="px-4 py-3 flex items-center justify-between bg-emerald-50">
            <p className="text-xs font-bold text-secondary-700">Material Detail:</p>
            <button type="button" onClick={addRow}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-primary bg-white hover:bg-primary/10 border border-primary/30 rounded-lg transition-all">
              <Plus className="w-3.5 h-3.5" /> Add Row
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[1100px]">
              <thead>
                <tr className="bg-emerald-200/60">
                  <th className="px-2 py-2 text-center text-[10px] font-bold text-emerald-900 w-12 border border-emerald-300">S/N</th>
                  <th className="px-2 py-2 text-center text-[10px] font-bold text-emerald-900 border border-emerald-300">Description</th>
                  <th className="px-2 py-2 text-center text-[10px] font-bold text-emerald-900 border border-emerald-300">Technical Specifications</th>
                  <th className="px-2 py-2 text-center text-[10px] font-bold text-emerald-900 w-20 border border-emerald-300">Quantity</th>
                  <th className="px-2 py-2 text-center text-[10px] font-bold text-emerald-900 w-20 border border-emerald-300">Unit</th>
                  <th className="px-2 py-2 text-center text-[10px] font-bold text-emerald-900 border border-emerald-300">EHS Requirements</th>
                  <th className="px-2 py-2 text-center text-[10px] font-bold text-emerald-900 w-32 border border-emerald-300">Req. By Date</th>
                  <th className="px-1 py-2 text-center text-[10px] font-bold text-emerald-900 w-10 border border-emerald-300"></th>
                </tr>
              </thead>
              <tbody>
                {form.items.map((it, i) => (
                  <tr key={i}>
                    <td className="px-2 py-2 text-center font-bold text-neutral-500 border border-neutral-200">{i + 1}</td>
                    <td className="px-2 py-2 border border-neutral-200"><input value={it.description} onChange={e => updateItem(i, 'description', e.target.value)} placeholder="Item name" className="w-full px-2 py-1 outline-none text-xs" /></td>
                    <td className="px-2 py-2 border border-neutral-200"><input value={it.technical_specifications} onChange={e => updateItem(i, 'technical_specifications', e.target.value)} placeholder="Specs / model" className="w-full px-2 py-1 outline-none text-xs" /></td>
                    <td className="px-2 py-2 border border-neutral-200"><input type="number" min="0" step="0.01" value={it.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} className="w-full px-2 py-1 outline-none text-xs text-center" /></td>
                    <td className="px-2 py-2 border border-neutral-200"><input value={it.unit} onChange={e => updateItem(i, 'unit', e.target.value)} placeholder="pcs" className="w-full px-2 py-1 outline-none text-xs text-center" /></td>
                    <td className="px-2 py-2 border border-neutral-200"><input value={it.ehs_requirements} onChange={e => updateItem(i, 'ehs_requirements', e.target.value)} placeholder="—" className="w-full px-2 py-1 outline-none text-xs" /></td>
                    <td className="px-2 py-2 border border-neutral-200"><input type="date" value={it.required_by_date} onChange={e => updateItem(i, 'required_by_date', e.target.value)} className="w-full px-2 py-1 outline-none text-xs" /></td>
                    <td className="px-1 py-2 text-center border border-neutral-200">
                      <button type="button" onClick={() => removeRow(i)} disabled={form.items.length === 1}
                        className="p-1 rounded text-neutral-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Delivery Information (matches PDF) ── */}
        <div className="border-b-2 border-neutral-200">
          <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-200">
            <p className="text-xs font-bold text-secondary-700">Delivery Information:</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-neutral-200">
            <div className="px-4 py-3">
              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide mb-1">Delivery Location</p>
              <input value={form.delivery_location} onChange={e => set('delivery_location', e.target.value)} placeholder="e.g. Kozzika Depot" className={INPUT} />
            </div>
            <div className="px-4 py-3">
              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide mb-1">Contact</p>
              <input value={form.delivery_contact} onChange={e => set('delivery_contact', e.target.value)} placeholder="e.g. Eslam Tarek" className={INPUT} />
            </div>
          </div>
        </div>

        {/* ── Requester's Contact Information (matches PDF) ── */}
        <div className="border-b-2 border-neutral-200">
          <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-200">
            <p className="text-xs font-bold text-secondary-700">Requester's Contact Information:</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-neutral-200">
            <div className="px-4 py-3">
              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide mb-1">Phone</p>
              <input value={form.requester_phone} onChange={e => set('requester_phone', e.target.value)} placeholder="01x-xxxx-xxxx" className={INPUT} />
            </div>
            <div className="px-4 py-3">
              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide mb-1">Email</p>
              <input type="email" value={form.requester_email} onChange={e => set('requester_email', e.target.value)} className={INPUT} />
            </div>
          </div>
        </div>

        {/* ── Additional Notes (text + optional image) ── */}
        <div className="border-b-2 border-neutral-200">
          <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-200 flex items-center justify-between">
            <p className="text-xs font-bold text-secondary-700">Additional Notes / Instructions:</p>
            {!form.notes_image ? (
              <label className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold text-primary bg-white hover:bg-primary/5 border border-primary/30 rounded-lg cursor-pointer transition-all">
                <Upload className="w-3 h-3" /> Attach Image
                <input type="file" accept="image/*" onChange={handleNotesImage} className="hidden" />
              </label>
            ) : (
              <button type="button" onClick={() => set('notes_image', '')}
                className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold text-red-600 bg-white hover:bg-red-50 border border-red-200 rounded-lg transition-all">
                <X className="w-3 h-3" /> Remove Image
              </button>
            )}
          </div>
          <div className="px-4 py-3 space-y-3">
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
              className={INPUT + ' resize-none'} placeholder="Any additional context or special instructions..." />

            {form.notes_image && (
              <div className="relative inline-block max-w-full">
                <img src={form.notes_image} alt="Notes attachment"
                  className="max-h-64 max-w-full rounded-lg border border-neutral-200 shadow-sm" />
                <div className="mt-1 flex items-center gap-1 text-[10px] text-neutral-400">
                  <ImageIcon className="w-3 h-3" /> Image will be embedded in the printed PRF
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Approval Section ── */}
        <div className="border-b border-neutral-100">
          <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-200">
            <p className="text-xs font-bold text-secondary-700">Approval Section:</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-neutral-200">
            {[
              ['Requester',           user?.name ?? '—'],
              ['Procurement',         'Pending'],
              ['EHS',                 'Pending'],
              ['Depot Manager',       'Pending'],
            ].map(([label, name]) => (
              <div key={label} className="px-4 py-6 text-center">
                <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide mb-3">{label}:</p>
                <p className="text-xs font-semibold text-secondary-700 min-h-[2em]">{name}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Error */}
        {err && (
          <div className="px-4 py-3 bg-red-50 border-t border-red-200 text-xs text-red-700 flex items-center gap-2">
            <X className="w-3.5 h-3.5 shrink-0" /> {err}
          </div>
        )}

        {/* Submit */}
        <div className="px-4 py-4 bg-neutral-50 flex items-center justify-between border-t border-neutral-100">
          <p className="text-[10px] text-neutral-400">
            Doc No: <span className="text-red-500 font-bold">SRS-PRC-P01-F04</span> &nbsp;|&nbsp;
            <span className="text-red-500 font-bold">Rev.: 04</span>
          </p>
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-60">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : 'Submit Request'}
          </button>
        </div>
      </form>

      {submitted && (
        <div className="fixed bottom-6 right-6 z-[60] flex items-start gap-3 bg-white border border-green-200 shadow-2xl rounded-2xl px-5 py-4 max-w-sm">
          <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
            <CheckCircle className="w-5 h-5 text-green-500" />
          </div>
          <div>
            <p className="text-sm font-bold text-secondary-700">PRF Submitted!</p>
            <p className="text-xs text-neutral-400 mt-0.5">{submitted.prf_number} — Awaiting procurement review.</p>
          </div>
        </div>
      )}
    </div>
  )
}
