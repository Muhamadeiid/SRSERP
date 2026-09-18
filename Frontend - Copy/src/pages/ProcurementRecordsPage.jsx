import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { useSearchParams } from 'react-router-dom'
import { Building2, Calculator, ClipboardX, Download, FileSpreadsheet, Loader2, Plus, RefreshCw, Search, Star, X } from 'lucide-react'
import {
  createBudget, createSupplier, decideBudget, evaluateSupplier,
  getBudgets, getControlLog, getRejectedGoods, getSuppliers, updateRejectedGood,
} from '../services/procurementRegistryService'
import { getPrfs } from '../services/prfService'

const CRITERIA = [
  ['valid_commercial_registration', 'Valid Commercial registration'],
  ['valid_tax_registration', 'Tax Identification Number / valid certificate'],
  ['technical_support_available', 'Availability of technical support team'],
  ['timely_competitive_quotations', 'Timely quotations with competitive pricing'],
  ['clear_payment_lead_time', 'Clear payment terms and lead time'],
  ['clear_warranty_terms', 'Clear warranty terms and conditions'],
  ['ehs_compliant', 'Inherent to EHS requirements'],
]
const EVAL = [
  ['c01', 'Quotation response lead time'], ['c02', 'Delivery lead time'], ['c03', 'Quality of supplied goods'],
  ['c04', 'Invoice response after PO'], ['c05', 'Payment process'], ['c06', 'Competitiveness of price'],
  ['c07', 'Company reputation'], ['c08', 'Research / technical support'], ['c09', 'After-sales service'], ['c10', 'EHS requirements'],
]
const STATUS = {
  approved: 'bg-green-50 text-green-700 border-green-200', pending: 'bg-amber-50 text-amber-700 border-amber-200',
  re_evaluation: 'bg-orange-50 text-orange-700 border-orange-200', suspended: 'bg-red-50 text-red-700 border-red-200',
  pending_depot: 'bg-amber-50 text-amber-700 border-amber-200', pending_management: 'bg-blue-50 text-blue-700 border-blue-200',
  rejected: 'bg-red-50 text-red-700 border-red-200', draft: 'bg-neutral-100 text-neutral-600 border-neutral-200',
}
const emptySupplier = {
  company_name: '', company_address: '', interface_person: '', business_type: '', phone_email: '',
  locations_count: '', specialties: '', origin: '', contact_number: '',
  is_contractor: false, ohs_instructions_acknowledged_at: '', ohs_acknowledgement_reference: '',
  ...Object.fromEntries(CRITERIA.map(([k]) => [k, false])),
}
const emptyBudgetItem = () => ({ category: 'Consumables', description: '', delivery_term: '', stock: '', average_usage: '', quantity: 1, unit: 'pcs', unit_price: 0, vat_rate: 14, withholding_rate: 1, notes: '' })
const fmt = d => d ? new Date(d).toLocaleDateString('en-GB') : '—'
const money = n => Number(n || 0).toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const nextBudgetPeriod = () => { const d=new Date(); d.setMonth(d.getMonth()+1); return {year:d.getFullYear(),month:d.getMonth()+1} }

function Badge({ value }) {
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold capitalize ${STATUS[value] || STATUS.draft}`}>{String(value || '—').replaceAll('_', ' ')}</span>
}

export default function ProcurementRecordsPage() {
  const [searchParams] = useSearchParams()
  const { user } = useSelector(s => s.auth)
  const requestedTab = searchParams.get('tab')
  const [tab, setTab] = useState(['suppliers', 'budgets', 'rejected', 'log'].includes(requestedTab) ? requestedTab : 'suppliers')
  const [data, setData] = useState({ suppliers: [], budgets: [], rejected: [], log: [] })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [supplierForm, setSupplierForm] = useState(null)
  const [evaluation, setEvaluation] = useState(null)
  const [budgetForm, setBudgetForm] = useState(null)
  const canManage = ['admin', 'procurement', 'purchasing'].includes(user?.role)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [s, b, r, l] = await Promise.all([getSuppliers(), getBudgets(), getRejectedGoods(), getControlLog()])
      setData({ suppliers: s.data || [], budgets: b.data || [], rejected: r.data || [], log: l.data || [] })
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const suppliers = useMemo(() => {
    const q = search.trim().toLowerCase()
    return !q ? data.suppliers : data.suppliers.filter(s => `${s.supplier_number} ${s.company_name} ${s.specialties} ${s.interface_person}`.toLowerCase().includes(q))
  }, [data.suppliers, search])
  const log = useMemo(() => {
    const q = search.trim().toLowerCase()
    return !q ? data.log : data.log.filter(x => Object.values(x).join(' ').toLowerCase().includes(q))
  }, [data.log, search])

  const saveSupplier = async e => {
    e.preventDefault(); setBusy(true); setError('')
    try { await createSupplier({ ...supplierForm, locations_count: supplierForm.locations_count || null }); setSupplierForm(null); await load() }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const saveEvaluation = async e => {
    e.preventDefault(); setBusy(true); setError('')
    try { await evaluateSupplier(evaluation.id, { ratings: evaluation.ratings, notes: evaluation.notes }); setEvaluation(null); await load() }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const saveBudget = async e => {
    e.preventDefault(); setBusy(true); setError('')
    try { await createBudget(budgetForm); setBudgetForm(null); await load() }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const budgetDecision = async (id, action) => {
    setBusy(true); setError('')
    try { await decideBudget(id, { action }); await load() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const exportRegister = async () => {
    const { generateProcurementRegister } = await import('../utils/generateProcurementRegister')
    return generateProcurementRegister(data)
  }
  const prepareBudgetFromPrfs = async () => {
    setBusy(true); setError('')
    try {
      const period = nextBudgetPeriod()
      const response = await getPrfs({ status: 'approved' })
      const items = (response?.data || []).flatMap(prf => (prf.items || [])
        .filter(item => { if (!item.required_by_date) return true; const d=new Date(item.required_by_date); return d.getFullYear()===period.year && d.getMonth()+1===period.month })
        .map(item => ({ ...emptyBudgetItem(), category:prf.material_category?.[0] || 'Consumables', description:item.description, quantity:Number(item.quantity||0), unit:item.unit||'pcs', notes:`PRF ${prf.prf_number}` })))
      if (!items.length) throw new Error('No approved PRF items were found for the next budget period')
      setBudgetForm({ ...period, items })
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const tabs = [
    ['suppliers', 'Vendors', Building2], ['budgets', 'Budget Plan', Calculator],
    ['rejected', 'Rejected Goods', ClipboardX], ['log', 'PO & PR Control', FileSpreadsheet],
  ]

  return <div className="p-4 sm:p-6 space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-extrabold text-secondary-700">Procurement Management</h1><p className="text-sm text-neutral-400 mt-1">Supplier management, purchasing controls and live traceability</p></div>
      <div className="flex gap-2"><button onClick={exportRegister} disabled={loading} className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2.5 text-xs font-bold text-secondary-700"><Download className="h-4 w-4"/>Export SOP Register</button><button onClick={load} className="p-2.5 rounded-xl border bg-white text-neutral-500"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button></div>
    </div>
    <div className="flex flex-wrap gap-2 border-b border-neutral-200">
      {tabs.map(item => {
        const [key, label] = item
        const TabIcon = item[2]
        return <button key={key} onClick={() => { setTab(key); setSearch('') }} className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 ${tab === key ? 'border-primary text-primary' : 'border-transparent text-neutral-400'}`}><TabIcon className="w-4 h-4" />{label}</button>
      })}
    </div>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
    {loading ? <div className="py-20 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div> : <>
      {(tab === 'suppliers' || tab === 'log') && <div className="relative max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-300" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-neutral-200 bg-white text-sm outline-none focus:border-primary" /></div>}

      {tab === 'suppliers' && <section className="space-y-4">
        {canManage && <button onClick={() => setSupplierForm({ ...emptySupplier })} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-bold"><Plus className="w-4 h-4" />New Supplier Assessment</button>}
        <div className="bg-white border border-neutral-100 rounded-2xl overflow-x-auto"><table className="w-full text-xs min-w-[900px]"><thead className="bg-neutral-50"><tr>{['NSA No.','Supplier','Specialties','Interface','Deliveries','Performance','Next Evaluation','Status','Action'].map(h=><th key={h} className="px-4 py-3 text-left text-[10px] uppercase text-neutral-400">{h}</th>)}</tr></thead><tbody className="divide-y divide-neutral-100">{suppliers.map(s=><tr key={s.id}><td className="px-4 py-3 font-mono font-bold">{s.supplier_number}</td><td className="px-4 py-3"><b>{s.company_name}</b><div className="text-neutral-400 mt-1">{s.phone_email}</div></td><td className="px-4 py-3">{s.specialties || '—'}</td><td className="px-4 py-3">{s.interface_person || '—'}</td><td className="px-4 py-3 text-center">{s.successful_deliveries}</td><td className="px-4 py-3">{s.latest_performance_percentage == null ? '—' : `${s.latest_performance_percentage}%`}</td><td className="px-4 py-3">{fmt(s.next_evaluation_at)}</td><td className="px-4 py-3"><Badge value={s.status} /></td><td className="px-4 py-3">{canManage && <button disabled={s.successful_deliveries < 3} title={s.successful_deliveries < 3 ? 'Available after 3 successful deliveries' : ''} onClick={()=>setEvaluation({ id:s.id, name:s.company_name, ratings:Object.fromEntries(EVAL.map(([k])=>[k,3])), notes:'' })} className="flex items-center gap-1 text-primary font-bold disabled:text-neutral-300"><Star className="w-3.5 h-3.5" />Evaluate</button>}</td></tr>)}</tbody></table></div>
      </section>}

      {tab === 'budgets' && <section className="space-y-4">
        {canManage && <div className="flex flex-wrap gap-2"><button onClick={()=>setBudgetForm({ ...nextBudgetPeriod(), items:[emptyBudgetItem()] })} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-bold"><Plus className="w-4 h-4" />New Monthly Plan</button><button onClick={prepareBudgetFromPrfs} disabled={busy} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-primary/30 bg-white text-primary text-xs font-bold"><FileSpreadsheet className="w-4 h-4"/>Build from Approved PRFs</button></div>}
        <div className="grid gap-3">{data.budgets.map(b=><div key={b.id} className="bg-white rounded-2xl border border-neutral-100 p-4 flex flex-wrap items-center gap-4"><div className="min-w-[130px]"><p className="font-bold text-secondary-700">{String(b.month).padStart(2,'0')}/{b.year}</p><p className="text-[10px] text-neutral-400">{b.items?.length || 0} items</p></div><div><p className="text-[10px] text-neutral-400 uppercase">Grand Total</p><p className="font-bold">EGP {money(b.grand_total)}</p></div><Badge value={b.status} /><div className="ml-auto flex gap-2">{b.status==='pending_depot' && ['admin','depot_manager'].includes(user?.role) && <><button onClick={()=>budgetDecision(b.id,'approve')} className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-bold">Approve</button><button onClick={()=>budgetDecision(b.id,'reject')} className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-bold">Reject</button></>}{b.status==='pending_management' && user?.role==='admin' && <><button onClick={()=>budgetDecision(b.id,'approve')} className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-bold">Management Approve</button><button onClick={()=>budgetDecision(b.id,'reject')} className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-bold">Reject</button></>}</div></div>)}</div>
      </section>}

      {tab === 'rejected' && <div className="bg-white border border-neutral-100 rounded-2xl overflow-x-auto"><table className="w-full text-xs min-w-[850px]"><thead className="bg-neutral-50"><tr>{['RGF No.','PO','Item','Qty','Rejecting Date','Reason','Status','Action'].map(h=><th key={h} className="px-4 py-3 text-left text-[10px] uppercase text-neutral-400">{h}</th>)}</tr></thead><tbody className="divide-y divide-neutral-100">{data.rejected.map(r=><tr key={r.id}><td className="px-4 py-3 font-mono font-bold">{r.rejection_number}</td><td className="px-4 py-3">{r.igi?.po?.po_number || '—'}</td><td className="px-4 py-3">{r.item_description}<div className="text-neutral-400">{r.part_number}</div></td><td className="px-4 py-3">{r.quantity_affected}</td><td className="px-4 py-3">{fmt(r.rejecting_date)}</td><td className="px-4 py-3 max-w-xs">{r.reason}</td><td className="px-4 py-3"><Badge value={r.status} /></td><td className="px-4 py-3">{canManage && r.status!=='closed' && <select value={r.status} onChange={async e=>{setBusy(true);try{await updateRejectedGood(r.id,{status:e.target.value});await load()}catch(x){setError(x.message)}finally{setBusy(false)}}} className="border rounded-lg px-2 py-1"><option value="pending_return">Pending return</option><option value="supplier_acknowledged">Supplier acknowledged</option><option value="returned">Returned</option><option value="closed">Closed</option></select>}</td></tr>)}</tbody></table></div>}

      {tab === 'log' && <div className="bg-white border border-neutral-100 rounded-2xl overflow-x-auto"><table className="w-full text-xs min-w-[1150px]"><thead className="bg-neutral-50"><tr>{['PRF','Requester','Req. Date','Required By','PRF Status','PO','Supplier','PO Date','PO Approval','PO Status','IGI','Delivery','Payment'].map(h=><th key={h} className="px-3 py-3 text-left text-[10px] uppercase text-neutral-400">{h}</th>)}</tr></thead><tbody className="divide-y divide-neutral-100">{log.map(x=><tr key={x.prf_id}><td className="px-3 py-3 font-mono font-bold">{x.prf_number}</td><td className="px-3 py-3">{x.requester}</td><td className="px-3 py-3">{fmt(x.prf_date)}</td><td className="px-3 py-3">{fmt(x.required_by_date)}</td><td className="px-3 py-3"><Badge value={x.prf_status}/></td><td className="px-3 py-3 font-mono">{x.po_number||'—'}</td><td className="px-3 py-3">{x.supplier||'—'}</td><td className="px-3 py-3">{fmt(x.po_date)}</td><td className="px-3 py-3"><Badge value={x.approval_status}/></td><td className="px-3 py-3"><Badge value={x.po_status}/></td><td className="px-3 py-3 font-mono">{x.igi_number||'—'}</td><td className="px-3 py-3">{fmt(x.delivery_date)}</td><td className="px-3 py-3"><Badge value={x.payment_status}/></td></tr>)}</tbody></table></div>}
    </>}

    {supplierForm && <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4"><form onSubmit={saveSupplier} className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto p-6 space-y-4"><div className="flex justify-between"><div><h2 className="font-extrabold text-secondary-700">New Supplier Assessment</h2><p className="text-xs text-neutral-400">SRS-PRC-P01-F01</p></div><button type="button" onClick={()=>setSupplierForm(null)}><X/></button></div><div className="grid sm:grid-cols-2 gap-3">{[['company_name','Company name'],['company_address','Company address'],['interface_person','Interface person'],['business_type','Type of business'],['phone_email','Phone / Mail'],['locations_count','Number of locations'],['specialties','Specialities'],['origin','Origin'],['contact_number','Contact No.']].map(([k,l])=><label key={k} className="text-xs font-bold text-neutral-500">{l}<input required={k==='company_name'} value={supplierForm[k]} onChange={e=>setSupplierForm({...supplierForm,[k]:e.target.value})} className="mt-1 w-full border rounded-lg px-3 py-2 font-normal text-secondary-700" /></label>)}</div><label className="flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-bold"><input type="checkbox" checked={supplierForm.is_contractor} onChange={e=>setSupplierForm({...supplierForm,is_contractor:e.target.checked})}/>This external provider is a contractor</label>{supplierForm.is_contractor&&<div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-neutral-500">OH&amp;S instructions acknowledgement date<input required type="date" value={supplierForm.ohs_instructions_acknowledged_at} onChange={e=>setSupplierForm({...supplierForm,ohs_instructions_acknowledged_at:e.target.value})} className="mt-1 w-full border rounded-lg px-3 py-2 font-normal"/></label><label className="text-xs font-bold text-neutral-500">Signed acknowledgement reference<input required value={supplierForm.ohs_acknowledgement_reference} onChange={e=>setSupplierForm({...supplierForm,ohs_acknowledgement_reference:e.target.value})} className="mt-1 w-full border rounded-lg px-3 py-2 font-normal"/></label></div>}<div className="border rounded-xl overflow-hidden">{CRITERIA.map(([k,l])=><label key={k} className="flex items-center justify-between gap-3 px-4 py-3 border-b last:border-0 text-xs"><span>{l}</span><input type="checkbox" checked={supplierForm[k]} onChange={e=>setSupplierForm({...supplierForm,[k]:e.target.checked})} className="w-4 h-4" /></label>)}</div><button disabled={busy} className="w-full py-3 rounded-xl bg-primary text-white font-bold">{busy?'Saving...':'Save Assessment'}</button></form></div>}

    {evaluation && <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4"><form onSubmit={saveEvaluation} className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto p-6 space-y-4"><div className="flex justify-between"><div><h2 className="font-extrabold">Vendor Evaluation — {evaluation.name}</h2><p className="text-xs text-neutral-400">SRS-PRC-P01-F02 · rate each criterion from 1 to 5</p></div><button type="button" onClick={()=>setEvaluation(null)}><X/></button></div>{EVAL.map(([k,l])=><div key={k} className="flex items-center justify-between gap-4 border-b pb-2"><span className="text-xs">{l}</span><div className="flex gap-1">{[1,2,3,4,5].map(n=><button type="button" key={n} onClick={()=>setEvaluation({...evaluation,ratings:{...evaluation.ratings,[k]:n}})} className={`w-8 h-8 rounded-lg text-xs font-bold ${evaluation.ratings[k]===n?'bg-primary text-white':'bg-neutral-100'}`}>{n}</button>)}</div></div>)}<textarea value={evaluation.notes} onChange={e=>setEvaluation({...evaluation,notes:e.target.value})} placeholder="Notes" className="w-full border rounded-xl p-3 text-sm"/><button disabled={busy} className="w-full py-3 rounded-xl bg-primary text-white font-bold">Save Evaluation</button></form></div>}

    {budgetForm && <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4"><form onSubmit={saveBudget} className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto p-6 space-y-4"><div className="flex justify-between"><div><h2 className="font-extrabold">Monthly Budget & Cost Control</h2><p className="text-xs text-neutral-400">SRS-PRC-P01-F05</p></div><button type="button" onClick={()=>setBudgetForm(null)}><X/></button></div><div className="flex gap-3"><input type="number" value={budgetForm.month} onChange={e=>setBudgetForm({...budgetForm,month:+e.target.value})} min="1" max="12" className="border rounded-lg px-3 py-2 w-24"/><input type="number" value={budgetForm.year} onChange={e=>setBudgetForm({...budgetForm,year:+e.target.value})} className="border rounded-lg px-3 py-2 w-28"/></div><div className="space-y-3">{budgetForm.items.map((it,i)=><div key={i} className="grid sm:grid-cols-8 gap-2 p-3 border rounded-xl"><select value={it.category} onChange={e=>{const a=[...budgetForm.items];a[i]={...it,category:e.target.value};setBudgetForm({...budgetForm,items:a})}} className="border rounded-lg px-2 py-2 text-xs"><option>Consumables</option><option>Safety</option><option>Asset maintenance</option><option>Stationary</option><option>Office operating expenses</option><option>Water</option><option>Office Communication</option></select>{[['description','Description'],['delivery_term','Delivery'],['stock','Stock'],['average_usage','Avg Usage'],['quantity','Qty'],['unit_price','Unit Price'],['notes','Notes']].map(([k,p])=><input key={k} required={k==='description'} type={['stock','average_usage','quantity','unit_price'].includes(k)?'number':'text'} step="any" value={it[k]} placeholder={p} onChange={e=>{const a=[...budgetForm.items];a[i]={...it,[k]:e.target.value};setBudgetForm({...budgetForm,items:a})}} className="border rounded-lg px-2 py-2 text-xs"/>)}</div>)}</div><button type="button" onClick={()=>setBudgetForm({...budgetForm,items:[...budgetForm.items,emptyBudgetItem()]})} className="text-primary text-xs font-bold">+ Add item</button><button disabled={busy} className="w-full py-3 rounded-xl bg-primary text-white font-bold">Submit to Depot Manager</button></form></div>}
  </div>
}
