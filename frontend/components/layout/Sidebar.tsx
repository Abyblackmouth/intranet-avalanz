'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ChevronLeft, ChevronRight, Users, Building2, LayoutGrid,
  Shield, Key, Layers,
} from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  isModule?: boolean
}

const adminItems: NavItem[] = [
  { label: 'Usuarios',   href: '/admin/users',       icon: <Users size={16} /> },
  { label: 'Empresas',   href: '/admin/companies',   icon: <Building2 size={16} /> },
  { label: 'Grupos',     href: '/admin/groups',      icon: <Layers size={16} /> },
  { label: 'Modulos',    href: '/admin/modules',     icon: <LayoutGrid size={16} /> },
  { label: 'Roles',      href: '/admin/roles',       icon: <Shield size={16} /> },
  { label: 'Permisos',   href: '/admin/permissions', icon: <Key size={16} /> },
]

function getModuleIcon(iconSlug: string | null | undefined): React.ReactNode {
  if (!iconSlug) return <LucideIcons.Layers size={16} />
  const iconName = (iconSlug || '').split('-').map((w: string) => w ? w.charAt(0).toUpperCase() + w.slice(1) : '').join('')
  const Icon = (LucideIcons as any)[iconName]
  if (!Icon) return <LucideIcons.Layers size={16} />
  return <Icon size={16} />
}

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase() || 'U'
}

export default function Sidebar() {
  const pathname = usePathname()
  const { user, isAdmin, isSuperAdmin, isLoggingOut } = useAuthStore()
  if (isLoggingOut) return null
  const [collapsed, setCollapsed] = useState(false)
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set())
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const toggleModule = (slug: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev)
      next.has(slug) ? next.delete(slug) : next.add(slug)
      return next
    })
  }

  const modules = user?.modules || []
  const isActive = (href: string) => pathname.startsWith(href)

  return (
    <aside
      suppressHydrationWarning
      className={`
        relative flex flex-col h-screen bg-white border-r-2 border-slate-300
        shadow-[4px_0_20px_rgba(0,0,0,0.08)] transition-all duration-300 shrink-0
        ${mounted && collapsed ? 'w-16' : 'w-60'}
      `}
    >
      {/* Boton colapsar */}
      {mounted && (
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3.5 top-5 z-10 w-7 h-7 bg-[#1a4fa0] border border-[#1a4fa0] rounded-full flex items-center justify-center hover:bg-blue-700 shadow-md transition text-white"
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
      )}

      {/* Logo + nombre */}
      <div className="flex flex-col items-center px-3 pt-5 pb-4 shrink-0">
        {mounted && collapsed ? (
          <div className="w-8 h-8">
            <img src="/logo_200.png" alt="Avalanz" className="w-full h-full object-contain" />
          </div>
        ) : (
          <>
            <div className="w-20 h-20">
              <img src="/logo_200.png" alt="Avalanz" className="w-full h-full object-contain" />
            </div>
            <p className="text-slate-900 text-xl font-semibold mt-1 tracking-wide" style={{ fontFamily: "var(--font-jakarta)" }}>
              Intranet Avalanz
            </p>
            <p className="text-slate-300 text-[9px] tracking-widest uppercase mt-0.5">v1.0.0</p>
          </>
        )}
      </div>

      <div className="h-px bg-slate-100 mx-3 shrink-0" />

      {/* Nav */}
      <div className="flex-1 overflow-y-auto py-2">

        {/* Admin */}
        {mounted && isAdmin() && (
          <div className="px-2 mb-1">
            {!collapsed && (
              <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-widest px-2 py-1.5">
                Administracion
              </p>
            )}
            <nav className="space-y-0.5">
              {adminItems.map((item) => {
                if (!isSuperAdmin() && ['/admin/groups', '/admin/modules', '/admin/roles', '/admin/permissions'].includes(item.href)) return null
                return <NavLink key={item.href} item={item} active={isActive(item.href)} collapsed={collapsed} />
              })}
            </nav>
          </div>
        )}

        {/* Modulos */}
        {mounted && modules.length > 0 && (
          <>
            <div className="h-px bg-slate-100 mx-3 my-1" />
            <div className="px-2">
              {!collapsed && (
                <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-widest px-2 py-1.5">
                  Mis Modulos
                </p>
              )}
              <nav className="space-y-0.5">
                {modules.map((mod: any) => {
                  const slug = typeof mod === 'string' ? mod : mod.slug
                  const icon = typeof mod === 'string' ? null : mod.icon
                  const submodules = typeof mod === 'string' ? [] : (mod.submodules ?? [])
                  const moduleActive = isActive(`/app/${slug}`)
                  const expanded = expandedModules.has(slug)

                  return (
                    <div key={slug}>
                      <div className={`flex items-center rounded-lg transition-all duration-150 ${moduleActive ? 'bg-[#1a4fa0]' : 'hover:bg-slate-100'}`}>
                        <Link
                          href={`/app/${slug}`}
                          className={`flex items-center gap-2.5 px-2.5 py-2 flex-1 min-w-0 text-sm font-medium transition-colors ${moduleActive ? 'text-white' : 'text-slate-800'} ${collapsed ? 'justify-center' : ''}`}
                          title={collapsed ? (slug || '').charAt(0).toUpperCase() + (slug || '').slice(1) : undefined}
                        >
                          <span className="shrink-0">{getModuleIcon(icon)}</span>
                          {!collapsed && <span className="truncate">{(slug || '').charAt(0).toUpperCase() + (slug || '').slice(1)}</span>}
                        </Link>
                        {!collapsed && submodules.length > 0 && (
                          <button
                            onClick={() => toggleModule(slug)}
                            className={`px-2 py-1 shrink-0 rounded-md transition-all ${moduleActive ? 'text-white/70 hover:text-white hover:bg-white/10' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200'}`}
                          >
                            <ChevronRight
                              size={14}
                              className={`transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
                            />
                          </button>
                        )}
                      </div>

                      {/* Submodulos */}
                      {!collapsed && expanded && submodules.length > 0 && (
                        <div className="mt-0.5 ml-3 pl-3 border-l-2 border-slate-100 space-y-0.5">
                          {submodules.map((sub: any) => {
                            const subActive = isActive(`/app/${slug}/${sub.slug}`)
                            return (
                              <Link
                                key={sub.slug}
                                href={`/app/${slug}/${sub.slug}`}
                                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                                  subActive
                                    ? 'bg-blue-50 text-[#1a4fa0]'
                                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                                }`}
                              >
                                <span className="shrink-0">{getModuleIcon(sub.icon)}</span>
                                <span className="truncate">{sub.name ?? (sub.slug || '').charAt(0).toUpperCase() + (sub.slug || '').slice(1)}</span>
                              </Link>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </nav>
            </div>
          </>
        )}
      </div>

      <div className="h-px bg-slate-100 mx-3 shrink-0" />

      {/* Footer usuario */}
      <div className="px-3 py-2.5 shrink-0">
        {mounted && collapsed ? (
          <div className="w-8 h-8 bg-[#1a4fa0] rounded-lg flex items-center justify-center mx-auto">
            <span className="text-white text-xs font-bold">
              {user?.full_name ? getInitials(user.full_name) : 'U'}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-[#1a4fa0] rounded-lg flex items-center justify-center shrink-0 relative">
              <span className="text-white text-xs font-bold">
                {mounted && user?.full_name ? getInitials(user.full_name) : 'U'}
              </span>
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white" />
            </div>
            <div className="overflow-hidden">
              <p className="text-slate-700 text-xs font-semibold truncate leading-tight">
                {mounted ? (user?.full_name || 'Usuario') : 'Usuario'}
              </p>
              <p className="text-slate-400 text-[10px] truncate leading-tight">
                {mounted ? (isSuperAdmin() ? 'Super Admin' : isAdmin() ? 'Admin Empresa' : 'Usuario') : ''}
              </p>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

const NavLink = ({ item, active, collapsed }: { item: NavItem; active: boolean; collapsed: boolean }) => (
  <Link
    href={item.href}
    title={collapsed ? item.label : undefined}
    className={`
      flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all duration-150
      ${active
        ? 'bg-[#1a4fa0] text-white font-semibold'
        : 'text-slate-800 hover:bg-slate-100 font-medium'
      }
      ${collapsed ? 'justify-center' : ''}
    `}
  >
    <span className="shrink-0">{item.icon}</span>
    {!collapsed && <span className="truncate">{item.label}</span>}
  </Link>
)