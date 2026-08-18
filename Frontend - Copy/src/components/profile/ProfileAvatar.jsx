import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Loader2, Trash2, Upload, X } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import { getProfilePhoto, removeProfilePhoto, uploadProfilePhoto } from '../../services/authService'
import { refreshUser } from '../../store/slices/authSlice'

let cachedUserId = null
let cachedPhotoUrl = null
let loadingPhoto = null

const clearCachedPhoto = () => {
  if (cachedPhotoUrl) URL.revokeObjectURL(cachedPhotoUrl)
  cachedPhotoUrl = null
  cachedUserId = null
  loadingPhoto = null
}

const loadPhoto = async (userId, force = false) => {
  if (force) clearCachedPhoto()
  if (cachedPhotoUrl && cachedUserId === userId) return cachedPhotoUrl
  if (loadingPhoto) return loadingPhoto

  loadingPhoto = getProfilePhoto().then(blob => {
    cachedUserId = userId
    cachedPhotoUrl = URL.createObjectURL(blob)
    loadingPhoto = null
    return cachedPhotoUrl
  }).catch(error => {
    loadingPhoto = null
    throw error
  })
  return loadingPhoto
}

const initials = name => String(name || 'User')
  .split(' ')
  .filter(Boolean)
  .slice(0, 2)
  .map(part => part[0])
  .join('')
  .toUpperCase()

export default function ProfileAvatar({ size = 'md', editable = true, className = '' }) {
  const dispatch = useDispatch()
  const user = useSelector(state => state.auth.user)
  const [photoUrl, setPhotoUrl] = useState(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  const dimensions = size === 'sm' ? 'h-8 w-8 text-xs' : size === 'lg' ? 'h-16 w-16 text-xl' : 'h-[34px] w-[34px] text-sm'

  const refreshPhoto = useCallback(async (force = false) => {
    if (!user?.has_profile_photo) {
      setPhotoUrl(null)
      return
    }
    try {
      setPhotoUrl(await loadPhoto(user.id, force))
    } catch (_) {
      setPhotoUrl(null)
    }
  }, [user?.has_profile_photo, user?.id])

  useEffect(() => { refreshPhoto() }, [refreshPhoto])

  useEffect(() => {
    const sync = () => refreshPhoto(true)
    window.addEventListener('srs-profile-photo-changed', sync)
    return () => window.removeEventListener('srs-profile-photo-changed', sync)
  }, [refreshPhoto])

  const choosePhoto = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Choose a JPG, PNG, or WEBP image.')
      return
    }
    if (file.size > 3 * 1024 * 1024) {
      setError('The image must be 3 MB or smaller.')
      return
    }

    setBusy(true)
    setError('')
    try {
      const result = await uploadProfilePhoto(file)
      dispatch(refreshUser(result.user))
      window.dispatchEvent(new Event('srs-profile-photo-changed'))
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not upload the profile photo.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    setError('')
    try {
      const result = await removeProfilePhoto()
      clearCachedPhoto()
      setPhotoUrl(null)
      dispatch(refreshUser(result.user))
      window.dispatchEvent(new Event('srs-profile-photo-changed'))
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not remove the profile photo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => editable && setOpen(true)}
        title={editable ? 'Change profile photo' : user?.name}
        className={`relative shrink-0 overflow-hidden rounded-full bg-primary text-white font-bold flex items-center justify-center ring-offset-2 hover:ring-2 hover:ring-primary/30 ${dimensions} ${className}`}
      >
        {photoUrl ? <img src={photoUrl} alt={user?.name || 'Profile'} className="h-full w-full object-cover" /> : initials(user?.name)}
        {editable && <span className="absolute inset-x-0 bottom-0 hidden h-3 items-center justify-center bg-black/45 sm:flex"><Camera className="h-2 w-2" /></span>}
      </button>

      {open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/35 p-4" onMouseDown={event => event.target === event.currentTarget && !busy && setOpen(false)}>
          <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white shadow-2xl">
            <header className="flex items-center border-b border-neutral-100 px-5 py-4">
              <div>
                <h2 className="text-sm font-bold text-secondary-700">Profile Photo</h2>
                <p className="mt-0.5 text-[11px] text-neutral-400">JPG, PNG or WEBP · maximum 3 MB</p>
              </div>
              <button type="button" disabled={busy} onClick={() => setOpen(false)} className="ml-auto rounded p-1 text-neutral-400 hover:bg-neutral-100"><X className="h-4 w-4" /></button>
            </header>
            <div className="p-5 text-center">
              <div className="mx-auto h-28 w-28 overflow-hidden rounded-full bg-primary text-white flex items-center justify-center text-3xl font-bold border-4 border-white shadow-lg">
                {photoUrl ? <img src={photoUrl} alt="Profile preview" className="h-full w-full object-cover" /> : initials(user?.name)}
              </div>
              <p className="mt-3 text-sm font-bold text-secondary-700">{user?.name}</p>
              {error && <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
              <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} className="hidden" />
              <div className="mt-5 flex justify-center gap-2">
                <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-xs font-bold text-white disabled:opacity-50">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {user?.has_profile_photo ? 'Change Photo' : 'Upload Photo'}
                </button>
                {user?.has_profile_photo && (
                  <button type="button" disabled={busy} onClick={remove} className="inline-flex h-9 items-center gap-2 rounded-md border border-red-200 px-3 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50">
                    <Trash2 className="h-4 w-4" /> Remove
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
