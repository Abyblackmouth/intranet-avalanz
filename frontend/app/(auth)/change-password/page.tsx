'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { changePassword } from '@/services/authService'

// ── Schema ────────────────────────────────────────────────────────────────────

const schema = z.object({
  new_password: z
    .string()
    .min(8, 'Minimo 8 caracteres')
    .regex(/[A-Z]/, 'Debe contener al menos una mayuscula')
    .regex(/[a-z]/, 'Debe contener al menos una minuscula')
    .regex(/\d/, 'Debe contener al menos un numero')
    .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Debe contener al menos un caracter especial'),
  confirm_password: z.string(),
}).refine((data) => data.new_password === data.confirm_password, {
  message: 'Las contrasenas no coinciden',
  path: ['confirm_password'],
})

type ChangePasswordForm = z.infer<typeof schema>

// ── Reglas de contrasena ──────────────────────────────────────────────────────

const rules = [
  { label: 'Minimo 8 caracteres', test: (v: string) => v.length >= 8 },
  { label: 'Una letra mayuscula', test: (v: string) => /[A-Z]/.test(v) },
  { label: 'Una letra minuscula', test: (v: string) => /[a-z]/.test(v) },
  { label: 'Un numero', test: (v: string) => /\d/.test(v) },
  { label: 'Un caracter especial', test: (v: string) => /[!@#$%^&*(),.?":{}|<>]/.test(v) },
]

// ── Componente ────────────────────────────────────────────────────────────────

export default function ChangePasswordPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const userId = searchParams.get('user_id') || ''

  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, watch, formState: { errors } } = useForm<ChangePasswordForm>({
    resolver: zodResolver(schema),
  })

  const passwordValue = watch('new_password') || ''

  const onSubmit = async (data: ChangePasswordForm) => {
    if (!userId) {
      setError('Usuario no identificado. Vuelve a iniciar sesion.')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const res = await changePassword({ user_id: userId, new_password: data.new_password })

      if (!res.success) {
        setError(res.message)
        return
      }

      // Redirigir a configuracion de 2FA
      if (res.data?.action === 'setup_2fa') {
        router.push(`/setup-2fa?user_id=${userId}&mode=setup`)
      }

    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } }
      setError(axiosError?.response?.data?.message || 'Error al cambiar la contrasena')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="bg-white rounded-2xl shadow-lg p-8">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-2xl">A</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Crea tu contrasena</h1>
          <p className="text-slate-500 text-sm mt-1">
            Tu contrasena temporal ha expirado. Crea una nueva contrasena segura.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

          {/* Nueva contrasena */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Nueva contrasena
            </label>
            <div className="relative">
              <input
                {...register('new_password')}
                type={showNew ? 'text' : 'password'}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.new_password && (
              <p className="text-red-500 text-xs mt-1">{errors.new_password.message}</p>
            )}
          </div>

          {/* Reglas de contrasena */}
          {passwordValue.length > 0 && (
            <div className="bg-slate-50 rounded-lg p-3 space-y-1.5">
              {rules.map((rule) => (
                <div key={rule.label} className="flex items-center gap-2 text-xs">
                  {rule.test(passwordValue)
                    ? <CheckCircle2 size={14} className="text-green-500 shrink-0" />
                    : <XCircle size={14} className="text-slate-300 shrink-0" />
                  }
                  <span className={rule.test(passwordValue) ? 'text-green-700' : 'text-slate-400'}>
                    {rule.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Confirmar contrasena */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Confirmar contrasena
            </label>
            <div className="relative">
              <input
                {...register('confirm_password')}
                type={showConfirm ? 'text' : 'password'}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.confirm_password && (
              <p className="text-red-500 text-xs mt-1">{errors.confirm_password.message}</p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-slate-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-slate-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading && <Loader2 size={16} className="animate-spin" />}
            {isLoading ? 'Guardando...' : 'Guardar contrasena'}
          </button>

        </form>
      </div>

      <p className="text-center text-xs text-slate-400 mt-6">
        &copy; {new Date().getFullYear()} Avalanz. Todos los derechos reservados.
      </p>
    </div>
  )
}