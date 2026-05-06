// src/components/HR/Attendance/AttendanceTimeline.jsx
import { Clock, Edit2, Trash2 } from 'lucide-react'

const STATUS_CONFIG = {
  present: {
    label: 'Present',
    color: 'bg-green-500',
    bgColor: 'bg-green-50',
    textColor: 'text-green-700',
    borderColor: 'border-green-200',
  },
  shortage: {
    label: 'Shortage',
    color: 'bg-orange-500',
    bgColor: 'bg-orange-50',
    textColor: 'text-orange-700',
    borderColor: 'border-orange-200',
  },
  late: {
    label: 'Late',
    color: 'bg-yellow-500',
    bgColor: 'bg-yellow-50',
    textColor: 'text-yellow-700',
    borderColor: 'border-yellow-200',
  },
  wfh: {
    label: 'WFH',
    color: 'bg-blue-500',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200',
  },
  intervention: {
    label: 'Intervention',
    color: 'bg-purple-500',
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-700',
    borderColor: 'border-purple-200',
  },
  absent: {
    label: 'Absent',
    color: 'bg-red-500',
    bgColor: 'bg-red-50',
    textColor: 'text-red-700',
    borderColor: 'border-red-200',
  },
  incomplete: {
    label: 'Incomplete',
    color: 'bg-neutral-400',
    bgColor: 'bg-neutral-50',
    textColor: 'text-neutral-600',
    borderColor: 'border-neutral-200',
  },
}

const formatTime = (time) => {
  if (!time) return '—'
  return time.substring(0, 5) // HH:MM
}

const formatDate = (dateStr) => {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { 
    weekday: 'short',
    day: '2-digit', 
    month: 'short',
    year: 'numeric'
  })
}

export default function AttendanceTimeline({ attendances, loading, onRefresh }) {
  
  if (loading) {
    return (
      <div className="bg-white border border-neutral-100 rounded-xl p-12">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="ml-3 text-sm text-neutral-400">Loading attendance...</p>
        </div>
      </div>
    )
  }

  if (!attendances || attendances.length === 0) {
    return (
      <div className="bg-white border border-neutral-100 rounded-xl p-12">
        <div className="text-center">
          <Clock className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-secondary-700">No attendance records found</p>
          <p className="text-xs text-neutral-400 mt-1">Try adjusting your filters or upload biometric data</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-neutral-100 rounded-xl overflow-hidden">
      
      {/* Header */}
      <div className="px-6 py-4 border-b border-neutral-100 bg-neutral-50/60">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-secondary-700">
            {attendances.length} Records Found
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50/60">
              <th className="text-left text-[11px] font-semibold text-neutral-400 uppercase tracking-widest px-6 py-3 whitespace-nowrap">
                Date
              </th>
              <th className="text-left text-[11px] font-semibold text-neutral-400 uppercase tracking-widest px-6 py-3 whitespace-nowrap">
                Employee
              </th>
              <th className="text-left text-[11px] font-semibold text-neutral-400 uppercase tracking-widest px-6 py-3 whitespace-nowrap">
                Check In
              </th>
              <th className="text-left text-[11px] font-semibold text-neutral-400 uppercase tracking-widest px-6 py-3 whitespace-nowrap">
                Check Out
              </th>
              <th className="text-left text-[11px] font-semibold text-neutral-400 uppercase tracking-widest px-6 py-3 whitespace-nowrap">
                Work Hours
              </th>
              <th className="text-left text-[11px] font-semibold text-neutral-400 uppercase tracking-widest px-6 py-3 whitespace-nowrap">
                Timeline
              </th>
              <th className="text-left text-[11px] font-semibold text-neutral-400 uppercase tracking-widest px-6 py-3 whitespace-nowrap">
                Status
              </th>
              <th className="text-left text-[11px] font-semibold text-neutral-400 uppercase tracking-widest px-6 py-3 whitespace-nowrap">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-50">
            {attendances.map((attendance) => {
              const statusCfg = STATUS_CONFIG[attendance.status] || STATUS_CONFIG.absent
              const workHours = parseFloat(attendance.work_hours || 0)
              const expectedHours = parseFloat(attendance.expected_hours || 8)
              
              // Calculate bar width (percentage of expected hours)
              const barWidth = Math.min((workHours / expectedHours) * 100, 100)
              
              return (
                <tr key={attendance.id} className="hover:bg-neutral-50/60 transition-colors group">
                  
                  {/* Date */}
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-secondary-700">
                      {formatDate(attendance.date)}
                    </p>
                  </td>

                  {/* Employee */}
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-sm font-semibold text-secondary-700">
                        {attendance.employee?.name || 'Unknown'}
                      </p>
                      <p className="text-xs text-neutral-400">
                        {attendance.employee?.department || '—'}
                      </p>
                    </div>
                  </td>

                  {/* Check In */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                      <span className="text-sm font-mono text-secondary-700">
                        {formatTime(attendance.check_in)}
                      </span>
                    </div>
                  </td>

                  {/* Check Out */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                      <span className="text-sm font-mono text-secondary-700">
                        {formatTime(attendance.check_out)}
                      </span>
                    </div>
                  </td>

                  {/* Work Hours */}
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-sm font-bold text-secondary-700">
                        {workHours.toFixed(2)}h
                      </p>
                      <p className="text-xs text-neutral-400">
                        / {expectedHours}h expected
                      </p>
                    </div>
                  </td>

                  {/* Timeline Bar */}
                  <td className="px-6 py-4">
                    <div className="w-32">
                      <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${statusCfg.color} rounded-full transition-all`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-neutral-400 mt-1">
                        {workHours.toFixed(1)}h / {expectedHours}h
                      </p>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className={`
                        text-[11px] font-semibold px-2.5 py-1 rounded-full border
                        ${statusCfg.bgColor} ${statusCfg.textColor} ${statusCfg.borderColor}
                      `}>
                        {statusCfg.label}
                      </span>
                      {attendance.is_manual && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
                          Manual
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        title="Edit"
                        className="p-1.5 rounded-lg hover:bg-primary-50 text-neutral-400 hover:text-primary transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {attendance.is_manual && (
                        <button
                          title="Delete"
                          className="p-1.5 rounded-lg hover:bg-red-50 text-neutral-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>

                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

    </div>
  )
}