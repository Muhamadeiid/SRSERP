import { useEffect, useState } from 'react'
import api from '../../services/axios'

const photoCache = new Map()
const pendingPhotos = new Map()

const initials = name => String(name || 'User').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()

const loadUserPhoto = async userId => {
  if (photoCache.has(userId)) return photoCache.get(userId)
  if (pendingPhotos.has(userId)) return pendingPhotos.get(userId)
  const request = api.get(`/users/${userId}/profile-photo`, { responseType: 'blob' }).then(response => {
    const url = URL.createObjectURL(response.data)
    photoCache.set(userId, url)
    pendingPhotos.delete(userId)
    return url
  }).catch(error => {
    pendingPhotos.delete(userId)
    throw error
  })
  pendingPhotos.set(userId, request)
  return request
}

export default function UserAvatar({ user, name, size = 'md', className = '' }) {
  const displayName = name || user?.name || 'User'
  const [photoUrl, setPhotoUrl] = useState(() => user?.id ? photoCache.get(user.id) || null : null)
  const dimensions = size === 'sm' ? 'h-6 w-6 text-[8px]' : size === 'lg' ? 'h-10 w-10 text-xs' : 'h-8 w-8 text-[10px]'

  useEffect(() => {
    let active = true
    if (!user?.id || !user?.has_profile_photo) {
      setPhotoUrl(null)
      return () => { active = false }
    }
    loadUserPhoto(user.id).then(url => active && setPhotoUrl(url)).catch(() => active && setPhotoUrl(null))
    return () => { active = false }
  }, [user?.id, user?.has_profile_photo])

  return (
    <span title={displayName} className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary-700 font-bold text-white ${dimensions} ${className}`}>
      {photoUrl ? <img src={photoUrl} alt={displayName} className="h-full w-full object-cover" /> : initials(displayName)}
    </span>
  )
}
