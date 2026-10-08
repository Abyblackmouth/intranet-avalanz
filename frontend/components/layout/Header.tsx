'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { ChevronDown, LogOut, User, Shield } from 'lucide-react'
import { Plus_Jakarta_Sans, Inter } from 'next/font/google'
import { useAuthStore } from '@/store/authStore'
import { useAvatarPhoto } from '@/hooks/useAvatarPhoto'
import { logout } from '@/services/authService'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { useWebSocket, useWSEvent } from '@/hooks/useWebSocket'
import { useToastStore } from '@/store/toastStore'
import Cookies from 'js-cookie'
import api from "@/services/api"

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['600', '700'], display: 'swap' })
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], display: 'swap' })

// Nombres de las pantallas que no vienen de los modulos del usuario
const PAGINAS_FIJAS: Record<string, string> = {
  '/admin': 'Panel admin', '/admin/users': 'Usuarios', '/admin/companies': 'Empresas', '/admin/groups': 'Grupos',
  '/admin/modules': 'Módulos', '/admin/roles': 'Roles', '/admin/permissions': 'Permisos', '/profile': 'Mi perfil',
}
// Nombre de la pagina principal de cada modulo en la ruta (por defecto, Inicio)
const PAGINA_PRINCIPAL: Record<string, string> = { 'it-service-desk': 'Dashboard de métricas' }
const nombreDe = (slug: string) => (slug || '').split('-').map(w => (w ? w.charAt(0).toUpperCase() + w.slice(1) : '')).join(' ')

// Ruta de la pantalla actual: [{ texto, href? }]. Sustituye a los titulos de cada pantalla.
function rutaDe(pathname: string, modules: any[]): { texto: string; href?: string }[] {
  const m = pathname.match(/^\/app\/([^/]+)(?:\/([^/]+))?/)
  if (m) {
    const mod = modules.find((x: any) => (typeof x === 'string' ? x : x.slug) === m[1])
    const modNombre = (mod && typeof mod !== 'string' && mod.name) || nombreDe(m[1])
    if (!m[2]) return [{ texto: modNombre, href: `/app/${m[1]}` }, { texto: PAGINA_PRINCIPAL[m[1]] ?? 'Inicio' }]
    const sub = mod && typeof mod !== 'string' ? (mod.submodules ?? []).find((s: any) => s.slug === m[2]) : null
    return [{ texto: modNombre, href: `/app/${m[1]}` }, { texto: sub?.name ?? nombreDe(m[2]) }]
  }
  const fija = Object.keys(PAGINAS_FIJAS).filter(k => pathname === k || pathname.startsWith(k + '/')).sort((a, b) => b.length - a.length)[0]
  if (fija?.startsWith('/admin/')) return [{ texto: 'Administración', href: '/admin' }, { texto: PAGINAS_FIJAS[fija] }]
  if (fija) return [{ texto: PAGINAS_FIJAS[fija] }]
  return []
}

export default function Header() {
  const router = useRouter()
  const pathname = usePathname()
  const { user, isAdmin, isSuperAdmin, logout: clearStore, setLoggingOut } = useAuthStore()
  const photoUrl = useAvatarPhoto()
  const [mounted, setMounted] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [now, setNow] = useState<Date | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useWebSocket()

  // Desbloquear audio en primera interacción del usuario
  useEffect(() => {
    const unlock = () => {
      const audio = new Audio('/notification.wav')
      audio.volume = 0
      audio.play().then(() => audio.pause()).catch(() => {})
      document.removeEventListener('click', unlock)
    }
    document.addEventListener('click', unlock)
    return () => document.removeEventListener('click', unlock)
  }, [])
  const { addToast } = useToastStore()
  useWSEvent('notification.new', useCallback((data: any) => {
    if (data?.title) {
      addToast({ type: data?.type ?? 'info', title: data.title, body: data?.body ?? '' })
      // Sonido del aviso (el navegador lo permite despues del primer clic en la pagina)
      try { const a = new Audio('/notification.wav'); a.volume = 0.6; a.play().catch(() => {}) } catch {}
    }
  }, [addToast]))

  useEffect(() => {
    setMounted(true)
    setNow(new Date())
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      const refreshToken = Cookies.get('refresh_token')
      if (refreshToken) await logout(refreshToken)
    } catch {}
    finally {
      clearStore()
      router.push('/login')
    }
  }

  const initials = mounted ? (user?.full_name?.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase() || 'U') : 'U'
  const role = mounted ? (isSuperAdmin() ? 'Super Admin' : isAdmin() ? 'Admin Empresa' : 'Usuario') : 'Usuario'

  const hora = now ? now.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : ''
  const fecha = now ? now.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' }).replace(/\./g, '') : ''
  const sessionStart = mounted && user?.session_started_at
    ? new Date(user.session_started_at).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })
    : null

  const ruta = mounted ? rutaDe(pathname, user?.modules || []) : []

  // Empresa y puesto debajo del nombre (los mismos datos de Mi perfil); se piden una sola vez
  const [empresaPuesto, setEmpresaPuesto] = useState<string>('')
  useEffect(() => {
    const id = (user as any)?.user_id
    if (!mounted || !id) return
    api.get(`/api/v1/users/${id}`).then((r: any) => {
      const p = r.data?.data ?? r.data ?? {}
      const empresa = p.company_name || p.company?.nombre_comercial || p.company?.name || (p.is_super_admin ? 'Grupo Avalanz' : '')
      const SIGLAS = new Set(['erp', 'ti', 'rh', 'totvs', 'crm', 'sat', 'ceo', 'cfo', 'cto', 'coo', 'it', 'qa', 'ui', 'ux'])
      const MENORES = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'en', 'a', 'para', 'por'])
      const puesto = (p.puesto || '').toLowerCase().split(/\s+/).filter(Boolean).map((w: string, i: number) =>
        SIGLAS.has(w) ? w.toUpperCase() : (i > 0 && MENORES.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      setEmpresaPuesto([empresa, puesto].filter(Boolean).join(' · '))
    }).catch(() => {})
  }, [mounted, (user as any)?.user_id])

  return (
    <header className={`h-14 bg-white border-b-2 border-[#cbd5e1] flex items-center justify-between gap-4 px-6 shrink-0 ${inter.className}`}>

      {/* Izquierda: ruta de la pantalla actual */}
      <nav aria-label="Ruta" className="flex items-center gap-2 min-w-0 text-[13px] text-[#94a3b8]">
        <Link href="/" className="hover:text-[#475569] transition-colors shrink-0">Inicio</Link>
        {ruta.map((r, i) => (
          <span key={i} className="flex items-center gap-2 min-w-0">
            <span className="text-[#cbd5e1] shrink-0">/</span>
            {r.href ? (
              <Link href={r.href} className="hover:text-[#1a4fa0] transition-colors truncate text-[#475569]">{r.texto}</Link>
            ) : (
              <span className={`truncate text-[#1e293b] font-semibold ${jakarta.className}`}>{r.texto}</span>
            )}
          </span>
        ))}
      </nav>

      {/* Derecha: reloj y conexion, notificaciones y usuario */}
      <div className="flex items-center gap-3 shrink-0">
        {mounted && now && (
          <div className="hidden md:flex flex-col items-end leading-tight pr-3 border-r border-[#e2e8f0]">
            <span className="text-[13px] font-semibold text-[#1e293b] tabular-nums">
              {hora}<span className="font-normal text-[#94a3b8] ml-1.5">{fecha}</span>
            </span>
            {sessionStart && <span className="text-[11px] text-[#94a3b8]">Conectado desde {sessionStart}</span>}
          </div>
        )}

        {mounted && <NotificationBell />}

        <div className="relative" ref={menuRef}>
          <button onClick={() => setMenuOpen(!menuOpen)} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#f1f5f9] transition">
            <div className="w-9 h-9 bg-sky-700 rounded-full flex items-center justify-center shrink-0 relative">
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt="" className="absolute inset-0 w-full h-full object-cover rounded-full" style={{ clipPath: 'circle(50%)' }} />
              ) : (
                <span className="text-white text-xs font-bold">{initials}</span>
              )}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-[13.5px] font-semibold text-[#1e293b] leading-tight">{mounted ? (user?.full_name || 'Usuario') : 'Usuario'}</p>
              <p className="text-[11.5px] text-[#64748b] leading-tight whitespace-nowrap" title={role}>{empresaPuesto || role}</p>
            </div>
            <ChevronDown size={14} className="text-[#94a3b8] hidden sm:block" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-52 bg-white border-2 border-[#cbd5e1] rounded-xl shadow-[0_12px_28px_-8px_rgba(15,23,42,0.22)] py-1 z-50">
              <div className="px-4 py-3 border-b border-[#e2e8f0]">
                <p className="text-sm font-semibold text-[#1e293b] truncate">{user?.full_name}</p>
                <p className="text-xs text-[#64748b] truncate">{user?.email}</p>
              </div>
              <div className="py-1">
                <button onClick={() => { setMenuOpen(false); router.push('/profile') }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-[#334155] hover:bg-[#f1f5f9] transition">
                  <User size={15} className="text-[#64748b]" /> Mi perfil
                </button>
                {mounted && isAdmin() && (
                  <button onClick={() => { setMenuOpen(false); router.push('/admin') }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-[#334155] hover:bg-[#f1f5f9] transition">
                    <Shield size={15} className="text-[#64748b]" /> Panel admin
                  </button>
                )}
              </div>
              <div className="border-t border-[#e2e8f0] py-1">
                <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition">
                  <LogOut size={15} /> Cerrar sesión
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
