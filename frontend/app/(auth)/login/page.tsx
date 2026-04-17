'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react'
import { login } from '@/services/authService'
import { useAuthStore } from '@/store/authStore'

const loginSchema = z.object({
  email: z.string().email('Correo electronico invalido'),
  password: z.string().min(1, 'La contrasena es requerida'),
})

type LoginForm = z.infer<typeof loginSchema>

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

      if (action === 'change_password' && user_id) {
        router.push(`/change-password?user_id=${user_id}`)
        return
      }

      if (action === '2fa_required' && temp_token) {
        router.push(`/setup-2fa?temp_token=${temp_token}&mode=verify`)
        return
      }

      if (access_token && refresh_token) {
        setTokens({ access_token, refresh_token, token_type: 'bearer' })
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
    <>
      <style>{`
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
        .login-card {
          animation: fadeSlideUp 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .error-banner {
          animation: fadeIn 0.3s ease both, shake 0.4s ease 0.05s both;
        }
        .field-error {
          animation: fadeIn 0.25s ease both;
        }
        .auth-input {
          width: 100%;
          padding: 10px 14px;
          border: 1.5px solid #e2e8f0;
          border-radius: 10px;
          font-size: 14px;
          color: #0f172a;
          background: #ffffff;
          transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
          outline: none;
        }
        .auth-input::placeholder { color: #94a3b8; }
        .auth-input:hover { border-color: #cbd5e1; }
        .auth-input:focus {
          border-color: #1a4fa0;
          box-shadow: 0 0 0 3.5px rgba(26, 79, 160, 0.10);
          background: #fafcff;
        }
        .auth-input.has-error {
          border-color: #f87171;
          box-shadow: 0 0 0 3.5px rgba(248, 113, 113, 0.10);
        }
        .auth-input.has-error:focus {
          border-color: #ef4444;
          box-shadow: 0 0 0 3.5px rgba(239, 68, 68, 0.12);
        }
        .auth-btn {
          width: 100%;
          background: #1a4fa0;
          color: white;
          padding: 11px 0;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          letter-spacing: 0.01em;
          border: none;
          cursor: pointer;
          transition: background 0.18s ease, transform 0.12s ease, box-shadow 0.18s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          box-shadow: 0 2px 8px rgba(26, 79, 160, 0.18);
        }
        .auth-btn:hover:not(:disabled) {
          background: #163f84;
          transform: translateY(-1px);
          box-shadow: 0 4px 14px rgba(26, 79, 160, 0.28);
        }
        .auth-btn:active:not(:disabled) {
          transform: translateY(0px) scale(0.99);
          box-shadow: 0 1px 4px rgba(26, 79, 160, 0.18);
        }
        .auth-btn:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }
        .eye-btn {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          color: #94a3b8;
          padding: 4px;
          border-radius: 6px;
          transition: color 0.15s ease, background 0.15s ease;
          display: flex;
          align-items: center;
        }
        .eye-btn:hover { color: #475569; background: #f1f5f9; }
        .forgot-link {
          font-size: 13px;
          color: #64748b;
          text-decoration: none;
          transition: color 0.15s ease;
          position: relative;
        }
        .forgot-link::after {
          content: '';
          position: absolute;
          bottom: -1px;
          left: 0;
          width: 0;
          height: 1px;
          background: #1a4fa0;
          transition: width 0.2s ease;
        }
        .forgot-link:hover { color: #1a4fa0; }
        .forgot-link:hover::after { width: 100%; }
      `}</style>

      <div className="w-full max-w-md login-card">

        {/* Card */}
        <div style={{
          background: 'white',
          borderRadius: '20px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.04), 0 12px 40px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)',
          padding: '40px 36px 36px',
        }}>

          {/* Logo y titulo */}
          <div className="text-center mb-8">
            <div style={{
              width: '120px',
              height: '120px',
              overflow: 'hidden',
              margin: '0 auto 2px',
            }}>
              <img
                src="/logo_200.png"
                alt="Avalanz"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.3px' }}>
              Intranet Avalanz
            </h1>
            <p style={{ fontSize: '13.5px', color: '#64748b', marginTop: '28px', marginBottom: '-20px' }}>
              Inicia sesion en tu cuenta
            </p>
          </div>

          {/* Error global */}
          {error && (
            <div className="error-banner" style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#b91c1c',
              borderRadius: '10px',
              padding: '12px 14px',
              fontSize: '13.5px',
              marginBottom: '20px',
              lineHeight: '1.4',
            }}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>{error}</span>
            </div>
          )}

          {/* Formulario */}
          <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

            {/* Email */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                Correo electronico
              </label>
              <input
                {...register('email')}
                type="email"
                placeholder="usuario@avalanz.com"
                autoComplete="email"
                className={`auth-input${errors.email ? ' has-error' : ''}`}
              />
              {errors.email && (
                <p className="field-error" style={{ color: '#ef4444', fontSize: '12px', marginTop: '5px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                Contrasena
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className={`auth-input${errors.password ? ' has-error' : ''}`}
                  style={{ paddingRight: '40px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="eye-btn"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {errors.password && (
                <p className="field-error" style={{ color: '#ef4444', fontSize: '12px', marginTop: '5px' }}>
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Forgot */}
            <div style={{ textAlign: 'right', marginTop: '-6px' }}>
              <a href="/reset-password" className="forgot-link">
                Olvide mi contrasena
              </a>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="auth-btn"
              style={{ marginTop: '4px' }}
            >
              {isLoading && <Loader2 size={15} className="animate-spin" />}
              {isLoading ? 'Iniciando sesion...' : 'Iniciar sesion'}
            </button>

          </form>
        </div>

        {/* Footer */}
        <p style={{ textAlign: 'center', fontSize: '12px', color: '#94a3b8', marginTop: '20px' }}>
          &copy; {new Date().getFullYear()} Avalanz. Todos los derechos reservados.
        </p>

      </div>
    </>
  )
}