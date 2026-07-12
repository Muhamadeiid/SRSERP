import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Wrench, Zap, CalendarClock, HardHat, Cog, ArrowRight, Construction,
  Loader2, CheckCircle2, Clock, AlertTriangle, BarChart3,
} from 'lucide-react'
import { getJobCardStats, getEquipmentStats } from '../services/maintenanceService'

const TABS = [
  {
    key: 'cm', title: 'CM — Corrective Maintenance',
    desc: 'Breakdown repairs, fault diagnosis, and corrective interventions.',
    icon: Zap, color: 'bg-red-100 text-red-600', accent: 'border-l-red-500',
    path: '/maintenance/cm',
  },
  {
    key: 'pm', title: 'PM — Preventive Maintenance',
    desc: 'Scheduled inspections, routine servicing, and compliance tracking.',
    icon: CalendarClock, color: 'bg-blue-100 text-blue-600', accent: 'border-l-blue-500',
    path: '/maintenance/pm',
  },
  {
    key: 'hm', title: 'HM — Heavy Maintenance',
    desc: 'Major overhauls, component rebuilds, and heavy repair programs.',
    icon: HardHat, color: 'bg-amber-100 text-amber-600', accent: 'border-l-amber-500',
    path: '/maintenance/hm',
  },
]

function StatMini({ label, value, color }) {
  return (
    <div className="text-center">
      <p className={`text-xl font-extrabold ${color}`}>{value}</p>
      <p className="text-[10px] text-neutral-400 mt-0.5">{label}</p>
    </div>
  )
}

export default function MaintenanceDashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [tabStats, setTabStats] = useState({})
  const [eqStats, setEqStats] = useState({})

  const fetchStats = useCallback(async () => {
    setLoading(true)
    try {
      const [cm, pm, hm, eq] = await Promise.all([
        getJobCardStats({ maintenance_type: 'cm' }),
        getJobCardStats({ maintenance_type: 'pm' }),
        getJobCardStats({ maintenance_type: 'hm' }),
        getEquipmentStats(),
      ])
      setTabStats({ cm: cm.data, pm: pm.data, hm: hm.data })
      setEqStats(eq.data ?? {})
    } catch (_) {}
    setLoading(false)
  }, [])

  useEffect(() => { fetchStats() }, [fetchStats])

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-extrabold text-secondary-700 flex items-center gap-2">
            <Wrench className="w-5 h-5 text-primary" />
            Maintenance Module
          </h1>
          <p className="text-xs text-neutral-400 mt-0.5">Corrective, preventive, and heavy maintenance workflows</p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-bold rounded-full">
          <Construction className="w-3.5 h-3.5" />
          Admin Preview
        </span>
      </div>

      {/* Equipment overview */}
      <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Cog className="w-4 h-4 text-neutral-400" />
          <h2 className="text-sm font-bold text-secondary-700">Fleet Overview</h2>
          <button onClick={() => navigate('/maintenance/equipment')} className="ml-auto text-xs font-bold text-primary hover:underline flex items-center gap-1">
            Equipment Register <ArrowRight className="w-3 h-3" />
          </button>
        </div>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-neutral-50 rounded-xl p-4">
              <p className="text-[10px] text-neutral-400 uppercase tracking-wider">Total Equipment</p>
              <p className="text-2xl font-extrabold text-secondary-700 mt-1">{eqStats.total ?? 0}</p>
            </div>
            <div className="bg-green-50 rounded-xl p-4">
              <p className="text-[10px] text-green-600 uppercase tracking-wider">Available</p>
              <p className="text-2xl font-extrabold text-green-700 mt-1">{eqStats.available ?? 0}</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-4">
              <p className="text-[10px] text-amber-600 uppercase tracking-wider">Under Maintenance</p>
              <p className="text-2xl font-extrabold text-amber-700 mt-1">{eqStats.underMaint ?? 0}</p>
            </div>
            <div className="bg-red-50 rounded-xl p-4">
              <p className="text-[10px] text-red-600 uppercase tracking-wider">Out of Service</p>
              <p className="text-2xl font-extrabold text-red-700 mt-1">{eqStats.oos ?? 0}</p>
            </div>
          </div>
        )}
      </div>

      {/* 3 Maintenance tabs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {TABS.map(tab => {
          const s = tabStats[tab.key] ?? {}
          return (
            <div key={tab.key} className={`bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden border-l-4 ${tab.accent}`}>
              <div className="p-5">
                <div className="flex items-start gap-3 mb-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tab.color}`}>
                    <tab.icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-bold text-secondary-700">{tab.title}</h2>
                    <p className="text-[10px] text-neutral-400 mt-0.5 leading-relaxed">{tab.desc}</p>
                  </div>
                </div>

                {loading ? (
                  <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-neutral-300" /></div>
                ) : (
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <StatMini label="Open" value={s.open ?? 0} color="text-amber-600" />
                    <StatMini label="In Progress" value={s.in_progress ?? 0} color="text-blue-600" />
                    <StatMini label="This Month" value={s.completed_this_month ?? 0} color="text-green-600" />
                  </div>
                )}

                {(s.critical ?? 0) > 0 && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-[11px] font-bold text-red-600">{s.critical} Critical</span>
                  </div>
                )}

                <button onClick={() => navigate(tab.path)}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-neutral-50 hover:bg-neutral-100 text-xs font-bold text-secondary-700 rounded-xl transition-colors">
                  Open {tab.key.toUpperCase()} <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
