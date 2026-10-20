'use client'

// Flujos → Hoja: cómo se presenta el documento de este flujo (tarjetas, adjuntos, tablas y
// totales). La vista previa usa el último trámite real del flujo y el mismo armado del
// servidor que verán el aprobador (liga y Bandeja) y el correo.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Send, Trash2, Wand2, X } from 'lucide-react'
import {
  FlujoDetalle, HojaCfg, HojaTramite as HojaT, CampoHojaCfg, ColumnaHojaCfg, TotalHojaCfg, TablaHojaCfg, TipoCampoHoja,
  getHojaSugerida, previsualizarHoja, probarHoja, guardarHoja,
} from '@/services/workflowsService'
import { Interruptor, inputCls, labelCls, btnPrimario, btnSecundario, errMsg } from '@/components/app/workflows/compartidos'

const VACIA: HojaCfg = { documento: { etiqueta: '', numero: 'folio', area: '' }, tarjetas: [], adjuntos: true, tablas: [] }
const TIPOS: [TipoCampoHoja, string][] = [['texto', 'Texto'], ['moneda', 'Moneda'], ['numero', 'Número'], ['fecha', 'Fecha'], ['porcentaje', 'Porcentaje']]
const mini = `${inputCls} !py-1 !px-2 !text-[13px]`

function mover<T>(arr: T[], i: number, d: -1 | 1): T[] {
  const j = i + d
  if (j < 0 || j >= arr.length) return arr
  const c = [...arr];[c[i], c[j]] = [c[j], c[i]]; return c
}

const aTexto = (v?: Record<string, string>) => Object.entries(v ?? {}).map(([k, x]) => `${k} = ${x}`).join('\n')
const deTexto = (t: string): Record<string, string> => Object.fromEntries(t.split('\n').map(l => l.split('=')).filter(p => p.length >= 2 && p[0].trim() && p.slice(1).join('=').trim()).map(p => [p[0].trim(), p.slice(1).join('=').trim()]))

function FilaCampo<T extends CampoHojaCfg>({ c, i, total, claves, onCambio, onMover, onQuitar, extra, conAncho, conValores }: {
  c: T; i: number; total: number; claves: string[]; onCambio: (c: T) => void; onMover: (d: -1 | 1) => void; onQuitar: () => void; extra?: React.ReactNode
  conAncho?: boolean; conValores?: boolean
}) {
  const nValores = Object.keys(c.valores ?? {}).length
  const [verValores, setVerValores] = useState(false)
  const [texto, setTexto] = useState(aTexto(c.valores))
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
      <input list="hoja-claves" className={`${mini} w-40 font-mono`} placeholder="clave" value={c.clave} onChange={e => onCambio({ ...c, clave: e.target.value })} />
      <input className={`${mini} w-36`} placeholder="Etiqueta" value={c.etiqueta} onChange={e => onCambio({ ...c, etiqueta: e.target.value })} />
      <select className={`${mini} w-28`} value={c.tipo} onChange={e => onCambio({ ...c, tipo: e.target.value as TipoCampoHoja })}>
        {TIPOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {extra}
      {conAncho && (
        <select className={`${mini} w-24`} value={c.ancho ?? 'normal'} onChange={e => onCambio({ ...c, ancho: e.target.value as 'normal' | 'ancha' })} title="Ancho de la tarjeta">
          <option value="normal">Normal</option><option value="ancha">Ancha</option>
        </select>
      )}
      {conValores && (
        <button type="button" onClick={() => setVerValores(v => !v)} title="Equivalencias: mostrar un texto en lugar del valor que manda Protheus"
          className={`rounded-md border px-2 py-1 text-[12px] ${nValores ? 'border-[#1a4fa0] bg-blue-50 text-[#1a4fa0]' : 'border-slate-300 text-slate-500 hover:border-slate-400'}`}>
          {nValores ? `${nValores} equivalencia${nValores === 1 ? '' : 's'}` : 'Equivalencias'}
        </button>
      )}
      <span className="ml-auto flex items-center">
        <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => onMover(-1)} className="grid size-7 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"><ArrowUp size={13} /></button>
        <button type="button" aria-label="Bajar" disabled={i === total - 1} onClick={() => onMover(1)} className="grid size-7 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"><ArrowDown size={13} /></button>
        <button type="button" aria-label="Quitar" onClick={onQuitar} className="grid size-7 place-items-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600"><X size={13} /></button>
      </span>
      {claves.length > 0 && c.clave && !claves.includes(c.clave) && <span className="w-full text-[11px] text-amber-700">El último trámite no trae «{c.clave}»; no se mostrará si viene vacío.</span>}
      {conValores && verValores && (
        <div className="w-full">
          <textarea rows={3} className={`${inputCls} w-full font-mono !text-[12.5px]`} value={texto}
            onChange={e => { setTexto(e.target.value); onCambio({ ...c, valores: deTexto(e.target.value) }) }}
            placeholder={'Una por renglón, valor = texto\n1 = Consumidor final\nF = Persona física'} />
          <p className="text-[11px] text-slate-400">Si el valor que llega no está en la lista, se muestra tal cual.</p>
        </div>
      )}
    </div>
  )
}

export default function HojaConfig({ flujo, onChange, puedeEditar }: { flujo: FlujoDetalle; onChange: (f: FlujoDetalle) => void; puedeEditar: boolean }) {
  const [cfg, setCfg] = useState<HojaCfg>(flujo.hoja ?? VACIA)
  const [claves, setClaves] = useState<string[]>([])
  const [clavesTabla, setClavesTabla] = useState<Record<string, string[]>>({})
  const [vista, setVista] = useState<'pagina' | 'correo'>('pagina')
  const [prev, setPrev] = useState<{ hoja: HojaT; pagina_html: string; correo_html: string; folio: string } | null>(null)
  const [estado, setEstado] = useState<{ ok: boolean; texto: string } | null>(null)
  const [sinTramites, setSinTramites] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sucio = JSON.stringify(cfg) !== JSON.stringify(flujo.hoja ?? VACIA)

  // claves disponibles (para autocompletar) a partir del último trámite
  useEffect(() => {
    getHojaSugerida(flujo.id).then(r => {
      setClaves(r.data.claves)
      const porTabla: Record<string, string[]> = {}
      r.data.hoja.tablas.forEach(t => { porTabla[t.clave] = t.columnas.map(c => c.clave) })
      setClavesTabla(porTabla)
      if (!flujo.hoja) setCfg(r.data.hoja)
    }).catch(() => setSinTramites(true))
  }, [flujo.id, flujo.hoja])

  const refrescar = useCallback((c: HojaCfg) => {
    if (temporizador.current) clearTimeout(temporizador.current)
    temporizador.current = setTimeout(() => {
      previsualizarHoja(flujo.id, c).then(r => { setPrev(r.data); setEstado(e => (e && !e.ok ? null : e)) })
        .catch(e => { if ((e as { response?: { status?: number } })?.response?.status === 404) setSinTramites(true); else setEstado({ ok: false, texto: errMsg(e, 'La vista previa falló') }) })
    }, 450)
  }, [flujo.id])
  useEffect(() => { refrescar(cfg) }, [cfg, refrescar])

  const detectar = async () => {
    try { const r = await getHojaSugerida(flujo.id); setCfg({ ...r.data.hoja, documento: { ...r.data.hoja.documento, etiqueta: cfg.documento.etiqueta || r.data.hoja.documento.etiqueta, area: cfg.documento.area } }); setEstado({ ok: true, texto: `Campos detectados del trámite ${r.data.folio}` }) }
    catch (e) { setEstado({ ok: false, texto: errMsg(e, 'No se pudieron detectar los campos') }) }
  }
  const guardar = async () => {
    setGuardando(true); setEstado(null)
    try { const r = await guardarHoja(flujo.id, cfg); onChange(r.data); setEstado({ ok: true, texto: `Hoja guardada · versión ${r.data.version}` }) }
    catch (e) { setEstado({ ok: false, texto: errMsg(e, 'No se pudo guardar') }) } finally { setGuardando(false) }
  }
  const prueba = async () => {
    try { const r = await probarHoja(flujo.id, cfg); setEstado({ ok: true, texto: `Correo de prueba enviado a ${r.data.para}` }) }
    catch (e) { setEstado({ ok: false, texto: errMsg(e, 'No se pudo enviar la prueba') }) }
  }

  const setTabla = (i: number, t: TablaHojaCfg) => setCfg(c => ({ ...c, tablas: c.tablas.map((x, j) => (j === i ? t : x)) }))
  const dis = !puedeEditar

  return (
    <div className="grid gap-4 2xl:grid-cols-[minmax(460px,560px)_minmax(0,1fr)]">
      <datalist id="hoja-claves">{claves.map(k => <option key={k} value={k} />)}</datalist>

      {/* ── Editor ── */}
      <div className={`grid content-start gap-3 ${dis ? 'pointer-events-none opacity-70' : ''}`}>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btnSecundario} onClick={detectar} disabled={sinTramites}><Wand2 size={14} /> Detectar campos</button>
          <button type="button" className={btnSecundario} onClick={prueba} disabled={sinTramites}><Send size={14} /> Enviarme una prueba</button>
          <button type="button" className={`${btnPrimario} ml-auto`} onClick={guardar} disabled={guardando || !sucio}>{guardando ? 'Guardando…' : sucio ? 'Guardar hoja' : 'Guardada'}</button>
        </div>
        {estado && <p className={`text-[13px] ${estado.ok ? 'text-emerald-700' : 'text-red-600'}`}>{estado.texto}</p>}
        {sinTramites && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">Este flujo todavía no tiene trámites: puedes configurar la hoja, pero la vista previa y «Detectar campos» necesitan que la plataforma mande al menos uno.</p>}

        <section className="rounded-xl border border-slate-300 bg-white p-3">
          <h4 className="mb-2 text-[13px] font-bold text-slate-800">Documento</h4>
          <div className="mb-2">
            <label className={labelCls}>Estilo</label>
            <div className="flex flex-wrap gap-1.5">
              {([['', 'El del módulo'], ['flotante', 'Flotante'], ['neutro', 'Neutro'], ['tinta', 'Tinta'], ['arena', 'Arena'], ['clasico', 'Clásico']] as [string, string][]).map(([v, l]) => (
                <button key={v || 'modulo'} type="button" onClick={() => setCfg(c => ({ ...c, estilo: (v || undefined) as HojaCfg['estilo'] }))}
                  className={`rounded-lg border px-3 py-1 text-[12.5px] ${(cfg.estilo ?? '') === v ? 'border-[#1a4fa0] bg-[#1a4fa0] text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'}`}>{l}</button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">«El del módulo» usa el que esté en Ajustes → Apariencia (Flotante, si nadie lo cambia).</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div><label className={labelCls}>Etiqueta</label><input className={`${inputCls} w-full`} placeholder={flujo.nombre} value={cfg.documento.etiqueta} onChange={e => setCfg(c => ({ ...c, documento: { ...c.documento, etiqueta: e.target.value } }))} /></div>
            <div><label className={labelCls}>Número (clave o folio)</label><input list="hoja-claves" className={`${inputCls} w-full font-mono`} value={cfg.documento.numero} onChange={e => setCfg(c => ({ ...c, documento: { ...c.documento, numero: e.target.value } }))} /></div>
            <div><label className={labelCls}>Área (opcional)</label><input className={`${inputCls} w-full`} placeholder="Compras" value={cfg.documento.area} onChange={e => setCfg(c => ({ ...c, documento: { ...c.documento, area: e.target.value } }))} /></div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-300 bg-white p-3">
          <div className="mb-2 flex items-center"><h4 className="text-[13px] font-bold text-slate-800">Datos de la solicitud <span className="font-normal text-slate-400">· tarjetas</span></h4>
            <button type="button" className="ml-auto text-[12.5px] text-[#1a4fa0] hover:underline inline-flex items-center gap-1" onClick={() => setCfg(c => ({ ...c, tarjetas: [...c.tarjetas, { clave: '', etiqueta: '', tipo: 'texto' }] }))}><Plus size={12} /> Agregar</button></div>
          <div className="grid gap-1.5">
            {cfg.tarjetas.map((t, i) => (
              <FilaCampo key={i} c={t} i={i} total={cfg.tarjetas.length} claves={claves} conAncho conValores
                onCambio={n => setCfg(c => ({ ...c, tarjetas: c.tarjetas.map((x, j) => (j === i ? n : x)) }))}
                onMover={d => setCfg(c => ({ ...c, tarjetas: mover(c.tarjetas, i, d) }))}
                onQuitar={() => setCfg(c => ({ ...c, tarjetas: c.tarjetas.filter((_, j) => j !== i) }))} />
            ))}
            {cfg.tarjetas.length === 0 && <p className="text-[12.5px] text-slate-400">Sin tarjetas.</p>}
          </div>
        </section>

        <section className="flex items-center gap-3 rounded-xl border border-slate-300 bg-white p-3">
          <Interruptor on={cfg.adjuntos} onChange={() => setCfg(c => ({ ...c, adjuntos: !c.adjuntos }))} label="Mostrar adjuntos" />
          <div><p className="text-[13px] font-bold text-slate-800">Archivos adjuntos</p><p className="text-[12px] text-slate-500">Solo aparece si el trámite trae archivos.</p></div>
        </section>

        {cfg.tablas.map((t, ti) => {
          const cls = clavesTabla[t.clave] ?? []
          return (
            <section key={ti} className="rounded-xl border border-slate-300 bg-white p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h4 className="text-[13px] font-bold text-slate-800">Tabla</h4>
                <input list="hoja-claves" className={`${mini} w-32 font-mono`} placeholder="lista en cardData" value={t.clave} onChange={e => setTabla(ti, { ...t, clave: e.target.value })} />
                <input className={`${mini} w-36`} placeholder="Título" value={t.titulo} onChange={e => setTabla(ti, { ...t, titulo: e.target.value })} />
                <span className="ml-auto flex">
                  <button type="button" aria-label="Subir" disabled={ti === 0} onClick={() => setCfg(c => ({ ...c, tablas: mover(c.tablas, ti, -1) }))} className="grid size-7 place-items-center rounded text-slate-400 hover:bg-slate-100 disabled:opacity-30"><ArrowUp size={13} /></button>
                  <button type="button" aria-label="Bajar" disabled={ti === cfg.tablas.length - 1} onClick={() => setCfg(c => ({ ...c, tablas: mover(c.tablas, ti, 1) }))} className="grid size-7 place-items-center rounded text-slate-400 hover:bg-slate-100 disabled:opacity-30"><ArrowDown size={13} /></button>
                  <button type="button" aria-label="Quitar tabla" onClick={() => setCfg(c => ({ ...c, tablas: c.tablas.filter((_, j) => j !== ti) }))} className="grid size-7 place-items-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={13} /></button>
                </span>
              </div>
              <datalist id={`hoja-cols-${ti}`}>{cls.map(k => <option key={k} value={k} />)}</datalist>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Columnas</p>
              <div className="grid gap-1.5">
                {t.columnas.map((col, ci) => (
                  <FilaCampo<ColumnaHojaCfg> key={ci} c={col} i={ci} total={t.columnas.length} claves={cls} conValores
                    onCambio={n => setTabla(ti, { ...t, columnas: t.columnas.map((x, j) => (j === ci ? n : x)) })}
                    onMover={d => setTabla(ti, { ...t, columnas: mover(t.columnas, ci, d) })}
                    onQuitar={() => setTabla(ti, { ...t, columnas: t.columnas.filter((_, j) => j !== ci) })}
                    extra={<>
                      <select className={`${mini} w-24`} value={col.alinear} onChange={e => setTabla(ti, { ...t, columnas: t.columnas.map((x, j) => (j === ci ? { ...x, alinear: e.target.value as ColumnaHojaCfg['alinear'] } : x)) })}>
                        <option value="izq">Izquierda</option><option value="centro">Centro</option><option value="der">Derecha</option>
                      </select>
                      <input list={`hoja-cols-${ti}`} className={`${mini} w-28 font-mono`} placeholder="+ detalle" title="Clave que se muestra en gris junto al valor (por ejemplo, el código del producto)" value={col.detalle} onChange={e => setTabla(ti, { ...t, columnas: t.columnas.map((x, j) => (j === ci ? { ...x, detalle: e.target.value } : x)) })} />
                    </>} />
                ))}
                <button type="button" className="justify-self-start text-[12.5px] text-[#1a4fa0] hover:underline inline-flex items-center gap-1" onClick={() => setTabla(ti, { ...t, columnas: [...t.columnas, { clave: '', etiqueta: '', tipo: 'texto', alinear: 'izq', detalle: '' }] })}><Plus size={12} /> Columna</button>
              </div>
              <p className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Totales al pie (claves de cardData)</p>
              <div className="grid gap-1.5">
                {t.totales.map((tot, k) => (
                  <FilaCampo<TotalHojaCfg> key={k} c={tot} i={k} total={t.totales.length} claves={claves}
                    onCambio={n => setTabla(ti, { ...t, totales: t.totales.map((x, j) => (j === k ? n : x)) })}
                    onMover={d => setTabla(ti, { ...t, totales: mover(t.totales, k, d) })}
                    onQuitar={() => setTabla(ti, { ...t, totales: t.totales.filter((_, j) => j !== k) })}
                    extra={<label className="flex items-center gap-1 text-[12px] text-slate-600"><input type="checkbox" checked={tot.destacado} onChange={() => setTabla(ti, { ...t, totales: t.totales.map((x, j) => (j === k ? { ...x, destacado: !x.destacado } : x)) })} /> destacado</label>} />
                ))}
                <button type="button" className="justify-self-start text-[12.5px] text-[#1a4fa0] hover:underline inline-flex items-center gap-1" onClick={() => setTabla(ti, { ...t, totales: [...t.totales, { clave: '', etiqueta: '', tipo: 'moneda', destacado: false }] })}><Plus size={12} /> Total</button>
              </div>
            </section>
          )
        })}
        <button type="button" className={`${btnSecundario} justify-self-start`} onClick={() => setCfg(c => ({ ...c, tablas: [...c.tablas, { clave: '', titulo: '', columnas: [], totales: [] }] }))}><Plus size={14} /> Agregar tabla</button>
      </div>

      {/* ── Vista previa ── */}
      <div className="min-w-0">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[13px] font-semibold text-slate-700">Vista previa{prev ? ` · ${prev.folio}` : ''}</span>
          <div className="ml-auto flex rounded-lg border border-slate-300 bg-white p-0.5 text-[12.5px]">
            {(['pagina', 'correo'] as const).map(v => <button key={v} type="button" onClick={() => setVista(v)} className={`rounded-md px-3 py-1 ${vista === v ? 'bg-[#1a4fa0] text-white' : 'text-slate-600'}`}>{v === 'pagina' ? 'Página de aprobación' : 'Correo'}</button>)}
          </div>
        </div>
        {!prev ? (
          <div className="grid h-64 place-items-center rounded-2xl border border-dashed border-slate-300 text-[13px] text-slate-400">{sinTramites ? 'Sin trámites para previsualizar' : 'Armando la vista previa…'}</div>
        ) : vista === 'pagina' ? (
          <iframe title="Vista previa de la página de aprobación" className="h-[820px] w-full rounded-2xl border border-slate-300 bg-[#eef2f7]" srcDoc={prev.pagina_html} sandbox="allow-same-origin" />
        ) : (
          <iframe title="Vista previa del correo" className="h-[520px] w-full rounded-2xl border border-slate-300 bg-white" srcDoc={`<!doctype html><html><body style="margin:0;padding:20px;background:#f1f5f9;font-family:system-ui,sans-serif"><div style="max-width:560px;margin:0 auto;background:#fff;padding:24px;border-radius:12px"><h2 style="margin:0 0 6px">Tienes una aprobación pendiente</h2><p>Te toca decidir en la etapa 1 · Gerente de compras.</p>${prev.correo_html}<p style="margin:18px 0"><span style="display:inline-block;background:#1a4fa0;color:#fff;padding:10px 18px;border-radius:10px;font-weight:600">Revisar y decidir</span></p></div></body></html>`} />
        )}
      </div>
    </div>
  )
}
