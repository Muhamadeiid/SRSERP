import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { attendanceService } from '../../services/Attendanceservice'

const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const stages = [
  ['pending_procurement', 'Procurement review', '#005782'],
  ['pending_ehs', 'EHS review', '#6489a5'],
  ['pending_depot', 'Depot approval', '#bc9454'],
  ['approved', 'Approved', '#17877f'],
  ['rejected', 'Rejected', '#c66a6a'],
  ['cancelled', 'Cancelled', '#a2adb5'],
]

export default function OperationsInsights({ hrAccess, procurementAccess, requests, refreshing }) {
  const navigate = useNavigate()
  const [week, setWeek] = useState({ rows: [], loading: true, error: false })
  useEffect(() => {
    if (!hrAccess || refreshing) return
    let active = true
    const end = new Date()
    const start = new Date(end)
    start.setDate(start.getDate() - 6)
    setWeek(previous => ({ ...previous, loading: previous.rows.length === 0, error: false }))
    attendanceService.getDashboardWeek(dateKey(start), dateKey(end))
      .then(response => {
        if (!Array.isArray(response?.data)) throw new Error('Invalid weekly data')
        if (active) setWeek({ rows: response.data, loading: false, error: false })
      })
      .catch(() => { if (active) setWeek(previous => ({ ...previous, loading: false, error: true })) })
    return () => { active = false }
  }, [hrAccess, refreshing])

  if (!hrAccess && !procurementAccess) return null
  const max = Math.max(1, ...week.rows.map(day => Number(day.present || 0) + Number(day.leave || 0) + Number(day.absent || 0)))
  const counts = stages.map(([status, label, color]) => ({ status, label, color, count: requests.filter(request => request.status === status).length }))
  const largestStage = Math.max(1, ...counts.map(stage => stage.count))

  return <div className={`grid min-w-0 gap-5 ${hrAccess && procurementAccess ? 'xl:grid-cols-2' : 'grid-cols-1'}`}>
    {hrAccess && <section className="operations-insight">
      <header><div><p className="operations-section-kicker">WORKFORCE PULSE</p><h2>Attendance overview</h2><p>Last 7 days · employees per day</p></div><button type="button" onClick={() => navigate('/human-resources/attendance')}>View attendance →</button></header>
      <div className="insight-legend"><span><i style={{ background: '#005782' }} />Present</span><span><i style={{ background: '#d7b776' }} />On leave</span><span><i style={{ background: '#d78d88' }} />Absent</span></div>
      {week.error && week.rows.length > 0 && <p className="insight-footnote" role="status">Showing the last loaded data. Refresh to retry.</p>}
      {week.loading && !week.rows.length ? <div className="insight-placeholder" role="status">Loading attendance…</div> : week.error && !week.rows.length ? <div className="insight-placeholder" role="status">Attendance could not be loaded. Use Refresh to try again.</div> : !week.rows.length ? <div className="insight-placeholder">No attendance data for this period</div> : <>
        <div className="attendance-bars" aria-label="Daily attendance breakdown">
          {week.rows.map(day => {
            const present = Number(day.present || 0), leave = Number(day.leave || 0), absent = Number(day.absent || 0)
            const date = new Date(`${day.date}T00:00:00`)
            const description = `${day.date}: ${present} present, ${leave} on leave, ${absent} absent`
            return <button type="button" key={day.date} className="attendance-day" aria-label={description} title={description} onClick={() => navigate('/human-resources/attendance')}>
              <span className="attendance-stack"><span className="attendance-total">{present + leave + absent}</span><span style={{ height: `${absent / max * 150}px`, background: '#d78d88' }} /><span style={{ height: `${leave / max * 150}px`, background: '#d7b776' }} /><span style={{ height: `${present / max * 150}px`, background: '#005782' }} /></span>
              <span className="attendance-day-label">{date.toLocaleDateString('en-GB', { weekday: 'short' })}<small>{date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</small></span>
              <span className="attendance-tip">{present} present · {leave} leave · {absent} absent</span>
            </button>
          })}
        </div>
        <p className="insight-footnote">Daily totals follow the HR attendance report. Hover or focus a day for its breakdown.</p>
      </>}
    </section>}
    {procurementAccess && <section className="operations-insight">
      <header><div><p className="operations-section-kicker">PURCHASE REQUEST PIPELINE</p><h2>From request to approval</h2><p>Current distribution · all purchase requests</p></div><button type="button" onClick={() => navigate('/procurement/master')}>View requests →</button></header>
      {refreshing ? <div className="insight-placeholder" role="status">Loading requests…</div> : requests.length === 0 ? <div className="insight-placeholder">No purchase requests yet</div> : <div className="pipeline-bars">{counts.map(stage => <button type="button" key={stage.status} onClick={() => navigate(`/procurement/master?status=${stage.status}`)} aria-label={`${stage.label}: ${stage.count} requests`}><span className="pipeline-label">{stage.label}</span><span className="pipeline-track"><span style={{ width: `${stage.count / largestStage * 100}%`, background: stage.color }} /></span><strong>{stage.count}</strong></button>)}</div>}
      <p className="insight-footnote">Select a stage to open its requests.</p>
    </section>}
  </div>
}
