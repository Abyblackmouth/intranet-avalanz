'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ChevronLeft, ChevronRight, Users, Building2, LayoutGrid,
  Shield, Key, Layers, BarChart2, Settings, Scale,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  isModule?: boolean
}

const adminItems: NavItem[] = [
  { label: 'Usuarios',   href: '/admin/users',       icon: <Users size={17} /> },
  { label: 'Empresas',   href: '/admin/companies',   icon: <Building2 size={17} /> },
  { label: 'Grupos',     href: '/admin/groups',      icon: <Layers size={17} /> },
  { label: 'Modulos',    href: '/admin/modules',     icon: <LayoutGrid size={17} /> },
  { label: 'Roles',      href: '/admin/roles',       icon: <Shield size={17} /> },
  { label: 'Permisos',   href: '/admin/permissions', icon: <Key size={17} /> },
]

const testModules: NavItem[] = [
  { label: 'Legal',  href: '/app/legal',  icon: <Scale size={17} />,    isModule: true },
  { label: 'Boveda', href: '/app/boveda', icon: <BarChart2 size={17} />, isModule: true },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { user, isAdmin, isSuperAdmin } = useAuthStore()
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const modules = user?.modules || []
  const isActive = (href: string) => pathname.startsWith(href)

  if (!mounted) return (
    <aside className="relative flex flex-col h-screen bg-white border-r-2 border-slate-300 shadow-[4px_0_20px_rgba(0,0,0,0.12)] shrink-0 w-64" />
  )

  return (
    <aside className={`
      relative flex flex-col h-screen bg-white border-r-2 border-slate-300
      shadow-[4px_0_20px_rgba(0,0,0,0.12)] transition-all duration-300 shrink-0
      ${collapsed ? 'w-16' : 'w-64'}
    `}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3.5 top-6 z-10 w-7 h-7 bg-[#1a4fa0] border border-[#1a4fa0] rounded-full flex items-center justify-center hover:bg-blue-700 shadow-md transition text-white"
      >
        {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
      </button>

      <div className="flex flex-col items-center px-4 pt-4 pb-3 shrink-0">
        <div className={`overflow-hidden rounded-2xl shrink-0 ${collapsed ? 'w-9 h-9' : 'w-[70%] aspect-square'}`}>
          <img src="/logo.png" alt="Avalanz" className="w-full h-full object-cover" />
        </div>
        {!collapsed && (
          <div className="text-center mt-2">
            <p className="text-slate-800 text-lg leading-tight tracking-wide font-semibold mt-1">Intranet Avalanz</p>
            <p className="text-slate-400 text-xs mt-0.5 tracking-widest uppercase">v1.0.0</p>
          </div>
        )}
      </div>

      <div className="h-px bg-slate-100 mx-3 shrink-0" />

      <div className="flex-1 overflow-y-auto py-3 space-y-1">

        {isAdmin() && (
          <div className="px-2">
            {!collapsed && (
              <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-widest px-2 mb-1.5 mt-1">
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

        {isAdmin() && (testModules.length > 0 || modules.length > 0) && (
          <div className="h-px bg-slate-100 mx-3" />
        )}

        <div className="px-2">
          {!collapsed && (
            <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-widest px-2 mb-1.5 mt-1">
              Mis Modulos
            </p>
          )}
          <nav className="space-y-0.5">
            {testModules.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(item.href)} collapsed={collapsed} />
            ))}
          </nav>
        </div>

      </div>

      <div className="h-px bg-slate-100 mx-3 shrink-0" />

      <div className="px-3 py-3 shrink-0">
        {collapsed ? (
          <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center mx-auto relative">
            <Settings size={14} className="text-slate-400" />
            <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-green-500 rounded-full border border-white" />
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="relative shrink-0">
              <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                <Building2 size={14} className="text-slate-500" />
              </div>
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white" />
            </div>
            <div className="overflow-hidden">
              <p className="text-slate-700 text-xs font-semibold truncate">
                {user?.companies?.[0] ? 'Empresa' : 'Sin empresa'}
              </p>
              <p className="text-slate-400 text-xs truncate">{user?.full_name || ''}</p>
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
        ? 'bg-[#1a4fa0] text-white font-semibold shadow-sm'
        : 'text-slate-800 hover:bg-[#1a4fa0] hover:text-white font-medium border border-transparent hover:border-[#1a4fa0]'
      }
      ${collapsed ? 'justify-center' : ''}
    `}
  >
    <span className="shrink-0">{item.icon}</span>
    {!collapsed && <span className="truncate">{item.label}</span>}
  </Link>
)
