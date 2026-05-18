// src/components/HR/Attendance/AttendanceFilters.jsx
import { useState, useEffect } from 'react'
import { Search, Calendar } from 'lucide-react'

export default function AttendanceFilters({ filters, onFilterChange }) {
  const [localFilters, setLocalFilters] = useState(filters)

  useEffect(() => {
    setLocalFilters(filters)
  }, [filters])

  const handleChange = (key, value) => {
    const updated = { ...localFilters, [key]: value }
    setLocalFilters(updated)
    onFilterChange(updated)
  }

  return (
    <div className="bg-white border border-neutral-100 rounded-xl p-4 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        
        {/* Employee Search */}
        <div>
          <label className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-2 block">
            Employee
          </label>
          <div className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 rounded-lg px-3 h-9">
            <Search className="w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search by name or ID..."
              value={localFilters.employee_id || ''}
              onChange={(e) => handleChange('employee_id', e.target.value)}
              className="bg-transparent text-sm text-secondary-700 placeholder:text-neutral-400 outline-none w-full"
            />
          </div>
        </div>

        {/* Start Date */}
        <div>
          <label className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-2 block">
            Start Date
          </label>
          <div className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 rounded-lg px-3 h-9">
            <Calendar className="w-4 h-4 text-neutral-400" />
            <input
              type="date"
              value={localFilters.start_date || ''}
              onChange={(e) => handleChange('start_date', e.target.value)}
              className="bg-transparent text-sm text-secondary-700 outline-none w-full"
            />
          </div>
        </div>

        {/* End Date */}
        <div>
          <label className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-2 block">
            End Date
          </label>
          <div className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 rounded-lg px-3 h-9">
            <Calendar className="w-4 h-4 text-neutral-400" />
            <input
              type="date"
              value={localFilters.end_date || ''}
              onChange={(e) => handleChange('end_date', e.target.value)}
              className="bg-transparent text-sm text-secondary-700 outline-none w-full"
            />
          </div>
        </div>

        {/* Status */}
        <div>
          <label className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-2 block">
            Status
          </label>
          <select
            value={localFilters.status || ''}
            onChange={(e) => handleChange('status', e.target.value)}
            className="w-full h-9 px-3 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-secondary-700 outline-none"
          >
            <option value="">All Status</option>
            <option value="present">Present</option>
            <option value="absent">Absent</option>
            <option value="late">Late</option>
            <option value="wfh">WFH</option>
            <option value="intervention">Intervention</option>
            <option value="incomplete">Incomplete</option>
            <option value="shortage">Shortage</option>
          </select>
        </div>

        {/* Department */}
        <div>
          <label className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-2 block">
            Department
          </label>
          <select
            value={localFilters.department || ''}
            onChange={(e) => handleChange('department', e.target.value)}
            className="w-full h-9 px-3 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-secondary-700 outline-none"
          >
            <option value="">All Departments</option>
            <option value="cm">CM</option>
            <option value="pm">PM</option>
            <option value="warranty">Warranty</option>
            <option value="cm_intervention">CM (Intervention)</option>
            <option value="human_resources">Human Resources</option>
          </select>
        </div>

      </div>
    </div>
  )
}