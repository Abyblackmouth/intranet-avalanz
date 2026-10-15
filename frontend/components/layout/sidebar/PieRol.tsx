'use client'

import { nombreDe } from './menu'
import { jakarta } from './fuentes'

// Rol de la persona al pie, con los colores de la tabla de Usuarios:
// Super Admin rojo, Admin Empresa ambar, roles de modulo azul. Debajo, la version.
export default function PieRol({ user, recogido }: { user: any; recogido: boolean }) {
  const roles: string[] = user?.roles ?? []
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
  const color = (l: string) => l === 'Super Admin' ? 'bg-red-50 text-red-700 border-red-200'
    : l === 'Admin Empresa' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-blue-50 text-[#1a4fa0] border-blue-200'
  const iniciales = (l: string) => l === 'Super Admin' ? 'SA' : l === 'Admin Empresa' ? 'AE'
    : l.split(' · ').pop()!.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className={`shrink-0 border-t border-slate-200 ${recogido ? 'px-2 py-2.5 flex justify-center' : 'px-3 py-2.5'}`} title={lineas.join('\n')}>
      {recogido ? (
        <span className={`inline-flex h-5.5 min-w-8 items-center justify-center rounded-full border px-1.5 text-[10px] font-bold ${color(lineas[0])} ${jakarta.className}`}>
          {iniciales(lineas[0])}
        </span>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-1">
          {lineas.map(l => (
            <span key={l} className={`max-w-full truncate rounded-full border px-2 py-px text-[11px] font-semibold ${color(l)} ${jakarta.className}`}>{l}</span>
          ))}
        </div>
      )}
    </div>
  )
}
