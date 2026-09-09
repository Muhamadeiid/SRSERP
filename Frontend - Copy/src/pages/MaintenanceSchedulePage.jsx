import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Save, Upload } from 'lucide-react'
import { getMaintenanceSchedule, saveMaintenanceSchedule, uploadMaintenanceSchedule } from '../services/maintenanceService'

const EMPTY_META = { k6: '', k5: '', c_col: '', k19: '', remark: '' }
const META_COLUMNS = [['k6', 'K6', 70], ['k5', 'K5', 70], ['c_col', 'C', 70], ['k19', 'K19', 70], ['remark', 'Remark', 240]]
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
  const [notice, setNotice] = useState(null)
  const fileRef = useRef()

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

  return <div className="min-h-full bg-neutral-50 p-4 lg:p-6">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="flex items-center gap-2 text-2xl font-bold text-secondary"><CalendarDays className="h-6 w-6 text-primary" />PM Schedule</h1><p className="text-sm text-neutral-500">Monthly preventive maintenance plan by train</p></div>
      <div className="flex flex-wrap gap-2">
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={upload} />
        <button type="button" disabled={saving} onClick={() => fileRef.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-md border border-neutral-200 bg-white px-4 text-sm font-semibold text-secondary hover:bg-neutral-50 disabled:opacity-50"><Upload className="h-4 w-4" />Upload Excel</button>
        <button type="button" disabled={!dirtyCount || saving} onClick={save} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-bold text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save Changes {dirtyCount ? `(${dirtyCount})` : ''}</button>
      </div>
    </div>
    <div className="mb-4 flex items-center justify-between rounded-md border border-neutral-200 bg-white p-3">
      <button type="button" onClick={() => moveMonth(-1)} className="rounded-md border border-neutral-200 p-2 hover:bg-neutral-50" title="Previous month"><ChevronLeft className="h-4 w-4" /></button>
      <strong className="text-base text-secondary">{monthLabel}</strong>
      <button type="button" onClick={() => moveMonth(1)} className="rounded-md border border-neutral-200 p-2 hover:bg-neutral-50" title="Next month"><ChevronRight className="h-4 w-4" /></button>
    </div>
    {notice && <div className={`mb-4 rounded-md border px-4 py-3 text-sm ${notice.error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{notice.text}</div>}
    <div className="overflow-hidden rounded-md border border-neutral-200 bg-white shadow-sm">
      {loading ? <div className="flex h-80 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div> : !schedule ? <div className="flex h-80 items-center justify-center text-sm text-neutral-500">Schedule data is unavailable.</div> : <div className="max-h-[calc(100vh-250px)] overflow-auto">
        <table className="border-collapse text-xs" style={{ minWidth: 1680 }}>
          <thead className="sticky top-0 z-20 bg-secondary text-white"><tr>
            <th className="sticky left-0 z-30 w-10 border border-white/15 bg-secondary px-2 py-3 text-center">No</th>
            <th className="sticky left-10 z-30 w-24 border border-white/15 bg-secondary px-2 py-3 text-center">Date</th>
            <th className="sticky left-[136px] z-30 w-12 border border-white/15 bg-secondary px-2 py-3 text-center">D</th>
            {schedule.trains.map(train => <th key={train.id} className="w-14 min-w-14 border border-white/15 px-1 py-3 text-center">{train.id}</th>)}
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
    <div className="mt-3 flex flex-wrap gap-3 text-xs text-neutral-600">{schedule?.codes?.map(code => <span key={code.code} className="inline-flex items-center gap-1.5"><i className="h-3 w-3 border border-neutral-300" style={{ backgroundColor: code.color_hex }} />{code.code}: {code.name}</span>)}</div>
  </div>
}
