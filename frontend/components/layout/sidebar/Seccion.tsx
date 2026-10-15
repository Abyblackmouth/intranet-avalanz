'use client'

import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { SECCION } from './estilos'
import { jakarta } from './fuentes'

// Una seccion del menu (Fijados, Administracion, Mis modulos). Su titulo la pliega y la abre.
export default function Seccion({ titulo, plegada, onAlternar, recogido, children }: {
  titulo: string; plegada: boolean; onAlternar: () => void; recogido: boolean; children: ReactNode
}) {
  if (recogido) return <div><div className="h-px bg-slate-200 mx-2.5 my-2.5" />{children}</div>
  return (
    <div>
      <button type="button" onClick={onAlternar} aria-expanded={!plegada} className={`${SECCION} ${jakarta.className}`}>
        <span className="flex-1 text-left">{titulo}</span>
        <ChevronDown size={13} strokeWidth={2.4} className={`transition-transform duration-200 ${plegada ? '-rotate-90' : ''}`} />
      </button>
      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${plegada ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'}`}>
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  )
}
