import { useEffect, useState } from 'react'
import api from '@/services/api'
import { getSignedUrl } from '@/services/uploadService'
import { useAuthStore } from '@/store/authStore'

// Cache a nivel de modulo: la foto se pide una sola vez y se comparte entre
// todos los componentes que usen el hook (sidebar, header, etc.).
let cachedUrl: string | null = null
let cachedUserId: string | null = null
let inFlight: Promise<string | null> | null = null
const listeners = new Set<(u: string | null) => void>()

async function loadPhoto(userId: string): Promise<string | null> {
  try {
    const res = await api.get(`/api/v1/users/${userId}`)
    const key = res.data?.data?.photo_object_key
    if (!key) return null
    const signed = await getSignedUrl(key, 'dirdoc')
    return signed.data?.data?.url || signed.data?.url || null
  } catch {
    return null
  }
}

// Se llama tras cambiar la foto en el perfil para actualizar el avatar en vivo
export function refreshAvatarPhoto() {
  if (!cachedUserId) return
  cachedUrl = null
  inFlight = loadPhoto(cachedUserId).then((u) => {
    cachedUrl = u
    inFlight = null
    listeners.forEach((fn) => fn(u))
    return u
  })
}

export function useAvatarPhoto(): string | null {
  const { user } = useAuthStore()
  const userId = user?.user_id || null
  const [url, setUrl] = useState<string | null>(cachedUrl)

  useEffect(() => {
    if (!userId) return
    const sub = (u: string | null) => setUrl(u)
    listeners.add(sub)

    if (cachedUserId !== userId) {
      cachedUserId = userId
      cachedUrl = null
      inFlight = null
    }

    if (cachedUrl) {
      setUrl(cachedUrl)
    } else if (inFlight) {
      inFlight.then((u) => setUrl(u))
    } else {
      inFlight = loadPhoto(userId).then((u) => {
        cachedUrl = u
        inFlight = null
        listeners.forEach((fn) => fn(u))
        return u
      })
    }

    return () => { listeners.delete(sub) }
  }, [userId])

  return url
}
