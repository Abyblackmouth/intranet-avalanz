'use client'
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Cookies from 'js-cookie'
import { useAuthStore } from '@/store/authStore'
import { getMe } from '@/services/authService'
import AvisoVersion from '@/components/layout/AvisoVersion'

const INACTIVITY_TIMEOUT = 30 * 60 * 1000
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click']

const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter()
  // Al login recordando a donde iba (por ejemplo, el enlace de un correo a un ticket)
  const irAlLogin = () => {
    const v = window.location.pathname + window.location.search
    router.push(v.startsWith('/app') ? `/login?volver=${encodeURIComponent(v)}` : '/login')
  }
  const { setUser, logout, isAuthenticated } = useAuthStore()
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Prevents the browser back button from returning to the login page
  useEffect(() => {
    window.history.pushState(null, '', window.location.href)
    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href)
    }
    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  // Despues de una actualizacion, un navegador con la version anterior pide archivos que ya
  // no existen (ChunkLoadError) y la pagina se queda a medias: se recarga UNA vez con la nueva.
  useEffect(() => {
    const esVersionVieja = (m: string) => /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|Failed to find Server Action/i.test(m)
    const recargar = (m: string) => {
      if (!esVersionVieja(m)) return
      if (sessionStorage.getItem('recarga-version')) return   // una sola vez, para no ciclar
      sessionStorage.setItem('recarga-version', '1')
      window.location.reload()
    }
    const onError = (e: ErrorEvent) => recargar(String(e?.message ?? ''))
    const onRechazo = (e: PromiseRejectionEvent) => recargar(String((e?.reason as any)?.message ?? e?.reason ?? ''))
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRechazo)
    const limpiar = setTimeout(() => sessionStorage.removeItem('recarga-version'), 30_000)
    return () => { window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRechazo); clearTimeout(limpiar) }
  }, [])

  // Roles y modulos al dia: se vuelven a pedir cada 10 min y al regresar a la pestana
  // (la renovacion del token ya toma los roles actuales del usuario)
  useEffect(() => {
    const actualizar = async () => {
      if (!Cookies.get('access_token')) return
      try {
        const res = await getMe()
        if (res.success && res.data && !(res.data as any).is_temp_password) setUser(res.data)
      } catch { /* silencioso: se reintenta en la siguiente vuelta */ }
    }
    const alVolver = () => { if (document.visibilityState === 'visible') actualizar() }
    const cada = setInterval(actualizar, 10 * 60 * 1000)
    document.addEventListener('visibilitychange', alVolver)
    return () => { clearInterval(cada); document.removeEventListener('visibilitychange', alVolver) }
  }, [setUser])

  useEffect(() => {
    const validate = async () => {
      const token = Cookies.get('access_token')
      if (!token) {
        // Sin token (vencio o se borro): al login. Antes solo cerraba la sesion y la pagina
        // se quedaba girando en /app esperando un usuario que ya no llegaba.
        logout()
        irAlLogin()
        return
      }
      try {
        const res = await getMe()
        if (res.success && res.data) {
          const user = res.data
          if ((user as any).is_temp_password) {
            logout(); irAlLogin()
            return
          }
          setUser(user)
        } else {
          logout()
          irAlLogin()
        }
      } catch {
        logout()
        irAlLogin()
      }
    }

    const handleInactivityLogout = () => {
      logout()
      irAlLogin()
    }

    const resetTimer = () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
      inactivityTimer.current = setTimeout(handleInactivityLogout, INACTIVITY_TIMEOUT)
    }

    validate()
    resetTimer()
    ACTIVITY_EVENTS.forEach(event => window.addEventListener(event, resetTimer, { passive: true }))

    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
      ACTIVITY_EVENTS.forEach(event => window.removeEventListener(event, resetTimer))
    }
  }, [])

  return <><>{children}<AvisoVersion /></></>
}

export default AuthProvider
