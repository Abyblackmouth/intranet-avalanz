'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, ChevronDown, LogOut, User, Shield, Clock } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { logout } from '@/services/authService'
import Cookies from 'js-cookie'

export default function Header() {
  const router = useRouter()
  const { user, isAdmin, isSuperAdmin, logout: clearStore } = useAuthStore()

  const [menuOpen, setMenuOpen] = useState(false)
  const [now, setNow] = useState(new Date())
  const menuRef = useRef<HTMLDivElement>(null)

  // Reloj en tiempo real
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  // Cerrar menu al hacer click fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleLogout = async () => {
    try {
      const refreshToken = Cookies.get('refresh_token')
      if (refreshToken) await logout(refreshToken)
    } catch {
      // Si falla el logout del servidor igual limpiamos localmente
    } finally {
      clearStore()
      router.push('/login')
    }
  }

  const initials = user?.full_name
    ?.split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase() || 'U'

  const role = isSuperAdmin() ? 'Super Admin' : isAdmin() ? 'Admin Empresa' : 'Usuario'

  const formattedDate = now.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
  const formattedTime = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  const sessionStart = user?.session_started_at
    ? new Date(user.session_started_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">

      {/* Lado izquierdo — fecha, hora y conexion */}
      <div className="flex items-center gap-4 text-slate-500">
        <div className="flex items-center gap-1.5 text-xs">
          <Clock size={13} className="text-slate-400" />
          <span className="font-mono text-slate-700">{formattedTime}</span>
          <span className="text-slate-400">—</span>
          <span className="capitalize">{formattedDate}</span>
        </div>
        {sessionStart && (
          <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-400">
            <span>Conexion:</span>
            <span className="text-slate-600 font-medium">{sessionStart}</span>
          </div>
        )}
      </div>

      {/* Lado derecho — notificaciones y usuario */}
      <div className="flex items-center gap-3">

        {/* Notificaciones */}
        <button className="relative w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 transition">
          <Bell size={18} />
          {/* Badge de notificaciones sin leer */}
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        {/* Menu de usuario */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition"
          >
            {/* Avatar */}
            <div className="w-7 h-7 bg-sky-700 rounded-lg flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">{initials}</span>
            </div>

            {/* Nombre y rol — nombre completo arriba, rol abajo */}
            <div className="text-left hidden sm:block">
              <p className="text-sm font-medium text-slate-900 leading-tight">
                {user?.full_name || 'Usuario'}
              </p>
              <p className="text-xs text-slate-500 leading-tight">
                {role}
              </p>
            </div>

            <ChevronDown size={14} className="text-slate-400 hidden sm:block" />
          </button>

          {/* Dropdown */}
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-slate-200 rounded-xl shadow-lg py-1 z-50">

              {/* Info del usuario */}
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-sm font-medium text-slate-900 truncate">{user?.full_name}</p>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              </div>

              {/* Opciones */}
              <div className="py-1">
                <button
                  onClick={() => { setMenuOpen(false); router.push('/app/profile') }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition"
                >
                  <User size={15} className="text-slate-400" />
                  Mi perfil
                </button>

                {isAdmin() && (
                  <button
                    onClick={() => { setMenuOpen(false); router.push('/admin') }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition"
                  >
                    <Shield size={15} className="text-slate-400" />
                    Panel admin
                  </button>
                )}
              </div>

              <div className="border-t border-slate-100 py-1">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition"
                >
                  <LogOut size={15} />
                  Cerrar sesion
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}