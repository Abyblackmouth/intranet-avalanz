'use client'

// Tablero Proyectos (Control de Cambios). Componente independiente del
// tablero de incidentes (KanbanBoard.tsx): copia el estilo de su tarjeta,
// pero no comparte código con él, para no arriesgar ese tablero.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Building2, AlertTriangle, RotateCcw, Search } from 'lucide-react'
import { useWSEvent } from '@/hooks/useWebSocket'
import { getTableroProyectos } from '@/services/itServiceDeskService'

interface Cdc {
  id: string; folio: string; title: string; status: string; empresa: string | null; asignado: string | null
  prioridad: string | null; clasificacion: string | null; vencido: boolean; dias_en_etapa: number
  regreso_uat: boolean; mio: boolean; created_at: string; closed_at: string | null
}

const FASES = [
  { key: 'evaluacion', label: 'Evaluación', desc: '¿Procede y qué tan importante es?', color: '#64748b', chip: 'bg-slate-100 text-slate-700',
    etapas: [['en_backlog', 'Registrado'], ['en_revision', 'En revisión'], ['aprobado', 'Aprobado'], ['priorizado', 'Priorizado']] },
  { key: 'planeacion', label: 'Planeación', desc: 'Formalizar y diseñar la solución', color: '#1a4fa0', chip: 'bg-blue-100 text-blue-800',
    etapas: [['en_arranque', 'Arranque'], ['en_diseno_funcional', 'Diseño funcional'], ['en_diseno_tecnico', 'Diseño técnico']] },
  { key: 'ejecucion', label: 'Ejecución', desc: 'Construir, probar e instalar', color: '#b45309', chip: 'bg-amber-100 text-amber-800',
    etapas: [['en_desarrollo', 'En desarrollo'], ['en_pruebas', 'En pruebas (UAT)'], ['en_paso_produccion', 'Paso a producción']] },
  { key: 'cierre', label: 'Cierre', desc: 'Garantía y cierre', color: '#15803d', chip: 'bg-emerald-100 text-emerald-800',
    etapas: [['terminado', 'Terminado · garantía'], ['cerrado', 'Cerrado']] },
] as const
const ETAPAS = FASES.flatMap(f => f.etapas.map(([key, label]) => ({ key, label, fase: f })))
const IDX: Record<string, number> = Object.fromEntries(ETAPAS.map((e, i) => [e.key, i]))

const PRIO_CLS: Record<string, string> = {
  P1: 'bg-red-50 text-red-600 border-red-200', P2: 'bg-amber-50 text-amber-700 border-amber-200', P3: 'bg-sky-50 text-sky-700 border-sky-200',
}
function prioCode(p: string | null): string | null {
  if (!p) return null
  const v = p.toLowerCase()
  return ({ alta: 'P1', media: 'P2', baja: 'P3', p1: 'P1', p2: 'P2', p3: 'P3' } as Record<string, string>)[v] ?? null
}
const fmtShort = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', timeZone: 'America/Monterrey' }).replace('.', '')

function Tarjeta({ c, conEtapa, onOpen }: { c: Cdc; conEtapa: boolean; onOpen: (id: string) => void }) {
  const e = ETAPAS[IDX[c.status]]
  const code = prioCode(c.prioridad)
  const n = IDX[c.status] + 1
  return (
    <div role="button" tabIndex={0} onDoubleClick={() => onOpen(c.id)} onKeyDown={ev => { if (ev.key === 'Enter') onOpen(c.id) }}
      title="Doble clic para abrir"
      style={{ borderTop: `3px solid ${e.fase.color}` }}
      className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 p-3.5 transition-all duration-300 select-none h-[165px] flex flex-col cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#1a4fa0]/30">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-xs font-mono text-slate-400 truncate">{c.folio}</p>
        <div className="flex items-center gap-1 shrink-0">
          {c.regreso_uat && <span title="Regresó de pruebas (UAT)"><RotateCcw size={12} className="text-amber-600" /></span>}
          {code && <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${PRIO_CLS[code]}`}>{code}</span>}
        </div>
      </div>
      <p className="text-sm font-semibold text-slate-800 leading-snug mb-2 line-clamp-2 flex-1 overflow-hidden">{c.title}</p>
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-1 truncate">
        <Building2 size={11} className="shrink-0" />
        <span className="truncate">{c.empresa ?? '—'}{c.clasificacion ? ` · ${c.clasificacion === 'proyecto' ? 'Proyecto' : 'Cambio'}` : ''}</span>
      </div>
      <p className={`text-[11px] truncate mb-1 ${c.asignado ? 'text-slate-500' : 'text-slate-400 italic'}`}>→ {c.asignado ?? 'Sin asignar'}</p>
      <div className="-mx-3.5 mt-auto h-[3px] bg-slate-100" title={`Etapa ${n} de 12`}>
        <div className="h-full" style={{ width: `${(n / 12) * 100}%`, background: e.fase.color }} />
      </div>
      <div className={`flex items-center justify-between -mx-3.5 -mb-3.5 px-3.5 py-1.5 rounded-b-xl ${c.vencido ? 'bg-red-50' : 'bg-slate-50'}`}>
        <span className="text-[10px] text-slate-400 truncate">
          {conEtapa ? `${e.label} · ` : ''}{c.status === 'cerrado' ? fmtShort(c.closed_at ?? c.created_at) : `${c.dias_en_etapa} ${c.dias_en_etapa === 1 ? 'día' : 'días'}`}
        </span>
        {c.vencido
          ? <span className="flex items-center gap-1 text-[10px] font-semibold text-red-600 shrink-0"><AlertTriangle size={11} /> Vencido</span>
          : <span className="text-[10px] text-slate-400 shrink-0">{n}/12</span>}
      </div>
    </div>
  )
}

// Medidas fijas: ninguna depende del contenido. El numero de filas (2 a 4)
// lo decide el tablero segun el alto disponible de la pantalla.
const CARD_W = 180, CARD_H = 165, GAP = 8, COLS = 2, PAD = 8
const COL_W = COLS * CARD_W + (COLS - 1) * GAP + PAD * 2
const HEADER_H = 38, PAGER_H = 34, FASE_LABEL_H = 22
const colH = (rows: number) => HEADER_H + PAD + rows * CARD_H + (rows - 1) * GAP + PAD + PAGER_H
const filasQueCaben = (alto: number) =>
  Math.max(2, Math.min(4, Math.floor((alto - FASE_LABEL_H - 12 - HEADER_H - PAD * 2 - PAGER_H + GAP) / (CARD_H + GAP))))

function Columna({ label, color, items, conEtapa, onOpen, rows }: {
  label: string; color: string; items: Cdc[]; conEtapa: boolean; onOpen: (id: string) => void; esCerrado?: boolean; rows: number
}) {
  const porPagina = COLS * rows
  const [pagina, setPagina] = useState(0)
  const paginas = Math.max(1, Math.ceil(items.length / porPagina))
  const actual = Math.min(pagina, paginas - 1)
  const visibles = items.slice(actual * porPagina, (actual + 1) * porPagina)
  return (
    <section className="shrink-0 bg-slate-50/80 border border-slate-200 rounded-2xl flex flex-col overflow-hidden"
      style={{ width: COL_W, height: colH(rows) }}>
      <header className="px-3 flex items-center gap-2 shrink-0" style={{ height: HEADER_H }}>
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-700 truncate">{label}</h3>
        <span className="ml-auto text-[11px] text-slate-500">{items.length}</span>
      </header>
      <div className="flex-1 min-h-0 overflow-hidden" style={{ padding: `0 ${PAD}px ${PAD}px` }}>
        {items.length === 0 ? (
          <p className="text-[11px] text-slate-400 pt-6 text-center">Sin proyectos</p>
        ) : (
          <div className="grid content-start" style={{ gridTemplateColumns: `repeat(${COLS}, ${CARD_W}px)`, gridAutoRows: `${CARD_H}px`, gap: GAP }}>
            {visibles.map(c => <Tarjeta key={c.id} c={c} conEtapa={conEtapa} onOpen={onOpen} />)}
          </div>
        )}
      </div>
      <footer className="shrink-0 flex items-center justify-center border-t border-slate-200/70" style={{ height: PAGER_H }}>
        {paginas > 1 && (
          <button type="button" onClick={() => setPagina(actual + 1 >= paginas ? 0 : actual + 1)}
            className="text-[12px] font-medium text-[#1a4fa0] hover:underline">
            {actual + 1 >= paginas ? 'Ver desde el inicio' : `Ver más · ${actual + 1} de ${paginas}`}
          </button>
        )}
      </footer>
    </section>
  )
}

export default function CdcKanbanBoard({ onOpen, refreshKey = 0 }: { onOpen: (id: string) => void; refreshKey?: number }) {
  const [items, setItems] = useState<Cdc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [vista, setVista] = useState<'etapas' | 'fases'>('etapas')
  const [clasif, setClasif] = useState<'todos' | 'proyecto' | 'cambio'>('todos')
  const [prio, setPrio] = useState<'todas' | 'P1' | 'P2' | 'P3'>('todas')
  const [q, setQ] = useState('')
  const [mios, setMios] = useState(false)
  const [ocultas, setOcultas] = useState<Set<string>>(new Set())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tableroRef = useRef<HTMLDivElement>(null)
  const [rows, setRows] = useState(3)
  useEffect(() => {
    const el = tableroRef.current
    if (!el) return
    const medir = () => setRows(filasQueCaben(el.clientHeight))
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [loading])

  const cargar = useCallback(async () => {
    try { const r = await getTableroProyectos(); setItems(r.data ?? []); setError(null) }
    catch { setError('No se pudo cargar el tablero de proyectos') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { cargar() }, [cargar, refreshKey])

  // En vivo: solo reacciona a Controles de Cambio, con una pausa para agrupar ráfagas
  const refrescar = useCallback((data: any) => {
    if (!(data?.ticket_type === 'control_cambio' || data?.folio?.startsWith?.('CDC-'))) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(cargar, 600)
  }, [cargar])
  useWSEvent('it_service_desk.ticket_created', refrescar)
  useWSEvent('it_service_desk.ticket_updated', refrescar)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase()
    return items.filter(c => IDX[c.status] !== undefined
      && (clasif === 'todos' || c.clasificacion === clasif)
      && (prio === 'todas' || prioCode(c.prioridad) === prio)
      && (!mios || c.mio)
      && (!t || [c.folio, c.title, c.asignado ?? '', c.empresa ?? ''].some(x => x.toLowerCase().includes(t))))
  }, [items, q, clasif, prio, mios])

  const seg = (valor: string, actual: string, set: (v: any) => void, label: string, first: boolean) => (
    <button key={valor} type="button" onClick={() => set(valor)} aria-pressed={actual === valor}
      className={`px-2.5 py-1.5 ${first ? '' : 'border-l border-slate-200'} ${actual === valor ? 'bg-[#1a4fa0] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{label}</button>
  )

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Barra de herramientas */}
      <div className="flex flex-wrap items-center gap-2 mb-2.5 shrink-0 text-[12px]">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar folio, título o persona"
            className="bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 w-60 outline-none focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#1a4fa0]/15" />
        </div>
        <div className="inline-flex rounded-lg border border-slate-300 bg-white overflow-hidden" role="group" aria-label="Clasificación">
          {[['todos', 'Todos'], ['proyecto', 'Proyecto'], ['cambio', 'Cambio']].map(([v, l], i) => seg(v, clasif, setClasif, l, i === 0))}
        </div>
        <div className="inline-flex rounded-lg border border-slate-300 bg-white overflow-hidden" role="group" aria-label="Prioridad">
          {[['todas', 'Todas'], ['P1', 'P1'], ['P2', 'P2'], ['P3', 'P3']].map(([v, l], i) => seg(v, prio, setPrio, l, i === 0))}
        </div>
        <label className="inline-flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 cursor-pointer text-slate-600">
          <input type="checkbox" checked={mios} onChange={e => setMios(e.target.checked)} className="accent-[#1a4fa0]" /> Solo los míos
        </label>
        <div className="ml-auto inline-flex rounded-lg border border-slate-300 bg-white overflow-hidden" role="group" aria-label="Vista">
          {seg('etapas', vista, setVista, 'Por etapa', true)}{seg('fases', vista, setVista, 'Por fase', false)}
        </div>
      </div>

      {/* Resumen por fase: también oculta o muestra la fase en la vista por etapa */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-2.5 shrink-0">
        {FASES.map(f => {
          const de = filtrados.filter(c => f.etapas.some(([k]) => k === c.status))
          const activos = de.filter(c => c.status !== 'cerrado').length
          const venc = de.filter(c => c.vencido).length
          const oculta = ocultas.has(f.key)
          return (
            <button key={f.key} type="button" aria-pressed={!oculta}
              onClick={() => vista === 'etapas' && setOcultas(s => { const n = new Set(s); n.has(f.key) ? n.delete(f.key) : n.add(f.key); return n })}
              className={`text-left bg-white border border-slate-200 rounded-xl px-3 py-2 hover:border-slate-300 transition ${oculta ? 'opacity-50' : ''}`}
              style={{ borderLeft: `4px solid ${f.color}` }}>
              <span className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">{f.label}</span>
                {vista === 'etapas' && <span className="text-[10.5px] text-slate-400">{oculta ? 'Mostrar' : 'Ocultar'}</span>}
              </span>
              <span className="block text-[18px] font-semibold text-slate-900 leading-tight">{activos}</span>
              <span className="block text-[11px] text-slate-500 truncate">{f.desc}{venc ? <span className="text-red-600"> · {venc} vencido{venc > 1 ? 's' : ''}</span> : null}</span>
            </button>
          )
        })}
      </div>

      {/* Tablero: un solo contenedor con scroll */}
      <div ref={tableroRef} className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden pb-2">
        {loading ? (
          <div className="py-16 flex justify-center"><div className="w-5 h-5 border-2 border-slate-300 border-t-[#1a4fa0] rounded-full animate-spin" /></div>
        ) : error ? (
          <p className="py-10 text-center text-[13px] text-red-600">{error}</p>
        ) : vista === 'fases' ? (
          <div className="flex gap-3 items-start min-w-max">
            {FASES.map(f => (
              <Columna rows={rows} key={f.key} label={f.label} color={f.color} conEtapa onOpen={onOpen}
                items={filtrados.filter(c => f.etapas.some(([k]) => k === c.status) && c.status !== 'cerrado').sort((a, b) => IDX[a.status] - IDX[b.status])} />
            ))}
          </div>
        ) : (
          <div className="flex gap-3 items-start min-w-max">
            {FASES.map(f => {
              if (ocultas.has(f.key)) {
                const total = filtrados.filter(c => f.etapas.some(([k]) => k === c.status)).length
                return (
                  <button key={f.key} type="button" title={`Mostrar ${f.label}`}
                    onClick={() => setOcultas(s => { const n = new Set(s); n.delete(f.key); return n })}
                    style={{ height: colH(rows) + FASE_LABEL_H }}
                    className="shrink-0 w-10 rounded-2xl border border-slate-200 bg-white flex flex-col items-center py-3 gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: f.color }} />
                    <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600 [writing-mode:vertical-rl] rotate-180">{f.label} · {total}</span>
                  </button>
                )
              }
              return (
                <div key={f.key} className="shrink-0">
                  <p className="text-[11px] font-bold uppercase tracking-wider mb-1.5 px-1 h-[16px] leading-[16px]" style={{ color: f.color }}>{f.label}</p>
                  <div className="flex gap-2.5 items-start rounded-2xl" style={{ background: `${f.color}0d`, padding: 6 }}>
                    {f.etapas.map(([k, l]) => (
                      <Columna rows={rows} key={k} label={l} color={f.color} conEtapa={false} onOpen={onOpen} esCerrado={k === 'cerrado'}
                        items={filtrados.filter(c => c.status === k)} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
