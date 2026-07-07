import { useEffect, useState } from 'react'
import { fetchLookups } from '../services/lookupService'

/**
 * Returns { departments, locations, categories, roles, loading }.
 * Cached across the app — first mount fetches, everyone else reuses.
 */
export function useLookups() {
  const [data, setData]     = useState(null)
  const [loading, setLoad]  = useState(!data)

  useEffect(() => {
    let cancelled = false
    fetchLookups()
      .then(d => { if (!cancelled) setData(d) })
      .finally(() => { if (!cancelled) setLoad(false) })
    return () => { cancelled = true }
  }, [])

  return {
    departments: data?.department ?? [],
    locations:   data?.location   ?? [],
    categories:  data?.category   ?? [],
    roles:       data?.role       ?? [],
    disciplinaryViolations: data?.disciplinary_violation ?? [],
    all:         data ?? {},
    loading,
  }
}
