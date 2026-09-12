import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import {
  Download, FileOutput, Loader2, Plus, Search, Trash2, X,
} from 'lucide-react'
import {
  createReleaseNote, deleteReleaseNote, getInventorySpecialist,
  getReleaseNote, getReleaseNotes, updateReleaseNote,
} from '../services/releaseNoteService'
import { searchEmployees } from '../services/employeeService'
import { generateReleaseNote } from '../utils/generateReleaseNote'

const UNITS = ['PCS', 'Set', 'Meter', 'Liter', 'KG', 'Box', 'Roll', 'Pair', 'Drum']

const inputClass = 'w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10'
const gridInput = 'w-full min-w-0 rounded border border-transparent bg-transparent px-2 py-1.5 text-sm outline-none hover:border-neutral-200 focus:border-primary focus:bg-white'
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500'
const day = value => (value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB') : '—')

const statusLabel = {
  pending: 'Pending store',
  ready_for_approval: 'Ready for approval',
  released: 'Released',
  rejected: 'Rejected',
  closed: 'Closed',
}
const statusStyle = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  ready_for_approval: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  released: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  closed: 'bg-neutral-100 text-neutral-600 border-neutral-200',
}

const stamp = value => (value
  ? new Date(value).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : null)

/** Human labels for the fields stored in an activity's details.field. */
const FIELD_LABEL = {
  item_name: 'Item name', unit: 'Unit', qty_requested: 'Qty requested', code: 'Code',
  qty_released: 'Qty released', qty_returned: 'Qty returned', actual_qty: 'Actual Qty',
  check_type: 'Check type', receiver_name: 'Receiver', receiver_title: 'Receiver title',
  date: 'Date', trainset_asset_name: 'Trainset / Asset', work_order: 'Work order',
  type: 'Type', plan_status: 'Status', over_plan_reason: 'Over-plan reason',
  store_remark: 'Store note',
}

const val = v => (v === null || v === undefined || v === '' ? '—' : String(v))

/** One line describing what happened, given an activity row from the API. */
function describeActivity(activity) {
  const details = activity.details || {}
  switch (activity.kind) {
    case 'created':       return 'raised this request'
    case 'marked_ready':  return 'marked the note ready for approval'
    case 'released':      return 'released the parts and signed the note'
    case 'rejected':      return 'rejected the request'
    case 'reopened':      return 'reopened the note for editing'
    case 'closed':        return 'closed the note'
    case 'item_added':    return `added item #${activity.item_no}`
    case 'item_removed':  return `removed item #${activity.item_no}`
    case 'edited': {
      const label = FIELD_LABEL[details.field] || details.field
      const scope = activity.item_no ? ` on item #${activity.item_no}` : ''
      return `changed ${label}${scope}: ${val(details.before)} → ${val(details.after)}`
    }
    default: return activity.kind
  }
}

/**
 * The engineer's tracking view — where the request has got to, and every
 * touch on the note so far: who edited what and when.
 */
function RequestTracker({ note }) {
  const activities = note.activities || []
  const findAt = kind => stamp(activities.find(a => a.kind === kind)?.created_at)

  const readyAt    = findAt('marked_ready')
  const releasedAt = findAt('released')
  const rejectedAt = findAt('rejected')

  const steps = [
    { label: 'Request submitted', at: stamp(note.created_at), done: true },
    {
      label: 'Being prepared by the store',
      at: null,
      done: note.status !== 'pending',
      current: note.status === 'pending',
    },
    {
      label: 'Ready for approval',
      at: readyAt,
      done: ['ready_for_approval', 'released', 'closed'].includes(note.status) || Boolean(readyAt),
      current: note.status === 'ready_for_approval',
    },
    {
      label: note.status === 'rejected' ? 'Rejected' : 'Approved and released',
      at: stamp(note.decided_at) || releasedAt || rejectedAt,
      done: note.status === 'released' || note.status === 'rejected' || note.status === 'closed',
      failed: note.status === 'rejected',
    },
  ]

  return <div className="space-y-3">
    <div className="rounded-md border border-neutral-200 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className={labelClass}>Progress</span>
        <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusStyle[note.status]}`}>{statusLabel[note.status]}</span>
      </div>
      <ol className="space-y-3">
        {steps.map(step => <li key={step.label} className="flex gap-3">
          <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
            step.failed && step.done ? 'bg-red-500'
              : step.done ? 'bg-emerald-500'
                : step.current ? 'bg-amber-400' : 'bg-neutral-200'}`} />
          <div className="min-w-0">
            <p className={`text-sm ${step.done || step.current ? 'font-semibold text-secondary' : 'text-neutral-400'}`}>{step.label}</p>
            {step.at && <p className="text-xs text-neutral-500">{step.at}</p>}
            {step.current && !step.at && <p className="text-xs text-neutral-500">
              {note.status === 'pending' ? 'The store team has not touched it yet' : 'Waiting on approval'}
            </p>}
          </div>
        </li>)}
      </ol>
      {note.store_remark && <p className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
        <strong className="text-secondary">Store note:</strong> {note.store_remark}
      </p>}
    </div>

    {activities.length > 0 && <ActivityLog activities={activities} />}
  </div>
}

/**
 * Every change made to the note, with who did it and when. Visible to the
 * requester and to anyone with view access, so nothing gets amended silently.
 */
function ActivityLog({ activities }) {
  return <div className="rounded-md border border-neutral-200 p-4">
    <div className="mb-3 flex items-center justify-between">
      <span className={labelClass}>Change log</span>
      <span className="text-xs text-neutral-400">{activities.length} entr{activities.length === 1 ? 'y' : 'ies'}</span>
    </div>
    <ol className="space-y-2">
      {activities.map(activity => <li key={activity.id} className="flex gap-3 text-sm">
        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-300" />
        <div className="min-w-0 flex-1">
          <p className="text-secondary">
            <strong>{activity.user?.name || 'Someone'}</strong>
            {activity.user?.role && <span className="ml-1 text-[10px] uppercase tracking-wide text-neutral-400">({activity.user.role.replace('_', ' ')})</span>}
            {' '}{describeActivity(activity)}
          </p>
          <p className="text-xs text-neutral-500">{stamp(activity.created_at)}</p>
        </div>
      </li>)}
    </ol>
  </div>
}

const emptyItem = () => ({
  item_name: '', qty_requested: '', unit: '', code: '', qty_released: '', qty_returned: '',
  actual_qty: '', actual_touched: false, check_type: '',
  receiver_employee_id: '', receiver_name: '', receiver_title: '',
})

/** Employee lookup — captures id, name and position so the note keeps a snapshot. */
function ReceiverPicker({ value, onPick }) {
  const [query, setQuery] = useState(value || '')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const timer = useRef()

  useEffect(() => { setQuery(value || '') }, [value])

  useEffect(() => {
    clearTimeout(timer.current)
    const term = query.trim()
    if (term.length < 2 || term === value) { setResults([]); return }
    setLoading(true)
    timer.current = setTimeout(() => {
      searchEmployees(term)
        .then(data => { setResults(Array.isArray(data) ? data : []); setOpen(true) })
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, 300)
    return () => clearTimeout(timer.current)
  }, [query, value])

  return <div className="relative">
    <input
      className={gridInput}
      value={query}
      placeholder="Search employee…"
      onChange={event => { setQuery(event.target.value); onPick({ id: '', name: event.target.value, title: null }) }}
      onFocus={() => results.length && setOpen(true)}
      onBlur={() => setTimeout(() => setOpen(false), 150)}
    />
    {loading && <Loader2 className="pointer-events-none absolute right-2 top-2 h-3.5 w-3.5 animate-spin text-neutral-400" />}
    {open && results.length > 0 && <div className="absolute left-0 top-full z-30 mt-1 max-h-56 w-64 overflow-y-auto rounded-md border border-neutral-200 bg-white shadow-xl">
      {results.map(employee => <button
        type="button"
        key={employee.id}
        onMouseDown={event => event.preventDefault()}
        onClick={() => { onPick({ id: employee.id, name: employee.name, title: employee.position || '' }); setQuery(employee.name); setOpen(false) }}
        className="block w-full border-b border-neutral-100 px-3 py-2 text-left last:border-0 hover:bg-neutral-50"
      >
        <strong className="block text-sm text-secondary">{employee.name}</strong>
        <small className="text-xs text-neutral-500">{employee.position || 'No position'} · {employee.ibs_code || '—'}</small>
      </button>)}
    </div>}
  </div>
}

/** Stage 1 — the requesting engineer lists what they need. */
function RequestModal({ note, readOnly = false, onClose, onSaved }) {
  const user = useSelector(state => state.auth.user)
  // Store staff open every request in read-only mode; the requester's own
  // pending draft is the only case that's still editable.
  const locked = readOnly || (Boolean(note) && note.status !== 'pending')
  const [items, setItems] = useState(() => (note?.items?.length
    ? note.items.map(item => ({ ...emptyItem(), ...item, unit: item.unit || '' }))
    : [emptyItem()]))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const setItem = (index, patch) => setItems(current => current.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  const addRow = () => setItems(current => [...current, emptyItem()])
  const removeRow = index => setItems(current => (current.length > 1 ? current.filter((_, i) => i !== index) : current))

  const submit = async event => {
    event.preventDefault()
    const rows = items.filter(item => item.item_name.trim())
    if (!rows.length) { setError('Add at least one item.'); return }
    setSaving(true); setError('')
    const payload = {
      items: rows.map(item => ({
        item_name: item.item_name.trim(),
        qty_requested: item.qty_requested === '' ? null : item.qty_requested,
        unit: item.unit || null,
      })),
    }
    try {
      onSaved(note ? await updateReleaseNote(note.id, payload) : await createReleaseNote(payload))
    } catch (err) {
      const errors = err.response?.data?.errors
      setError(errors ? Object.values(errors).flat()[0] : (err.response?.data?.message || 'Could not save the request.'))
    } finally {
      setSaving(false)
    }
  }

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-3" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <form onSubmit={submit} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-2xl">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white px-5 py-4">
        <div>
          <h2 className="text-lg font-bold text-secondary">{note ? `Edit request ${note.prn_number}` : 'Request parts'}</h2>
          <p className="text-xs text-neutral-400">Release Note · SRS-INV-P01-F06</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-2 text-neutral-400 hover:bg-neutral-100" aria-label="Close"><X className="h-5 w-5" /></button>
      </div>

      <div className="space-y-4 p-5">
        {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

        <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3">
          <span className={labelClass}>Requested by</span>
          <strong className="text-sm text-secondary">{note?.requested_by_name || user?.name}</strong>
          <p className="text-xs text-neutral-500">{note?.requested_by_title || user?.role} · taken from your account</p>
        </div>

        {note && <RequestTracker note={note} />}

        <div>
          <span className={labelClass}>Items needed</span>
          <div className="overflow-hidden rounded-md border border-neutral-200">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
                <tr>
                  <th className="w-10 px-3 py-2 text-left font-semibold">#</th>
                  <th className="px-3 py-2 text-left font-semibold">Item name / اسم البند</th>
                  <th className="w-24 px-3 py-2 text-left font-semibold">Qty / كميه</th>
                  <th className="w-32 px-3 py-2 text-left font-semibold">Unit / وحده</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => <tr key={index} className="border-t border-neutral-100">
                  <td className="px-3 py-1 text-neutral-400">{index + 1}</td>
                  <td className="px-1 py-1">
                    <input autoFocus={index === 0} disabled={locked} className={gridInput} maxLength={500} placeholder="e.g. Brake pad set" value={item.item_name} onChange={e => setItem(index, { item_name: e.target.value })} />
                  </td>
                  <td className="px-1 py-1">
                    <input type="number" min="0" step="any" disabled={locked} className={gridInput} placeholder="0" value={item.qty_requested} onChange={e => setItem(index, { qty_requested: e.target.value })} />
                  </td>
                  <td className="px-1 py-1">
                    <select className={gridInput} disabled={locked} value={item.unit} onChange={e => setItem(index, { unit: e.target.value })}>
                      <option value="">—</option>
                      {UNITS.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    {!locked && <button type="button" onClick={() => removeRow(index)} title="Remove" className="rounded p-1.5 text-neutral-300 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>}
                  </td>
                </tr>)}
              </tbody>
            </table>
          </div>
          {!locked && <button type="button" onClick={addRow} className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-secondary hover:bg-neutral-50">
            <Plus className="h-3.5 w-3.5" />Add item
          </button>}
        </div>

        <p className="text-xs text-neutral-500">
          The store keeper fills in the code, quantities, check type and receiver when the parts are issued.
        </p>
      </div>

      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-neutral-200 bg-white px-5 py-4">
        <button type="button" onClick={onClose} className="rounded-md border border-neutral-200 px-4 py-2 text-sm font-semibold">{locked ? 'Close' : 'Cancel'}</button>
        {!locked && <button disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}{note ? 'Save changes' : 'Send request'}
        </button>}
      </div>
    </form>
  </div>
}

/** Stage 2 — the store keeper completes and issues the note. */
/**
 * Stage 2 (store staff prepare) and stage 3 (Material Controller approves).
 * The `canFulfil` prop decides which controls are shown — store staff cannot
 * release or reject, they can only mark the note ready for approval.
 */
function FulfilModal({ note, specialist, canFulfil, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    date: String(note.date || '').slice(0, 10),
    type: note.type || '',
    plan_status: note.plan_status || '',
    over_plan_reason: note.over_plan_reason || '',
    trainset_asset_name: note.trainset_asset_name || '',
    work_order: note.work_order || '',
    inventory_specialist_date: String(note.inventory_specialist_date || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
    status: note.status,
    store_remark: note.store_remark || '',
    items: (note.items || []).map(item => ({
      ...emptyItem(), ...item,
      unit: item.unit || '',
      code: item.code || '',
      qty_requested: item.qty_requested ?? '',
      // Nothing issued yet? Start from what the engineer asked for.
      qty_released: item.qty_released ?? (item.qty_requested ?? ''),
      qty_returned: item.qty_returned ?? '',
      actual_qty: item.actual_qty ?? '',
      actual_touched: item.actual_qty !== null && item.actual_qty !== undefined,
      check_type: item.check_type || '',
      receiver_employee_id: item.receiver_employee_id || '',
      receiver_name: item.receiver_name || item.receiver?.name || '',
      receiver_title: item.receiver_title || item.receiver?.position || '',
    })),
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))

  const setItem = (index, patch) => setForm(current => ({
    ...current,
    items: current.items.map((item, i) => {
      if (i !== index) return item
      const next = { ...item, ...patch }
      // Actual Qty defaults to released − returned until somebody types over it.
      if (!next.actual_touched && ('qty_released' in patch || 'qty_returned' in patch)) {
        const released = Number(next.qty_released)
        next.actual_qty = next.qty_released === '' || Number.isNaN(released)
          ? ''
          : String(released - Number(next.qty_returned || 0))
      }
      return next
    }),
  }))

  const addRow = () => setForm(current => ({ ...current, items: [...current.items, emptyItem()] }))

  const submit = async event => {
    event.preventDefault()
    setSaving(true); setError('')
    const blank = value => (value === '' ? null : value)
    const payload = {
      date: blank(form.date), type: blank(form.type), plan_status: blank(form.plan_status),
      over_plan_reason: blank(form.over_plan_reason),
      trainset_asset_name: blank(form.trainset_asset_name), work_order: blank(form.work_order),
      inventory_specialist_date: blank(form.inventory_specialist_date),
      status: form.status,
      store_remark: blank(form.store_remark),
      items: form.items.filter(item => item.item_name.trim()).map(item => ({
        item_name: item.item_name, unit: blank(item.unit),
        qty_requested: blank(item.qty_requested), code: blank(item.code),
        qty_released: blank(item.qty_released), qty_returned: blank(item.qty_returned),
        actual_qty: blank(item.actual_qty), check_type: blank(item.check_type),
        receiver_employee_id: blank(item.receiver_employee_id),
        receiver_name: blank(item.receiver_name), receiver_title: blank(item.receiver_title),
      })),
    }
    try {
      onSaved(await updateReleaseNote(note.id, payload))
    } catch (err) {
      const errors = err.response?.data?.errors
      setError(errors ? Object.values(errors).flat()[0] : (err.response?.data?.message || 'Could not save the release note.'))
    } finally {
      setSaving(false)
    }
  }

  // ☐ / ☒ tick boxes styled after the paper form. Only one of PM/CM (and
  // Plan/Over plan) can be checked at a time; clicking a ticked box unticks it.
  const checkbox = (group, value, label) => <button
    type="button" key={value}
    onClick={() => set(group, form[group] === value ? '' : value)}
    aria-pressed={form[group] === value}
    className="flex items-center gap-2 text-sm text-secondary hover:text-primary"
  >
    <span className="flex h-4 w-4 items-center justify-center border border-black bg-white text-[11px] leading-none">
      {form[group] === value ? '✕' : ''}
    </span>
    {label}
  </button>

  return <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/40 p-3" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <form onSubmit={submit} className="my-4 w-full max-w-6xl rounded-lg bg-white shadow-2xl">
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-neutral-200 bg-white px-5 py-4">
        <div>
          <h2 className="text-lg font-bold text-secondary">{note.prn_number}</h2>
          <p className="text-xs text-neutral-400">
            Requested by {note.requested_by_name || '—'} · {day(note.requested_by_date)}
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-2 text-neutral-400 hover:bg-neutral-100" aria-label="Close"><X className="h-5 w-5" /></button>
      </div>

      <div className="space-y-4 p-5">
        {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

        <div className="grid gap-4 rounded-md border border-neutral-200 p-4 md:grid-cols-4">
          <label><span className={labelClass}>Date</span><input type="date" className={inputClass} value={form.date} onChange={e => set('date', e.target.value)} /></label>
          <label><span className={labelClass}>Trainset / Asset</span><input className={inputClass} maxLength={255} value={form.trainset_asset_name} onChange={e => set('trainset_asset_name', e.target.value)} /></label>
          <label><span className={labelClass}>Work order</span><input className={inputClass} maxLength={255} value={form.work_order} onChange={e => set('work_order', e.target.value)} /></label>
          <label><span className={labelClass}>Issue date</span><input type="date" className={inputClass} value={form.inventory_specialist_date} onChange={e => set('inventory_specialist_date', e.target.value)} /></label>

          <div><span className={labelClass}>Type</span><div className="flex gap-4 pt-1">{checkbox('type', 'pm', 'PM')}{checkbox('type', 'cm', 'CM')}</div></div>
          <div><span className={labelClass}>Status</span><div className="flex gap-4 pt-1">{checkbox('plan_status', 'plan', 'Plan')}{checkbox('plan_status', 'over_plan', 'Over plan')}</div></div>
          <label className="md:col-span-2">
            <span className={labelClass}>Reason if not in plan</span>
            <input className={inputClass} maxLength={500} disabled={form.plan_status !== 'over_plan'} value={form.over_plan_reason} onChange={e => set('over_plan_reason', e.target.value)} />
          </label>
        </div>

        <div className="overflow-x-auto rounded-md border border-neutral-200">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
              <tr>
                <th className="w-8 px-2 py-2 text-left font-semibold">#</th>
                <th className="w-32 px-2 py-2 text-left font-semibold">Code</th>
                <th className="px-2 py-2 text-left font-semibold">Item name</th>
                <th className="w-24 px-2 py-2 text-left font-semibold">Unit</th>
                <th className="w-24 px-2 py-2 text-left font-semibold">Requested</th>
                <th className="w-24 px-2 py-2 text-left font-semibold">Released</th>
                <th className="w-24 px-2 py-2 text-left font-semibold">Returned</th>
                <th className="w-24 px-2 py-2 text-left font-semibold">Actual</th>
                <th className="w-24 px-2 py-2 text-left font-semibold">Check type</th>
                <th className="w-52 px-2 py-2 text-left font-semibold">Receiver</th>
                <th className="w-40 px-2 py-2 text-left font-semibold">Title</th>
              </tr>
            </thead>
            <tbody>
              {form.items.map((item, index) => <tr key={index} className="border-t border-neutral-100">
                <td className="px-2 py-1 text-neutral-400">{index + 1}</td>
                <td className="px-1 py-1"><input className={gridInput} maxLength={100} value={item.code} onChange={e => setItem(index, { code: e.target.value })} /></td>
                <td className="px-1 py-1"><input className={gridInput} maxLength={500} value={item.item_name} onChange={e => setItem(index, { item_name: e.target.value })} /></td>
                <td className="px-1 py-1">
                  <select className={gridInput} value={item.unit} onChange={e => setItem(index, { unit: e.target.value })}>
                    <option value="">—</option>
                    {UNITS.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1 text-neutral-500">{item.qty_requested === '' ? '—' : item.qty_requested}</td>
                <td className="px-1 py-1"><input type="number" min="0" step="any" className={gridInput} value={item.qty_released} onChange={e => setItem(index, { qty_released: e.target.value })} /></td>
                <td className="px-1 py-1"><input type="number" min="0" step="any" className={gridInput} value={item.qty_returned} onChange={e => setItem(index, { qty_returned: e.target.value })} /></td>
                <td className="px-1 py-1"><input type="number" min="0" step="any" className={gridInput} value={item.actual_qty} onChange={e => setItem(index, { actual_qty: e.target.value, actual_touched: true })} /></td>
                <td className="px-1 py-1"><input className={gridInput} maxLength={100} value={item.check_type} onChange={e => setItem(index, { check_type: e.target.value })} /></td>
                <td className="px-1 py-1">
                  <ReceiverPicker
                    value={item.receiver_name}
                    onPick={({ id, name, title }) => setItem(index, {
                      receiver_employee_id: id,
                      receiver_name: name,
                      ...(title === null ? {} : { receiver_title: title }),
                    })}
                  />
                </td>
                <td className="px-1 py-1"><input className={gridInput} maxLength={255} value={item.receiver_title} onChange={e => setItem(index, { receiver_title: e.target.value })} /></td>
              </tr>)}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between">
          <button type="button" onClick={addRow} className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-secondary hover:bg-neutral-50">
            <Plus className="h-3.5 w-3.5" />Add item
          </button>
          <p className="text-xs text-neutral-500">
            Inventory Responsibility: <strong className="text-secondary">{specialist?.name || note.inventory_specialist_name || 'Not configured'}</strong>
            {(specialist?.position || note.inventory_specialist_title) && ` · ${specialist?.position || note.inventory_specialist_title}`}
          </p>
        </div>

        {(note.activities?.length ?? 0) > 0 && <ActivityLog activities={note.activities} />}
      </div>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-neutral-200 bg-white px-5 py-4">
        <label className="mr-auto flex min-w-64 flex-1 items-center gap-2">
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-neutral-500">Note to engineer</span>
          <input
            className={inputClass}
            maxLength={500}
            required={form.status === 'rejected'}
            placeholder={form.status === 'rejected' ? 'Why is it rejected?' : 'Optional'}
            value={form.store_remark}
            onChange={e => set('store_remark', e.target.value)}
          />
        </label>
        <select className="rounded-md border border-neutral-200 px-3 py-2 text-sm" value={form.status} onChange={e => set('status', e.target.value)}>
          <option value="pending">Pending store</option>
          <option value="ready_for_approval">Ready for approval</option>
          {canFulfil && <option value="released">Released</option>}
          {canFulfil && <option value="rejected">Rejected</option>}
          {canFulfil && <option value="closed">Closed</option>}
        </select>
        <button type="button" onClick={onClose} className="rounded-md border border-neutral-200 px-4 py-2 text-sm font-semibold">Cancel</button>
        {!canFulfil && form.status !== 'ready_for_approval' && <button
          type="button"
          onClick={() => set('status', 'ready_for_approval')}
          className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
        >Mark ready for approval</button>}
        <button disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}Save
        </button>
      </div>
    </form>
  </div>
}

export default function ReleaseNotesPage() {
  const user = useSelector(state => state.auth.user)
  const [notes, setNotes] = useState([])
  const [canFulfil, setCanFulfil]  = useState(false)
  const [canPrepare, setCanPrepare] = useState(false)
  const [canView, setCanView]       = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [requesting, setRequesting] = useState(undefined)
  const [fulfilling, setFulfilling] = useState(null)
  const [specialist, setSpecialist] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    getReleaseNotes()
      .then(result => {
        setNotes(result.data)
        setCanFulfil(result.canFulfil)
        setCanPrepare(result.canPrepare)
        setCanView(result.canView)
      })
      .catch(() => setNotes([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])
  useEffect(() => { getInventorySpecialist().then(setSpecialist).catch(() => setSpecialist(null)) }, [])

  const shown = useMemo(() => notes.filter(note =>
    (status === 'all' || note.status === status)
    && `${note.prn_number} ${note.trainset_asset_name || ''} ${note.work_order || ''} ${note.requested_by_name || ''}`
      .toLowerCase().includes(search.toLowerCase())
  ), [notes, search, status])

  const open = async note => {
    const { note: full } = await getReleaseNote(note.id)
    // Store staff and the Material Controller both work in the fulfilment
    // modal; store staff just see fewer status controls. Engineers get the
    // tracker view of their own note.
    if (canPrepare) setFulfilling(full)
    else setRequesting(full)
  }
  const download = async note => generateReleaseNote((await getReleaseNote(note.id)).note)
  const remove = async note => {
    if (!window.confirm(`Delete release note ${note.prn_number}? This cannot be undone.`)) return
    await deleteReleaseNote(note.id)
    setNotes(current => current.filter(item => item.id !== note.id))
  }

  return <div className="min-h-full bg-neutral-50 p-4 lg:p-6">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-secondary"><FileOutput className="h-6 w-6 text-primary" />Release Notes</h1>
        <p className="text-sm text-neutral-500">
          {canFulfil
            ? 'All part requests across the depot · you approve and sign'
            : canPrepare
              ? 'Every part request across the depot · you prepare and send for approval'
              : canView
                ? 'Every part request across the depot — read only'
                : 'Your part requests and where they stand'} · SRS-INV-P01-F06
        </p>
      </div>
      {!canView && <button onClick={() => setRequesting(null)} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-bold text-white">
        <Plus className="h-4 w-4" />Request parts
      </button>}
    </div>

    <div className="mb-4 flex flex-wrap gap-3 rounded-lg border border-neutral-200 bg-white p-3">
      <label className="relative min-w-64 flex-1">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
        <input className={`${inputClass} pl-9`} placeholder="Search PRN, trainset, work order, engineer…" value={search} onChange={e => setSearch(e.target.value)} />
      </label>
      <select className={`${inputClass} w-52`} value={status} onChange={e => setStatus(e.target.value)}>
        <option value="all">All statuses</option>
        <option value="pending">Pending store</option>
        <option value="ready_for_approval">Ready for approval</option>
        <option value="released">Released</option>
        <option value="rejected">Rejected</option>
        <option value="closed">Closed</option>
      </select>
    </div>

    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm">
        <thead className="bg-secondary text-white"><tr>
          {['PRN Number', 'Date', 'Requested by', 'Trainset / Asset', 'Work Order', 'Items', 'Status', 'Actions'].map(header =>
            <th key={header} className="px-4 py-3 text-left text-xs font-bold uppercase">{header}</th>)}
        </tr></thead>
        <tbody>
          {loading ? <tr><td colSpan="8" className="py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></td></tr>
            : shown.length === 0 ? <tr><td colSpan="8" className="py-16 text-center text-neutral-400">No release notes yet</td></tr>
              : shown.map(note => <tr key={note.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                <td className="px-4 py-3 font-bold text-primary">{note.prn_number}</td>
                <td className="px-4 py-3">{day(note.date)}</td>
                <td className="px-4 py-3">{note.requested_by_name || '—'}</td>
                <td className="px-4 py-3">{note.trainset_asset_name || '—'}</td>
                <td className="px-4 py-3">{note.work_order || '—'}</td>
                <td className="px-4 py-3">{note.items?.length ?? 0}</td>
                <td className="px-4 py-3"><span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusStyle[note.status]}`}>{statusLabel[note.status]}</span></td>
                <td className="px-4 py-3"><div className="flex gap-2">
                  <button onClick={() => open(note)} className="rounded-md border border-neutral-200 px-3 py-1.5 font-semibold hover:bg-neutral-100">
                    {canFulfil ? 'Review' : canPrepare ? 'Prepare' : 'Open'}
                  </button>
                  <button onClick={() => download(note)} title="Download Word" className="rounded-md border border-blue-200 p-2 text-blue-700 hover:bg-blue-50"><Download className="h-4 w-4" /></button>
                  {(canFulfil || note.created_by === user?.id) && <button onClick={() => remove(note)} title="Delete" className="rounded-md border border-red-200 p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>}
                </div></td>
              </tr>)}
        </tbody>
      </table></div>
    </div>

    {requesting !== undefined && <RequestModal
      note={requesting}
      readOnly={canView && !!requesting && requesting.created_by !== user?.id}
      onClose={() => setRequesting(undefined)}
      onSaved={() => { setRequesting(undefined); load() }}
    />}
    {fulfilling && <FulfilModal
      note={fulfilling}
      specialist={specialist}
      canFulfil={canFulfil}
      onClose={() => setFulfilling(null)}
      onSaved={() => { setFulfilling(null); load() }}
    />}
  </div>
}
