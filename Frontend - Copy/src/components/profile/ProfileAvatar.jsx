import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Crop, Loader2, RotateCcw, Trash2, Upload, X, ZoomIn } from 'lucide-react'
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

const CROP_SIZE = 280
const OUTPUT_SIZE = 512
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export default function ProfileAvatar({ size = 'md', editable = true, className = '' }) {
  const dispatch = useDispatch()
  const user = useSelector(state => state.auth.user)
  const [photoUrl, setPhotoUrl] = useState(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cropImage, setCropImage] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const inputRef = useRef(null)
  const dragRef = useRef(null)

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

  const clearCrop = useCallback(() => {
    setCropImage(current => {
      if (current?.url) URL.revokeObjectURL(current.url)
      return null
    })
    setZoom(1)
    setPosition({ x: 0, y: 0 })
    dragRef.current = null
  }, [])

  useEffect(() => () => {
    if (cropImage?.url) URL.revokeObjectURL(cropImage.url)
  }, [cropImage?.url])

  const cropMetrics = useCallback((image = cropImage, nextZoom = zoom) => {
    if (!image) return null
    const scale = Math.max(CROP_SIZE / image.width, CROP_SIZE / image.height) * nextZoom
    return {
      scale,
      maxX: Math.max(0, (image.width * scale - CROP_SIZE) / 2),
      maxY: Math.max(0, (image.height * scale - CROP_SIZE) / 2),
    }
  }, [cropImage, zoom])

  const choosePhoto = event => {
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

    setError('')
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      clearCrop()
      setCropImage({ file, url, width: image.naturalWidth, height: image.naturalHeight })
      setZoom(1)
      setPosition({ x: 0, y: 0 })
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      setError('Could not read this image. Choose another file.')
    }
    image.src = url
  }

  const changeZoom = value => {
    const nextZoom = Number(value)
    const metrics = cropMetrics(cropImage, nextZoom)
    setZoom(nextZoom)
    setPosition(current => metrics ? {
      x: clamp(current.x, -metrics.maxX, metrics.maxX),
      y: clamp(current.y, -metrics.maxY, metrics.maxY),
    } : current)
  }

  const startDrag = event => {
    if (!cropImage) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, origin: position }
  }

  const drag = event => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return
    const metrics = cropMetrics()
    setPosition({
      x: clamp(dragRef.current.origin.x + event.clientX - dragRef.current.x, -metrics.maxX, metrics.maxX),
      y: clamp(dragRef.current.origin.y + event.clientY - dragRef.current.y, -metrics.maxY, metrics.maxY),
    })
  }

  const saveCrop = async () => {
    if (!cropImage) return
    setBusy(true)
    setError('')
    try {
      const image = new Image()
      image.src = cropImage.url
      await image.decode()
      const { scale } = cropMetrics()
      const sourceSize = CROP_SIZE / scale
      const sourceX = clamp(cropImage.width / 2 - (CROP_SIZE / 2 + position.x) / scale, 0, cropImage.width - sourceSize)
      const sourceY = clamp(cropImage.height / 2 - (CROP_SIZE / 2 + position.y) / scale, 0, cropImage.height - sourceSize)
      const canvas = document.createElement('canvas')
      canvas.width = OUTPUT_SIZE
      canvas.height = OUTPUT_SIZE
      const context = canvas.getContext('2d')
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
      context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
      if (!blob) throw new Error('Image processing failed.')
      const result = await uploadProfilePhoto(new File([blob], 'profile-photo.jpg', { type: 'image/jpeg' }))
      clearCrop()
      dispatch(refreshUser(result.user))
      window.dispatchEvent(new Event('srs-profile-photo-changed'))
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || 'Could not upload the profile photo.')
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
          <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-2xl">
            <header className="flex items-center border-b border-neutral-100 px-5 py-4">
              <div>
                <h2 className="text-sm font-bold text-secondary-700">Profile Photo</h2>
                <p className="mt-0.5 text-[11px] text-neutral-400">JPG, PNG or WEBP · maximum 3 MB</p>
              </div>
              <button type="button" disabled={busy} onClick={() => { clearCrop(); setOpen(false) }} className="ml-auto rounded p-1 text-neutral-400 hover:bg-neutral-100"><X className="h-4 w-4" /></button>
            </header>
            <div className="p-5 text-center">
              {cropImage ? (
                <>
                  <div
                    className="relative mx-auto cursor-move touch-none select-none overflow-hidden rounded-lg bg-neutral-900 shadow-inner"
                    style={{ width: CROP_SIZE, height: CROP_SIZE }}
                    onPointerDown={startDrag}
                    onPointerMove={drag}
                    onPointerUp={() => { dragRef.current = null }}
                    onPointerCancel={() => { dragRef.current = null }}
                  >
                    <img
                      src={cropImage.url}
                      alt="Crop profile photo"
                      draggable="false"
                      className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                      style={{
                        width: cropImage.width * cropMetrics().scale,
                        height: cropImage.height * cropMetrics().scale,
                        transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
                      }}
                    />
                    <div className="pointer-events-none absolute inset-0 rounded-full border-2 border-white/90 shadow-[0_0_0_80px_rgba(0,0,0,0.42)]" />
                    <div className="pointer-events-none absolute left-1/2 top-1/2 h-px w-5 -translate-x-1/2 bg-white/70" />
                    <div className="pointer-events-none absolute left-1/2 top-1/2 h-5 w-px -translate-y-1/2 bg-white/70" />
                  </div>
                  <div className="mx-auto mt-4 flex max-w-[280px] items-center gap-3">
                    <ZoomIn className="h-4 w-4 shrink-0 text-neutral-500" />
                    <input aria-label="Photo zoom" type="range" min="1" max="3" step="0.01" value={zoom} onChange={event => changeZoom(event.target.value)} className="w-full accent-primary" />
                    <button type="button" title="Reset crop" onClick={() => { setZoom(1); setPosition({ x: 0, y: 0 }) }} className="rounded p-1.5 text-neutral-500 hover:bg-neutral-100"><RotateCcw className="h-4 w-4" /></button>
                  </div>
                  <p className="mt-2 text-[11px] text-neutral-400">Drag to position · use Zoom to resize</p>
                </>
              ) : (
                <>
                  <div className="mx-auto h-28 w-28 overflow-hidden rounded-full bg-primary text-white flex items-center justify-center text-3xl font-bold border-4 border-white shadow-lg">
                    {photoUrl ? <img src={photoUrl} alt="Profile preview" className="h-full w-full object-cover" /> : initials(user?.name)}
                  </div>
                  <p className="mt-3 text-sm font-bold text-secondary-700">{user?.name}</p>
                </>
              )}
              {error && <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
              <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} className="hidden" />
              <div className="mt-5 flex justify-center gap-2">
                {cropImage ? (
                  <>
                    <button type="button" disabled={busy} onClick={clearCrop} className="inline-flex h-9 items-center rounded-md border border-neutral-200 px-4 text-xs font-bold text-neutral-600 hover:bg-neutral-50 disabled:opacity-50">Cancel</button>
                    <button type="button" disabled={busy} onClick={saveCrop} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-xs font-bold text-white disabled:opacity-50">
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crop className="h-4 w-4" />} Save Photo
                    </button>
                  </>
                ) : (
                  <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-xs font-bold text-white disabled:opacity-50">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {user?.has_profile_photo ? 'Change Photo' : 'Upload Photo'}
                  </button>
                )}
                {user?.has_profile_photo && !cropImage && (
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
