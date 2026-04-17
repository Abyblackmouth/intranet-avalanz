'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Cookies from 'js-cookie'
import { useAuthStore } from '@/store/authStore'
import { getMe } from '@/services/authService'

const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter()
  const { setUser, logout, isAuthenticated } = useAuthStore()

  useEffect(() => {
    const validate = async () => {
      const token = Cookies.get('access_token')

      // No hay token — limpiar estado y redirigir al login
      if (!token) {
        if (isAuthenticated) {
          logout()
        }
        return
      }

      // Hay token — validar con el servidor
      try {
        const res = await getMe()
        if (res.success && res.data) {
          const user = res.data
          // Si tiene contraseña temporal activa, forzar cambio
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

    validate()
  }, [])

  return <>{children}</>
}

export default AuthProvider