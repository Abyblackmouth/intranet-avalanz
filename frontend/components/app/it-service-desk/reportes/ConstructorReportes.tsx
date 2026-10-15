'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Download, FileText, Loader2, Presentation } from 'lucide-react'
import { getReporteDatos, getReporteHtml, descargarReportePdf } from '@/services/itServiceDeskService'

// Arma tu presentacion: el servidor arma las laminas (HTML 16:9) con los datos y estas
// elecciones; la vista previa y el PDF son el mismo HTML, asi que lo que ves es lo que bajas.

type Lamina = { id: 'resumen' | 'compacto' | 'detallado'; nombre: string; on: boolean }
const TZ = 'America/Monterrey'
const TEMAS = [
  { id: 'verus', nombre: 'Verus', colores: ['#065744', '#0fcb9e', '#b4501f', '#fbfaf7'] },
  { id: 'intranet', nombre: 'Azul intranet', colores: ['#1a4fa0', '#ffffff', '#c2410c', '#8fb0dc'] },
  { id: 'sobrio', nombre: 'Sobrio', colores: ['#334155', '#ffffff', '#b91c1c', '#cbd5e1'] },
  { id: 'ejecutivo', nombre: 'Ejecutivo oscuro', colores: ['#d4a64a', '#0f1b2d', '#f59e5b', '#3c5a85'] },
]
const ANCHO = 1280, ALTO = 720, SEPARACION = 24

const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ })
const iso = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ })
function rangoAtajo(a: string): [string, string] {
  const [y, m, d] = hoy().split('-').map(Number)
  const base = new Date(y, m - 1, d)
  if (a === 'semana') { const l = new Date(base); l.setDate(d - ((base.getDay() + 6) % 7)); return [iso(l), hoy()] }
  if (a === 'mes') return [iso(new Date(y, m - 1, 1)), hoy()]
  if (a === 'anterior') return [iso(new Date(y, m - 2, 1)), iso(new Date(y, m - 1, 0))]
  if (a === '30') { const i = new Date(base); i.setDate(d - 29); return [iso(i), hoy()] }
  return [iso(new Date(y, 0, 1)), hoy()]
}
const ATAJOS = [['semana', 'Esta semana'], ['mes', 'Este mes'], ['anterior', 'Mes anterior'], ['30', 'Últimos 30 días'], ['anio', 'Este año']]
const LABEL = 'block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5'
const CAMPO = 'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 outline-none focus:border-[#1a4fa0]'

export default function ConstructorReportes() {
  const [atajo, setAtajo] = useState('mes')
  const [[desde, hasta], setRango] = useState<[string, string]>(() => rangoAtajo('mes'))
  const [empresa, setEmpresa] = useState('')
  const [empresas, setEmpresas] = useState<string[]>([])
  const [tema, setTema] = useState('verus')
  const [acento, setAcento] = useState('#065744')
  const [laminas, setLaminas] = useState<Lamina[]>([
    { id: 'resumen', nombre: 'Resumen e indicadores', on: true },
    { id: 'compacto', nombre: 'Detalle por empresa y módulo', on: true },
    { id: 'detallado', nombre: 'Detalle por sistema y módulo', on: false },
  ])
  const [titulo, setTitulo] = useState('Mesa de Ayuda')
  const [estatus, setEstatus] = useState('')
  const [hallazgos, setHallazgos] = useState('')
  const [acciones, setAcciones] = useState('')
  const [html, setHtml] = useState('')
  const [cargando, setCargando] = useState(false)
  const [bajando, setBajando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ancho, setAncho] = useState(900)
  const caja = useRef<HTMLDivElement>(null)

  const opciones = useMemo(() => ({
    desde, hasta, empresa: empresa || null, tema, acento, titulo: titulo.trim() || 'Mesa de Ayuda',
    laminas: laminas.filter(l => l.on).map(l => l.id),
    estatus: estatus.trim() || null,
    hallazgos: hallazgos.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 8),
    acciones: acciones.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 8),
  }), [desde, hasta, empresa, tema, acento, titulo, laminas, estatus, hallazgos, acciones])

  // Empresas del periodo (para el selector)
  useEffect(() => {
    if (!desde || !hasta || hasta < desde) return
    getReporteDatos({ desde, hasta }).then(r => setEmpresas(r.data?.data?.empresas ?? [])).catch(() => {})
  }, [desde, hasta])

  // Vista previa: medio segundo despues del ultimo cambio
  useEffect(() => {
    if (!desde || !hasta) return
    if (hasta < desde) { setError('La fecha final es anterior a la inicial'); return }
    const t = setTimeout(() => {
      setCargando(true); setError(null)
      getReporteHtml(opciones)
        .then(r => setHtml(typeof r.data === 'string' ? r.data : ''))
        .catch(e => setError(e?.response?.status === 403 ? 'No tienes acceso a los reportes' : 'No se pudo armar la vista previa'))
        .finally(() => setCargando(false))
    }, 500)
    return () => clearTimeout(t)
  }, [opciones, desde, hasta])

  // Escala de la vista previa al ancho disponible
  useEffect(() => {
    const el = caja.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(320, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const escala = Math.min(1, ancho / ANCHO)
  const nLaminas = (html.match(/class="slide"/g) || []).length
  const altoHtml = Math.max(1, nLaminas) * (ALTO + SEPARACION)

  const descargar = useCallback(async () => {
    setBajando(true); setError(null)
    try {
      const r = await descargarReportePdf(opciones)
      const nombre = /filename="([^"]+)"/.exec(r.headers?.['content-disposition'] || '')?.[1] || 'presentacion.pdf'
      const url = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }))
      const a = document.createElement('a'); a.href = url; a.download = nombre; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch {
      setError('No se pudo generar el PDF; intenta de nuevo')
    } finally { setBajando(false) }
  }, [opciones])

  const mover = (i: number, d: number) => setLaminas(ls => {
    const j = i + d; if (j < 0 || j >= ls.length) return ls
    const c = [...ls]; [c[i], c[j]] = [c[j], c[i]]; return c
  })
  const elegirAtajo = (a: string) => { setAtajo(a); setRango(rangoAtajo(a)) }

  return (
    <div className="flex flex-1 min-h-0">
      <aside className="w-80 shrink-0 flex flex-col border-r border-slate-200 bg-white">
        <div className="flex-1 overflow-auto px-4 py-4 space-y-5">
          <div>
            <p className="flex items-center gap-2 text-base font-bold text-slate-800"><Presentation size={18} className="text-[#1a4fa0]" /> Arma tu presentación</p>
            <p className="text-xs text-slate-500 mt-0.5">La vista previa es exactamente lo que descargas.</p>
          </div>

          <div>
            <p className={LABEL}>Periodo (fecha de creación)</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {ATAJOS.map(([id, txt]) => (
                <button key={id} type="button" aria-pressed={atajo === id} onClick={() => elegirAtajo(id)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${atajo === id ? 'border-[#0f2440] bg-[#0f2440] text-white' : 'border-slate-300 text-slate-600 hover:border-slate-400'}`}>{txt}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <input type="date" aria-label="Desde" value={desde} onChange={e => { setAtajo(''); setRango([e.target.value, hasta]) }} className={CAMPO} />
              <input type="date" aria-label="Hasta" value={hasta} onChange={e => { setAtajo(''); setRango([desde, e.target.value]) }} className={CAMPO} />
            </div>
          </div>

          <div>
            <label className={LABEL} htmlFor="rep-empresa">Empresa</label>
            <select id="rep-empresa" value={empresa} onChange={e => setEmpresa(e.target.value)} className={CAMPO}>
              <option value="">Todas las empresas</option>
              {empresas.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>

          <div>
            <p className={LABEL}>Tema</p>
            <div className="grid grid-cols-2 gap-1.5">
              {TEMAS.map(t => (
                <button key={t.id} type="button" aria-pressed={tema === t.id} onClick={() => { setTema(t.id); setAcento(t.colores[0]) }}
                  className={`rounded-lg border-2 p-2 text-left ${tema === t.id ? 'border-[#1a4fa0]' : 'border-slate-200 hover:border-slate-300'}`}>
                  <span className="flex gap-0.5 mb-1">{t.colores.map(c => <i key={c} className="h-3.5 flex-1 rounded-sm border border-slate-200" style={{ background: c }} />)}</span>
                  <span className="text-xs font-semibold text-slate-700">{t.nombre}</span>
                </button>
              ))}
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
              Color principal
              <input type="color" value={acento} onChange={e => setAcento(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-slate-300 bg-white p-0.5" />
              <span className="font-mono">{acento.toUpperCase()}</span>
            </label>
          </div>

          <div>
            <p className={LABEL}>Láminas</p>
            <div className="space-y-1.5">
              {laminas.map((l, i) => (
                <div key={l.id} className={`flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 ${l.on ? '' : 'opacity-50'}`}>
                  <input type="checkbox" checked={l.on} aria-label={`Incluir ${l.nombre}`} className="size-4 accent-[#1a4fa0]"
                    onChange={e => setLaminas(ls => ls.map(x => x.id === l.id ? { ...x, on: e.target.checked } : x))} />
                  <span className="flex-1 text-sm font-medium text-slate-700">{l.nombre}</span>
                  <button type="button" onClick={() => mover(i, -1)} aria-label="Subir" className="grid size-6 place-items-center rounded text-slate-500 hover:bg-slate-100"><ArrowUp size={13} /></button>
                  <button type="button" onClick={() => mover(i, 1)} aria-label="Bajar" className="grid size-6 place-items-center rounded text-slate-500 hover:bg-slate-100"><ArrowDown size={13} /></button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className={LABEL} htmlFor="rep-titulo">Título</label>
            <input id="rep-titulo" value={titulo} maxLength={80} onChange={e => setTitulo(e.target.value)} className={CAMPO} />
          </div>
          <div>
            <label className={LABEL} htmlFor="rep-estatus">Estatus (opcional)</label>
            <textarea id="rep-estatus" rows={2} maxLength={200} value={estatus} onChange={e => setEstatus(e.target.value)} className={CAMPO}
              placeholder="Actualmente no existe algún stopper para la operación" />
          </div>
          <div>
            <label className={LABEL} htmlFor="rep-hallazgos">Hallazgos (uno por línea)</label>
            <textarea id="rep-hallazgos" rows={4} value={hallazgos} onChange={e => setHallazgos(e.target.value)} className={CAMPO}
              placeholder={'Dyce: 39% del volumen y 10 de 23 vencidos\nCorporativo: 19 S1'} />
          </div>
          <div>
            <label className={LABEL} htmlFor="rep-acciones">Acciones (una por línea)</label>
            <textarea id="rep-acciones" rows={3} value={acciones} onChange={e => setAcciones(e.target.value)} className={CAMPO}
              placeholder="Rebalancear backlog" />
          </div>
        </div>

        <div className="border-t border-slate-200 p-3">
          {error && <p role="alert" className="mb-2 text-xs text-red-600">{error}</p>}
          <button type="button" onClick={descargar} disabled={bajando || !nLaminas}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#1a4fa0] text-sm font-semibold text-white hover:bg-[#153f82] disabled:opacity-50">
            {bajando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Descargar PDF
          </button>
        </div>
      </aside>

      <section className="flex-1 min-w-0 overflow-auto bg-slate-400/40 px-6 py-5" aria-label="Vista previa">
        <div className="mb-3 flex items-center justify-between text-xs text-slate-600">
          <span className="flex items-center gap-1.5"><FileText size={14} /> {nLaminas} lámina{nLaminas === 1 ? '' : 's'} · 16:9</span>
          {cargando && <span className="flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> Actualizando…</span>}
        </div>
        <div ref={caja} className="w-full">
          <div style={{ height: altoHtml * escala }} className="overflow-hidden">
            <iframe title="Vista previa de la presentación" sandbox="" srcDoc={html}
              style={{ width: ANCHO, height: altoHtml, transform: `scale(${escala})`, transformOrigin: 'top left' }}
              className="border-0 bg-transparent" />
          </div>
        </div>
      </section>
    </div>
  )
}
