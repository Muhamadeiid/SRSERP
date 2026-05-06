// src/components/HR/Attendance/ManualEntryModal.jsx
import { useState } from 'react'
import { X, Save, Loader } from 'lucide-react'
import { attendanceService } from '../../services/Attendanceservice'

export default function ManualEntryModal({ onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    employee_id: '',
    date: new Date().toISOString().split('T')[0],
    check_in: '',
    check_out: '',
    status: 'wfh',
    notes: '',
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    // Validation
    if (!formData.employee_id) {
      setError('Please select an employee')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await attendanceService.createManual(formData)
      
      if (response.success) {
        onSuccess()
      } else {
        setError(response.message || 'Failed to create manual entry')
      }
    } catch (err) {
      console.error('Manual entry error:', err)
      setError(err.response?.data?.message || 'Failed to create manual entry')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
          <div>
            <h3 className="text-lg font-bold text-secondary-700">Manual Attendance Entry</h3>
            <p className="text-xs text-neutral-400 mt-0.5">Add attendance record manually (WFH, corrections, etc.)</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {/* Employee ID */}
          <div>
            <label className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-2 block">
              Employee ID *
            </label>
            <input
              type="text"
              value={formData.employee_id}
              onChange={(e) => handleChange('employee_id', e.target.value)}
              placeholder="Enter employee ID or IBS code"
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm text-secondary-700 placeholder:text-neutral-400 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              required
            />
          </div>

          {/* Date */}
          <div>
            <label className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-2 block">
              Date *
            </label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => handleChange('date', e.target.value)}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm text-secondary-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              required
            />
          </div>

          {/* Status */}
          <div>
            <label className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-2 block">
              Status *
            </label>
            <select
              value={formData.status}
              onChange={(e) => handleChange('status', e.target.value)}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm text-secondary-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="wfh">Work From Home</option>
              <option value="present">Present</option>
              <option value="absent">Absent</option>
              <option value="intervention">Intervention</option>
            </select>
          </div>

          {/* Check In & Check Out */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-2 block">
                Check In
              </label>
              <input
                type="time"
                value={formData.check_in}
                onChange={(e) => handleChange('check_in', e.target.value)}
                className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm text-secondary-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-2 block">
                Check Out
              </label>
              <input
                type="time"
                value={formData.check_out}
                onChange={(e) => handleChange('check_out', e.target.value)}
                className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm text-secondary-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-2 block">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Add any notes or comments..."
              rows={3}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm text-secondary-700 placeholder:text-neutral-400 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={loading}
            className="px-5 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading && <Loader className="w-4 h-4 animate-spin" />}
            <Save className="w-4 h-4" />
            {loading ? 'Saving...' : 'Save Entry'}
          </button>
        </div>

      </div>
    </div>
  )
}