'use client'

import { useState, useEffect, createContext, useContext, type ReactNode, type CSSProperties } from 'react'
import dynamic from 'next/dynamic'
import { useAuthStore } from '@/store/authStore'
import { getDashboardDirectivo } from '@/services/itServiceDeskService'
import { Lock, Moon, Sun } from 'lucide-react'
import { IBM_Plex_Sans } from 'next/font/google'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

// Dashboard directivo: cada pestana abre con una conclusion armada por el
// backend (/estadisticas/directivo) y debajo las graficas que la sustentan.
// La pantalla ocupa todo el ancho, con fondo propio y dos temas; los colores
// salen de variables CSS para que el cambio de tema llegue a todo, graficas
// incluidas.

const TEMAS = {
  claro: {
    bg: '#F3F5F8', panel: '#FFFFFF', ink: '#16263D', ink2: '#4A5A70', ink3: '#8593A6', line: '#B8C5D6', grid: '#E2E7EE',
    navy: '#1E3A5F', blue: '#2563EB', blueBg: '#EAF1FE', green: '#0F9D6E', amber: '#D97706', red: '#DC2626',
    greenBg: '#E7F6F0', amberBg: '#FDF3E3', redBg: '#FDECEC', heatA: ['#BFD3EE', '#5B85C2'], heatV: ['#C9E9DC', '#5DBB96'],
  },
  // Oscuro: grafito azulado; el acento es el azul de la intranet (#1a4fa0) aclarado
  oscuro: {
    bg: '#1F2733', panel: '#283241', ink: '#E8EDF3', ink2: '#B4C0CE', ink3: '#8A97A8', line: '#4A586B', grid: '#323D4C',
    navy: '#8DB0E8', blue: '#6E9BE6', blueBg: '#2F4361', green: '#3DBB8E', amber: '#E8A84A', red: '#EC6F6F',
    greenBg: '#24443A', amberBg: '#463A26', redBg: '#4A2E31', heatA: ['#34507A', '#5179B4'], heatV: ['#2A5245', '#3A8C69'],
  },
}
type Paleta = typeof TEMAS.claro
type NombreTema = keyof typeof TEMAS
const PaletaCtx = createContext<Paleta>(TEMAS.claro)
const usePaleta = () => useContext(PaletaCtx)
// Next descarga la fuente al compilar y la sirve desde la intranet
const plex = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], display: 'swap' })
const FUENTE = `${plex.style.fontFamily}, "Segoe UI", system-ui, -apple-system, sans-serif`
const CLAVE_TEMA = 'itsd-dashboard-tema'
// Sombra en dos capas: un contacto corto y una difusa abajo, para que la tarjeta se vea al aire
const SOMBRA: Record<'claro' | 'oscuro', string> = {
  claro: '0 1px 2px rgba(22, 38, 61, 0.06), 0 8px 20px -6px rgba(22, 38, 61, 0.16)',
  oscuro: '0 1px 2px rgba(0, 0, 0, 0.35), 0 10px 24px -8px rgba(0, 0, 0, 0.55)',
}

type Tono = 'ok' | 'warn' | 'bad'
interface Veredicto { tono: Tono; titulo: string; detalle: string; decidir: string }
interface Kpi { label: string; valor: string; delta: string; tono: 'good' | 'bad' | 'flat' }
type D = any

const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'problemas', label: 'Dónde están los problemas' },
  { id: 'equipo', label: 'Equipo y proveedores' },
  { id: 'adopcion', label: 'Adopción' },
  { id: 'procesos', label: 'Cambios y accesos' },
] as const
type TabId = typeof TABS[number]['id']

function firstDayOfMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Clases comunes (los colores vienen de las variables CSS del contenedor)
const PANEL = 'bg-[var(--panel)] border border-[var(--line)] rounded-lg [box-shadow:var(--sombra)]'
const INK = 'text-[color:var(--ink)]'
const INK2 = 'text-[color:var(--ink2)]'
const INK3 = 'text-[color:var(--ink3)]'

// ── Piezas de la pantalla ──────────────────────────────────────────────────
function VerdictBox({ v }: { v: Veredicto }) {
  const c = usePaleta()
  const bar = { ok: c.green, warn: c.amber, bad: c.red }[v.tono]
  return (
    <div className={`grid grid-cols-[6px_1fr] gap-x-4 py-4 pr-5 mb-4 overflow-hidden ${PANEL}`}>
      <div className="rounded-r-[3px]" style={{ backgroundColor: bar }} />
      <div>
        <h2 className={`text-[19px] leading-[1.35] font-semibold max-w-[70ch] m-0 mb-1 ${INK}`}>{v.titulo}</h2>
        {v.detalle && <p className={`text-[14px] max-w-[80ch] m-0 ${INK2}`}>{v.detalle}</p>}
        {v.decidir && <p className="text-[14px] font-medium mt-2 mb-0" style={{ color: c.navy }}>Para decidir: {v.decidir}</p>}
      </div>
    </div>
  )
}

function KpiStrip({ kpis }: { kpis: Kpi[] }) {
  const c = usePaleta()
  const color = { good: c.green, bad: c.red, flat: c.ink3 }
  return (
    <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
      {kpis.map(k => (
        <div key={k.label} className={`${PANEL} px-[14px] py-3`}>
          <div className={`text-[13px] ${INK2}`}>{k.label}</div>
          <div className={`text-[26px] font-semibold leading-[1.2] my-0.5 tabular-nums ${INK}`}>{k.valor}</div>
          <div className="text-[12px] font-medium" style={{ color: color[k.tono] }}>{k.delta}</div>
        </div>
      ))}
    </div>
  )
}

function Card({ title, q, children, className = '' }: { title: string; q?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`${PANEL} p-4 min-w-0 ${className}`}>
      <h3 className={`text-[15px] font-semibold m-0 ${INK}`}>{title}</h3>
      {q && <p className={`text-[13px] mt-0.5 mb-2 ${INK2}`}>{q}</p>}
      {children}
    </div>
  )
}

function Vacio({ height = 300 }: { height?: number }) {
  return <div className={`flex items-center justify-center text-[14px] text-center px-6 ${INK3}`} style={{ height }}>Aún no hay datos en este periodo</div>
}

function Chart({ option, height = 300, empty }: { option: any; height?: number; empty: boolean }) {
  if (empty) return <Vacio height={height} />
  return <ReactECharts option={option} notMerge opts={{ renderer: 'svg' }} style={{ height, width: '100%' }} />
}

function Pendiente({ height = 300, texto }: { height?: number; texto: string }) {
  return (
    <div className={`flex items-center justify-center text-center px-8 rounded-md border border-dashed border-[var(--line)] text-[14px] ${INK2}`} style={{ height }}>
      {texto}
    </div>
  )
}

// ── Opciones base de ECharts ───────────────────────────────────────────────
function useEje() {
  const c = usePaleta()
  return {
    c,
    base: () => ({
      textStyle: { color: c.ink2, fontFamily: FUENTE },
      grid: { left: 8, right: 16, top: 30, bottom: 8, containLabel: true },
      tooltip: { trigger: 'axis', backgroundColor: c.panel, borderColor: c.line, textStyle: { color: c.ink, fontFamily: FUENTE } },
      legend: { top: 0, textStyle: { color: c.ink2 }, itemWidth: 12, itemHeight: 8 },
    }),
    cat: (data: string[], extra: any = {}) => ({ type: 'category', data, axisLine: { lineStyle: { color: c.grid } }, axisTick: { show: false }, axisLabel: { color: c.ink2 }, ...extra }),
    val: (extra: any = {}) => ({ type: 'value', minInterval: 1, splitLine: { lineStyle: { color: c.grid } }, axisLabel: { color: c.ink3 }, ...extra }),
  }
}

// ── 1. Resumen ─────────────────────────────────────────────────────────────
// Empieza por la ingesta (el trabajo que entra cada dia) y de ahi sigue con
// los indicadores, creados contra resueltos y la capacidad del equipo.
function Resumen({ d }: { d: D }) {
  const { c, base, cat, val } = useEje()
  const f = d.flujo
  const g = d.ingesta
  const cap = d.capacidad
  const n = f.etiquetas.length
  const salto = n > 45 ? 6 : n > 20 ? 3 : n > 10 ? 1 : 0
  const sinDatos = f.creados.every((x: number) => !x) && f.resueltos.every((x: number) => !x)

  const ingesta = {
    ...base(), legend: { show: false },
    tooltip: { trigger: 'axis', backgroundColor: c.panel, borderColor: c.line, textStyle: { color: c.ink },
      formatter: (p: any) => `${p[0].name}<br><b>${p[0].value}</b> ${p[0].value === 1 ? 'ticket entró' : 'tickets entraron'}` },
    xAxis: cat(f.etiquetas, { axisLabel: { color: c.ink2, interval: salto, fontSize: 11 } }),
    yAxis: val(),
    series: [{ type: 'bar', barWidth: '62%', barMaxWidth: 56,
      data: f.creados.map((v: number, i: number) => ({ value: v, itemStyle: { color: f.fin_de_semana[i] ? c.blueBg : c.navy, borderRadius: [3, 3, 0, 0] } })),
      markLine: g.prom_habil ? { symbol: 'none', data: [{ yAxis: g.prom_habil }], lineStyle: { color: c.amber, type: 'dashed', width: 2 },
        label: { formatter: `Promedio ${g.prom_habil}`, color: c.amber, position: 'insideStartTop' } } : undefined }],
  }
  const simple = {
    ...base(),
    legend: { top: 0, left: 'center', icon: 'roundRect', itemWidth: 12, itemHeight: 8, itemGap: 18, textStyle: { color: c.ink2, fontSize: 12 },
      inactiveColor: c.ink3, data: ['Creados', 'Resueltos', 'Abiertos acumulados'] },
    tooltip: { trigger: 'axis', backgroundColor: c.panel, borderColor: c.line, textStyle: { color: c.ink }, axisPointer: { type: 'line', lineStyle: { color: c.line } },
      formatter: (p: any) => `<b>${p[0].name}</b><br>` + p.map((x: any) => `${x.marker}${x.seriesName}: <b>${x.value}</b>`).join('<br>') },
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    xAxis: cat(f.etiquetas, { axisLabel: { color: c.ink3, interval: salto, fontSize: 11 } }),
    yAxis: [val({ splitNumber: 3 }), val({ splitNumber: 3, splitLine: { show: false }, axisLabel: { show: false } })],
    dataZoom: [{ type: 'inside' }],
    series: [
      { name: 'Abiertos acumulados', type: 'bar', yAxisIndex: 1, barWidth: '60%', barMaxWidth: 56, z: 1, data: f.abiertos, itemStyle: { color: c.blueBg, borderRadius: [3, 3, 0, 0] } },
      { name: 'Creados', type: 'line', z: 3, data: f.creados, smooth: 0.3, smoothMonotone: 'x', showSymbol: false, symbolSize: 6,
        lineStyle: { width: 2, color: c.red }, itemStyle: { color: c.red } },
      { name: 'Resueltos', type: 'line', z: 3, data: f.resueltos, smooth: 0.3, smoothMonotone: 'x', showSymbol: false, symbolSize: 6,
        lineStyle: { width: 2, color: c.green }, itemStyle: { color: c.green } },
    ],
  }
  // Balance del dia: lo que entro menos lo que se resolvio. Arriba (rojo) se
  // acumulo trabajo; abajo (verde) se avanzo. Una sola escala, una pregunta.
  const balance = f.creados.map((v: number, i: number) => v - f.resueltos[i])
  const diasAcum = balance.filter((v: number) => v > 0).length
  const diasAvance = balance.filter((v: number) => v < 0).length
  const balanceTotal = balance.reduce((x: number, y: number) => x + y, 0)
  const es = {
    ...base(), legend: { show: false },
    tooltip: { trigger: 'axis', backgroundColor: c.panel, borderColor: c.line, textStyle: { color: c.ink }, axisPointer: { type: 'shadow' },
      formatter: (p: any) => {
        const i = p[0].dataIndex, v = balance[i]
        const txt = v > 0 ? `se acumularon ${v}` : v < 0 ? `se avanzó ${-v}` : 'en equilibrio'
        return `<b>${p[0].name}</b><br>Entraron: ${f.creados[i]}<br>Se resolvieron: ${f.resueltos[i]}<br>Balance: <b>${v > 0 ? '+' : ''}${v}</b> (${txt})`
      } },
    xAxis: cat(f.etiquetas, { axisLabel: { color: c.ink2, interval: salto, fontSize: 11 } }),
    yAxis: val({ axisLabel: { formatter: (v: number) => (v > 0 ? `+${v}` : `${v}`), color: c.ink3 } }),
    series: [{ type: 'bar', barWidth: '55%', barMaxWidth: 44,
      data: balance.map((v: number) => ({ value: v, itemStyle: { color: v > 0 ? c.red : c.green, borderRadius: v > 0 ? [3, 3, 0, 0] : [0, 0, 3, 3] } })),
      label: { show: true, position: 'outside', fontSize: 11, color: c.ink2, formatter: (x: any) => (x.value ? (x.value > 0 ? `+${x.value}` : `${x.value}`) : '') },
      markLine: { symbol: 'none', silent: true, data: [{ yAxis: 0 }], lineStyle: { color: c.ink3, width: 1 }, label: { show: false } } }],
  }
  const coloresEdad = [c.green, c.blue, c.amber, c.red]
  const edad = {
    ...base(), legend: { show: false },
    xAxis: val(), yAxis: cat([...d.edad].reverse().map((e: D) => e.rango)),
    series: [{ type: 'bar', barWidth: '55%', label: { show: true, position: 'right', color: c.ink },
      data: [...d.edad].reverse().map((e: D, i: number) => ({ value: e.tickets, itemStyle: { color: coloresEdad[3 - i] } })) }],
  }
  const sev = {
    ...base(), legend: { show: false },
    tooltip: { trigger: 'axis', backgroundColor: c.panel, borderColor: c.line, textStyle: { color: c.ink },
      formatter: (p: any) => `${p[0].name}<br>Se consume en promedio el ${p[0].value}% del límite<br>${d.severidad[p[0].dataIndex].horas} h promedio · ${d.severidad[p[0].dataIndex].tickets} tickets` },
    xAxis: val({ max: (v: any) => Math.max(120, Math.ceil(v.max / 10) * 10 + 10), axisLabel: { formatter: '{value}%', color: c.ink3 } }),
    yAxis: cat(d.severidad.map((s: D) => s.severidad)),
    series: [{ type: 'bar', barWidth: '45%', barMaxWidth: 40,
      data: d.severidad.map((s: D) => ({ value: s.consumo, itemStyle: { color: s.consumo > 100 ? c.red : s.consumo >= 90 ? c.amber : c.green } })),
      label: { show: true, position: 'right', formatter: '{c}%', color: c.ink },
      markLine: { symbol: 'none', data: [{ xAxis: 100 }], lineStyle: { color: c.red, type: 'dashed', width: 2 }, label: { formatter: 'Límite', color: c.red } } }],
  }
  const delta = g.delta_pct
  const capFila = (t: string, v: ReactNode) => (
    <li className="flex justify-between gap-3 py-2 border-b border-[var(--grid)] last:border-0">
      <span className={INK}>{t}</span><span className={`tabular-nums whitespace-nowrap ${INK2}`}>{v}</span>
    </li>
  )
  const num = (v: any, color?: string) => <b className="font-semibold" style={{ color: color ?? c.ink }}>{v ?? '—'}</b>
  return (
    <>
      <VerdictBox v={d.veredicto} />

      <div className={`${PANEL} p-4 mb-4`}>
        <div className="grid gap-x-6 gap-y-2 grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="flex flex-col gap-3.5 py-1">
            <div>
              <div className={`text-[44px] font-semibold leading-none tabular-nums ${INK}`}>{g.total}</div>
              <div className={`text-[13px] mt-1 ${INK2}`}>{g.total === 1 ? 'ticket entró' : 'tickets entraron'} en el periodo</div>
            </div>
            <hr className="border-0 border-t border-[var(--grid)] m-0" />
            <div>
              <div className={`text-[20px] font-semibold leading-tight tabular-nums ${INK}`}>{g.prom_habil}</div>
              <div className={`text-[13px] mt-0.5 ${INK2}`}>promedio por día hábil</div>
            </div>
            <div>
              <div className={`text-[20px] font-semibold leading-tight tabular-nums ${INK}`}>{g.pico.valor || '—'}</div>
              <div className={`text-[13px] mt-0.5 ${INK2}`}>{g.pico.etiqueta ? `día pico: ${g.pico.etiqueta}` : 'sin día pico'}</div>
            </div>
            <div>
              <div className="text-[20px] font-semibold leading-tight tabular-nums" style={{ color: delta === null ? c.ink3 : delta > 0 ? c.red : c.green }}>
                {delta === null ? '—' : `${delta > 0 ? '▲' : delta < 0 ? '▼' : ''} ${Math.abs(delta)}%`}
              </div>
              <div className={`text-[13px] mt-0.5 ${INK2}`}>contra el periodo anterior ({g.prev_total})</div>
            </div>
          </div>
          <div className="min-w-0">
            <h3 className={`text-[15px] font-semibold m-0 ${INK}`}>Ingesta: tickets que entran cada {f.unidad === 'dia' ? 'día' : 'semana'}</h3>
            <p className={`text-[13px] mt-0.5 mb-2 ${INK2}`}>
              {f.unidad === 'dia' ? 'Las barras claras son fines de semana. ' : ''}La línea punteada es el promedio por día hábil.
            </p>
            <Chart option={ingesta} empty={!g.total} height={280} />
          </div>
        </div>
      </div>

      <KpiStrip kpis={d.kpis} />

      <Card className="mb-4" title={`Creados, resueltos y abiertos acumulados por ${f.unidad === 'dia' ? 'día' : 'semana'}`}
        q="Si la línea roja va por encima de la verde, el trabajo se acumula. Haz clic en un concepto de la leyenda para ocultarlo o mostrarlo.">
        <Chart option={simple} empty={sinDatos} height={300} />
      </Card>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-[2fr_1fr]">
        <Card title={`Balance de cada ${f.unidad === 'dia' ? 'día' : 'semana'}: ¿ganamos o perdimos terreno?`}
          q="Lo que entró menos lo que se resolvió. Rojo hacia arriba: se acumuló trabajo. Verde hacia abajo: se avanzó.">
          <div className={`flex flex-wrap gap-x-5 gap-y-1 text-[13px] mb-1 ${INK2}`}>
            <span>Con acumulación: <b style={{ color: c.red }}>{diasAcum}</b></span>
            <span>Con avance: <b style={{ color: c.green }}>{diasAvance}</b></span>
            <span>Balance del periodo: <b style={{ color: balanceTotal > 0 ? c.red : balanceTotal < 0 ? c.green : c.ink }}>{balanceTotal > 0 ? '+' : ''}{balanceTotal}</b></span>
          </div>
          <Chart option={es} empty={sinDatos} height={330} />
        </Card>
        <Card title="Capacidad del equipo" q="Lo que entra contra lo que el equipo alcanza a sacar.">
          <ul className="m-0 mt-1.5 p-0 list-none text-[14px]">
            {capFila('Entran por día hábil', <>{num(cap.entran_dia)} tickets</>)}
            {capFila('Se resuelven por día hábil', <>{num(cap.cierran_dia)} tickets</>)}
            {capFila('Personas atendiendo', num(cap.personas))}
            {capFila('Resueltos por persona al día', num(cap.cierres_persona_dia))}
            {capFila('Abiertos por persona hoy', num(cap.abiertos_persona))}
            {capFila('Trabajo acumulado', <>{num(cap.dias_acumulados, c.amber)} días hábiles</>)}
          </ul>
          <p className="text-[13px] font-medium mt-2.5 mb-0" style={{ color: cap.suficiente ? c.navy : c.ink2 }}>{cap.conclusion}</p>
        </Card>
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 mt-4">
        <Card title="Antigüedad de los abiertos" q="Los tickets olvidados que hoy no se ven.">
          <Chart option={edad} empty={d.edad.every((e: D) => !e.tickets)} />
        </Card>
        <Card title="Tiempo real de resolución contra la meta, por severidad"
          q="Qué porcentaje del límite del SLA se consume en promedio. Cerca del 100% significa que se cumple, pero apenas.">
          <Chart option={sev} empty={!d.severidad.length} />
        </Card>
      </div>
      <ResueltosCard lista={d.resueltos ?? []} />
    </>
  )
}

function ResueltosCard({ lista }: { lista: D[] }) {
  const c = usePaleta()
  const th = `font-semibold px-2.5 py-2 whitespace-nowrap border-b border-[var(--line)] ${INK2}`
  const td = 'px-2.5 py-2 border-b border-[var(--grid)]'
  return (
    <Card className="mt-4" title="Tickets resueltos en el periodo" q="Quién los resolvió, cuánto tardaron y si cumplieron el SLA de resolución.">
      {lista.length === 0 ? <Vacio height={120} /> : (
        <div className="overflow-x-auto">
          <table className={`w-full border-collapse text-[13px] tabular-nums ${INK}`}>
            <thead>
              <tr>
                {['Folio', 'Título', 'Sistema', 'Sev.', 'Resolvió', 'Resuelto'].map(h => <th key={h} className={`text-left ${th}`}>{h}</th>)}
                {['Tardó', 'SLA'].map(h => <th key={h} className={`text-right ${th}`}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {lista.map((t: D) => (
                <tr key={t.folio}>
                  <td className={`${td} whitespace-nowrap font-medium`} style={{ color: c.navy }}>{t.folio}</td>
                  <td className={`${td} max-w-[340px] truncate`} title={t.titulo}>{t.titulo}</td>
                  <td className={`${td} whitespace-nowrap ${INK2}`}>{t.sistema}</td>
                  <td className={`${td} whitespace-nowrap ${INK2}`}>{t.severidad}</td>
                  <td className={`${td} whitespace-nowrap`}>{t.resolvio}</td>
                  <td className={`${td} whitespace-nowrap ${INK2}`}>{t.resuelto}</td>
                  <td className={`${td} whitespace-nowrap text-right`}>{t.horas} h</td>
                  <td className={`${td} whitespace-nowrap text-right`}>
                    {t.cumplio === null ? <span className={INK3}>—</span> : (
                      <span className="inline-block px-2 rounded-full text-[12px] font-medium"
                        style={t.cumplio ? { background: c.greenBg, color: c.green } : { background: c.redBg, color: c.red }}>
                        {t.cumplio ? 'A tiempo' : 'Tarde'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

// ── 2. Problemas ───────────────────────────────────────────────────────────
function Problemas({ d }: { d: D }) {
  const { c, base, cat, val } = useEje()
  const total = d.pareto.reduce((a: number, b: D) => a + b.tickets, 0)
  let acc = 0
  const cum = d.pareto.map((p: D) => Math.round((acc += p.tickets) * 100 / (total || 1)))
  const pareto = {
    ...base(),
    xAxis: cat(d.pareto.map((p: D) => p.sistema), { axisLabel: { color: c.ink2, interval: 0, rotate: 35 } }),
    yAxis: [val(), val({ max: 100, minInterval: 0, splitLine: { show: false }, axisLabel: { formatter: '{value}%', color: c.ink3 } })],
    series: [
      { name: 'Tickets', type: 'bar', barWidth: '55%', data: d.pareto.map((p: D, i: number) => ({ value: p.tickets, itemStyle: { color: i < 3 ? c.navy : c.ink3 } })) },
      { name: '% acumulado', type: 'line', yAxisIndex: 1, data: cum, smooth: true, symbolSize: 5, lineStyle: { color: c.amber, width: 2 }, itemStyle: { color: c.amber },
        markLine: { symbol: 'none', data: [{ yAxis: 80 }], lineStyle: { color: c.amber, type: 'dashed' }, label: { formatter: '80%', color: c.amber } } },
    ],
  }
  const m = d.mapa
  const maxHeat = Math.max(1, ...m.valores.map((v: number[]) => v[2]))
  const heat = {
    ...base(), legend: { show: false },
    tooltip: { position: 'top', backgroundColor: c.panel, borderColor: c.line, textStyle: { color: c.ink },
      formatter: (p: any) => `${m.sistemas[p.value[1]]} · ${m.severidades[p.value[0]]}: ${p.value[2]} tickets` },
    grid: { left: 8, right: 16, top: 8, bottom: 48, containLabel: true },
    xAxis: cat(m.severidades), yAxis: cat(m.sistemas, { inverse: true }),
    visualMap: { min: 0, max: maxHeat, orient: 'horizontal', left: 'center', bottom: 0, itemHeight: 120, textStyle: { color: c.ink3 },
      inRange: { color: [c.panel, c.heatA[0], c.heatA[1], c.navy] } },
    series: [{ type: 'heatmap', data: m.valores, label: { show: true, color: c.ink }, itemStyle: { borderColor: c.panel, borderWidth: 2 } }],
  }
  const conTasa = d.empresas.some((e: D) => e.por_10_usuarios !== null)
  const valores = d.empresas.map((e: D) => (conTasa ? e.por_10_usuarios : e.tickets))
  const prom = valores.length ? Math.round(valores.reduce((a: number, b: number) => a + b, 0) / valores.length * 10) / 10 : 0
  const emp = {
    ...base(), legend: { show: false },
    xAxis: cat(d.empresas.map((e: D) => e.empresa)), yAxis: val({ minInterval: conTasa ? 0 : 1 }),
    series: [{ type: 'bar', barWidth: '45%', label: { show: true, position: 'top', color: c.ink },
      data: valores.map((v: number) => ({ value: v, itemStyle: { color: v > prom * 1.8 ? c.red : c.blue } })),
      markLine: { symbol: 'none', data: [{ yAxis: prom }], lineStyle: { color: c.ink3, type: 'dashed' }, label: { formatter: `Promedio ${prom}`, color: c.ink2 } } }],
  }
  return (
    <>
      <VerdictBox v={d.veredicto} />
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card title="Tickets por sistema (Pareto)" q="Las barras son tickets; la línea, el porcentaje acumulado.">
          <Chart option={pareto} empty={!d.pareto.length} height={360} />
        </Card>
        <Card title="Sistema por severidad" q="Más oscuro, más tickets.">
          <Chart option={heat} empty={!m.sistemas.length} height={360} />
        </Card>
      </div>
      <Card className="mt-4" title={conTasa ? 'Tickets por cada 10 usuarios, por empresa' : 'Tickets por empresa'}
        q={conTasa ? 'Compara empresas de distinto tamaño. La línea punteada es el promedio del grupo.'
          : 'La comparación por cada 10 usuarios se activa al conectar el número de usuarios por empresa.'}>
        <Chart option={emp} empty={!d.empresas.length} />
      </Card>
    </>
  )
}

// ── 3. Equipo y proveedores ────────────────────────────────────────────────
function Equipo({ d }: { d: D }) {
  const { c, base, cat, val } = useEje()
  const max = Math.max(1, ...d.personas.map((p: D) => p.abiertos))
  const pill = (n: number): CSSProperties => (n === 0 ? { background: c.greenBg, color: c.green } : n <= 1 ? { background: c.amberBg, color: c.amber } : { background: c.redBg, color: c.red })
  const areas = {
    ...base(),
    xAxis: cat(d.areas.map((a: D) => a.area), { axisLabel: { color: c.ink2, interval: 0 } }),
    yAxis: [val({ max: 100, axisLabel: { formatter: '{value}%', color: c.ink3 } }), val({ minInterval: 0, splitLine: { show: false }, axisLabel: { formatter: '{value} h', color: c.ink3 } })],
    series: [
      { name: 'Cumplimiento', type: 'bar', barWidth: '40%', label: { show: true, position: 'inside', formatter: '{c}%', color: '#fff' },
        data: d.areas.map((a: D) => ({ value: a.cumplimiento ?? 0, itemStyle: { color: (a.cumplimiento ?? 0) < 80 ? c.red : (a.cumplimiento ?? 0) < 90 ? c.amber : c.green } })) },
      { name: 'Horas promedio', type: 'line', yAxisIndex: 1, data: d.areas.map((a: D) => a.prom_horas), symbolSize: 7, lineStyle: { color: c.navy, width: 2 }, itemStyle: { color: c.navy } },
    ],
  }
  const th = `font-semibold px-2.5 py-2 whitespace-nowrap border-b border-[var(--line)] ${INK2}`
  const td = 'px-2.5 py-2 whitespace-nowrap border-b border-[var(--grid)]'
  return (
    <>
      <VerdictBox v={d.veredicto} />
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-[2fr_1fr]">
        <Card title="Desempeño por persona" q="Abiertos hoy, resueltos en el periodo, tiempo promedio e incumplimientos de respuesta o resolución.">
          {d.personas.length === 0 ? <Vacio height={160} /> : (
            <div className="overflow-x-auto">
              <table className={`w-full border-collapse text-[13px] tabular-nums ${INK}`}>
                <thead>
                  <tr>
                    {['Persona', 'Equipo', 'Área o proveedor'].map(h => <th key={h} className={`text-left ${th}`}>{h}</th>)}
                    {['Abiertos', 'Resueltos', 'Prom. resolución', 'Incumplidos', 'Reasignados'].map(h => <th key={h} className={`text-right ${th}`}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {d.personas.map((p: D) => (
                    <tr key={p.nombre + p.area}>
                      <td className={td}>{p.nombre}</td>
                      <td className={`${td} ${INK2}`}>{p.equipo}</td>
                      <td className={`${td} ${INK2}`}>{p.area}</td>
                      <td className={`${td} text-right`}>
                        <span className="inline-block h-2 rounded align-middle mr-1.5" style={{ width: Math.round(p.abiertos / max * 48), backgroundColor: c.blue }} />{p.abiertos}
                      </td>
                      <td className={`${td} text-right`}>{p.resueltos}</td>
                      <td className={`${td} text-right`}>{p.prom_horas !== null ? `${p.prom_horas} h` : '—'}</td>
                      <td className={`${td} text-right`}><span className="inline-block px-2 rounded-full text-[12px] font-medium" style={pill(p.incumplidos)}>{p.incumplidos}</span></td>
                      <td className={`${td} text-right`}>{p.reasignados}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Áreas y proveedores" q="Cumplimiento de respuesta y resolución, y tiempo promedio de los tickets resueltos.">
          <Chart option={areas} empty={!d.areas.length} height={360} />
        </Card>
      </div>
    </>
  )
}

// ── 4. Adopción ────────────────────────────────────────────────────────────
function Adopcion({ d }: { d: D }) {
  const { c, base, cat } = useEje()
  const maxH = Math.max(1, ...d.mapa.map((v: number[]) => v[2]))
  const hora = {
    ...base(), legend: { show: false },
    tooltip: { position: 'top', backgroundColor: c.panel, borderColor: c.line, textStyle: { color: c.ink },
      formatter: (p: any) => `${d.dias[p.value[1]]} ${d.horas[p.value[0]]} · ${p.value[2]} tickets` },
    grid: { left: 8, right: 16, top: 8, bottom: 44, containLabel: true },
    xAxis: cat(d.horas), yAxis: cat(d.dias, { inverse: true }),
    visualMap: { min: 0, max: maxH, orient: 'horizontal', left: 'center', bottom: 0, itemHeight: 120, textStyle: { color: c.ink3 },
      inRange: { color: [c.panel, c.heatV[0], c.heatV[1], c.green] } },
    series: [{ type: 'heatmap', data: d.mapa, itemStyle: { borderColor: c.panel, borderWidth: 2 } }],
  }
  const pend = 'Pendiente de conectar: estos datos viven en otro servicio de la intranet y se enlazan en el siguiente paso.'
  return (
    <>
      <VerdictBox v={d.veredicto} />
      {d.kpis && <KpiStrip kpis={d.kpis} />}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card title="¿Cuándo se crean los tickets?" q={`Día y hora, en hora de Monterrey. Fuera del horario hábil: ${d.fuera_de_horario}.`}>
          <Chart option={hora} empty={!d.mapa.some((v: number[]) => v[2])} />
        </Card>
        <Card title="Usuarios activos por semana" q="Personas distintas que entraron a la intranet.">
          {d.usuarios_activos ? <UsuariosActivos u={d.usuarios_activos} /> : <Pendiente texto={pend} />}
        </Card>
      </div>
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 mt-4">
        <Card title="Uso del asistente por semana" q="Preguntas, cuántas terminaron en ticket y cuántas con baja confianza.">
          {d.asistente ? <Asistente a={d.asistente} /> : <Pendiente texto={pend} />}
        </Card>
        <Card title="Temas que el asistente no supo responder" q="Señal de qué documentar o capacitar.">
          {d.temas_sin_respuesta ? (
            d.temas_sin_respuesta.length ? (
              <ul className="m-0 p-0 list-none">
                {d.temas_sin_respuesta.map((t: D) => (
                  <li key={t.tema} className="flex justify-between gap-3 py-2 border-b border-[var(--grid)] last:border-0">
                    <span className={INK}>{t.tema}</span>
                    <span className={`tabular-nums whitespace-nowrap ${INK2}`}>{t.preguntas} {t.preguntas === 1 ? 'pregunta' : 'preguntas'}</span>
                  </li>
                ))}
              </ul>
            ) : <Vacio height={160} />
          ) : <Pendiente texto={pend} />}
        </Card>
      </div>
    </>
  )
}

function UsuariosActivos({ u }: { u: D }) {
  const { c, base, cat, val } = useEje()
  const colores = [c.navy, c.blue, c.heatA[1], c.ink3, c.heatA[0], c.green]
  const option = {
    ...base(), xAxis: cat(u.semanas), yAxis: val(),
    series: u.series.map((s: D, i: number) => ({ name: s.nombre, type: 'line', stack: 'u', areaStyle: { opacity: 0.85 }, smooth: true, showSymbol: false,
      data: s.valores, lineStyle: { width: 1, color: colores[i % colores.length] }, itemStyle: { color: colores[i % colores.length] } })),
  }
  return <Chart option={option} empty={!u.series.length} />
}

function Asistente({ a }: { a: D }) {
  const { c, base, cat, val } = useEje()
  const option = {
    ...base(), xAxis: cat(a.semanas), yAxis: val(),
    series: [
      { name: 'Respondidas sin ticket', type: 'bar', stack: 'a', barWidth: '45%', data: a.sin_ticket, itemStyle: { color: c.green } },
      { name: 'Baja confianza', type: 'bar', stack: 'a', data: a.baja_confianza, itemStyle: { color: c.amber } },
      { name: 'Terminaron en ticket', type: 'bar', stack: 'a', data: a.con_ticket, itemStyle: { color: c.red } },
    ],
  }
  return <Chart option={option} empty={!a.semanas.length} />
}

// ── 5. Cambios y accesos ───────────────────────────────────────────────────
function Procesos({ d }: { d: D }) {
  const { c, base, cat, val } = useEje()
  const tonos = [c.navy, c.blue, c.heatA[1], c.heatA[0]]
  const embudo = {
    textStyle: { fontFamily: FUENTE },
    tooltip: { trigger: 'item', formatter: '{b}: {c} cambios', backgroundColor: c.panel, borderColor: c.line, textStyle: { color: c.ink } },
    series: [{ type: 'funnel', left: '8%', width: '84%', top: 8, bottom: 8, minSize: '18%', sort: 'descending', gap: 3,
      label: { show: true, position: 'inside', formatter: '{b}  {c}', color: '#fff', fontWeight: 500 },
      data: d.embudo.map((e: D, i: number) => ({ name: e.etapa, value: e.cambios,
        itemStyle: { color: i === d.embudo.length - 1 && d.embudo.length > 1 ? c.green : tonos[Math.min(i, tonos.length - 1)] } })) }],
  }
  const maxD = Math.max(0, ...d.dias_etapa.map((e: D) => e.dias))
  const etapas = {
    ...base(), legend: { show: false },
    xAxis: val({ minInterval: 0, axisLabel: { formatter: '{value} d', color: c.ink3 } }), yAxis: cat(d.dias_etapa.map((e: D) => e.etapa), { inverse: true }),
    series: [{ type: 'bar', barWidth: '50%', label: { show: true, position: 'right', formatter: '{c} días', color: c.ink },
      data: d.dias_etapa.map((e: D) => ({ value: e.dias, itemStyle: { color: e.dias === maxD ? c.red : c.blue } })) }],
  }
  const coloresAcc = [c.ink3, c.blue, c.red, c.green, c.amber, c.navy]
  const acc = {
    ...base(), tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: c.panel, borderColor: c.line, textStyle: { color: c.ink } },
    xAxis: val({ minInterval: 0, axisLabel: { formatter: '{value} h', color: c.ink3 } }), yAxis: cat(d.accesos.meses, { inverse: true }),
    series: d.accesos.pasos.map((p: D, i: number) => ({ name: `Después de: ${p.paso.toLowerCase()}`, type: 'bar', stack: 't', barWidth: '50%',
      data: p.horas, itemStyle: { color: coloresAcc[i % coloresAcc.length] } })),
  }
  return (
    <>
      <VerdictBox v={d.veredicto} />
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card title="Control de Cambios: cuántos llegan a cada etapa" q="Del registro a la liberación en producción.">
          <Chart option={embudo} empty={!d.embudo.length} height={360} />
        </Card>
        <Card title="Control de Cambios: días promedio en cada etapa" q="La barra roja es el cuello de botella.">
          <Chart option={etapas} empty={!d.dias_etapa.length} height={360} />
        </Card>
      </div>
      <Card className="mt-4" title="Solicitud de Accesos: de dónde sale el tiempo total" q="Horas promedio entre un paso y el siguiente, por mes de la solicitud.">
        <Chart option={acc} empty={!d.accesos.pasos.length} height={Math.max(260, d.accesos.meses.length * 60 + 80)} />
      </Card>
    </>
  )
}

// ── Página ─────────────────────────────────────────────────────────────────
export default function ItServiceDeskDashboardPage() {
  const { user } = useAuthStore()
  const roles: string[] = user?.roles ?? []

  const hasFullAccess = roles.includes('it-service-desk:incident-manager')
    || roles.includes('it-service-desk:project-manager')
    || roles.includes('it-service-desk:comite-directivo')
    || roles.includes('super_admin')
  const isEspecialista = roles.includes('it-service-desk:especialista-funcional') || roles.includes('it-service-desk:especialista-tecnico')
  const canViewDashboard = hasFullAccess || isEspecialista

  const [tema, setTema] = useState<NombreTema>('claro')
  const [tab, setTab] = useState<TabId>('resumen')
  const [dateFrom, setDateFrom] = useState(firstDayOfMonth())
  const [dateTo, setDateTo] = useState(today())
  const [empresa, setEmpresa] = useState('')
  const [tipo, setTipo] = useState('')
  const [data, setData] = useState<D | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // El tema elegido se recuerda en este navegador
  useEffect(() => {
    try { const t = localStorage.getItem(CLAVE_TEMA); if (t === 'oscuro' || t === 'claro') setTema(t) } catch {}
  }, [])
  const cambiarTema = () => {
    const t: NombreTema = tema === 'claro' ? 'oscuro' : 'claro'
    setTema(t)
    try { localStorage.setItem(CLAVE_TEMA, t) } catch {}
  }

  useEffect(() => {
    if (!canViewDashboard) { setLoading(false); return }
    setLoading(true)
    setError(null)
    getDashboardDirectivo({ date_from: dateFrom, date_to: dateTo, empresa: empresa || undefined, tipo: tipo || undefined })
      .then(res => setData(res.data))
      .catch(err => setError(err?.response?.data?.detail ?? 'No se pudieron cargar las métricas'))
      .finally(() => setLoading(false))
  }, [dateFrom, dateTo, empresa, tipo, canViewDashboard])

  if (!canViewDashboard) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-32 text-center px-6">
        <div className="p-5 bg-slate-100 rounded-2xl mb-6">
          <Lock size={40} className="text-slate-400" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">IT Service Desk</h1>
        <p className="text-slate-400 text-sm max-w-sm">Selecciona un submódulo del menú lateral para comenzar.</p>
      </div>
    )
  }

  const c = TEMAS[tema]
  const vars = {
    '--bg': c.bg, '--panel': c.panel, '--ink': c.ink, '--ink2': c.ink2, '--ink3': c.ink3,
    '--line': c.line, '--grid': c.grid, '--sombra': SOMBRA[tema], fontFamily: FUENTE, colorScheme: tema === 'oscuro' ? 'dark' : 'light',
  } as CSSProperties
  const control = `font-[inherit] text-[13px] px-2.5 py-1.5 rounded-md border border-[var(--line)] bg-[var(--panel)] ${INK}`

  return (
    <PaletaCtx.Provider value={c}>
      <div className="w-full shrink-0 min-h-[calc(100vh-49px)] bg-[var(--bg)] text-[14px] leading-[1.5] antialiased transition-colors" style={vars}>
        <div className="w-full px-6 pt-5 pb-12">
          <header className="flex flex-wrap items-end justify-between gap-4 mb-4">
            <div>
              <h1 className={`text-[22px] font-semibold m-0 ${INK}`}>Dashboard de métricas</h1>
              <p className={`mt-0.5 mb-0 ${INK2}`}>
                {hasFullAccess ? 'Vista completa del módulo' : `Vista de tu especialidad (${data?.scope ?? '...'})`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="Empresa" value={empresa} onChange={e => setEmpresa(e.target.value)} className={control}>
                <option value="">Todas las empresas</option>
                {data?.opciones?.empresas?.map((e: D) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
              <select aria-label="Tipo de ticket" value={tipo} onChange={e => setTipo(e.target.value)} className={control}>
                <option value="">Todos los tipos</option>
                {data?.opciones?.tipos?.map((t: D) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
              <input type="date" aria-label="Desde" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={control} />
              <span className={`text-[13px] ${INK3}`}>a</span>
              <input type="date" aria-label="Hasta" value={dateTo} onChange={e => setDateTo(e.target.value)} className={control} />
              <button type="button" onClick={cambiarTema} className={`${control} inline-flex items-center gap-1.5 cursor-pointer`}>
                {tema === 'claro' ? <Moon size={14} /> : <Sun size={14} />} Cambiar tema
              </button>
            </div>
          </header>

          <nav role="tablist" aria-label="Vistas del dashboard" className="flex gap-0.5 border-b border-[var(--line)] mb-5 overflow-x-auto overflow-y-hidden">
            {TABS.map(t => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                className={`font-[inherit] text-[14px] px-3.5 py-2.5 whitespace-nowrap bg-transparent border-0 border-b-[3px] cursor-pointer ${tab === t.id ? 'font-semibold' : `font-medium border-transparent ${INK2}`}`}
                style={tab === t.id ? { color: c.navy, borderBottomColor: c.navy } : undefined}>
                {t.label}
              </button>
            ))}
          </nav>

          {loading && !data ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-6 h-6 border-2 border-[#1a4fa0] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error || !data ? (
            <div className="text-center py-20 text-[14px]" style={{ color: c.red }}>{error ?? 'No se pudieron cargar las métricas'}</div>
          ) : (
            <div role="tabpanel" className={loading ? 'opacity-60 transition-opacity' : ''}>
              {tab === 'resumen' && <Resumen d={data.resumen} />}
              {tab === 'problemas' && <Problemas d={data.problemas} />}
              {tab === 'equipo' && <Equipo d={data.equipo} />}
              {tab === 'adopcion' && <Adopcion d={data.adopcion} />}
              {tab === 'procesos' && <Procesos d={data.procesos} />}
            </div>
          )}
        </div>
      </div>
    </PaletaCtx.Provider>
  )
}
