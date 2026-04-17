'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Loader2, CheckCircle2, XCircle, Mail, AlertCircle } from 'lucide-react'
import { requestPasswordReset, confirmPasswordReset } from '@/services/authService'

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

const rules = [
  { label: 'Minimo 8 caracteres', test: (v: string) => v.length >= 8 },
  { label: 'Una letra mayuscula', test: (v: string) => /[A-Z]/.test(v) },
  { label: 'Una letra minuscula', test: (v: string) => /[a-z]/.test(v) },
  { label: 'Un numero', test: (v: string) => /\d/.test(v) },
  { label: 'Un caracter especial', test: (v: string) => /[!@#$%^&*(),.?":{}|<>]/.test(v) },
]

const SuccessModal = ({ onDone }: { onDone: () => void }) => {
  const [countdown, setCountdown] = useState(2)
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { clearInterval(interval); setTimeout(onDone, 0); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [onDone])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-8 text-center" style={{ animation: 'fadeSlideUp 0.35s cubic-bezier(0.22,1,0.36,1) both' }}>
        <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="text-green-500" size={26} />
        </div>
        <h2 className="text-lg font-bold text-slate-900 mb-2">Contrasena actualizada</h2>
        <p className="text-slate-500 text-sm mb-4">Tu contrasena ha sido restablecida exitosamente.</p>
        <p className="text-xs text-slate-400">Redirigiendo al login en {countdown}...</p>
      </div>
    </div>
  )
}

const sharedStyles = `
  @keyframes fadeSlideUp {
    from { opacity: 0; transform: translateY(18px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20%       { transform: translateX(-6px); }
    40%       { transform: translateX(6px); }
    60%       { transform: translateX(-4px); }
    80%       { transform: translateX(4px); }
  }
  .auth-card { animation: fadeSlideUp 0.45s cubic-bezier(0.22,1,0.36,1) both; }
  .error-banner { animation: fadeIn 0.3s ease both, shake 0.4s ease 0.05s both; }
  .field-error { animation: fadeIn 0.25s ease both; }
  .auth-input {
    width: 100%; padding: 10px 14px;
    border: 1.5px solid #e2e8f0; border-radius: 10px;
    font-size: 14px; color: #0f172a; background: #ffffff;
    transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
    outline: none;
  }
  .auth-input::placeholder { color: #94a3b8; }
  .auth-input:hover { border-color: #cbd5e1; }
  .auth-input:focus {
    border-color: #1a4fa0;
    box-shadow: 0 0 0 3.5px rgba(26,79,160,0.10);
    background: #fafcff;
  }
  .auth-input.has-error { border-color: #f87171; box-shadow: 0 0 0 3.5px rgba(248,113,113,0.10); }
  .auth-btn {
    width: 100%; background: #1a4fa0; color: white;
    padding: 11px 0; border-radius: 10px;
    font-size: 14px; font-weight: 600; letter-spacing: 0.01em;
    border: none; cursor: pointer;
    transition: background 0.18s ease, transform 0.12s ease, box-shadow 0.18s ease;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    box-shadow: 0 2px 8px rgba(26,79,160,0.18);
  }
  .auth-btn:hover:not(:disabled) { background: #163f84; transform: translateY(-1px); box-shadow: 0 4px 14px rgba(26,79,160,0.28); }
  .auth-btn:active:not(:disabled) { transform: translateY(0px) scale(0.99); box-shadow: 0 1px 4px rgba(26,79,160,0.18); }
  .auth-btn:disabled { opacity: 0.65; cursor: not-allowed; }
  .eye-btn {
    position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
    background: none; border: none; cursor: pointer; color: #94a3b8;
    padding: 4px; border-radius: 6px;
    transition: color 0.15s ease, background 0.15s ease;
    display: flex; align-items: center;
  }
  .eye-btn:hover { color: #475569; background: #f1f5f9; }
  .back-btn {
    width: 100%; background: none; border: none; cursor: pointer;
    font-size: 13px; color: #64748b; padding: 8px 0;
    transition: color 0.15s ease;
  }
  .back-btn:hover { color: #1a4fa0; }
`

const Logo = () => (
  <div style={{ width: '120px', height: '120px', overflow: 'hidden', margin: '0 auto 2px' }}>
    <img src="/logo_200.png" alt="Avalanz" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
  </div>
)

const Card = ({ children }: { children: React.ReactNode }) => (
  <div className="auth-card" style={{
    background: 'white', borderRadius: '20px',
    boxShadow: '0 4px 6px rgba(0,0,0,0.04), 0 12px 40px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)',
    padding: '40px 36px 36px',
  }}>
    {children}
  </div>
)

const ErrorBanner = ({ message }: { message: string }) => (
  <div className="error-banner" style={{
    display: 'flex', alignItems: 'flex-start', gap: '10px',
    background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c',
    borderRadius: '10px', padding: '12px 14px', fontSize: '13.5px',
    marginBottom: '20px', lineHeight: '1.4',
  }}>
    <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
    <span>{message}</span>
  </div>
)

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

  const requestForm = useForm<RequestForm>({ resolver: zodResolver(requestSchema) })
  const confirmForm = useForm<ConfirmForm>({ resolver: zodResolver(confirmSchema) })
  const passwordValue = confirmForm.watch('new_password') || ''

  const onRequest = async (data: RequestForm) => {
    setIsLoading(true); setError(null)
    try {
      const res = await requestPasswordReset({ email: data.email })
      if (res?.data?.success === false) setError(res.data.message || 'No se pudo procesar la solicitud.')
      else setEmailSent(true)
    } catch { setError('Error al enviar el correo. Intenta de nuevo.') }
    finally { setIsLoading(false) }
  }

  const onConfirm = async (data: ConfirmForm) => {
    if (!token) return
    setIsLoading(true); setError(null)
    try {
      await confirmPasswordReset({ token, new_password: data.new_password })
      setSuccess(true)
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } }
      setError(axiosError?.response?.data?.message || 'Error al restablecer la contrasena')
    } finally { setIsLoading(false) }
  }

  // Email enviado
  if (emailSent) {
    return (
      <div className="w-full max-w-md">
        <style>{sharedStyles}</style>
        <Card>
          <div className="text-center">
            <div style={{ width: '56px', height: '56px', background: '#eff6ff', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Mail size={24} style={{ color: '#1a4fa0' }} />
            </div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.3px', marginBottom: '8px' }}>
              Revisa tu correo
            </h1>
            <p style={{ fontSize: '13.5px', color: '#64748b', lineHeight: '1.5', marginBottom: '24px' }}>
              Si el correo existe en el sistema recibiras un enlace de recuperacion en los proximos minutos.
            </p>
            <button className="back-btn" onClick={() => router.push('/login')}>
              Volver al login
            </button>
          </div>
        </Card>
        <p style={{ textAlign: 'center', fontSize: '12px', color: '#94a3b8', marginTop: '20px' }}>
          &copy; {new Date().getFullYear()} Avalanz. Todos los derechos reservados.
        </p>
      </div>
    )
  }

  // Nueva contrasena con token
  if (token) {
    return (
      <>
        <style>{sharedStyles}</style>
        {success && <SuccessModal onDone={() => router.push('/login')} />}
        <div className="w-full max-w-md">
          <Card>
            <div style={{ textAlign: 'center', marginBottom: '28px' }}>
              <Logo />
              <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.3px' }}>Nueva contrasena</h1>
              <p style={{ fontSize: '13.5px', color: '#64748b', marginTop: '20px', marginBottom: '-10px' }}>Crea una nueva contrasena segura</p>
            </div>
            {error && <ErrorBanner message={error} />}
            <form onSubmit={confirmForm.handleSubmit(onConfirm)} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>Nueva contrasena</label>
                <div style={{ position: 'relative' }}>
                  <input {...confirmForm.register('new_password')} type={showNew ? 'text' : 'password'} placeholder="••••••••" className={`auth-input${confirmForm.formState.errors.new_password ? ' has-error' : ''}`} style={{ paddingRight: '40px' }} />
                  <button type="button" onClick={() => setShowNew(!showNew)} className="eye-btn">{showNew ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                </div>
                {confirmForm.formState.errors.new_password && <p className="field-error" style={{ color: '#ef4444', fontSize: '12px', marginTop: '5px' }}>{confirmForm.formState.errors.new_password.message}</p>}
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

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>Confirmar contrasena</label>
                <div style={{ position: 'relative' }}>
                  <input {...confirmForm.register('confirm_password')} type={showConfirm ? 'text' : 'password'} placeholder="••••••••" className={`auth-input${confirmForm.formState.errors.confirm_password ? ' has-error' : ''}`} style={{ paddingRight: '40px' }} />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="eye-btn">{showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                </div>
                {confirmForm.formState.errors.confirm_password && <p className="field-error" style={{ color: '#ef4444', fontSize: '12px', marginTop: '5px' }}>{confirmForm.formState.errors.confirm_password.message}</p>}
              </div>

              <button type="submit" disabled={isLoading} className="auth-btn" style={{ marginTop: '4px' }}>
                {isLoading && <Loader2 size={15} className="animate-spin" />}
                {isLoading ? 'Guardando...' : 'Guardar contrasena'}
              </button>
            </form>
          </Card>
          <p style={{ textAlign: 'center', fontSize: '12px', color: '#94a3b8', marginTop: '20px' }}>
            &copy; {new Date().getFullYear()} Avalanz. Todos los derechos reservados.
          </p>
        </div>
      </>
    )
  }

  // Solicitar recuperacion
  return (
    <>
      <style>{sharedStyles}</style>
      <div className="w-full max-w-md">
        <Card>
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <Logo />
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.3px' }}>Recuperar contrasena</h1>
            <p style={{ fontSize: '13.5px', color: '#64748b', marginTop: '20px', marginBottom: '-10px' }}>
              Ingresa tu correo y te enviaremos un enlace de recuperacion
            </p>
          </div>
          {error && <ErrorBanner message={error} />}
          <form onSubmit={requestForm.handleSubmit(onRequest)} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>Correo electronico</label>
              <input {...requestForm.register('email')} type="email" placeholder="usuario@avalanz.com" autoComplete="email" className={`auth-input${requestForm.formState.errors.email ? ' has-error' : ''}`} />
              {requestForm.formState.errors.email && <p className="field-error" style={{ color: '#ef4444', fontSize: '12px', marginTop: '5px' }}>{requestForm.formState.errors.email.message}</p>}
            </div>
            <button type="submit" disabled={isLoading} className="auth-btn" style={{ marginTop: '4px' }}>
              {isLoading && <Loader2 size={15} className="animate-spin" />}
              {isLoading ? 'Enviando...' : 'Enviar enlace de recuperacion'}
            </button>
            <button type="button" onClick={() => router.push('/login')} className="back-btn">
              Volver al login
            </button>
          </form>
        </Card>
        <p style={{ textAlign: 'center', fontSize: '12px', color: '#94a3b8', marginTop: '20px' }}>
          &copy; {new Date().getFullYear()} Avalanz. Todos los derechos reservados.
        </p>
      </div>
    </>
  )
}