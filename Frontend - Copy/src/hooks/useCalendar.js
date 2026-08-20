import { useCallback, useEffect, useMemo, useState } from 'react'
import { getCalendarEvents } from '../services/calendarService'

const dateKey = date => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function calendarRange(cursor) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const start = new Date(first)
  start.setDate(1 - first.getDay())
  const end = new Date(start)
  end.setDate(start.getDate() + 41)
  return { start, end, from: dateKey(start), to: dateKey(end) }
}

export default function useCalendar(cursor) {
  const range = useMemo(() => calendarRange(cursor), [cursor])
  const [events, setEvents] = useState([])
  const [nonWorkingDays, setNonWorkingDays] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await getCalendarEvents(range.from, range.to)
      setEvents(response.data || [])
      setNonWorkingDays(response.meta?.nonWorkingDays || [])
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Calendar data could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [range.from, range.to])

  useEffect(() => { refresh() }, [refresh])

  return { events, nonWorkingDays, loading, error, refresh, range }
}
