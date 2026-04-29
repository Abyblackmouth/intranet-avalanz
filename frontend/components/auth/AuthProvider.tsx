'use client'
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Cookies from 'js-cookie'
import { useAuthStore } from '@/store/authStore'
import { getMe } from '@/services/authService'

const INACTIVITY_TIMEOUT = 30 * 60 * 1000 // 30 minutos
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click']

const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter()
  const { setUser, logout, isAuthenticated } = useAuthStore()
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

    // Iniciar timer y escuchar actividad
    resetTimer()
    ACTIVITY_EVENTS.forEach(event => window.addEventListener(event, resetTimer, { passive: true }))

    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
      ACTIVITY_EVENTS.forEach(event => window.removeEventListener(event, resetTimer))
    }
  }, [])

  return <>{children}</>
}

export default AuthProvider
