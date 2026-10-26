import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Download, History, Loader2, Save, Sparkles, Upload, X } from 'lucide-react'
import { generateMaintenanceSchedule, getMaintenanceHistory, getMaintenanceSchedule, saveMaintenanceSchedule, uploadMaintenanceSchedule } from '../services/maintenanceService'
import { exportMaintenanceSchedule } from '../utils/exportMaintenanceSchedule'

const EMPTY_META = { k6: '', k5: '', c_col: '', k19: '', remark: '' }
const META_COLUMNS = [['k6', 'K6', 70], ['k5', 'K5', 70], ['c_col', 'C', 70], ['k19', 'K19', 70], ['remark', 'Remark', 240]]
const SCHEDULE_TABLE_WIDTH = 1824
const isoDate = (year, month, day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

export default function MaintenanceSchedulePage() {
  const now = new Date()
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 })
  const [schedule, setSchedule] = useState(null)
  const [entries, setEntries] = useState({})
  const [meta, setMeta] = useState({})
  const [entryChanges, setEntryChanges] = useState({})
  const [metaChanges, setMetaChanges] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [generationWarnings, setGenerationWarnings] = useState([])
  const [cycleReport, setCycleReport] = useState([])
  const [showCycleReport, setShowCycleReport] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [notice, setNotice] = useState(null)
  const [tableScale, setTableScale] = useState(1)
  const fileRef = useRef()
  const tableViewportRef = useRef()

  useEffect(() => {
    const viewport = tableViewportRef.current
    if (!viewport || typeof ResizeObserver === 'undefined') return undefined

    const fitTable = () => setTableScale(Math.min(1, Math.max(0.55, viewport.clientWidth / SCHEDULE_TABLE_WIDTH)))
    const observer = new ResizeObserver(fitTable)
    observer.observe(viewport)
    fitTable()
    return () => observer.disconnect()
  }, [schedule])

  const load = useCallback(async () => {
    setLoading(true); setNotice(null)
    try {
      const response = await getMaintenanceSchedule(cursor.year, cursor.month)
      setSchedule(response.data); setEntries(response.data.entries || {}); setMeta(response.data.meta || {})
      setEntryChanges({}); setMetaChanges({})
    } catch (error) { setNotice({ error: true, text: error.message || 'Could not load the PM schedule.' }) }
    finally { setLoading(false) }
  }, [cursor])

  useEffect(() => { load() }, [load])

  const codeMap = useMemo(() => Object.fromEntries((schedule?.codes || []).map(code => [code.code, code])), [schedule])
  const days = useMemo(() => Array.from({ length: schedule?.days_in_month || 0 }, (_, index) => index + 1), [schedule])
  const dirtyCount = Object.keys(entryChanges).length + Object.keys(metaChanges).length
  const monthLabel = new Date(cursor.year, cursor.month - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const validation = useMemo(() => {
    if (!schedule) return []
    return schedule.trains.map(train => {
      const codes = days.map(day => entries[isoDate(cursor.year, cursor.month, day)]?.[train.id] || '')
      const counts = Object.fromEntries(['A', 'B1', 'B2', 'B3', 'G', 'C'].map(code => [code, codes.filter(value => value === code).length]))
      const aDays = codes.map((code, index) => code === 'A' || code === 'A+C' ? index + 1 : null).filter(Boolean)
      const gaps = aDays.slice(1).map((day, index) => day - aDays[index])
      return { train, counts, total: counts.A + counts.B1 + counts.B2 + counts.B3 + counts.G, gaps }
    })
  }, [cursor, days, entries, schedule])

  const moveMonth = delta => setCursor(current => {
    const date = new Date(current.year, current.month - 1 + delta, 1)
    return { year: date.getFullYear(), month: date.getMonth() + 1 }
  })

  const updateEntry = (date, trainId, code) => {
    setEntries(current => ({ ...current, [date]: { ...(current[date] || {}), [trainId]: code } }))
    setEntryChanges(current => ({ ...current, [`${date}:${trainId}`]: { date, train_id: trainId, code: code || null } }))
  }

  const updateMeta = (date, key, value) => {
    const next = { ...EMPTY_META, ...(meta[date] || {}), [key]: value }
    setMeta(current => ({ ...current, [date]: next }))
    setMetaChanges(current => ({ ...current, [date]: { date, ...next } }))
  }

  const save = async () => {
    if (!dirtyCount) return
    setSaving(true); setNotice(null)
    try {
      await saveMaintenanceSchedule({ changes: Object.values(entryChanges), meta: Object.values(metaChanges) })
      setEntryChanges({}); setMetaChanges({}); setNotice({ text: 'Schedule changes saved successfully.' })
    } catch (error) { setNotice({ error: true, text: error.message || 'Could not save schedule changes.' }) }
    finally { setSaving(false) }
  }

  const upload = async event => {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file) return
    setSaving(true); setNotice(null)
    try {
      const response = await uploadMaintenanceSchedule(file, cursor.year, cursor.month)
      const result = response.data
      if (result.year === cursor.year && result.month === cursor.month) await load()
      else setCursor({ year: result.year, month: result.month })
      setNotice({ text: `Excel imported: ${result.imported} entries${result.skipped ? `, ${result.skipped} skipped` : ''}.` })
    } catch (error) { setNotice({ error: true, text: error.message || 'Could not import the Excel schedule.' }) }
    finally { setSaving(false) }
  }

  const generate = async () => {
    setGenerating(true); setNotice(null); setGenerationWarnings([]); setCycleReport([])
    try {
      const response = await generateMaintenanceSchedule(cursor.year, cursor.month)
      const result = response.data
      if (result.replaces_existing && !window.confirm(`${monthLabel} already contains ${result.existing_count} saved entries. Replace them in the draft? Nothing will be changed until you click Save Changes.`)) return
      const generated = result.entries || {}
      const changes = {}
      const dates = new Set([...Object.keys(entries), ...Object.keys(generated)])
      dates.forEach(date => {
        const trainIds = new Set([...Object.keys(entries[date] || {}), ...Object.keys(generated[date] || {})])
        trainIds.forEach(trainId => {
          const code = generated[date]?.[trainId] || ''
          if ((entries[date]?.[trainId] || '') !== code) changes[`${date}:${trainId}`] = { date, train_id: trainId, code: code || null }
        })
      })
      setEntries(generated)
      setEntryChanges(changes)
      const generatedMeta = result.meta || {}
      if (Object.keys(generatedMeta).length) {
        const nextMeta = { ...meta }
        const nextMetaChanges = {}
        Object.entries(generatedMeta).forEach(([date, values]) => {
          nextMeta[date] = { ...EMPTY_META, ...(nextMeta[date] || {}), ...values }
          nextMetaChanges[date] = { date, ...nextMeta[date] }
        })
        setMeta(nextMeta)
        setMetaChanges(nextMetaChanges)
      }
      setGenerationWarnings(result.warnings || [])
      setCycleReport(result.cycle_report || [])
      setNotice({ text: `Draft generated with ${Object.values(generated).reduce((sum, row) => sum + Object.keys(row).length, 0)} planned entries. Review and edit it, then click Save Changes.` })
    } catch (error) { setNotice({ error: true, text: error.message || 'Could not generate the schedule.' }) }
    finally { setGenerating(false) }
  }

  const exportExcel = async () => {
    if (!schedule) return
    setExporting(true); setNotice(null)
    try {
      await exportMaintenanceSchedule({ schedule, entries, meta, year: cursor.year, month: cursor.month })
      setNotice({ text: 'Excel schedule downloaded successfully.' })
    } catch (error) { setNotice({ error: true, text: error.message || 'Could not create the Excel schedule.' }) }
    finally { setExporting(false) }
  }

  return <div className="min-h-full bg-neutral-50 p-4 lg:p-6">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="flex items-center gap-2 text-2xl font-bold text-secondary"><CalendarDays className="h-6 w-6 text-primary" />PM Schedule</h1><p className="text-sm text-neutral-500">Monthly preventive maintenance plan by train</p></div>
      <div className="flex flex-wrap gap-2">
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={upload} />
        <button type="button" disabled={saving} onClick={() => fileRef.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-md border border-neutral-200 bg-white px-4 text-sm font-semibold text-secondary hover:bg-neutral-50 disabled:opacity-50"><Upload className="h-4 w-4" />Upload Excel</button>
        <button type="button" disabled={loading || exporting || !schedule} onClick={exportExcel} className="inline-flex h-10 items-center gap-2 rounded-md border border-neutral-200 bg-white px-4 text-sm font-semibold text-secondary hover:bg-neutral-50 disabled:opacity-50">{exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Download Excel</button>
        <button type="button" onClick={() => setShowHistory(true)} className="inline-flex h-10 items-center gap-2 rounded-md border border-neutral-200 bg-white px-4 text-sm font-semibold text-secondary hover:bg-neutral-50"><History className="h-4 w-4" />Visit History</button>
        <button type="button" disabled={saving || generating || loading} onClick={generate} className="inline-flex h-10 items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-4 text-sm font-bold text-primary hover:bg-primary/10 disabled:opacity-50">{generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Generate Draft</button>
        <button type="button" disabled={!dirtyCount || saving} onClick={save} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-bold text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save Changes {dirtyCount ? `(${dirtyCount})` : ''}</button>
      </div>
    </div>
    <div className="mb-4 flex items-center justify-between rounded-md border border-neutral-200 bg-white p-3">
      <button type="button" onClick={() => moveMonth(-1)} className="rounded-md border border-neutral-200 p-2 hover:bg-neutral-50" title="Previous month"><ChevronLeft className="h-4 w-4" /></button>
      <strong className="text-base text-secondary">{monthLabel}</strong>
      <button type="button" onClick={() => moveMonth(1)} className="rounded-md border border-neutral-200 p-2 hover:bg-neutral-50" title="Next month"><ChevronRight className="h-4 w-4" /></button>
    </div>
    {notice && <div className={`mb-4 rounded-md border px-4 py-3 text-sm ${notice.error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{notice.text}</div>}
    {generationWarnings.length > 0 && <div className="mb-4 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><div className="mb-1 flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4" />Generation review ({generationWarnings.length})</div><ul className="max-h-28 overflow-auto pl-5 text-xs list-disc">{generationWarnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>}
    {showHistory && <VisitHistory year={cursor.year} month={cursor.month} onClose={() => setShowHistory(false)} />}
    {cycleReport.length > 0 && <CycleReport rows={cycleReport} open={showCycleReport} onToggle={() => setShowCycleReport(value => !value)} />}
    <div className="overflow-hidden rounded-md border border-neutral-200 bg-white shadow-sm">
      {loading ? <div className="flex h-80 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div> : !schedule ? <div className="flex h-80 items-center justify-center text-sm text-neutral-500">Schedule data is unavailable.</div> : <div ref={tableViewportRef} className="max-h-[calc(100vh-250px)] overflow-y-auto overflow-x-hidden">
        <table className="origin-top-left border-collapse text-xs" style={{ width: SCHEDULE_TABLE_WIDTH, minWidth: SCHEDULE_TABLE_WIDTH, tableLayout: 'fixed', zoom: tableScale }}>
          <colgroup>
            <col style={{ width: 40 }} />
            <col style={{ width: 96 }} />
            <col style={{ width: 48 }} />
            {schedule.trains.map(train => <col key={train.id} style={{ width: 56 }} />)}
            {META_COLUMNS.map(([key, , width]) => <col key={key} style={{ width }} />)}
          </colgroup>
          <thead className="sticky top-0 z-20 bg-secondary text-white"><tr>
            <th className="sticky left-0 z-30 border border-white/15 bg-secondary px-2 py-3 text-center">No</th>
            <th className="sticky left-10 z-30 border border-white/15 bg-secondary px-2 py-3 text-center">Date</th>
            <th className="sticky left-[136px] z-30 border border-white/15 bg-secondary px-2 py-3 text-center">D</th>
            {schedule.trains.map(train => <th key={train.id} className="border border-white/15 px-1 py-3 text-center">{train.id}</th>)}
            {META_COLUMNS.map(([key, label, width]) => <th key={key} className="border border-white/15 px-2 py-3 text-center" style={{ minWidth: width }}>{label}</th>)}
          </tr></thead>
          <tbody>{days.map(day => {
            const date = isoDate(cursor.year, cursor.month, day)
            const dateObject = new Date(cursor.year, cursor.month - 1, day)
            const friday = dateObject.getDay() === 5
            const rowBackground = friday ? '#A6A6A6' : '#FFFFFF'
            return <tr key={date} style={{ backgroundColor: rowBackground }}>
              <td className="sticky left-0 z-10 h-10 border border-neutral-300 px-2 text-center font-semibold" style={{ backgroundColor: rowBackground }}>{day}</td>
              <td className="sticky left-10 z-10 border border-neutral-300 px-2 text-center font-semibold tabular-nums" style={{ backgroundColor: rowBackground }}>{String(day).padStart(2, '0')}/{String(cursor.month).padStart(2, '0')}</td>
              <td className="sticky left-[136px] z-10 border border-neutral-300 px-2 text-center font-semibold" style={{ backgroundColor: rowBackground }}>{dateObject.toLocaleDateString('en-US', { weekday: 'short' })}</td>
              {schedule.trains.map(train => {
                const code = entries[date]?.[train.id] || ''; const config = codeMap[code]
                const whiteText = ['A+C', 'G', '9Y'].includes(code)
                return <td key={train.id} className="h-10 w-14 min-w-14 border border-neutral-300 p-0 text-center" style={{ backgroundColor: friday ? rowBackground : (config?.color_hex || '#FFFFFF') }}>
                  <select
                    aria-label={`${train.name} on ${date}`}
                    title={code ? `${train.name}: ${config?.name || code}` : `${train.name}: Not planned`}
                    value={code}
                    onChange={event => updateEntry(date, train.id, event.target.value)}
                    className="h-10 w-full cursor-pointer appearance-none border-0 bg-transparent p-0 text-center text-xs font-bold outline-none hover:bg-black/5 focus:ring-2 focus:ring-inset focus:ring-primary"
                    style={{
                      color: friday && !code ? '#333333' : whiteText ? '#FFFFFF' : '#111111',
                      appearance: 'none',
                      WebkitAppearance: 'none',
                      MozAppearance: 'none',
                      textAlign: 'center',
                      textAlignLast: 'center',
                    }}
                  >
                    <option value=""> </option>
                    {schedule.codes.map(item => <option key={item.code} value={item.code} style={{ color: '#111111', backgroundColor: item.color_hex }}>{item.code}</option>)}
                  </select>
                </td>
              })}
              {META_COLUMNS.map(([key]) => <td key={key} className="h-10 border border-neutral-300 p-0" style={{ backgroundColor: rowBackground }}><input aria-label={`${key} on ${date}`} value={meta[date]?.[key] || ''} onChange={event => updateMeta(date, key, event.target.value)} className="h-10 w-full border-0 bg-transparent px-2 text-center text-xs outline-none focus:bg-blue-50" /></td>)}
            </tr>
          })}</tbody>
        </table>
      </div>}
    </div>
    {schedule && <div className="mt-4 overflow-hidden rounded-md border border-neutral-200 bg-white shadow-sm">
      <div className="border-b border-neutral-200 px-4 py-3"><h2 className="font-bold text-secondary">Schedule Validation</h2><p className="text-xs text-neutral-500">A target: 15 days. Accepted balance range: 13-17 days.</p></div>
      <div className="overflow-x-auto"><table className="min-w-[1150px] w-full border-collapse text-xs"><thead className="bg-neutral-100"><tr><th className="border border-neutral-200 px-3 py-2 text-left">Check</th>{validation.map(item => <th key={item.train.id} className="border border-neutral-200 px-2 py-2 text-center">{item.train.id}</th>)}</tr></thead><tbody>
        {['A', 'B1', 'B2', 'B3', 'G', 'C'].map(code => <tr key={code}><th className="border border-neutral-200 px-3 py-2 text-left">{code}</th>{validation.map(item => <td key={item.train.id} className="border border-neutral-200 px-2 py-2 text-center">{item.counts[code]}</td>)}</tr>)}
        <tr className="font-bold"><th className="border border-neutral-200 px-3 py-2 text-left">TO</th>{validation.map(item => <td key={item.train.id} className="border border-neutral-200 px-2 py-2 text-center">{item.total}</td>)}</tr>
        <tr className="bg-yellow-100"><th className="border border-neutral-200 px-3 py-2 text-left">A gaps</th>{validation.map(item => <td key={item.train.id} className="border border-neutral-200 px-2 py-2 text-center">{item.gaps.length ? item.gaps.join(', ') : '-'}</td>)}</tr>
      </tbody></table></div>
    </div>}
    <div className="mt-3 flex flex-wrap gap-3 text-xs text-neutral-600">{schedule?.codes?.map(code => <span key={code.code} className="inline-flex items-center gap-1.5"><i className="h-3 w-3 border border-neutral-300" style={{ backgroundColor: code.color_hex }} />{code.code}: {code.name}</span>)}</div>
  </div>
}

const SOURCE_LABEL = { schedule: 'Saved schedule', '9y': '9Y restart' }
const STATUS_STYLE = {
  planned: ['Planned', 'bg-emerald-50 text-emerald-700 border-emerald-200'],
  postponed: ['Postponed', 'bg-amber-50 text-amber-800 border-amber-200'],
  no_visit: ['No visit', 'bg-red-50 text-red-700 border-red-200'],
  not_due: ['Not due', 'bg-neutral-50 text-neutral-500 border-neutral-200'],
  no_history: ['No B/G history', 'bg-red-50 text-red-700 border-red-200'],
}
const shortDate = (iso) => iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'

// How the generator worked out each train's B/G stage, oldest to newest
function CycleReport({ rows, open, onToggle }) {
  return <div className="mb-4 rounded-md border border-sky-200 bg-white">
    <button type="button" onClick={onToggle} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-bold text-secondary">
      <span>B/G cycle check ({rows.length} trains)</span>
      <span className="text-xs font-semibold text-sky-700">{open ? 'Hide' : 'Show how each B/G was calculated'}</span>
    </button>
    {open && <div className="max-h-96 overflow-auto border-t border-sky-100">
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 bg-sky-50 text-left text-[11px] uppercase tracking-wide text-sky-900">
          <tr>{['Train', 'Last visits (old → new)', 'Last 9Y', 'B/G reference used', 'Next stage', 'Due (window)', 'Planned this month', 'Result'].map(h => <th key={h} className="border-b border-sky-100 px-3 py-2 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const [label, style] = STATUS_STYLE[row.status] || [row.status, '']
            return <tr key={row.train} className="border-b border-neutral-100 align-top">
              <td className="px-3 py-2 font-bold">{row.train}</td>
              <td className="px-3 py-2 text-neutral-600">{row.history.length ? row.history.map(([d, c]) => `${shortDate(d)} ${c}`).join(' → ') : '—'}</td>
              <td className="px-3 py-2 text-neutral-600">{row.last_9y ? `${shortDate(row.last_9y[0])} – ${shortDate(row.last_9y[1])}` : '—'}</td>
              <td className="px-3 py-2">{row.reference ? <><b>{row.reference.code}</b> on {shortDate(row.reference.date)}<div className="text-[10px] text-neutral-400">{SOURCE_LABEL[row.reference.source] || row.reference.source}</div></> : '—'}</td>
              <td className="px-3 py-2 font-bold">{row.next_stage || '—'}</td>
              <td className="px-3 py-2">{row.due ? <>{shortDate(row.due)}<div className="text-[10px] text-neutral-400">from {shortDate(row.due_window_start)}</div></> : '—'}</td>
              <td className="px-3 py-2 text-neutral-700">{row.planned.length ? row.planned.map(([d, c]) => `${d.slice(8)} ${c}`).join(', ') : '—'}</td>
              <td className="px-3 py-2"><span className={`inline-block rounded border px-2 py-0.5 font-semibold ${style}`}>{label}</span></td>
            </tr>
          })}
        </tbody>
      </table>
      <p className="px-4 py-2 text-[11px] text-neutral-500">The next stage is due three months after the reference. A visit from 8 days before the due date becomes that stage. If a reference is wrong, correct that B/G in the saved schedule of its month and generate again.</p>
    </div>}
  </div>
}

const HISTORY_STYLE = {
  A: 'bg-yellow-100 text-yellow-900',
  B1: 'bg-green-200 text-green-900',
  B2: 'bg-green-200 text-green-900',
  B3: 'bg-green-200 text-green-900',
  G: 'bg-sky-300 text-sky-950',
  C: 'bg-white text-neutral-500',
  '9Y': 'bg-red-500 text-white',
}
const historyStyle = (code) => HISTORY_STYLE[code] || 'bg-neutral-100'
const monthKey = (year, month) => `${year}-${String(month).padStart(2, '0')}`

// Saved visits per train, oldest first: one column per train
function VisitHistory({ year, month, onClose }) {
  const [from, setFrom] = useState(monthKey(year, 1))
  const [to, setTo] = useState(monthKey(year, month))
  const [showC, setShowC] = useState(false)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setData(null)
    setError('')
    getMaintenanceHistory(from, to)
      .then(response => { if (active) setData(response.data) })
      .catch(err => { if (active) setError(err.message || 'Could not load the visit history.') })
    return () => { active = false }
  }, [from, to])

  const columns = useMemo(() => {
    if (!data) return []
    return data.trains.map(train => {
      const items = []
      for (const [date, code] of (data.visits[train.id] || [])) {
        const upper = String(code).toUpperCase()
        if (upper === 'C' && !showC) continue
        const last = items[items.length - 1]
        const isOverhaul = upper.startsWith('9Y')
        const days = last ? (new Date(`${date}T00:00:00`) - new Date(`${last.to}T00:00:00`)) / 86400000 : 99
        // a 9Y block or a two-day G is one entry
        if (last && ((isOverhaul && last.code === '9Y' && days <= 7) || (upper === 'G' && last.code === 'G' && days <= 3))) {
          last.to = date
          continue
        }
        items.push({ code: isOverhaul ? '9Y' : upper, from: date, to: date })
      }
      return { train, items }
    })
  }, [data, showC])
  const monthGroups = useMemo(() => {
    if (!data || !from || !to) return []
    const groups = []
    const cursor = new Date(`${from}-01T00:00:00`)
    const end = new Date(`${to}-01T00:00:00`)
    while (cursor <= end) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
      const itemsByTrain = Object.fromEntries(columns.map(column => [
        column.train.id,
        column.items.filter(item => item.from.slice(0, 7) === key),
      ]))
      groups.push({
        key,
        year: cursor.getFullYear(),
        month: cursor.toLocaleString('en', { month: 'short' }),
        rowCount: Math.max(1, ...Object.values(itemsByTrain).map(items => items.length)),
        itemsByTrain,
      })
      cursor.setMonth(cursor.getMonth() + 1)
    }
    return groups
  }, [columns, data, from, to])
  const yearRowSpans = useMemo(() => monthGroups.reduce((spans, group) => {
    spans[group.year] = (spans[group.year] || 0) + group.rowCount
    return spans
  }, {}), [monthGroups])
  const label = (item) => (item.to !== item.from ? `${shortDate(item.from)} – ${shortDate(item.to)}` : shortDate(item.from))

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={onClose}>
    <div className="flex max-h-[92vh] w-full max-w-[1600px] flex-col rounded-lg bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
      <div className="flex flex-wrap items-center gap-3 border-b border-neutral-200 px-4 py-3">
        <h2 className="mr-auto flex items-center gap-2 text-base font-bold text-secondary"><History className="h-4 w-4 text-primary" />Visit history (saved schedule)</h2>
        <label className="text-xs text-neutral-500">From <input type="month" value={from} max={to} onChange={event => setFrom(event.target.value)} className="ml-1 rounded border border-neutral-200 px-2 py-1 text-xs" /></label>
        <label className="text-xs text-neutral-500">To <input type="month" value={to} min={from} onChange={event => setTo(event.target.value)} className="ml-1 rounded border border-neutral-200 px-2 py-1 text-xs" /></label>
        <label className="flex items-center gap-1 text-xs text-neutral-600"><input type="checkbox" checked={showC} onChange={event => setShowC(event.target.checked)} />Show C</label>
        <button type="button" onClick={onClose} className="rounded p-1 text-neutral-400 hover:bg-neutral-100" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      <div className="overflow-auto">
        {error ? <p className="p-6 text-sm text-red-600">{error}</p>
          : !data ? <div className="flex h-60 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          : <table className="border-collapse text-[11px]">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="sticky left-0 z-30 w-[60px] min-w-[60px] border border-neutral-700 bg-neutral-800 px-2 py-2 text-white">#</th>
                <th className="sticky left-[60px] z-30 w-[64px] min-w-[64px] border border-neutral-700 bg-neutral-800 px-2 py-2 text-white" aria-label="Month" />
                {columns.map(({ train, items }) => <th key={train.id} className="min-w-[96px] border border-neutral-700 bg-neutral-800 px-2 py-2 text-white">{train.id}<div className="text-[10px] font-normal text-neutral-300">{items.length} entries</div></th>)}
              </tr>
            </thead>
            <tbody>
              {monthGroups.map((group, groupIndex) => Array.from({ length: group.rowCount }, (_, rowIndex) => {
                const firstMonthRow = rowIndex === 0
                const firstYearRow = firstMonthRow && (groupIndex === 0 || monthGroups[groupIndex - 1].year !== group.year)
                return <tr key={`${group.key}-${rowIndex}`} className={firstMonthRow ? 'border-t-2 border-t-neutral-400' : ''}>
                  {firstYearRow && <td rowSpan={yearRowSpans[group.year]} className="sticky left-0 z-[5] w-[60px] min-w-[60px] border border-neutral-300 bg-neutral-100 px-2 text-center align-middle font-bold text-neutral-600">
                    <span className="inline-block -rotate-90 whitespace-nowrap text-sm">{group.year}</span>
                  </td>}
                  {firstMonthRow && <td rowSpan={group.rowCount} className="sticky left-[60px] z-[4] w-[64px] min-w-[64px] border border-neutral-300 bg-neutral-50 px-2 text-center align-middle font-bold text-neutral-600">
                    <span className="inline-block -rotate-90 whitespace-nowrap text-xs">{group.month}</span>
                  </td>}
                  {columns.map(({ train }) => {
                    const item = group.itemsByTrain[train.id][rowIndex]
                    return <td key={train.id} className={`border border-neutral-200 px-1.5 py-1 text-center ${item ? historyStyle(item.code) : ''}`}>
                      {item ? <><b>{item.code}</b><div className="whitespace-nowrap text-[10px]">{label(item)}</div></> : ''}
                    </td>
                  })}
                </tr>
              }))}
            </tbody>
          </table>}
      </div>
      <p className="border-t border-neutral-100 px-4 py-2 text-[11px] text-neutral-500">Oldest at the top. A two-day G and each 9Y block show as one entry. These are the saved visits the generator uses as history; months that were never saved or uploaded are empty here.</p>
    </div>
  </div>
}
