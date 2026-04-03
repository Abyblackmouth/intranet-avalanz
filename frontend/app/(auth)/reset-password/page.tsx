'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Loader2, CheckCircle2, XCircle, Mail } from 'lucide-react'
import { requestPasswordReset, confirmPasswordReset } from '@/services/authService'

// ── Schemas ───────────────────────────────────────────────────────────────────

const requestSchema = z.object({
  email: z.string().email('Correo electronico invalido'),
})

const confirmSchema = z.object({
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

type RequestForm = z.infer<typeof requestSchema>
type ConfirmForm = z.infer<typeof confirmSchema>

// ── Reglas de contrasena ──────────────────────────────────────────────────────

const rules = [
  { label: 'Minimo 8 caracteres', test: (v: string) => v.length >= 8 },
  { label: 'Una letra mayuscula', test: (v: string) => /[A-Z]/.test(v) },
  { label: 'Una letra minuscula', test: (v: string) => /[a-z]/.test(v) },
  { label: 'Un numero', test: (v: string) => /\d/.test(v) },
  { label: 'Un caracter especial', test: (v: string) => /[!@#$%^&*(),.?":{}|<>]/.test(v) },
]

// ── Modal de exito ────────────────────────────────────────────────────────────

const SuccessModal = ({ onDone }: { onDone: () => void }) => {
  const [countdown, setCountdown] = useState(2)

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          setTimeout(onDone, 0)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [onDone])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="text-green-600" size={28} />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Contraseña actualizada</h2>
        <p className="text-slate-500 text-sm mb-4">
          Tu contraseña ha sido restablecida exitosamente.
        </p>
        <p className="text-xs text-slate-400">
          Redirigiendo al login en {countdown}...
        </p>
      </div>
    </div>
  )
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function ResetPasswordPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [success, setSuccess] = useState(false)

  const requestForm = useForm<RequestForm>({
    resolver: zodResolver(requestSchema),
  })

  const confirmForm = useForm<ConfirmForm>({
    resolver: zodResolver(confirmSchema),
  })

  const passwordValue = confirmForm.watch('new_password') || ''

  // ── Solicitar recuperacion ────────────────────────────────────────────────

  const onRequest = async (data: RequestForm) => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await requestPasswordReset({ email: data.email })
      if (res?.data?.success === false) {
        setError(res.data.message || 'No se pudo procesar la solicitud.')
      } else {
        setEmailSent(true)
      }
    } catch {
      setError('Error al enviar el correo. Intenta de nuevo.')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Confirmar nueva contrasena ─────────────────────────────────────────────

  const onConfirm = async (data: ConfirmForm) => {
    if (!token) return
    setIsLoading(true)
    setError(null)
    try {
      await confirmPasswordReset({ token, new_password: data.new_password })
      setSuccess(true)
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } }
      setError(axiosError?.response?.data?.message || 'Error al restablecer la contrasena')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Vista: Email enviado ──────────────────────────────────────────────────

  if (emailSent) {
    return (
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Mail className="text-slate-600" size={28} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Revisa tu correo</h1>
          <p className="text-slate-500 text-sm mt-2 mb-6">
            Si el correo existe en el sistema recibiras un enlace de recuperacion en los proximos minutos.
          </p>
          <button
            onClick={() => router.push('/login')}
            className="w-full text-slate-500 text-sm hover:text-slate-700 transition"
          >
            Volver al login
          </button>
        </div>
      </div>
    )
  }

  // ── Vista: Nueva contrasena (con token) ───────────────────────────────────

  if (token) {
    return (
      <>
        {success && <SuccessModal onDone={() => router.push('/login')} />}
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-white font-bold text-2xl">A</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900">Nueva contrasena</h1>
              <p className="text-slate-500 text-sm mt-1">Crea una nueva contrasena segura</p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-6">
                {error}
              </div>
            )}

            <form onSubmit={confirmForm.handleSubmit(onConfirm)} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Nueva contrasena
                </label>
                <div className="relative">
                  <input
                    {...confirmForm.register('new_password')}
                    type={showNew ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {confirmForm.formState.errors.new_password && (
                  <p className="text-red-500 text-xs mt-1">{confirmForm.formState.errors.new_password.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Confirmar contrasena
                </label>
                <div className="relative">
                  <input
                    {...confirmForm.register('confirm_password')}
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {confirmForm.formState.errors.confirm_password && (
                  <p className="text-red-500 text-xs mt-1">{confirmForm.formState.errors.confirm_password.message}</p>
                )}
              </div>

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
        </div>
      </>
    )
  }

  // ── Vista: Solicitar recuperacion ─────────────────────────────────────────

  return (
    <div className="w-full max-w-md">
      <div className="bg-white rounded-2xl shadow-lg p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-2xl">A</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Recuperar contrasena</h1>
          <p className="text-slate-500 text-sm mt-1">
            Ingresa tu correo y te enviaremos un enlace de recuperacion
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-6">
            {error}
          </div>
        )}

        <form onSubmit={requestForm.handleSubmit(onRequest)} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Correo electronico
            </label>
            <input
              {...requestForm.register('email')}
              type="email"
              placeholder="usuario@avalanz.com"
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition"
            />
            {requestForm.formState.errors.email && (
              <p className="text-red-500 text-xs mt-1">{requestForm.formState.errors.email.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-slate-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-slate-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading && <Loader2 size={16} className="animate-spin" />}
            {isLoading ? 'Enviando...' : 'Enviar enlace de recuperacion'}
          </button>

          <button
            type="button"
            onClick={() => router.push('/login')}
            className="w-full text-slate-500 text-sm hover:text-slate-700 transition"
          >
            Volver al login
          </button>
        </form>
      </div>

      <p className="text-center text-xs text-slate-400 mt-6">
        &copy; {new Date().getFullYear()} Avalanz. Todos los derechos reservados.
      </p>
    </div>
  )
}