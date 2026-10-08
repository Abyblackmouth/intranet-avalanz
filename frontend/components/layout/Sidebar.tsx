'use client'

import { useState, useEffect, useRef, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ChevronLeft, ChevronRight, Users, Building2, LayoutGrid,
  Shield, Key, Layers, LayoutDashboard, BadgeCheck,
} from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import { Plus_Jakarta_Sans, Inter } from 'next/font/google'
import { useAuthStore } from '@/store/authStore'

// Fuentes del menu: Plus Jakarta Sans en modulos y secciones, Inter en submodulos.
// Next las descarga al compilar y las sirve desde la intranet.
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['500', '600', '700'], display: 'swap' })
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], display: 'swap' })

// Submódulos que solo ve el super admin (el backend también lo exige)
const SOLO_SUPER_ADMIN = new Set(['it-service-desk/ajustes'])

// Submodulos restringidos a ciertos roles ("modulo/submodulo": roles que lo ven).
// Super admin ve todo siempre y nunca se configura aqui: la restriccion aplica hacia abajo.
const SUBMODULO_ROLES: Record<string, string[]> = {
  'it-service-desk/actualizaciones': ['it-service-desk:incident-manager'],
}

function puedeVerSubmodulo(clave: string): boolean {
  const st: any = useAuthStore.getState()
  if (st.isSuperAdmin?.()) return true
  if (SOLO_SUPER_ADMIN.has(clave)) return false
  const permitidos = SUBMODULO_ROLES[clave]
  if (!permitidos) return true
  const roles: string[] = st.user?.roles ?? []
  return permitidos.some(r => roles.includes(r))
}

// Tamanos y colores de iconos del prototipo
const ICONO_MODULO = { size: 18, strokeWidth: 1.9 }
const ICONO_SUB = { size: 16, strokeWidth: 1.9 }

interface NavItem { label: string; href: string; icon: ReactNode }

const adminItems: NavItem[] = [
  { label: 'Usuarios', href: '/admin/users', icon: <Users {...ICONO_MODULO} /> },
  { label: 'Empresas', href: '/admin/companies', icon: <Building2 {...ICONO_MODULO} /> },
  { label: 'Grupos', href: '/admin/groups', icon: <Layers {...ICONO_MODULO} /> },
  { label: 'Módulos', href: '/admin/modules', icon: <LayoutGrid {...ICONO_MODULO} /> },
  { label: 'Roles', href: '/admin/roles', icon: <Shield {...ICONO_MODULO} /> },
  { label: 'Permisos', href: '/admin/permissions', icon: <Key {...ICONO_MODULO} /> },
]

function getIcon(iconSlug: string | null | undefined, props: { size: number; strokeWidth: number }): ReactNode {
  const nombre = (iconSlug || '').split('-').map((w: string) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : '')).join('')
  const Icon = nombre ? (LucideIcons as any)[nombre] : null
  return Icon ? <Icon {...props} /> : <Layers {...props} />
}

const nombreDe = (slug: string) => (slug || '').split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

interface Sub { slug: string; nombre: string; href: string; icon: ReactNode; exacto?: boolean }
interface Modulo { slug: string; nombre: string; icon: ReactNode; subs: Sub[] }

export default function Sidebar() {
  const pathname = usePathname()
  const { user, isAdmin, isSuperAdmin, isLoggingOut } = useAuthStore()
  const [collapsed, setCollapsed] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [mounted, setMounted] = useState(false)
  // Menu flotante cuando el sidebar esta recogido
  const [flot, setFlot] = useState<{ mod: Modulo; top: number; left: number } | null>(null)
  const cierre = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setMounted(true)
    // En laptops de 13"-15" abre recogido (solo íconos) para dar espacio a las tablas
    if (window.innerWidth <= 1440) setCollapsed(true)
  }, [])

  // El modulo donde estas se abre solo
  useEffect(() => {
    const m = pathname.match(/^\/app\/([^/]+)/)
    if (m) setExpanded(prev => (prev.has(m[1]) ? prev : new Set(prev).add(m[1])))
    setFlot(null)
  }, [pathname])

  // El menu flotante se cierra con Esc o al hacer clic fuera
  useEffect(() => {
    if (!flot) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setFlot(null) }
    const fuera = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('[role="menu"], aside')) setFlot(null) }
    document.addEventListener('keydown', esc)
    document.addEventListener('mousedown', fuera)
    return () => { document.removeEventListener('keydown', esc); document.removeEventListener('mousedown', fuera) }
  }, [flot])

  if (isLoggingOut) return null

  const modulos: Modulo[] = (user?.modules || []).map((mod: any) => {
    const slug = typeof mod === 'string' ? mod : mod.slug
    const subs: Sub[] = (typeof mod === 'string' ? [] : (mod.submodules ?? []))
      .filter((sub: any) => puedeVerSubmodulo(`${slug}/${sub.slug}`))
      .map((sub: any) => ({
        slug: sub.slug, nombre: sub.name ?? nombreDe(sub.slug),
        href: `/app/${slug}/${sub.slug}`, icon: getIcon(sub.icon, ICONO_SUB),
      }))
    // La pagina principal del modulo queda como primer submodulo
    if (subs.length) subs.unshift({ slug: '', nombre: 'Inicio', href: `/app/${slug}`, icon: <LayoutDashboard {...ICONO_SUB} />, exacto: true })
    return {
      slug, nombre: (typeof mod === 'string' ? null : mod.name) ?? nombreDe(slug),
      icon: getIcon(typeof mod === 'string' ? null : mod.icon, ICONO_MODULO), subs,
    }
  })

  const enRuta = (href: string, exacto = false) => (exacto ? pathname === href : pathname === href || pathname.startsWith(href + '/'))
  const toggle = (slug: string) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(slug) ? next.delete(slug) : next.add(slug)
    return next
  })

  const abrirFlot = (mod: Modulo, el: HTMLElement) => {
    if (!collapsed || !mod.subs.length) return
    if (cierre.current) clearTimeout(cierre.current)
    const r = el.getBoundingClientRect()
    const alto = 48 + mod.subs.length * 36
    setFlot({ mod, left: r.right + 10, top: Math.max(8, Math.min(r.top - 6, window.innerHeight - alto - 8)) })
  }
  const cerrarFlot = () => { cierre.current = setTimeout(() => setFlot(null), 220) }

  const fila = 'w-full flex items-center gap-3 min-h-10 rounded-[10px] text-[14.5px] transition-colors duration-75'
  const filaNormal = 'text-[#334155] font-medium hover:bg-[#1a4fa0]/[0.10] hover:text-[#1e293b]'
  const filaActiva = 'bg-[#1a4fa0] text-white font-semibold hover:bg-[#173f82]'
  const seccion = `text-[#64748b] text-[10.5px] font-semibold uppercase tracking-[0.09em] px-2.5 pt-4 pb-2 ${jakarta.className}`

  return (
    <aside
      suppressHydrationWarning
      className={`relative flex flex-col h-screen bg-white border-r-2 border-[#cbd5e1] transition-all duration-300 shrink-0
        ${mounted && collapsed ? 'w-16' : 'w-60 max-[1440px]:w-52'}`}
    >
      {/* Boton redondo para recoger o abrir */}
      {mounted && (
        <button
          onClick={() => { setCollapsed(!collapsed); setFlot(null) }}
          aria-label={collapsed ? 'Abrir menú' : 'Recoger menú'} title={collapsed ? 'Abrir menú' : 'Recoger menú'}
          className="absolute -right-3.5 top-5 z-30 w-7 h-7 bg-[#1a4fa0] rounded-full flex items-center justify-center hover:bg-[#173f82] shadow-[0_2px_6px_rgba(26,79,160,0.35)] transition text-white"
        >
          {collapsed ? <ChevronRight size={14} strokeWidth={2.6} /> : <ChevronLeft size={14} strokeWidth={2.6} />}
        </button>
      )}

      {/* Logo + nombre */}
      <div className={`flex flex-col items-center shrink-0 border-b border-[#e2e8f0] ${mounted && collapsed ? 'mx-2 pt-4 pb-3' : 'mx-3 pt-5 pb-4 max-[1440px]:pt-3 max-[1440px]:pb-2'}`}>
        {mounted && collapsed ? (
          <div className="w-9 h-9"><img src="/logo_200.png" alt="Avalanz" className="w-full h-full object-contain" /></div>
        ) : (
          <>
            <div className="w-20 h-20 max-[1440px]:w-12 max-[1440px]:h-12">
              <img src="/logo_200.png" alt="Avalanz" className="w-full h-full object-contain" />
            </div>
            <p className={`text-[#1e293b] text-lg max-[1440px]:text-base font-semibold mt-2 whitespace-nowrap ${jakarta.className}`}>Intranet Avalanz</p>
            <p className="text-[#94a3b8] text-[10px] tracking-[0.08em] uppercase mt-0.5 max-[1440px]:hidden">v1.0.0</p>
          </>
        )}
      </div>

      {/* Navegacion */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-4" onMouseLeave={cerrarFlot}>
        {mounted && isAdmin() && (
          <div>
            {collapsed ? <div className="h-px bg-[#e2e8f0] mx-2.5 my-3" /> : <p className={seccion}>Administración</p>}
            <nav>
              {adminItems.map(item => {
                if (!isSuperAdmin() && ['/admin/groups', '/admin/modules', '/admin/roles', '/admin/permissions'].includes(item.href)) return null
                const activo = enRuta(item.href)
                return (
                  <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined}
                    className={`${fila} ${jakarta.className} ${activo ? filaActiva : filaNormal} ${collapsed ? 'justify-center px-0' : 'px-3'}`}>
                    <span className="shrink-0 w-5 h-5 grid place-items-center">{item.icon}</span>
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                )
              })}
            </nav>
          </div>
        )}

        {mounted && modulos.length > 0 && (
          <div>
            {collapsed ? <div className="h-px bg-[#e2e8f0] mx-2.5 my-3" /> : <p className={seccion}>Mis módulos</p>}
            <nav>
              {modulos.map(mod => {
                const dentro = enRuta(`/app/${mod.slug}`)
                const abierto = expanded.has(mod.slug)
                const clase = `${fila} ${jakarta.className} ${dentro ? filaActiva : filaNormal} ${collapsed ? 'justify-center px-0' : 'px-3'}`

                // Modulo sin submodulos: la fila navega directo
                if (!mod.subs.length) {
                  return (
                    <Link key={mod.slug} href={`/app/${mod.slug}`} title={collapsed ? mod.nombre : undefined} className={clase}>
                      <span className="shrink-0 w-5 h-5 grid place-items-center">{mod.icon}</span>
                      {!collapsed && <span className="truncate flex-1 text-left">{mod.nombre}</span>}
                    </Link>
                  )
                }

                // Modulo con submodulos: TODA la fila abre y cierra (recogido: menu flotante)
                return (
                  <div key={mod.slug}>
                    <button type="button" className={clase} aria-expanded={collapsed ? undefined : abierto}
                      title={collapsed ? mod.nombre : undefined}
                      onClick={e => (collapsed ? abrirFlot(mod, e.currentTarget) : toggle(mod.slug))}
                      onMouseEnter={e => abrirFlot(mod, e.currentTarget)}>
                      <span className="shrink-0 w-5 h-5 grid place-items-center">{mod.icon}</span>
                      {!collapsed && <>
                        <span className="truncate flex-1 text-left">{mod.nombre}</span>
                        <ChevronRight size={16} className={`shrink-0 transition-transform duration-200 ${abierto ? 'rotate-90' : ''} ${dentro ? 'text-white' : 'text-[#94a3b8]'}`} />
                      </>}
                    </button>

                    {!collapsed && (
                      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${abierto ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                        <ul className={`overflow-hidden m-0 list-none ml-[21px] pl-2 border-l-[1.5px] border-[#dbe2ec] ${abierto ? 'mt-1 mb-1.5' : ''} ${inter.className}`}>
                          {mod.subs.map(sub => {
                            const activo = enRuta(sub.href, sub.exacto)
                            return (
                              <li key={sub.href}>
                                <Link href={sub.href} tabIndex={abierto ? 0 : -1}
                                  className={`flex items-center gap-[9px] min-h-8.5 px-2.5 rounded-lg text-[13.5px] whitespace-nowrap transition-colors duration-75
                                    ${activo ? 'bg-[#eef4fc] text-[#1a4fa0] font-semibold' : 'text-[#475569] hover:bg-[#1a4fa0]/[0.10] hover:text-[#1e293b]'}`}>
                                  <span className={`shrink-0 w-4 h-4 grid place-items-center ${activo ? 'text-[#1a4fa0]' : 'text-[#64748b]'}`}>{sub.icon}</span>
                                  <span className="truncate">{sub.nombre}</span>
                                </Link>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                )
              })}
            </nav>
          </div>
        )}
      </div>

      {/* Rol de la persona, al pie: global (Super Admin / Admin Empresa) y por modulo */}
      {mounted && (() => {
        const roles: string[] = (user as any)?.roles ?? []
        const nombreMod = (slug: string) => {
          const m = (user?.modules || []).find((x: any) => (typeof x === 'string' ? x : x.slug) === slug)
          return (m && typeof m !== 'string' && m.name) || nombreDe(slug)
        }
        const lineas: string[] = []
        if (roles.includes('super_admin')) lineas.push('Super Admin')
        else if (roles.includes('admin_empresa')) lineas.push('Admin Empresa')
        for (const r of roles) {
          const [mod, rol] = r.split(':')
          if (rol) lineas.push(`${nombreMod(mod)} · ${nombreDe(rol)}`)
        }
        if (!lineas.length) lineas.push('Usuario')
        return (
          <div className={`shrink-0 border-t border-[#e2e8f0] ${collapsed ? 'px-2 py-3 flex justify-center' : 'px-3 py-3'}`} title={collapsed ? lineas.join('\n') : undefined}>
            {collapsed ? (
              <span className="w-9 h-9 grid place-items-center rounded-[10px] bg-[#eef4fc] text-[#1a4fa0]"><BadgeCheck size={18} strokeWidth={1.9} /></span>
            ) : (
              <div className="flex items-start gap-2.5 rounded-[10px] bg-[#f8fafc] border border-[#e2e8f0] px-3 py-2.5">
                <BadgeCheck size={18} strokeWidth={1.9} className="text-[#1a4fa0] shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className={`text-[13px] font-semibold text-[#1e293b] truncate ${jakarta.className}`}>{lineas[0]}</p>
                  {lineas.slice(1).map(l => <p key={l} className={`text-[12px] text-[#64748b] truncate ${inter.className}`} title={l}>{l}</p>)}
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* Menu flotante (sidebar recogido) */}
      {flot && (
        <div role="menu" className={`fixed z-50 min-w-55 bg-white border-2 border-[#cbd5e1] rounded-xl p-2 shadow-[0_12px_28px_-8px_rgba(15,23,42,0.22)] ${inter.className}`}
          style={{ top: flot.top, left: flot.left }}
          onMouseEnter={() => cierre.current && clearTimeout(cierre.current)} onMouseLeave={cerrarFlot}>
          <p className={`mx-2 mt-0.5 mb-1.5 text-[13px] font-bold text-[#1e293b] ${jakarta.className}`}>{flot.mod.nombre}</p>
          {flot.mod.subs.map(sub => {
            const activo = enRuta(sub.href, sub.exacto)
            return (
              <Link key={sub.href} href={sub.href} role="menuitem"
                className={`flex items-center gap-[9px] min-h-8.5 px-2.5 rounded-lg text-[13.5px] transition-colors duration-75
                  ${activo ? 'bg-[#eef4fc] text-[#1a4fa0] font-semibold' : 'text-[#475569] hover:bg-[#1a4fa0]/[0.10] hover:text-[#1e293b]'}`}>
                <span className={`shrink-0 w-4 h-4 grid place-items-center ${activo ? 'text-[#1a4fa0]' : 'text-[#64748b]'}`}>{sub.icon}</span>
                {sub.nombre}
              </Link>
            )
          })}
        </div>
      )}
    </aside>
  )
}
