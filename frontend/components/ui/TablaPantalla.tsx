'use client'

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// TablaPantalla: la tabla de las pantallas cuyo protagonista es una lista.
// Regla de la casa: ocupa el 100% del alto disponible (medido contra la ventana, no contra sus
// filas), las filas por pagina se calculan solas ("Ajustar a pantalla"), encabezado fijo, orden
// por columna y paginacion. Cada pantalla solo dice que columnas lleva.
// No es para tablas dentro de tarjetas o modales: esas miden lo que necesitan.
// ─────────────────────────────────────────────────────────────────────────────

export interface Columna<T> {
  id: string
  titulo: ReactNode
  /** Contenido de la celda (opcional si la pantalla usa renderFila) */
  celda?: (fila: T) => ReactNode
  /** Valor para ordenar; sin el, la columna no se ordena */
  orden?: (fila: T) => string | number | null | undefined
  /** Clases de la celda y del encabezado (ancho, alineacion…) */
  clase?: string
}

interface Props<T> {
  filas: T[]
  columnas: Columna<T>[]
  clave: (fila: T) => string
  cargando?: boolean
  /** "usuarios", "empresas"… para el pie: "1–23 de 81 usuarios" */
  unidad?: string
  vacio?: ReactNode
  /** Clases extra por fila (por ejemplo, resaltar una seleccion) */
  claseFila?: (fila: T) => string
  /** Si cambia, la tabla vuelve a la pagina 1 (por ejemplo, al buscar o filtrar) */
  reinicio?: unknown
  /** Margen vertical de cada celda, en px (arriba y abajo). Aplica tambien a filas propias. */
  rellenoFila?: number
  /** Tamano de letra de las celdas, en px (las filas propias pueden fijar el suyo) */
  letra?: number
  /** Filas propias: la pantalla dibuja el <tr> completo (por ejemplo TicketRow) */
  renderFila?: (fila: T) => ReactNode
  /** Contenido arriba de la tabla, dentro de la misma tarjeta (buscador, filtros…) */
  cabecera?: ReactNode
  /** Clases de la tarjeta (por defecto: borde gris y esquinas redondeadas) */
  claseContenedor?: string
  /** Clases extra del pie de paginacion */
  clasePie?: string
  /** Espacio que deja abajo, en px (el margen inferior de la pagina) */
  margenInferior?: number
}

const normal = (v: unknown) => typeof v === 'string' ? v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() : v
const TAMANOS = [25, 50, 100]

export default function TablaPantalla<T>({ filas, columnas, clave, cargando = false, unidad = 'registros', vacio, claseFila, reinicio,
  rellenoFila = 4, letra = 12, renderFila, cabecera, claseContenedor, clasePie, margenInferior = 18 }: Props<T>) {
  const zona = useRef<HTMLDivElement>(null)
  const pie = useRef<HTMLDivElement>(null)
  const [alto, setAlto] = useState<number | null>(null)
  const [capacidad, setCapacidad] = useState(20)
  const [modo, setModo] = useState(0)                 // 0 = ajustar a pantalla
  const [pagina, setPagina] = useState(1)
  const [orden, setOrden] = useState<{ id: string; dir: 1 | -1 } | null>(null)
  const ajuste = useRef(0)      // px de menos cuando la pagina tiene margenes que el calculo no ve
  const recorte = useRef(0)     // filas de menos cuando algunas filas son mas altas que la primera
  const medirRef = useRef<() => void>(() => {})

  // Alto: de donde empieza la tabla al fondo de la ventana, menos la paginacion
  useLayoutEffect(() => {
    const el = zona.current
    if (!el) return
    const medir = () => {
      const disponible = Math.max(220, Math.floor(window.innerHeight - el.getBoundingClientRect().top - (pie.current?.offsetHeight ?? 38) - margenInferior - ajuste.current))
      setAlto(disponible)
      const cab = el.querySelector('thead')?.getBoundingClientRect().height ?? 30
      const fila = el.querySelector('tbody > tr:not([data-vacio])')?.getBoundingClientRect().height ?? 33
      const barra = el.scrollWidth > el.clientWidth ? 14 : 0
      setCapacidad(Math.max(5, Math.floor((disponible - cab - barra - 2) / Math.max(20, fila)) - recorte.current))
    }
    medirRef.current = medir
    medir()
    window.addEventListener('resize', medir)
    const ro = new ResizeObserver(medir)
    ro.observe(document.body)
    return () => { window.removeEventListener('resize', medir); ro.disconnect() }
  }, [filas.length > 0, cargando, rellenoFila, letra, margenInferior])

  // Despues de dibujar: si quedo scroll (en la pagina o en la tabla), se corrige solo
  useLayoutEffect(() => {
    const el = zona.current
    if (!el || cargando || !alto) return
    let p: HTMLElement | null = el.parentElement
    while (p && p !== document.body && !/(auto|scroll)/.test(getComputedStyle(p).overflowY)) p = p.parentElement
    const sobra = p && p !== document.body ? p.scrollHeight - p.clientHeight : document.documentElement.scrollHeight - window.innerHeight
    if (sobra > 1 && ajuste.current < 400) { ajuste.current += sobra; medirRef.current(); return }
    if (modo === 0 && el.scrollHeight - el.clientHeight > 1 && recorte.current < 30) { recorte.current += 1; medirRef.current() }
  })

  const ordenadas = useMemo(() => {
    const col = orden && columnas.find(c => c.id === orden.id)
    if (!col?.orden) return filas
    const v = (f: T) => normal(col.orden!(f) ?? '')
    return [...filas].sort((a, b) => { const x = v(a) as any, y = v(b) as any; return x < y ? -orden!.dir : x > y ? orden!.dir : 0 })
  }, [filas, columnas, orden])

  const porPagina = modo || capacidad
  const total = ordenadas.length
  const paginas = Math.max(1, Math.ceil(total / porPagina))
  useEffect(() => { setPagina(1) }, [reinicio, orden, modo])
  useEffect(() => { if (pagina > paginas) setPagina(paginas) }, [pagina, paginas])
  const visibles = ordenadas.slice((pagina - 1) * porPagina, pagina * porPagina)

  const ordenar = (id: string) => setOrden(o => (o?.id !== id ? { id, dir: 1 } : o.dir === 1 ? { id, dir: -1 } : null))

  return (
    <div className={claseContenedor ?? 'flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white'}>
      {cabecera}
      <div ref={zona} style={alto ? { height: alto } : undefined} className="overflow-auto">
        <table className="w-full border-separate border-spacing-0">
          <thead className="sticky top-0 z-10">
            <tr>
              {columnas.map(c => (
                <th key={c.id} className={`border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap ${c.clase ?? ''}`}>
                  {c.orden ? (
                    <button type="button" onClick={() => ordenar(c.id)} className="inline-flex items-center gap-1 uppercase hover:text-slate-800">
                      {c.titulo}
                      <span className={`text-[9px] ${orden?.id === c.id ? 'text-[#1a4fa0]' : 'text-slate-300'}`}>{orden?.id === c.id ? (orden.dir === 1 ? '▲' : '▼') : '↕'}</span>
                    </button>
                  ) : c.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody style={{ ['--relleno' as string]: `${rellenoFila}px`, fontSize: `${letra}px` } as React.CSSProperties}
            className="[&>tr>td]:py-(--relleno)!">
            {cargando ? (
              <tr data-vacio><td colSpan={columnas.length} className="py-12! text-center">
                <div className="mx-auto size-7 animate-spin rounded-full border-2 border-[#1a4fa0] border-t-transparent" />
                <p className="mt-2 text-sm text-slate-400">Cargando {unidad}…</p>
              </td></tr>
            ) : !visibles.length ? (
              <tr data-vacio><td colSpan={columnas.length} className="py-12! text-center text-sm text-slate-400">{vacio ?? `No se encontraron ${unidad}`}</td></tr>
            ) : visibles.map(f => renderFila ? <React.Fragment key={clave(f)}>{renderFila(f)}</React.Fragment> : (
              <tr key={clave(f)} data-fila className={`group hover:bg-[#1a4fa0]/5 [&>td]:border-b [&>td]:border-slate-100 ${claseFila?.(f) ?? ''}`}>
                {columnas.map(c => (
                  <td key={c.id} className={`px-2 text-slate-700 whitespace-nowrap ${c.clase ?? ''}`}>{c.celda?.(f)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div ref={pie} className={`flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 px-3 py-1.5 ${clasePie ?? ''}`}>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>{total ? `${(pagina - 1) * porPagina + 1}–${Math.min(pagina * porPagina, total)} de ${total} ${unidad}` : `0 ${unidad}`}</span>
          <select value={modo} onChange={e => setModo(Number(e.target.value))} aria-label={`${unidad} por página`}
            className="h-6 rounded-md border border-slate-300 bg-white px-1 text-xs text-slate-600 outline-none focus:border-[#1a4fa0]">
            <option value={0}>Ajustar a pantalla</option>
            {TAMANOS.map(n => <option key={n} value={n}>{n} por página</option>)}
          </select>
        </div>
        {paginas > 1 && (
          <div className="flex items-center gap-0.5">
            <button onClick={() => setPagina(p => p - 1)} disabled={pagina === 1} aria-label="Anterior" className="grid size-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-40"><ChevronLeft size={14} /></button>
            {Array.from({ length: paginas }, (_, i) => i + 1).filter(p => p === 1 || p === paginas || Math.abs(p - pagina) <= 1).map((p, idx, arr) => (
              <React.Fragment key={p}>
                {idx > 0 && arr[idx - 1] !== p - 1 && <span className="px-1 text-xs text-slate-300">…</span>}
                <button onClick={() => setPagina(p)} className={`size-7 rounded-md text-xs ${p === pagina ? 'bg-[#1a4fa0] font-semibold text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{p}</button>
              </React.Fragment>
            ))}
            <button onClick={() => setPagina(p => p + 1)} disabled={pagina === paginas} aria-label="Siguiente" className="grid size-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-40"><ChevronRight size={14} /></button>
          </div>
        )}
      </div>
    </div>
  )
}
