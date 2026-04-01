'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { login } from '@/services/authService'
import { useAuthStore } from '@/store/authStore'

// ── Schema de validacion ──────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email('Correo electronico invalido'),
  password: z.string().min(1, 'La contrasena es requerida'),
})

type LoginForm = z.infer<typeof loginSchema>

// ── Componente ────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter()
  const { setUser, setTokens } = useAuthStore()

  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true)
    setError(null)

    try {
      const res = await login(data)

      if (!res.success || !res.data) {
        setError(res.message || 'Error al iniciar sesion')
        return
      }

      const { action, user_id, temp_token, access_token, refresh_token } = res.data

      // Primer login — cambiar contrasena temporal
      if (action === 'change_password' && user_id) {
        router.push(`/change-password?user_id=${user_id}`)
        return
      }

      // Login externo — requiere 2FA
      if (action === '2fa_required' && temp_token) {
        router.push(`/setup-2fa?temp_token=${temp_token}&mode=verify`)
        return
      }

      // Login exitoso — red corporativa
      if (access_token && refresh_token) {
        setTokens({ access_token, refresh_token, token_type: 'bearer' })

        // Obtener datos del usuario
        const { getMe } = await import('@/services/authService')
        const meRes = await getMe()
        if (meRes.success && meRes.data) {
          setUser(meRes.data)
        }

        router.push('/app')
      }

    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } }
      setError(axiosError?.response?.data?.message || 'Error al iniciar sesion')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md">

      {/* Card */}
      <div className="bg-white rounded-2xl shadow-lg p-8">

        {/* Logo y titulo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-2xl">A</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Intranet Avalanz</h1>
          <p className="text-slate-500 text-sm mt-1">Inicia sesion en tu cuenta</p>
        </div>

        {/* Error global */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-6">
            {error}
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Correo electronico
            </label>
            <input
              {...register('email')}
              type="email"
              placeholder="usuario@avalanz.com"
              autoComplete="email"
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition"
            />
            {errors.email && (
              <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Contrasena
            </label>
            <div className="relative">
              <input
                {...register('password')}
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && (
              <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>
            )}
          </div>

          {/* Forgot password */}
          <div className="text-right">
            <a
              href="/reset-password"
              className="text-sm text-slate-500 hover:text-slate-900 transition"
            >
              Olvide mi contrasena
            </a>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-slate-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-slate-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading && <Loader2 size={16} className="animate-spin" />}
            {isLoading ? 'Iniciando sesion...' : 'Iniciar sesion'}
          </button>

        </form>
      </div>

      {/* Footer */}
      <p className="text-center text-xs text-slate-400 mt-6">
        &copy; {new Date().getFullYear()} Avalanz. Todos los derechos reservados.
      </p>

    </div>
  )
}