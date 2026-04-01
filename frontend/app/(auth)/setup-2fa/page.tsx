'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, ShieldCheck, Copy, Check } from 'lucide-react'
import { get2FASetup, activate2FA, verify2FA } from '@/services/authService'
import { useAuthStore } from '@/store/authStore'
import { saveSession } from '@/services/api'
import { getMe } from '@/services/authService'

// ── Schema ────────────────────────────────────────────────────────────────────

const schema = z.object({
  code: z
    .string()
    .length(6, 'El codigo debe tener 6 digitos')
    .regex(/^\d+$/, 'Solo se permiten numeros'),
})

type TwoFAForm = z.infer<typeof schema>

// ── Componente ────────────────────────────────────────────────────────────────

export default function Setup2FAPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const mode = searchParams.get('mode') || 'verify'
  const tempToken = searchParams.get('temp_token') || ''

  const { setUser, setTokens } = useAuthStore()

  const [qrSvg, setQrSvg] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [copiedSecret, setCopiedSecret] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingQR, setIsLoadingQR] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<'qr' | 'backup' | 'verify'>(
    mode === 'setup' ? 'qr' : 'verify'
  )

  const { register, handleSubmit, formState: { errors } } = useForm<TwoFAForm>({
    resolver: zodResolver(schema),
  })

  // Cargar QR en modo setup
  useEffect(() => {
    if (mode === 'setup') {
      loadQR()
    }
  }, [mode])

  const loadQR = async () => {
    setIsLoadingQR(true)
    try {
      const res = await get2FASetup()
      if (res.success && res.data) {
        setQrSvg(res.data.qr_code_svg)
        setSecret(res.data.secret)
        setBackupCodes(res.data.backup_codes)
      }
    } catch {
      setError('Error al cargar el codigo QR')
    } finally {
      setIsLoadingQR(false)
    }
  }

  const copySecret = () => {
    if (secret) {
      navigator.clipboard.writeText(secret)
      setCopiedSecret(true)
      setTimeout(() => setCopiedSecret(false), 2000)
    }
  }

  const onSubmit = async (data: TwoFAForm) => {
    setIsLoading(true)
    setError(null)

    try {
      if (mode === 'setup') {
        // Activar 2FA con primer codigo
        const res = await activate2FA(data.code)
        if (!res.success) {
          setError(res.message)
          return
        }
        setStep('backup')
      } else {
        // Verificar 2FA en login externo
        const res = await verify2FA({ temp_token: tempToken, code: data.code })
        if (!res.success || !res.data) {
          setError(res.message || 'Codigo incorrecto')
          return
        }
        const { access_token, refresh_token } = res.data as { access_token: string; refresh_token: string }
        setTokens({ access_token, refresh_token, token_type: 'bearer' })
        const meRes = await getMe()
        if (meRes.success && meRes.data) {
          setUser(meRes.data)
        }
        router.push('/app')
      }
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } }
      setError(axiosError?.response?.data?.message || 'Error al verificar el codigo')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Vista: QR Setup ─────────────────────────────────────────────────────────

  if (step === 'qr') {
    return (
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="text-white" size={28} />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Configura tu autenticador</h1>
            <p className="text-slate-500 text-sm mt-1">
              Escanea el codigo QR con Google Authenticator o Microsoft Authenticator
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
              {error}
            </div>
          )}

          {isLoadingQR ? (
            <div className="flex justify-center py-8">
              <Loader2 size={32} className="animate-spin text-slate-400" />
            </div>
          ) : qrSvg ? (
            <>
              {/* QR Code */}
              <div
                className="flex justify-center mb-4 p-4 bg-white border border-slate-200 rounded-xl"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />

              {/* Secret manual */}
              <div className="bg-slate-50 rounded-lg p-3 mb-6">
                <p className="text-xs text-slate-500 mb-1">O ingresa este codigo manualmente:</p>
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono text-slate-900 flex-1 break-all">{secret}</code>
                  <button
                    onClick={copySecret}
                    className="text-slate-400 hover:text-slate-700 transition shrink-0"
                  >
                    {copiedSecret ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                  </button>
                </div>
              </div>

              {/* Formulario de confirmacion */}
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Ingresa el codigo de tu autenticador
                  </label>
                  <input
                    {...register('code')}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 text-center tracking-widest text-lg font-mono focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition"
                  />
                  {errors.code && (
                    <p className="text-red-500 text-xs mt-1">{errors.code.message}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-slate-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-slate-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isLoading && <Loader2 size={16} className="animate-spin" />}
                  {isLoading ? 'Verificando...' : 'Activar autenticador'}
                </button>
              </form>
            </>
          ) : null}
        </div>
      </div>
    )
  }

  // ── Vista: Backup Codes ─────────────────────────────────────────────────────

  if (step === 'backup') {
    return (
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="text-green-600" size={28} />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">2FA activado</h1>
            <p className="text-slate-500 text-sm mt-1">
              Guarda estos codigos de respaldo en un lugar seguro. Solo podras verlos una vez.
            </p>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 mb-6">
            <div className="grid grid-cols-2 gap-2">
              {backupCodes.map((code, i) => (
                <code key={i} className="text-sm font-mono text-slate-900 bg-white border border-slate-200 rounded px-3 py-1.5 text-center">
                  {code}
                </code>
              ))}
            </div>
          </div>

          <button
            onClick={() => router.push('/login')}
            className="w-full bg-slate-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-slate-700 transition"
          >
            Continuar al login
          </button>
        </div>
      </div>
    )
  }

  // ── Vista: Verificar codigo (login externo) ──────────────────────────────────

  return (
    <div className="w-full max-w-md">
      <div className="bg-white rounded-2xl shadow-lg p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="text-white" size={28} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Verificacion en dos pasos</h1>
          <p className="text-slate-500 text-sm mt-1">
            Ingresa el codigo de 6 digitos de tu autenticador
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Codigo de autenticacion
            </label>
            <input
              {...register('code')}
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              autoFocus
              className="w-full px-4 py-3 border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 text-center tracking-widest text-2xl font-mono focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition"
            />
            {errors.code && (
              <p className="text-red-500 text-xs mt-1">{errors.code.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-slate-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-slate-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading && <Loader2 size={16} className="animate-spin" />}
            {isLoading ? 'Verificando...' : 'Verificar'}
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