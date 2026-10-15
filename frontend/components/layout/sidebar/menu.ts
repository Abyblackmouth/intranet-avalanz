import { createElement, type ReactNode } from 'react'
import * as LucideIcons from 'lucide-react'
import { Building2, Key, Layers, LayoutDashboard, LayoutGrid, Shield, Users } from 'lucide-react'
import { ADMIN_SOLO_SUPER, puedeVerSubmodulo } from './reglas'
import { ICONO_MODULO, ICONO_SUB } from './estilos'

// ─────────────────────────────────────────────────────────────────────────────
// QUE hay en el menu: se arma a partir del usuario, sin nada de pantalla.
// ─────────────────────────────────────────────────────────────────────────────

export interface Sub { slug: string; nombre: string; href: string; icon: ReactNode; exacto?: boolean; ruta: string }
export interface Modulo { slug: string; nombre: string; icon: ReactNode; href: string; subs: Sub[] }
export interface ItemAdmin { label: string; href: string; icon: ReactNode }

export const nombreDe = (slug: string) => (slug || '').split('-').map(w => (w ? w.charAt(0).toUpperCase() + w.slice(1) : '')).join(' ')

export function icono(iconSlug: string | null | undefined, props: { size: number; strokeWidth: number }): ReactNode {
  const nombre = (iconSlug || '').split('-').map(w => (w ? w.charAt(0).toUpperCase() + w.slice(1) : '')).join('')
  const Icon = nombre ? (LucideIcons as any)[nombre] : null
  return createElement(Icon || Layers, props)
}

const ADMIN: ItemAdmin[] = [
  { label: 'Usuarios', href: '/admin/users', icon: createElement(Users, ICONO_MODULO) },
  { label: 'Empresas', href: '/admin/companies', icon: createElement(Building2, ICONO_MODULO) },
  { label: 'Grupos', href: '/admin/groups', icon: createElement(Layers, ICONO_MODULO) },
  { label: 'Módulos', href: '/admin/modules', icon: createElement(LayoutGrid, ICONO_MODULO) },
  { label: 'Roles', href: '/admin/roles', icon: createElement(Shield, ICONO_MODULO) },
  { label: 'Permisos', href: '/admin/permissions', icon: createElement(Key, ICONO_MODULO) },
]

export function itemsAdmin(esSuperAdmin: boolean): ItemAdmin[] {
  return ADMIN.filter(i => esSuperAdmin || !ADMIN_SOLO_SUPER.has(i.href))
}

export function armarModulos(user: any): Modulo[] {
  return (user?.modules || []).map((mod: any) => {
    const slug = typeof mod === 'string' ? mod : mod.slug
    const nombre = (typeof mod === 'string' ? null : mod.name) ?? nombreDe(slug)
    const subs: Sub[] = (typeof mod === 'string' ? [] : (mod.submodules ?? []))
      .filter((sub: any) => puedeVerSubmodulo(`${slug}/${sub.slug}`))
      .map((sub: any) => {
        const n = sub.name ?? nombreDe(sub.slug)
        return { slug: sub.slug, nombre: n, href: `/app/${slug}/${sub.slug}`, icon: icono(sub.icon, ICONO_SUB), ruta: `${nombre} › ${n}` }
      })
    // La pagina principal del modulo queda como primer submodulo
    if (subs.length) subs.unshift({ slug: '', nombre: 'Inicio', href: `/app/${slug}`, icon: createElement(LayoutDashboard, ICONO_SUB), exacto: true, ruta: `${nombre} › Inicio` })
    return { slug, nombre, href: `/app/${slug}`, icon: icono(typeof mod === 'string' ? null : mod.icon, ICONO_MODULO), subs }
  })
}

/** Busqueda sin acentos ni mayusculas. */
export const normal = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Filtra el menu: un modulo queda si coincide su nombre o alguno de sus submodulos. */
export function filtrar(modulos: Modulo[], q: string): Modulo[] {
  const t = normal(q.trim())
  if (!t) return modulos
  return modulos
    .map(m => normal(m.nombre).includes(t) ? m : { ...m, subs: m.subs.filter(s => normal(s.nombre).includes(t)) })
    .filter(m => normal(m.nombre).includes(t) || m.subs.length > 0)
}
