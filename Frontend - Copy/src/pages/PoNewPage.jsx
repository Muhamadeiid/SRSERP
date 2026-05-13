import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Loader2, Trash2, Plus, CheckCircle, X, ArrowLeft, FileText } from 'lucide-react'
import { getPrf } from '../services/prfService'
import { createPo } from '../services/poService'

const today = () => new Date().toISOString().slice(0, 10)
const INPUT = 'w-full px-3 py-2 text-sm bg-white border border-neutral-200 rounded-lg outline-none focus:border-primary transition-colors'
const fmt   = (n) => (n == null ? '—' : Number(n).toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

export default function PoNewPage() {
  const { prfId } = useParams()
  const navigate  = useNavigate()

  const [prf,       setPrf]       = useState(null)
  const [loadingPrf,setLoadingPrf]= useState(true)
  const [saving,    setSaving]    = useState(false)
  const [submitted, setSubmitted] = useState(null)
  const [err,       setErr]       = useState('')

  const [form, setForm] = useState({
    po_number:        '',
    date:             today(),
    category:         '',
    vendor:           '',
    delivery_terms:   '',
    delivery_period:  'Week',
    payment_terms:    '100% After Received',
    receipt_location: 'Company Warehouse',
    comments:         'Banking Transfer',
    tax:              '',
    withholding_tax:  '',
    items:            [],
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // ── Load PRF and pre-fill items ──────────────────────────────────────────
  const loadPrf = useCallback(async () => {
    setLoadingPrf(true)
    try {
      const res = await getPrf(prfId)
      const data = res?.data
      setPrf(data)
      setForm(f => ({
        ...f,
        category: (data?.material_category ?? []).join(', '),
        items: (data?.items ?? []).map(it => ({
          prf_item_id:      it.id,
          item_description: it.description,
          stock:            '',
          average_con:      '',
          qty:              it.quantity,
          unit:             it.unit ?? 'pcs',
          unit_price:       '',
          remark:           '',
        })),
      }))
    } catch (e) {
      setErr(e.message || 'Failed to load PRF')
    } finally {
      setLoadingPrf(false)
    }
  }, [prfId])

  useEffect(() => { loadPrf() }, [loadPrf])

  // ── Items helpers ────────────────────────────────────────────────────────
  const updateItem = (idx, k, v) =>
    setForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, [k]: v } : it) }))

  const addRow = () =>
    setForm(f => ({
      ...f,
      items: [...f.items, { prf_item_id: null, item_description: '', stock: '', average_con: '', qty: '', unit: 'pcs', unit_price: '', remark: '' }],
    }))

  const removeRow = (i) =>
    setForm(f => ({ ...f, items: f.items.length > 1 ? f.items.filter((_, idx) => idx !== i) : f.items }))

  // ── Totals ───────────────────────────────────────────────────────────────
  const subtotal        = form.items.reduce((s, it) => s + (parseFloat(it.qty) || 0) * (parseFloat(it.unit_price) || 0), 0)
  const taxAmt          = parseFloat(form.tax)             || 0
  const withholdingAmt  = parseFloat(form.withholding_tax) || 0
  const grandTotal      = subtotal + taxAmt - withholdingAmt

  // ── Submit ───────────────────────────────────────────────────────────────
  const submit = async (e) => {
    e.preventDefault()
    setErr('')

    const items = form.items.filter(it => (it.item_description || '').trim())
    if (items.length === 0) { setErr('Add at least one item'); return }

    setSaving(true)
    try {
      const payload = {
        prf_id:           parseInt(prfId),
        po_number:        form.po_number.trim() || undefined,
        date:             form.date,
        category:         form.category,
        vendor:           form.vendor,
        tax:              parseFloat(form.tax)             || 0,
        withholding_tax:  parseFloat(form.withholding_tax) || 0,
        delivery_terms:   form.delivery_terms,
        delivery_period:  form.delivery_period,
        payment_terms:    form.payment_terms,
        receipt_location: form.receipt_location,
        comments:         form.comments,
        items: items.map(it => ({
          prf_item_id:      it.prf_item_id || null,
          item_description: it.item_description,
          stock:            it.stock       || null,
          average_con:      it.average_con || null,
          qty:              parseFloat(it.qty)        || 0,
          unit:             it.unit        || 'pcs',
          unit_price:       it.unit_price !== '' ? parseFloat(it.unit_price) : null,
          remark:           it.remark      || null,
        })),
      }
      const res = await createPo(payload)
      setSubmitted(res?.data ?? null)
      setTimeout(() => navigate(`/procurement/po/${res?.data?.id}`), 900)
    } catch (e2) {
      setErr(e2.message || 'Failed to create PO')
    } finally {
      setSaving(false)
    }
  }

  if (loadingPrf) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (err && !prf) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <p className="text-sm font-bold text-red-700">{err}</p>
          <button onClick={() => navigate(-1)} className="mt-3 text-xs font-bold text-primary hover:underline">← Back</button>
        </div>
      </div>
    )
  }

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
              New Purchase Order
            </h1>
            <p className="text-sm text-neutral-400 mt-1">Linked to PRF: <span className="font-semibold text-primary">{prf?.prf_number}</span></p>
          </div>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4">

        {/* ── PO Header Info ── */}
        <div className="bg-white rounded-2xl border border-neutral-100 overflow-hidden">
          <div className="px-5 py-3 bg-neutral-50 border-b border-neutral-100">
            <p className="text-xs font-bold text-secondary-700">Purchase Order Details</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-neutral-100">
            <div className="px-5 py-4">
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">PO Number</p>
              <input
                value={form.po_number}
                onChange={e => set('po_number', e.target.value)}
                placeholder="e.g. POF-EG1-2025-0001"
                className={INPUT}
              />
            </div>
            <div className="px-5 py-4">
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Date</p>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)} className={INPUT} />
            </div>
            <div className="px-5 py-4">
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Category</p>
              <input value={form.category} onChange={e => set('category', e.target.value)} placeholder="e.g. Components and Parts" className={INPUT} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-neutral-100 border-t border-neutral-100">
            <div className="px-5 py-4">
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Vendor</p>
              <input value={form.vendor} onChange={e => set('vendor', e.target.value)} placeholder="Vendor name / company" className={INPUT} />
            </div>
            <div className="px-5 py-4">
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Ship To</p>
              <p className="text-sm font-semibold text-secondary-700">Rotem SRS</p>
              <p className="text-xs text-neutral-400 mt-0.5">250 ST-Degla · 201060604163</p>
            </div>
          </div>
        </div>

        {/* ── Items Table ── */}
        <div className="bg-white rounded-2xl border border-neutral-100 overflow-hidden">
          <div className="px-5 py-3 bg-neutral-50 border-b border-neutral-100 flex items-center justify-between">
            <p className="text-xs font-bold text-secondary-700">Items</p>
            <button type="button" onClick={addRow}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-primary bg-white hover:bg-primary/10 border border-primary/30 rounded-lg transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add Row
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse" style={{ minWidth: 900 }}>
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-100">
                  {['NO', 'Item Description', 'Stock', 'Avg Con', 'QTY', 'Unit', 'Unit Price (EGP)', 'Total (EGP)', 'Remark', ''].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold text-neutral-400 uppercase tracking-wider whitespace-nowrap border-r border-neutral-100 last:border-0">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {form.items.map((it, i) => {
                  const lineTotal = (parseFloat(it.qty) || 0) * (parseFloat(it.unit_price) || 0)
                  return (
                    <tr key={i} className="hover:bg-neutral-50/50">
                      <td className="px-3 py-2 font-bold text-neutral-400 text-center w-10 border-r border-neutral-100">{i + 1}</td>
                      <td className="px-2 py-1 border-r border-neutral-100 min-w-[180px]">
                        <input value={it.item_description} onChange={e => updateItem(i, 'item_description', e.target.value)}
                          placeholder="Item name" className="w-full px-2 py-1.5 outline-none text-xs rounded-lg focus:bg-primary/5" />
                      </td>
                      <td className="px-2 py-1 border-r border-neutral-100 w-24">
                        <input value={it.stock} onChange={e => updateItem(i, 'stock', e.target.value)}
                          placeholder="—" className="w-full px-2 py-1.5 outline-none text-xs rounded-lg focus:bg-primary/5" />
                      </td>
                      <td className="px-2 py-1 border-r border-neutral-100 w-24">
                        <input value={it.average_con} onChange={e => updateItem(i, 'average_con', e.target.value)}
                          placeholder="—" className="w-full px-2 py-1.5 outline-none text-xs rounded-lg focus:bg-primary/5" />
                      </td>
                      <td className="px-2 py-1 border-r border-neutral-100 w-20">
                        <input type="number" min="0" step="0.001" value={it.qty} onChange={e => updateItem(i, 'qty', e.target.value)}
                          className="w-full px-2 py-1.5 outline-none text-xs text-center rounded-lg focus:bg-primary/5" />
                      </td>
                      <td className="px-2 py-1 border-r border-neutral-100 w-20">
                        <input value={it.unit} onChange={e => updateItem(i, 'unit', e.target.value)}
                          placeholder="pcs" className="w-full px-2 py-1.5 outline-none text-xs text-center rounded-lg focus:bg-primary/5" />
                      </td>
                      <td className="px-2 py-1 border-r border-neutral-100 w-32">
                        <input type="number" min="0" step="0.01" value={it.unit_price} onChange={e => updateItem(i, 'unit_price', e.target.value)}
                          placeholder="0.00" className="w-full px-2 py-1.5 outline-none text-xs text-right rounded-lg focus:bg-primary/5" />
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-secondary-700 w-32 border-r border-neutral-100">
                        {it.unit_price !== '' ? `EGP ${fmt(lineTotal)}` : '—'}
                      </td>
                      <td className="px-2 py-1 border-r border-neutral-100 min-w-[120px]">
                        <input value={it.remark} onChange={e => updateItem(i, 'remark', e.target.value)}
                          placeholder="—" className="w-full px-2 py-1.5 outline-none text-xs rounded-lg focus:bg-primary/5" />
                      </td>
                      <td className="px-2 py-2 text-center w-10">
                        <button type="button" onClick={() => removeRow(i)} disabled={form.items.length === 1}
                          className="p-1 rounded text-neutral-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-30 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="border-t border-neutral-100 px-5 py-4">
            <div className="flex justify-end">
              <div className="space-y-2 min-w-[260px]">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-500">Subtotal</span>
                  <span className="font-semibold text-secondary-700">EGP {fmt(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-xs gap-4">
                  <span className="text-neutral-500 whitespace-nowrap">TAX (EGP)</span>
                  <input type="number" min="0" step="0.01" value={form.tax}
                    onChange={e => set('tax', e.target.value)}
                    placeholder="0.00"
                    className="w-32 px-2 py-1 text-xs text-right border border-neutral-200 rounded-lg outline-none focus:border-primary" />
                </div>
                <div className="flex items-center justify-between text-xs gap-4">
                  <span className="text-neutral-500 whitespace-nowrap">Withholding Tax (EGP)</span>
                  <input type="number" min="0" step="0.01" value={form.withholding_tax}
                    onChange={e => set('withholding_tax', e.target.value)}
                    placeholder="0.00"
                    className="w-32 px-2 py-1 text-xs text-right border border-neutral-200 rounded-lg outline-none focus:border-primary" />
                </div>
                <div className="flex items-center justify-between text-sm font-extrabold border-t border-neutral-200 pt-2">
                  <span className="text-secondary-700">TOTAL</span>
                  <span className="text-primary">EGP {fmt(grandTotal)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Delivery & Terms ── */}
        <div className="bg-white rounded-2xl border border-neutral-100 overflow-hidden">
          <div className="px-5 py-3 bg-neutral-50 border-b border-neutral-100">
            <p className="text-xs font-bold text-secondary-700">Delivery &amp; Terms</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-neutral-100">
            <div className="px-5 py-4">
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Delivery Terms</p>
              <input value={form.delivery_terms} onChange={e => set('delivery_terms', e.target.value)}
                placeholder="e.g. FOB, CIF" className={INPUT} />
            </div>
            <div className="px-5 py-4">
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Delivery Period</p>
              <input value={form.delivery_period} onChange={e => set('delivery_period', e.target.value)}
                placeholder="Week" className={INPUT} />
            </div>
            <div className="px-5 py-4">
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Payment Terms</p>
              <input value={form.payment_terms} onChange={e => set('payment_terms', e.target.value)}
                placeholder="100% After Received" className={INPUT} />
            </div>
            <div className="px-5 py-4">
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Receipt Location</p>
              <input value={form.receipt_location} onChange={e => set('receipt_location', e.target.value)}
                placeholder="Company Warehouse" className={INPUT} />
            </div>
          </div>
        </div>

        {/* ── Comments ── */}
        <div className="bg-white rounded-2xl border border-neutral-100 overflow-hidden">
          <div className="px-5 py-3 bg-neutral-50 border-b border-neutral-100">
            <p className="text-xs font-bold text-secondary-700">Comments / Special Instructions</p>
          </div>
          <div className="px-5 py-4">
            <textarea value={form.comments} onChange={e => set('comments', e.target.value)} rows={3}
              className={INPUT + ' resize-none'} placeholder="e.g. Banking Transfer" />
          </div>
        </div>

        {/* ── Signatures preview ── */}
        <div className="bg-white rounded-2xl border border-neutral-100 overflow-hidden">
          <div className="px-5 py-3 bg-neutral-50 border-b border-neutral-100">
            <p className="text-xs font-bold text-secondary-700">Approval Signatures</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-neutral-100">
            {['Requester', 'Procurement', 'Logistics Manager', 'Depot Manager', 'MD'].map(label => (
              <div key={label} className="px-4 py-6 text-center">
                <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">{label}</p>
                <div className="mt-3 h-10 flex items-end justify-center border-b border-dashed border-neutral-200 mx-4" />
                <p className="text-[10px] text-neutral-300 mt-2">Signature &amp; Date</p>
              </div>
            ))}
          </div>
        </div>

        {/* Error */}
        {err && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
            <X className="w-3.5 h-3.5 shrink-0" /> {err}
          </div>
        )}

        {/* Submit */}
        <div className="flex items-center justify-between bg-white border border-neutral-100 rounded-2xl px-5 py-4">
          <p className="text-[10px] text-neutral-400">
            Doc No: <span className="text-red-500 font-bold">SRS-PRC-P01-F05</span>
          </p>
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-60">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : 'Create Purchase Order'}
          </button>
        </div>

      </form>

      {/* Success toast */}
      {submitted && (
        <div className="fixed bottom-6 right-6 z-[60] flex items-start gap-3 bg-white border border-green-200 shadow-2xl rounded-2xl px-5 py-4 max-w-sm">
          <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
            <CheckCircle className="w-5 h-5 text-green-500" />
          </div>
          <div>
            <p className="text-sm font-bold text-secondary-700">PO Created!</p>
            <p className="text-xs text-neutral-400 mt-0.5">{submitted.po_number} — Ready to issue.</p>
          </div>
        </div>
      )}
    </div>
  )
}
