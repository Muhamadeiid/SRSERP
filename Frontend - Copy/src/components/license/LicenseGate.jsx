import { useCallback, useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { AlertTriangle, Check, Copy, KeyRound, Lock, ShieldCheck, X } from 'lucide-react'
import { API_BASE_URL } from '../../config/api'
import { LICENSE_LOCKED_EVENT } from '../../services/licenseGuard'

const REFRESH_MS = 10 * 60 * 1000
const DISMISS_KEY = 'srs_license_notice_dismissed'

const LOCK_TITLE = {
  expired: 'License expired',
  missing: 'No license installed',
  invalid: 'License not valid for this server',
}

function KeyForm({ license, onActivated }) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard?.writeText(license.machine_code ?? '')
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const submit = async event => {
    event.preventDefault()
    if (!key.trim()) {
      setError('Paste the license key first.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`${API_BASE_URL}/license/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ key: key.trim() }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) {
        setError(data.message || 'The license key could not be activated.')
        return
      }
      onActivated(data.data)
    } catch {
      setError('Cannot reach the server.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Server code</p>
        <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
          <code className="min-w-0 flex-1 break-all text-xs text-secondary">{license.machine_code || 'Unavailable'}</code>
          <button type="button" onClick={copy} className="shrink-0 rounded p-1.5 text-neutral-500 hover:bg-white hover:text-primary" aria-label="Copy server code">
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-1 text-xs text-neutral-500">Send this code to your provider to receive a license key for this server.</p>
      </div>
      <div>
        <label htmlFor="license-key" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">License key</label>
        <textarea id="license-key" value={key} onChange={event => { setKey(event.target.value); setError('') }} rows={4}
          placeholder="SRS1...." className="w-full rounded-lg border border-neutral-200 px-3 py-2 font-mono text-xs focus:border-primary focus:outline-none" />
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </div>
      <button type="submit" disabled={busy}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-60">
        <KeyRound className="h-4 w-4" />{busy ? 'Activating…' : 'Activate license'}
      </button>
    </form>
  )
}

function LockScreen({ license, onActivated }) {
  return (
    <div className="flex min-h-screen min-h-[100dvh] items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
        <img src="/logo.png" alt="Rotem SRS Egypt" className="mb-6 h-10 w-auto" />
        <div className="mb-2 flex items-center gap-2 text-red-700"><Lock className="h-5 w-5" /><h1 className="text-lg font-bold">{LOCK_TITLE[license.status] ?? 'License required'}</h1></div>
        <p className="mb-6 text-sm text-neutral-600">
          {license.status === 'expired' && license.expires_at ? `The license ended on ${license.expires_at}. ` : ''}
          The system is locked until a valid license key is entered. All data is kept safe and nothing has been changed or deleted.
        </p>
        <KeyForm license={license} onActivated={onActivated} />
      </div>
    </div>
  )
}

// Shows the lock screen when the licence has ended, and warns admins before it does.
export default function LicenseGate({ children }) {
  const user = useSelector(state => state.auth.user)
  const [license, setLicense] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISS_KEY) === '1')

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/license`, { headers: { Accept: 'application/json' } })
      const data = await response.json()
      if (data?.success) setLicense(data.data)
    } catch {
      // keep the last known state when the server cannot be reached
    }
  }, [])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, REFRESH_MS)
    const onLocked = event => setLicense(current => ({ ...(current ?? {}), ...(event.detail ?? {}), locked: true }))
    window.addEventListener(LICENSE_LOCKED_EVENT, onLocked)
    window.addEventListener('focus', refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener(LICENSE_LOCKED_EVENT, onLocked)
      window.removeEventListener('focus', refresh)
    }
  }, [refresh])

  const activated = state => {
    setLicense(state)
    setShowForm(false)
    window.location.reload()
  }

  if (license?.locked) return <LockScreen license={license} onActivated={activated} />

  const isAdmin = user?.role === 'admin'
  const notice = isAdmin && license?.warn && !dismissed
  const message = license?.status === 'trial'
    ? `No license is installed. The system locks in ${license.grace_days_left} day${license.grace_days_left === 1 ? '' : 's'} (${license.grace_ends_at}).`
    : `The license ends in ${license?.days_left} day${license?.days_left === 1 ? '' : 's'} (${license?.expires_at}).`

  return (
    <>
      {children}
      {notice && (
        <div className="fixed bottom-4 right-4 z-[60] w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-900">License notice</p>
              <p className="mt-0.5 text-sm text-amber-800">{message}</p>
              <button type="button" onClick={() => setShowForm(true)} className="mt-2 text-sm font-semibold text-primary hover:underline">Enter a license key</button>
            </div>
            <button type="button" onClick={() => { sessionStorage.setItem(DISMISS_KEY, '1'); setDismissed(true) }}
              className="rounded p-1 text-amber-700 hover:bg-amber-100" aria-label="Dismiss"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}
      {showForm && license && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={event => event.stopPropagation()}>
            <div className="mb-4 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><h2 className="text-base font-bold text-secondary">Enter a license key</h2>
              <button type="button" onClick={() => setShowForm(false)} className="ml-auto rounded p-1 text-neutral-400 hover:bg-neutral-100" aria-label="Close"><X className="h-4 w-4" /></button></div>
            <KeyForm license={license} onActivated={activated} />
          </div>
        </div>
      )}
    </>
  )
}
