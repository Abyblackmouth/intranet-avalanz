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
        if (isAuthenticated) logout()
        return
      }
      try {
        const res = await getMe()
        if (res.success && res.data) {
          const user = res.data
          if ((user as any).is_temp_password) {
            router.push(`/change-password?user_id=${user.user_id}`)
            return
          }
          setUser(user)
        } else {
          logout()
          router.push('/login')
        }
      } catch {
        logout()
        router.push('/login')
      }
    }

    const handleInactivityLogout = () => {
      logout()
      router.push('/login')
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