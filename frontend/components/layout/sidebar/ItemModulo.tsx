'use client'

import Link from 'next/link'
import { ChevronRight, Pin, PinOff } from 'lucide-react'
import type { Modulo } from './menu'
import { FILA, FILA_ACTIVA, FILA_CONTIENE, FILA_NORMAL, SUB, SUB_ACTIVO, SUB_NORMAL } from './estilos'
import { inter, jakarta } from './fuentes'

interface Props {
  mod: Modulo
  recogido: boolean
  abierto: boolean
  enRuta: (href: string, exacto?: boolean) => boolean
  onAlternar: () => void
  onFlotante: (el: HTMLElement) => void
  estaFijado: (href: string) => boolean
  onFijar: (href: string) => void
}

/** Alfiler para fijar una pagina; aparece al pasar el mouse por la fila. */
export function BotonFijar({ fijado, onClick, activo }: { fijado: boolean; onClick: () => void; activo: boolean }) {
  return (
    <button type="button" onClick={e => { e.preventDefault(); e.stopPropagation(); onClick() }}
      aria-label={fijado ? 'Quitar de Fijados' : 'Fijar arriba'} title={fijado ? 'Quitar de Fijados' : 'Fijar arriba'}
      className={`absolute right-1 top-1/2 -translate-y-1/2 grid size-5.5 place-items-center rounded opacity-0 group-hover/li:opacity-100 focus-visible:opacity-100 transition-opacity
        ${activo ? 'text-white/80 hover:bg-white/15 hover:text-white' : 'text-slate-400 hover:bg-slate-200/70 hover:text-[#1a4fa0]'}`}>
      {fijado ? <PinOff size={12} /> : <Pin size={12} />}
    </button>
  )
}

export default function ItemModulo({ mod, recogido, abierto, enRuta, onAlternar, onFlotante, estaFijado, onFijar }: Props) {
  const dentro = enRuta(mod.href)
  const tieneSubs = mod.subs.length > 0
  const hojaActiva = !tieneSubs && dentro
  // Recogido no se ven los submodulos: el modulo donde estas se marca solido
  const estado = hojaActiva || (recogido && dentro) ? FILA_ACTIVA : dentro ? FILA_CONTIENE : FILA_NORMAL
  const clase = `${FILA} ${jakarta.className} ${estado} ${recogido ? 'justify-center px-0' : 'px-2.5'}`
  const icono = <span className="shrink-0 grid size-5 place-items-center">{mod.icon}</span>

  if (!tieneSubs) {
    return (
      <div className="group/li relative">
        <Link href={mod.href} title={recogido ? mod.nombre : undefined} className={`${clase} ${recogido ? '' : 'pr-7'}`} aria-current={hojaActiva ? 'page' : undefined}>
          {icono}
          {!recogido && <span className="truncate flex-1 text-left">{mod.nombre}</span>}
        </Link>
        {!recogido && <BotonFijar fijado={estaFijado(mod.href)} onClick={() => onFijar(mod.href)} activo={hojaActiva} />}
      </div>
    )
  }

  return (
    <div>
      <button type="button" className={clase} aria-expanded={recogido ? undefined : abierto} title={recogido ? mod.nombre : undefined}
        onClick={e => (recogido ? onFlotante(e.currentTarget) : onAlternar())}
        onMouseEnter={e => recogido && onFlotante(e.currentTarget)}>
        {icono}
        {!recogido && <>
          <span className="truncate flex-1 text-left">{mod.nombre}</span>
          <ChevronRight size={14} strokeWidth={2.2} className={`shrink-0 transition-transform duration-200 ${abierto ? 'rotate-90' : ''} ${dentro ? 'text-[#1a4fa0]' : 'text-slate-400'}`} />
        </>}
      </button>

      {!recogido && (
        <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${abierto ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
          <ul className={`overflow-hidden m-0 list-none ml-4.5 pl-2 border-l border-slate-200 ${abierto ? 'mt-0.5 mb-1' : ''} ${inter.className}`}>
            {mod.subs.map(sub => {
              const activo = enRuta(sub.href, sub.exacto)
              return (
                <li key={sub.href} className="group/li relative">
                  <Link href={sub.href} tabIndex={abierto ? 0 : -1} aria-current={activo ? 'page' : undefined}
                    className={`${SUB} pr-7 ${activo ? SUB_ACTIVO : SUB_NORMAL}`}>
                    <span className={`shrink-0 grid size-4 place-items-center ${activo ? 'text-white' : 'text-slate-400'}`}>{sub.icon}</span>
                    <span className="truncate flex-1">{sub.nombre}</span>
                  </Link>
                  {abierto && <BotonFijar fijado={estaFijado(sub.href)} onClick={() => onFijar(sub.href)} activo={activo} />}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
