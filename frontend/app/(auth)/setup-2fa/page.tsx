'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, ShieldCheck, Copy, Check, AlertCircle } from 'lucide-react'
import { get2FASetup, activate2FA, verify2FA, getMe } from '@/services/authService'
import { useAuthStore } from '@/store/authStore'

const schema = z.object({
  code: z.string().length(6, 'El codigo debe tener 6 digitos').regex(/^\d+$/, 'Solo se permiten numeros'),
})

type TwoFAForm = z.infer<typeof schema>

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

const backBtnStyle: React.CSSProperties = {
  width: '100%', background: 'none', border: 'none', cursor: 'pointer',
  fontSize: '13px', color: '#64748b', padding: '8px 0',
}

const footerStyle: React.CSSProperties = {
  textAlign: 'center', fontSize: '12px', color: '#94a3b8', marginTop: '20px',
}

function Setup2FAContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const mode = searchParams.get('mode') || 'verify'
  const tempToken = searchParams.get('temp_token') || ''

  const { setUser, setTokens } = useAuthStore()

  const [qrSvg, setQrSvg] = useState<string | null>(null)
  const [qrUri, setQrUri] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [copiedSecret, setCopiedSecret] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingQR, setIsLoadingQR] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<'qr' | 'backup' | 'verify'>(mode === 'setup' ? 'qr' : 'verify')

  const { register, handleSubmit, formState: { errors }, setValue } = useForm<TwoFAForm>({ resolver: zodResolver(schema) })

  useEffect(() => { if (mode === 'setup') loadQR() }, [mode])

  const loadQR = async () => {
    setIsLoadingQR(true)
    try {
      const res = await get2FASetup()
      if (res.success && res.data) { setQrSvg(res.data.qr_code_svg); setSecret(res.data.secret); setBackupCodes(res.data.backup_codes); setQrUri(`otpauth://totp/Avalanz:usuario?secret=${(res.data as any).secret}&issuer=Avalanz`) }
    } catch { setError('Error al cargar el codigo QR') }
    finally { setIsLoadingQR(false) }
  }

  const copySecret = () => {
    if (secret) { navigator.clipboard.writeText(secret); setCopiedSecret(true); setTimeout(() => setCopiedSecret(false), 2000) }
  }

  const onSubmit = async (data: TwoFAForm) => {
    setIsLoading(true); setError(null)
    try {
      if (mode === 'setup') {
        const res = await activate2FA(data.code)
        if (!res.success) { setError(res.message); return }
        setStep('backup')
      } else {
        const res = await verify2FA({ temp_token: tempToken, code: data.code })
        if (!res.success || !res.data) { setError(res.message || 'Codigo incorrecto'); setValue('code', ''); return }
        const { access_token, refresh_token } = res.data as { access_token: string; refresh_token: string }
        setTokens({ access_token, refresh_token, token_type: 'bearer' })
        const meRes = await getMe()
        if (meRes.success && meRes.data) setUser(meRes.data)
        router.push('/app')
      }
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } }
      setError(axiosError?.response?.data?.message || 'Error al verificar el codigo')
    } finally { setIsLoading(false) }
  }

  if (step === 'qr') {
    return (
      <div className="w-full max-w-md">
        <div style={cardStyle}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ width: '52px', height: '52px', background: '#eff6ff', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="9" height="9" fill="#f25022"/>
                <rect x="13" y="2" width="9" height="9" fill="#7fba00"/>
                <rect x="2" y="13" width="9" height="9" fill="#00a4ef"/>
                <rect x="13" y="13" width="9" height="9" fill="#ffb900"/>
              </svg>
            </div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.3px' }}>Microsoft Authenticator</h1>
            <p style={{ fontSize: '13.5px', color: '#64748b', marginTop: '8px' }}>
              Escanea el codigo QR con tu aplicacion autenticadora
            </p>
          </div>
          {error && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '10px', padding: '12px 14px', fontSize: '13.5px', marginBottom: '20px', lineHeight: '1.4' }}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '1px' }} /><span>{error}</span>
            </div>
          )}
          {isLoadingQR ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
              <Loader2 size={28} className="animate-spin" style={{ color: '#94a3b8' }} />
            </div>
          ) : qrSvg ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '16px', padding: '16px', background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '12px' }}>
                {qrUri && <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUri)}`} width={200} height={200} alt='QR Code' />}
              </div>
              <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '12px 14px', marginBottom: '20px' }}>
                <p style={{ fontSize: '11.5px', color: '#94a3b8', marginBottom: '6px' }}>O ingresa este codigo manualmente:</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <code style={{ fontSize: '13px', fontFamily: 'monospace', color: '#0f172a', flex: 1, wordBreak: 'break-all' }}>{secret}</code>
                  <button onClick={copySecret} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px', display: 'flex', alignItems: 'center' }}>
                    {copiedSecret ? <Check size={15} style={{ color: '#22c55e' }} /> : <Copy size={15} />}
                  </button>
                </div>
              </div>
              <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>Ingresa el codigo de tu autenticador</label>
                  <input {...register('code')} type="text" inputMode="numeric" maxLength={6} placeholder="000000"
                    style={{ ...inputBase, textAlign: 'center', fontSize: '26px', fontFamily: 'monospace', letterSpacing: '0.25em', padding: '14px' }} />
                  {errors.code && <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '5px' }}>{errors.code.message}</p>}
                </div>
                <button type="submit" disabled={isLoading} style={{ ...btnStyle, opacity: isLoading ? 0.65 : 1, cursor: isLoading ? 'not-allowed' : 'pointer' }}>
                  {isLoading && <Loader2 size={15} className="animate-spin" />}
                  {isLoading ? 'Verificando...' : 'Activar autenticador'}
                </button>
              </form>
            </>
          ) : null}
        </div>
      </div>
    )
  }

  if (step === 'backup') {
    return (
      <div className="w-full max-w-md">
        <div style={cardStyle}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ width: '52px', height: '52px', background: '#f0fdf4', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <ShieldCheck size={24} style={{ color: '#22c55e' }} />
            </div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.3px' }}>2FA activado</h1>
            <p style={{ fontSize: '13.5px', color: '#64748b', marginTop: '8px' }}>Guarda estos codigos de respaldo en un lugar seguro. Solo podras verlos una vez.</p>
          </div>
          <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '16px', marginBottom: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {backupCodes.map((code, i) => (
              <code key={i} style={{ fontSize: '13px', fontFamily: 'monospace', color: '#0f172a', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '8px 12px', textAlign: 'center' }}>
                {code}
              </code>
            ))}
          </div>
          <button onClick={async () => {
            const { clearSession } = await import('@/services/api')
            clearSession()
          }} style={btnStyle}>Continuar al login</button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md">
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>

          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.3px' }}>Verificacion en dos pasos</h1>
          <p style={{ fontSize: '13.5px', color: '#64748b', marginTop: '8px' }}>Ingresa el codigo de 6 digitos de tu autenticador</p>
        </div>
        {error && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '10px', padding: '12px 14px', fontSize: '13.5px', marginBottom: '20px', lineHeight: '1.4' }}>
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '1px' }} /><span>{error}</span>
          </div>
        )}
        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>Codigo de autenticacion</label>
            <input {...register('code')} type="text" inputMode="numeric" maxLength={6} placeholder="000000" autoFocus
              style={{ ...inputBase, textAlign: 'center', fontSize: '26px', fontFamily: 'monospace', letterSpacing: '0.25em', padding: '14px' }} />
            {errors.code && <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '5px' }}>{errors.code.message}</p>}
          </div>
          <button type="submit" disabled={isLoading} style={{ ...btnStyle, marginTop: '4px', opacity: isLoading ? 0.65 : 1, cursor: isLoading ? 'not-allowed' : 'pointer' }}>
            {isLoading && <Loader2 size={15} className="animate-spin" />}
            {isLoading ? 'Verificando...' : 'Verificar'}
          </button>
          <button type="button" onClick={() => router.push('/login')} style={backBtnStyle}>Volver al login</button>
        </form>
      </div>
      <p style={footerStyle}>&copy; 2026 Avalanz. Todos los derechos reservados.</p>
    </div>
  )
}
export default function Setup2FAPage() {
  return (
    <Suspense fallback={null}>
      <Setup2FAContent />
    </Suspense>
  )
}
