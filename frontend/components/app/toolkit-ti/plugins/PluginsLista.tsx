'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Play, Download, Loader2, Search, Upload, X, RotateCcw } from 'lucide-react'
import { getPlugins, cambiarPlugin, ejecutarPlugin, getEjecucion, getEjecuciones } from '@/services/toolkitTiService'
import { getSignedUrl } from '@/services/uploadService'

// Plugins de Toolkit TI al estilo Swagger: cada plugin es un bloque teñido del color de
// su tipo; al abrirlo se ven sus parametros, el boton Ejecutar, el resultado y su historial.

type Tipo = 'manual' | 'programado' | 'correo'
interface Param { nombre: string; tipo: string; requerido?: boolean; ayuda?: string; extensiones?: string[]; opciones?: string[] }
interface Plugin {
  slug: string; nombre: string; descripcion: string; tipo: Tipo; grupo: string; parametros: Param[]
  tiempo_maximo: number; activo: boolean; ultima: { estado: string; iniciado_at: string } | null
}
interface Ejecucion {
  id: string; estado: 'en_proceso' | 'ok' | 'error'; log: string; error: string | null; iniciado_por: string | null
  iniciado_at: string; duracion_ms: number | null; archivos_salida: { nombre: string; object_key: string; bucket: string; size_bytes: number }[]
}
const TZ = 'America/Monterrey'
const ESTILO: Record<Tipo, { bloque: string; badge: string; txt: string }> = {
  manual: { bloque: 'border-[#1a4fa0]/55 bg-[#1a4fa0]/[0.06]', badge: 'bg-[#1a4fa0]', txt: 'MANUAL' },
  programado: { bloque: 'border-violet-600/50 bg-violet-600/[0.06]', badge: 'bg-violet-600', txt: 'PROGRAMADO' },
  correo: { bloque: 'border-cyan-700/50 bg-cyan-700/[0.06]', badge: 'bg-cyan-700', txt: 'CORREO' },
}
const fecha = (iso: string) => new Date(iso).toLocaleString('es-MX', { timeZone: TZ, day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' })
const peso = (b: number) => b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`
const BTN = 'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12px] font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed'
const ICONO = 'inline-grid place-items-center w-7 h-7 rounded-md text-slate-500 hover:bg-white hover:text-[#1a4fa0] transition'

async function descargar(a: { object_key: string; bucket: string }) {
  const r = await getSignedUrl(a.object_key, a.bucket)
  const url = r.data?.data?.url || r.data?.url
  if (url) window.open(url, '_blank', 'noopener')
}

function Interruptor({ on, disabled, onChange, etiqueta }: { on: boolean; disabled: boolean; onChange: (v: boolean) => void; etiqueta: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={etiqueta} disabled={disabled}
      onClick={e => { e.stopPropagation(); onChange(!on) }}
      className={`relative w-8 h-4.5 shrink-0 rounded-full transition disabled:opacity-50 ${on ? 'bg-emerald-600' : 'bg-slate-300'}`}>
      <span className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white transition ${on ? 'translate-x-3.5' : ''}`} />
    </button>
  )
}

function Estado({ e }: { e: string }) {
  const m: Record<string, string> = { ok: 'bg-emerald-100 text-emerald-700', error: 'bg-red-100 text-red-700', en_proceso: 'bg-amber-100 text-amber-700' }
  const t: Record<string, string> = { ok: 'OK', error: 'ERROR', en_proceso: 'EN CURSO' }
  return <span className={`px-1.5 py-0.5 rounded text-[10.5px] font-bold font-mono ${m[e] ?? 'bg-slate-100 text-slate-600'}`}>{t[e] ?? e}</span>
}

function Bloque({ p, puedeOperar, onCambio }: { p: Plugin; puedeOperar: boolean; onCambio: () => void }) {
  const [abierto, setAbierto] = useState(false)
  const [valores, setValores] = useState<Record<string, any>>({})
  const [archivos, setArchivos] = useState<Record<string, File>>({})
  const [actual, setActual] = useState<Ejecucion | null>(null)
  const [historial, setHistorial] = useState<Ejecucion[]>([])
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const sondeo = useRef<ReturnType<typeof setInterval> | null>(null)
  const est = ESTILO[p.tipo] ?? ESTILO.manual

  const cargarHistorial = useCallback(() => {
    getEjecuciones(p.slug).then(r => setHistorial(r.data?.data ?? [])).catch(() => {})
  }, [p.slug])
  useEffect(() => { if (abierto) cargarHistorial() }, [abierto, cargarHistorial])
  useEffect(() => () => { if (sondeo.current) clearInterval(sondeo.current) }, [])

  const faltan = p.parametros.some(x => x.requerido && (x.tipo === 'archivo' ? !archivos[x.nombre] : valores[x.nombre] == null || valores[x.nombre] === ''))
  const ejecutar = async () => {
    setEnviando(true); setError(null)
    try {
      const fd = new FormData()
      fd.append('params', JSON.stringify(valores))
      Object.entries(archivos).forEach(([n, f]) => fd.append('files', f, `${n}::${f.name}`))
      const r = await ejecutarPlugin(p.slug, fd)
      const id = r.data?.data?.id
      setActual({ id, estado: 'en_proceso', log: '', error: null, iniciado_por: null, iniciado_at: new Date().toISOString(), duracion_ms: null, archivos_salida: [] })
      if (sondeo.current) clearInterval(sondeo.current)
      sondeo.current = setInterval(async () => {
        try {
          const e: Ejecucion = (await getEjecucion(id)).data?.data
          setActual(e)
          if (e.estado !== 'en_proceso') { clearInterval(sondeo.current!); sondeo.current = null; cargarHistorial(); onCambio() }
        } catch { /* se reintenta en la siguiente vuelta */ }
      }, 1200)
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'No se pudo ejecutar el plugin')
    } finally { setEnviando(false) }
  }
  const limpiar = () => { setValores({}); setArchivos({}); setActual(null); setError(null) }
  const corriendo = actual?.estado === 'en_proceso'

  return (
    <div className={`rounded-md border mb-2 overflow-hidden ${p.activo ? est.bloque : 'border-slate-300 bg-slate-100 grayscale opacity-75'}`}>
      <div role="button" tabIndex={0} aria-expanded={abierto}
        onClick={() => setAbierto(a => !a)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAbierto(a => !a) } }}
        className="flex items-center gap-2.5 px-2 py-1.5 cursor-pointer">
        <span className={`w-21 shrink-0 text-center rounded-[3px] py-1 text-[11px] font-bold font-mono text-white ${est.badge}`}>{est.txt}</span>
        <span className="font-mono text-[13px] font-semibold text-slate-800 shrink-0">{p.slug}</span>
        <span className="text-[13px] text-slate-600 truncate flex-1 min-w-0">{p.nombre}</span>
        {p.ultima && (
          <span className="hidden md:inline-flex items-center gap-1.5 text-[11.5px] text-slate-500 shrink-0">
            <span className={`w-1.5 h-1.5 rounded-full ${p.ultima.estado === 'ok' ? 'bg-emerald-600' : p.ultima.estado === 'error' ? 'bg-red-600' : 'bg-amber-500'}`} />
            {fecha(p.ultima.iniciado_at)}
          </span>
        )}
        <Interruptor on={p.activo} disabled={!puedeOperar} etiqueta={`Activar ${p.slug}`}
          onChange={v => cambiarPlugin(p.slug, { activo: v }).then(onCambio).catch(() => {})} />
        <ChevronDown size={16} className={`text-slate-400 shrink-0 transition ${abierto ? 'rotate-180' : ''}`} />
      </div>

      {abierto && (
        <div className="border-t border-inherit px-3.5 py-3">
          <p className="text-[13px] text-slate-600 mb-3">{p.descripcion}</p>
          {p.tipo !== 'manual' && (
            <p className="text-[12px] text-slate-500 mb-3">
              {p.tipo === 'programado' ? 'Plugin programado' : 'Plugin que se dispara por correo'}: por ahora se ejecuta a mano desde aquí.
            </p>
          )}

          {p.parametros.length > 0 && (
            <div className="rounded-md border border-slate-200 bg-white overflow-hidden mb-3">
              <div className="grid grid-cols-[minmax(0,180px)_90px_1fr] gap-3 px-3 py-1.5 text-[11px] font-semibold text-slate-400 border-b border-slate-200 bg-slate-50">
                <span>Parámetro</span><span>Tipo</span><span>Valor</span>
              </div>
              {p.parametros.map(x => (
                <div key={x.nombre} className="grid grid-cols-[minmax(0,180px)_90px_1fr] gap-3 items-center px-3 py-1.5 border-b border-slate-100 last:border-0">
                  <div className="min-w-0">
                    <p className="font-mono text-[12.5px] font-semibold text-slate-800 truncate">{x.nombre}{x.requerido && <span className="text-red-600 ml-1">*</span>}</p>
                    {x.ayuda && <p className="text-[11px] text-slate-400 truncate" title={x.ayuda}>{x.ayuda}</p>}
                  </div>
                  <span className="font-mono text-[11.5px] text-slate-400">{x.tipo === 'archivo' ? (x.extensiones ?? []).join(' ') || 'archivo' : x.tipo}</span>
                  <div className="min-w-0">
                    {x.tipo === 'archivo' ? (
                      <label className={`flex items-center gap-1.5 h-7 px-2 rounded-md border text-[12px] cursor-pointer truncate ${archivos[x.nombre] ? 'border-[#1a4fa0]/40 bg-[#eaf1fb] text-slate-800' : 'border-dashed border-slate-300 text-slate-400 hover:border-[#1a4fa0]'}`}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setArchivos(a => ({ ...a, [x.nombre]: f })) }}>
                        <Upload size={13} className="shrink-0" />
                        <span className="truncate">{archivos[x.nombre]?.name ?? 'Elegir o arrastrar archivo'}</span>
                        <input type="file" hidden accept={(x.extensiones ?? []).join(',')} onChange={e => { const f = e.target.files?.[0]; if (f) setArchivos(a => ({ ...a, [x.nombre]: f })); e.target.value = '' }} />
                      </label>
                    ) : x.tipo === 'booleano' ? (
                      <Interruptor on={!!valores[x.nombre]} disabled={false} etiqueta={x.nombre} onChange={v => setValores(s => ({ ...s, [x.nombre]: v }))} />
                    ) : x.tipo === 'opcion' ? (
                      <select value={valores[x.nombre] ?? ''} onChange={e => setValores(s => ({ ...s, [x.nombre]: e.target.value }))}
                        className="h-7 w-full max-w-64 px-2 rounded-md border border-slate-300 text-[12.5px] bg-white outline-none focus:border-[#1a4fa0]">
                        <option value="">Elegir…</option>
                        {(x.opciones ?? []).map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input type={x.tipo === 'numero' ? 'number' : x.tipo === 'fecha' ? 'date' : x.tipo === 'mes' ? 'month' : 'text'}
                        value={valores[x.nombre] ?? ''} onChange={e => setValores(s => ({ ...s, [x.nombre]: x.tipo === 'numero' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value }))}
                        className="h-7 w-full max-w-64 px-2 rounded-md border border-slate-300 text-[12.5px] bg-white outline-none focus:border-[#1a4fa0]" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <button type="button" onClick={ejecutar} disabled={!puedeOperar || !p.activo || faltan || enviando || corriendo}
              className={`${BTN} bg-[#1a4fa0] text-white hover:bg-[#153f82]`}>
              {corriendo || enviando ? <Loader2 size={13} className="animate-spin" /> : <Play size={12} fill="currentColor" />} Ejecutar
            </button>
            <button type="button" onClick={limpiar} title="Limpiar" aria-label="Limpiar" className={ICONO}><RotateCcw size={14} /></button>
            {!puedeOperar && <span className="text-[11.5px] text-slate-400 ml-1">Tu rol es de solo consulta</span>}
            {error && <span role="alert" className="text-[12px] text-red-600 ml-1">{error}</span>}
          </div>

          {actual && (
            <div className="mt-3 rounded-md border border-slate-200 bg-white overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-200 text-[12px] text-slate-500">
                <Estado e={actual.estado} />
                {actual.duracion_ms != null && <span>{(actual.duracion_ms / 1000).toFixed(1)} s</span>}
                {actual.error && <span className="text-red-600 truncate">{actual.error}</span>}
              </div>
              <pre className="m-0 px-3 py-2 bg-[#0f2440] text-[#cfe0f5] text-[11.5px] leading-relaxed font-mono max-h-44 overflow-auto whitespace-pre-wrap">{actual.log || '› Preparando…'}</pre>
              {actual.archivos_salida?.map(a => (
                <div key={a.object_key} className="flex items-center gap-2 px-3 py-1.5 border-t border-slate-100 text-[12.5px]">
                  <span className="font-mono truncate flex-1 text-slate-700">{a.nombre}</span>
                  <span className="text-slate-400 text-[11.5px]">{peso(a.size_bytes)}</span>
                  <button type="button" onClick={() => descargar(a)} title="Descargar" aria-label={`Descargar ${a.nombre}`} className={ICONO}><Download size={14} /></button>
                </div>
              ))}
            </div>
          )}

          {historial.length > 0 && (
            <div className="mt-3">
              <p className="text-[11.5px] font-semibold text-slate-500 mb-1">Historial</p>
              <div className="rounded-md border border-slate-200 bg-white overflow-hidden text-[12px]">
                {historial.map(h => (
                  <div key={h.id} className="flex items-center gap-3 px-3 py-1 border-b border-slate-100 last:border-0">
                    <span className="text-slate-500 w-28 shrink-0">{fecha(h.iniciado_at)}</span>
                    <Estado e={h.estado} />
                    <span className="text-slate-500 truncate w-36 shrink-0">{h.iniciado_por ?? 'Programado'}</span>
                    <span className="text-slate-400 w-12 shrink-0">{h.duracion_ms != null ? `${(h.duracion_ms / 1000).toFixed(1)} s` : ''}</span>
                    <span className="flex-1 min-w-0 truncate text-slate-500">{h.estado === 'error' ? h.error : h.archivos_salida?.map(a => a.nombre).join(', ')}</span>
                    {h.archivos_salida?.[0] && <button type="button" onClick={() => descargar(h.archivos_salida[0])} title="Descargar" aria-label="Descargar resultado" className={ICONO}><Download size={13} /></button>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function PluginsLista() {
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [puedeOperar, setPuedeOperar] = useState(false)
  const [conError, setConError] = useState<Record<string, string>>({})
  const [cargando, setCargando] = useState(true)
  const [q, setQ] = useState('')
  const [tipo, setTipo] = useState<'todos' | Tipo>('todos')

  const cargar = useCallback(() => {
    getPlugins().then(r => {
      const d = r.data?.data ?? {}
      setPlugins(d.plugins ?? []); setPuedeOperar(!!d.puede_operar); setConError(d.con_error ?? {})
    }).catch(() => {}).finally(() => setCargando(false))
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const grupos = useMemo(() => {
    const t = q.trim().toLowerCase()
    const vis = plugins.filter(p => (tipo === 'todos' || p.tipo === tipo) &&
      (!t || `${p.slug} ${p.nombre} ${p.descripcion}`.toLowerCase().includes(t)))
    return vis.reduce<Record<string, Plugin[]>>((acc, p) => { (acc[p.grupo] ||= []).push(p); return acc }, {})
  }, [plugins, q, tipo])

  return (
    <div className="max-w-6xl">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-56">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar plugin" aria-label="Buscar plugin"
            className="w-full h-8 pl-8 pr-7 rounded-md border border-slate-300 bg-white text-[13px] outline-none focus:border-[#1a4fa0]" />
          {q && <button type="button" onClick={() => setQ('')} aria-label="Limpiar búsqueda" className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={13} /></button>}
        </div>
        <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5 text-[12px] font-semibold">
          {(['todos', 'manual', 'programado', 'correo'] as const).map(t => (
            <button key={t} type="button" aria-pressed={tipo === t} onClick={() => setTipo(t)}
              className={`h-6.5 px-2.5 rounded capitalize ${tipo === t ? 'bg-[#0f2440] text-white' : 'text-slate-500 hover:text-slate-800'}`}>{t === 'todos' ? 'Todos' : t}</button>
          ))}
        </div>
      </div>

      {Object.keys(conError).length > 0 && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
          {Object.entries(conError).map(([s, e]) => <p key={s} className="m-0"><b className="font-mono">{s}</b>: {e}</p>)}
        </div>
      )}

      {cargando ? (
        <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-slate-400" /></div>
      ) : plugins.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <p className="text-[14px] font-semibold text-slate-700">Todavía no hay plugins</p>
          <p className="text-[13px] text-slate-500 mt-1">Copia <span className="font-mono">app/plugins/_plantilla.py</span> en el servicio <span className="font-mono">toolkit-ti-service</span>, llénalo y despliega: aparece aquí solo.</p>
        </div>
      ) : Object.keys(grupos).length === 0 ? (
        <p className="text-center text-[13px] text-slate-400 py-10">Ningún plugin coincide con la búsqueda.</p>
      ) : Object.entries(grupos).map(([g, lista]) => (
        <section key={g} className="mb-4">
          <h2 className="text-[12.5px] font-bold text-slate-600 mb-1.5">{g} <span className="font-normal text-slate-400">· {lista.length}</span></h2>
          {lista.map(p => <Bloque key={p.slug} p={p} puedeOperar={puedeOperar} onCambio={cargar} />)}
        </section>
      ))}
    </div>
  )
}
