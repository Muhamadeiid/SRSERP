import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellRing, Wrench, X } from 'lucide-react'
import { useSelector } from 'react-redux'
import { getNotifications, markOneRead } from '../../services/leaveService'

const TASK_NOTIFICATION_TYPES = new Set([
  'maintenance_task_assigned',
  'maintenance_task_updated',
])

const TOAST_LIFETIME_MS = 10000
const POLL_INTERVAL_MS = 5000

export default function MaintenanceTaskToasts() {
  const navigate = useNavigate()
  const token = useSelector(state => state.auth.token)
  const [toasts, setToasts] = useState([])
  const knownIds = useRef(new Set())
  const initialized = useRef(false)
  const timers = useRef(new Map())

  const dismiss = useCallback(id => {
    const timer = timers.current.get(id)
    if (timer) clearTimeout(timer)
    timers.current.delete(id)
    setToasts(current => current.filter(item => item.id !== id))
  }, [])

  const fetchTaskNotifications = useCallback(async () => {
    if (!token) return

    try {
      const response = await getNotifications()
      const notifications = Array.isArray(response?.data) ? response.data : []
      const taskNotifications = notifications.filter(item =>
        TASK_NOTIFICATION_TYPES.has(String(item.type || item.event || '').toLowerCase())
      )

      if (!initialized.current) {
        taskNotifications.forEach(item => knownIds.current.add(item.id))
        initialized.current = true
        return
      }

      const incoming = taskNotifications.filter(item => !knownIds.current.has(item.id))
      if (!incoming.length) return

      incoming.forEach(item => {
        knownIds.current.add(item.id)
        timers.current.set(item.id, setTimeout(() => dismiss(item.id), TOAST_LIFETIME_MS))
      })
      setToasts(current => [...incoming.reverse(), ...current].slice(0, 4))
    } catch (_) {
      // The bell remains the fallback if a polling request is temporarily unavailable.
    }
  }, [dismiss, token])

  useEffect(() => {
    if (!token) {
      initialized.current = false
      knownIds.current.clear()
      setToasts([])
      return undefined
    }

    fetchTaskNotifications()
    const interval = setInterval(fetchTaskNotifications, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchTaskNotifications, token])

  useEffect(() => () => {
    timers.current.forEach(timer => clearTimeout(timer))
    timers.current.clear()
  }, [])

  const openTask = async notification => {
    dismiss(notification.id)
    if (!notification.read) {
      try {
        await markOneRead(notification.id)
      } catch (_) {
        // Navigation should still work if marking the notification is unavailable.
      }
    }
    navigate(notification.data?.path || '/maintenance')
  }

  if (!toasts.length) return null

  return (
    <div className="fixed right-3 sm:right-5 bottom-4 z-[100] w-[calc(100%-24px)] sm:w-[370px] space-y-3 pointer-events-none" aria-live="polite">
      {toasts.map(notification => (
        <div
          key={notification.id}
          className="pointer-events-auto overflow-hidden rounded-xl border border-blue-200 bg-white shadow-2xl animate-[fadeIn_.2s_ease-out]"
        >
          <div className="h-1 bg-blue-600" />
          <div className="flex items-start gap-3 p-4">
            <button
              type="button"
              onClick={() => openTask(notification)}
              className="flex min-w-0 flex-1 items-start gap-3 text-left"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700">
                {notification.type === 'maintenance_task_assigned'
                  ? <BellRing className="h-5 w-5" />
                  : <Wrench className="h-5 w-5" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-secondary-700">{notification.title || 'Maintenance task'}</span>
                <span className="mt-1 block text-xs leading-5 text-neutral-500">{notification.body}</span>
                <span className="mt-2 block text-[10px] font-bold uppercase tracking-wide text-blue-700">Open task</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => dismiss(notification.id)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              aria-label="Close task notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
