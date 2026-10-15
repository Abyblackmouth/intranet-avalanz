'use client'

import Link from 'next/link'
import type { Modulo } from './menu'
import { SUB, SUB_ACTIVO, SUB_NORMAL } from './estilos'
import { inter, jakarta } from './fuentes'

// Con el sidebar recogido, los submodulos aparecen en este menu al pasar el mouse por el modulo.
export default function MenuFlotante({ mod, top, left, enRuta, onEntrar, onSalir }: {
  mod: Modulo; top: number; left: number; enRuta: (href: string, exacto?: boolean) => boolean
  onEntrar: () => void; onSalir: () => void
}) {
  return (
    <div role="menu" style={{ top, left }} onMouseEnter={onEntrar} onMouseLeave={onSalir}
      className={`fixed z-50 min-w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl ${inter.className}`}>
      <p className={`px-2.5 pt-1 pb-1.5 text-xs font-bold text-slate-800 ${jakarta.className}`}>{mod.nombre}</p>
      {mod.subs.map(sub => {
        const activo = enRuta(sub.href, sub.exacto)
        return (
          <Link key={sub.href} href={sub.href} role="menuitem" className={`${SUB} pr-2.5 ${activo ? SUB_ACTIVO : SUB_NORMAL}`}>
            <span className={`shrink-0 grid size-4 place-items-center ${activo ? 'text-white' : 'text-slate-400'}`}>{sub.icon}</span>
            {sub.nombre}
          </Link>
        )
      })}
    </div>
  )
}
