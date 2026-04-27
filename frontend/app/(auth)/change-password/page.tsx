'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { changePassword } from '@/services/authService'

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

const rules = [
  { label: 'Minimo 8 caracteres', test: (v: string) => v.length >= 8 },
  { label: 'Una letra mayuscula', test: (v: string) => /[A-Z]/.test(v) },
  { label: 'Una letra minuscula', test: (v: string) => /[a-z]/.test(v) },
  { label: 'Un numero', test: (v: string) => /\d/.test(v) },
  { label: 'Un caracter especial', test: (v: string) => /[!@#$%^&*(),.?":{}|<>]/.test(v) },
]

const cardStyle: React.CSSProperties = {
  background: 'white',
  borderRadius: '20px',
  boxShadow: '0 4px 6px rgba(0,0,0,0.04), 0 12px 40px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)',
  padding: '40px 36px 36px',
}

const inputBase: React.CSSProperties = {
  width: '100%', padding: '10px 14px',
  border: '1.5px solid #e2e8f0', borderRadius: '10px',
  fontSize: '14px', color: '#0f172a', background: '#ffffff',
  outline: 'none', boxSizing: 'border-box',
}

const btnStyle: React.CSSProperties = {
  width: '100%', background: '#1a4fa0', color: 'white',
  padding: '11px 0', borderRadius: '10px',
  fontSize: '14px', fontWeight: 600, letterSpacing: '0.01em',
  border: 'none', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
  boxShadow: '0 2px 8px rgba(26,79,160,0.18)',
}

const eyeBtnStyle: React.CSSProperties = {
  position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
  background: 'none', border: 'none', cursor: 'pointer',
  color: '#94a3b8', padding: '4px', display: 'flex', alignItems: 'center',
}

function ChangePasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const userId = searchParams.get('user_id') || ''

  const [showNew, setShowNew] = useState(false)
  const [alreadyUsed, setAlreadyUsed] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (!userId) { setAlreadyUsed(true); setChecking(false); return }
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/internal/users/${userId}/info`)
      .then(r => r.json())
      .then(data => {
        if (!data.is_temp_password) setAlreadyUsed(true)
      })
      .catch(() => setAlreadyUsed(true))
      .finally(() => setChecking(false))
  }, [userId])

  const [showConfirm, setShowConfirm] = useState(false)
  const [focusNew, setFocusNew] = useState(false)
  const [focusConfirm, setFocusConfirm] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, watch, formState: { errors } } = useForm<ChangePasswordForm>({
    resolver: zodResolver(schema),
  })

  const passwordValue = watch('new_password') || ''

  const onSubmit = async (data: ChangePasswordForm) => {
    if (!userId) { setError('Usuario no identificado. Vuelve a iniciar sesion.'); return }
    setIsLoading(true); setError(null)
    try {
      const res = await changePassword({ user_id: userId, new_password: data.new_password })
      if (!res.success) { setError(res.message); return }
      sessionStorage.setItem(`pwd_changed_${userId}`, 'true')
      if (res.data?.action === 'setup_2fa') {
        const d = res.data as any
        if (d.access_token && d.refresh_token) {
          const { saveSession } = await import('@/services/api')
          saveSession(d.access_token, d.refresh_token)
        }
        router.push(`/setup-2fa?user_id=${userId}&mode=setup`)
      }
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } }
      setError(axiosError?.response?.data?.message || 'Error al cambiar la contrasena')
    } finally { setIsLoading(false) }
  }

  return (
    <div className="w-full max-w-md">
      {checking ? null : alreadyUsed ? (
        <div style={cardStyle}>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
              Link expirado
            </h1>
            <p style={{ fontSize: '13.5px', color: '#64748b', marginBottom: '8px' }}>
              Este link ya fue utilizado. Si necesitas cambiar tu contrasena puedes:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
              <button onClick={() => router.push('/reset-password')} style={{ background: 'none', border: '1.5px solid #1a4fa0', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', color: '#1a4fa0', padding: '10px', fontWeight: 500 }}>
                Olvide mi contrasena
              </button>
              <p style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>o contacta al administrador</p>
            </div>
            <button onClick={() => router.push('/login')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#1a4fa0' }}>
              Ir al login
            </button>
          </div>
        </div>
      ) : (
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.3px' }}>
            Crea tu contrasena
          </h1>
          <p style={{ fontSize: '13.5px', color: '#64748b', marginTop: '8px' }}>
            Tu contrasena temporal ha expirado. Crea una nueva contrasena segura.
          </p>
        </div>

        {error && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '10px', padding: '12px 14px', fontSize: '13.5px', marginBottom: '20px', lineHeight: '1.4' }}>
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
              Nueva contrasena
            </label>
            <div style={{ position: 'relative' }}>
              <input
                {...register('new_password')}
                type={showNew ? 'text' : 'password'}
                placeholder="••••••••"
                style={{ ...inputBase, paddingRight: '40px', borderColor: focusNew ? '#1a4fa0' : '#e2e8f0', boxShadow: focusNew ? '0 0 0 3.5px rgba(26,79,160,0.10)' : 'none', background: focusNew ? '#fafcff' : '#ffffff' }}
                onFocus={() => setFocusNew(true)}
                onBlur={() => setFocusNew(false)}
              />
              <button type="button" onClick={() => setShowNew(!showNew)} style={eyeBtnStyle}>
                {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {errors.new_password && (
              <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '5px' }}>{errors.new_password.message}</p>
            )}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
              Confirmar contrasena
            </label>
            <div style={{ position: 'relative' }}>
              <input
                {...register('confirm_password')}
                type={showConfirm ? 'text' : 'password'}
                placeholder="••••••••"
                style={{ ...inputBase, paddingRight: '40px', borderColor: focusConfirm ? '#1a4fa0' : '#e2e8f0', boxShadow: focusConfirm ? '0 0 0 3.5px rgba(26,79,160,0.10)' : 'none', background: focusConfirm ? '#fafcff' : '#ffffff' }}
                onFocus={() => setFocusConfirm(true)}
                onBlur={() => setFocusConfirm(false)}
              />
              <button type="button" onClick={() => setShowConfirm(!showConfirm)} style={eyeBtnStyle}>
                {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {errors.confirm_password && (
              <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '5px' }}>{errors.confirm_password.message}</p>
            )}
          </div>

          {passwordValue.length > 0 && (
            <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              {rules.map((rule) => (
                <div key={rule.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {rule.test(passwordValue)
                    ? <CheckCircle2 size={13} style={{ color: '#22c55e', flexShrink: 0 }} />
                    : <XCircle size={13} style={{ color: '#cbd5e1', flexShrink: 0 }} />}
                  <span style={{ fontSize: '11.5px', color: rule.test(passwordValue) ? '#15803d' : '#94a3b8' }}>{rule.label}</span>
                </div>
              ))}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            style={{ ...btnStyle, marginTop: '4px', opacity: isLoading ? 0.65 : 1, cursor: isLoading ? 'not-allowed' : 'pointer' }}
          >
            {isLoading && <Loader2 size={15} className="animate-spin" />}
            {isLoading ? 'Guardando...' : 'Guardar contrasena'}
          </button>
        </form>
      </div>
      )}
      <p style={{ textAlign: 'center', fontSize: '12px', color: '#94a3b8', marginTop: '20px' }}>
        &copy; 2026 Avalanz. Todos los derechos reservados.
      </p>
    </div>
  )
}

export default function ChangePasswordPage() {
  return (
    <Suspense fallback={null}>
      <ChangePasswordContent />
    </Suspense>
  )
}
