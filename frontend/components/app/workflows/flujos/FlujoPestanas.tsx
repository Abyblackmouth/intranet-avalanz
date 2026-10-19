'use client'

// Pestañas secundarias del detalle de un flujo: Simular, Datos generales y Versiones.
import { useEffect, useState } from 'react'
import { Play, Plus, X } from 'lucide-react'
import {
  FlujoDetalle, Simulacion, UsuarioIntranet, VersionFlujo, ConexionResumen, CampoResumen,
  simularFlujo, updateFlujo, deleteFlujo, getFlujoVersiones, buscarUsuariosFlujos, getConexionesFlujos, createFlujo,
} from '@/services/workflowsService'
import RielFlujo, { LeyendaRiel } from '@/components/app/workflows/RielFlujo'
import { Seccion, BuscadorUsuario, inputCls, labelCls, btnPrimario, btnSecundario, btnPeligro, errMsg, fmtFecha } from '@/components/app/workflows/compartidos'

// ── Simular ────────────────────────────────────────────────────────────────
export function Simulador({ flujo }: { flujo: FlujoDetalle }) {
  const [clave, setClave] = useState(flujo.empresas_conexion[0]?.clave ?? flujo.grupos_detalle[0]?.origen_clave ?? '')
  const [solicitante, setSolicitante] = useState<UsuarioIntranet | null>(null)
  const [total, setTotal] = useState('120000')
  const [extra, setExtra] = useState('')
  const [res, setRes] = useState<Simulacion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [corriendo, setCorriendo] = useState(false)
  const claves = Array.from(new Set([...flujo.empresas_conexion.map(e => e.clave), ...flujo.grupos_detalle.map(g => g.origen_clave)])).sort()

  const correr = async () => {
    setError(null); setCorriendo(true)
    try {
      let card: Record<string, unknown> = { total: Number(total) || 0 }
      if (extra.trim()) {
        try { card = { ...card, ...JSON.parse(extra) } } catch { setError('El JSON extra no es válido'); setCorriendo(false); return }
      }
      const r = await simularFlujo(flujo.id, { origen_clave: clave, requester_user_id: solicitante?.id ?? null, card_data: card })
      setRes(r.data)
    } catch (e) { setError(errMsg(e, 'No se pudo simular')) } finally { setCorriendo(false) }
  }
  useEffect(() => { if (clave) correr() /* eslint-disable-line react-hooks/exhaustive-deps */ }, [])

  return (
    <div className="grid gap-4">
      <Seccion titulo="¿Qué camino tomaría un trámite?" sub="No crea nada: corre el motor sobre la definición vigente y muestra qué grupo se resuelve, qué etapas aplican y quién aprobaría.">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className={labelCls}>Empresa (clave)</label>
            <select className={`${inputCls} w-full`} value={clave} onChange={e => setClave(e.target.value)}>
              {claves.map(c => <option key={c} value={c}>{c}{flujo.empresas_conexion.find(e => e.clave === c)?.nombre ? ` · ${flujo.empresas_conexion.find(e => e.clave === c)?.nombre}` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Solicitante (vacío = alguien sin grupo propio)</label>
            <BuscadorUsuario valor={solicitante} onElegir={setSolicitante} buscar={buscarUsuariosFlujos} />
          </div>
          <div>
            <label className={labelCls}>cardData.total</label>
            <input type="number" className={`${inputCls} w-full`} value={total} onChange={e => setTotal(e.target.value)} />
          </div>
          <div className="md:col-span-3">
            <label className={labelCls}>Otros campos de cardData (JSON, opcional) para probar condiciones como <code>moneda == USD</code></label>
            <input className={`${inputCls} w-full font-mono`} value={extra} onChange={e => setExtra(e.target.value)} placeholder='{"moneda": "MXN", "centroCosto": "SIS001"}' />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button type="button" className={btnPrimario} onClick={correr} disabled={corriendo || !clave}><Play size={14} /> {corriendo ? 'Simulando…' : 'Simular'}</button>
          {error && <span className="text-[13px] text-red-600">{error}</span>}
        </div>
      </Seccion>
      {res && (
        <Seccion titulo={res.grupo ? `Grupo: ${res.grupo.nombre}` : 'Sin grupo'} sub={res.grupo ? (res.via === 'miembro' ? 'por ser miembro del grupo' : 'default de la empresa') : undefined}>
          {res.resultado === 'error_configuracion' ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-900">{res.mensaje}</div>
          ) : (
            <>
              <RielFlujo etapas={res.etapas} plataforma={{ titulo: `${flujo.conexion_titulo ?? 'Plataforma'} · ${flujo.result_service || 'resultService'}`, estado: null }} />
              <div className="mt-2"><LeyendaRiel /></div>
              <p className={`mt-3 text-[13px] ${res.resultado === 'aprobada' ? 'text-amber-700' : 'text-slate-700'}`}>{res.mensaje}</p>
            </>
          )}
        </Seccion>
      )}
    </div>
  )
}

// ── Datos generales ───────────────────────────────────────────────────────
export function DatosGenerales({ flujo, onChange, puedeEditar, onEliminado }: { flujo: FlujoDetalle; onChange: (f: FlujoDetalle) => void; puedeEditar: boolean; onEliminado: () => void }) {
  const [f, setF] = useState({ nombre: flujo.nombre, descripcion: flujo.descripcion ?? '', process_id: flujo.process_id, result_service: flujo.result_service, aliases: flujo.aliases.join(', ') })
  const [numero, setNumero] = useState(flujo.resumen?.numero ?? 'folio')
  const [campos, setCampos] = useState<CampoResumen[]>(flujo.resumen?.campos ?? [])
  const [estado, setEstado] = useState<{ ok: boolean; texto: string } | null>(null)
  const [guardando, setGuardando] = useState(false)
  useEffect(() => { setF({ nombre: flujo.nombre, descripcion: flujo.descripcion ?? '', process_id: flujo.process_id, result_service: flujo.result_service, aliases: flujo.aliases.join(', ') }); setNumero(flujo.resumen?.numero ?? 'folio'); setCampos(flujo.resumen?.campos ?? []) }, [flujo])
  const setCampo = (i: number, k: keyof CampoResumen, v: string) => setCampos(cs => cs.map((c, j) => j === i ? { ...c, [k]: v } : c))
  const guardar = async () => {
    setEstado(null); setGuardando(true)
    try {
      const r = await updateFlujo(flujo.id, {
        nombre: f.nombre.trim(), descripcion: f.descripcion.trim() || null, process_id: f.process_id.trim(), result_service: f.result_service.trim(),
        aliases: f.aliases.split(',').map(a => a.trim()).filter(Boolean),
        resumen: { numero: numero.trim() || 'folio', campos: campos.filter(c => c.clave.trim()) },
      })
      onChange(r.data); setEstado({ ok: true, texto: `Guardado · versión ${r.data.version}` })
    } catch (e) { setEstado({ ok: false, texto: errMsg(e, 'No se pudo guardar') }) } finally { setGuardando(false) }
  }
  const eliminar = async () => {
    if (!confirm(`¿Eliminar el flujo «${flujo.nombre}»? Solo se puede si no tiene trámites.`)) return
    try { await deleteFlujo(flujo.id); onEliminado() } catch (e) { setEstado({ ok: false, texto: errMsg(e, 'No se pudo eliminar') }) }
  }
  const dis = !puedeEditar
  return (
    <Seccion titulo="Datos generales" sub="Lo que identifica al flujo frente a la plataforma. Cada guardado crea una versión; los trámites en curso siguen con la suya.">
      <div className="grid gap-4 sm:grid-cols-2 max-w-3xl">
        <div className="sm:col-span-2">
          <label className={labelCls}>Nombre</label>
          <input className={`${inputCls} w-full`} value={f.nombre} onChange={e => setF(s => ({ ...s, nombre: e.target.value }))} disabled={dis} />
        </div>
        <div>
          <label className={labelCls}>processId (lo que manda la plataforma en el sobre)</label>
          <input className={`${inputCls} w-full font-mono`} value={f.process_id} onChange={e => setF(s => ({ ...s, process_id: e.target.value }))} disabled={dis} />
          {flujo.instancias_total > 0 && <p className="text-[11px] text-slate-400 mt-1">Ya hay {flujo.instancias_total} trámites: si lo cambias, el nombre anterior queda como alias y los envíos viejos siguen entrando.</p>}
        </div>
        <div>
          <label className={labelCls}>resultService (servicio de la plataforma que recibe el resultado)</label>
          <input className={`${inputCls} w-full font-mono`} value={f.result_service} onChange={e => setF(s => ({ ...s, result_service: e.target.value }))} placeholder="WFM110RESULT" disabled={dis} />
          <p className="text-[11px] text-slate-400 mt-1">Se manda a {`{URL base}/${f.result_service || 'resultService'}/`}.</p>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Aliases (otros processId que también entran a este flujo, separados por coma)</label>
          <input className={`${inputCls} w-full font-mono`} value={f.aliases} onChange={e => setF(s => ({ ...s, aliases: e.target.value }))} disabled={dis} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Descripción</label>
          <textarea rows={2} className={`${inputCls} w-full`} value={f.descripcion} onChange={e => setF(s => ({ ...s, descripcion: e.target.value }))} disabled={dis} />
        </div>
        <div className="sm:col-span-2 text-[13px] text-slate-600">Plataforma: <b>{flujo.conexion_titulo}</b> <span className="text-slate-400">({flujo.conexion_slug})</span>. Para cambiarla, crea otro flujo.</div>
      </div>

      <div className="mt-6 pt-5 border-t border-slate-200 max-w-3xl">
        <h4 className="text-[14px] font-bold text-slate-900">Resumen del trámite</h4>
        <p className="text-[12.5px] text-slate-500 mt-0.5 mb-3">Qué campos de <code>cardData</code> se muestran en la tabla de trámites, en el correo al aprobador y en el detalle. Cada flujo tiene los suyos (compras: solicitud, proveedor, total; cuentas contables: cuenta, descripción…). Hasta 4.</p>
        <div className="grid gap-3 sm:grid-cols-2 mb-3">
          <div>
            <label className={labelCls}>Número de documento visible</label>
            <input className={`${inputCls} w-full font-mono`} value={numero} onChange={e => setNumero(e.target.value)} placeholder="numerosolicitud" disabled={dis} />
            <p className="text-[11px] text-slate-400 mt-1">Clave de cardData que trae el número (lo asigna la plataforma), o <code>folio</code> si lo asigna la Intranet y la plataforma lo recibe en la respuesta.</p>
          </div>
        </div>
        {campos.map((c, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 mb-2">
            <input className={`${inputCls} w-44 font-mono`} placeholder="clave en cardData" value={c.clave} onChange={e => setCampo(i, 'clave', e.target.value)} disabled={dis} />
            <input className={`${inputCls} w-40`} placeholder="Etiqueta" value={c.etiqueta} onChange={e => setCampo(i, 'etiqueta', e.target.value)} disabled={dis} />
            <select className={`${inputCls} w-32`} value={c.tipo} onChange={e => setCampo(i, 'tipo', e.target.value)} disabled={dis}>
              <option value="texto">Texto</option><option value="moneda">Moneda</option><option value="numero">Número</option><option value="fecha">Fecha</option>
            </select>
            {!dis && <button type="button" onClick={() => setCampos(cs => cs.filter((_, j) => j !== i))} aria-label="Quitar" className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-red-600"><X size={14} /></button>}
          </div>
        ))}
        {!dis && campos.length < 4 && <button type="button" className={btnSecundario} onClick={() => setCampos(cs => [...cs, { clave: '', etiqueta: '', tipo: 'texto' }])}><Plus size={13} /> Agregar campo</button>}
        {campos.length === 0 && <p className="text-[12px] text-slate-400 mt-2">Sin configurar, la Intranet toma lo que reconozca (solicitud, proveedor, total, cuenta, descripción…).</p>}
      </div>
      {puedeEditar && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" className={btnPrimario} onClick={guardar} disabled={guardando || !f.nombre.trim() || !f.process_id.trim()}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
          {estado && <span className={`text-[13px] ${estado.ok ? 'text-emerald-700' : 'text-red-600'}`}>{estado.texto}</span>}
          <button type="button" className={`${btnPeligro} ml-auto`} onClick={eliminar} disabled={flujo.instancias_total > 0}>Eliminar flujo</button>
        </div>
      )}
    </Seccion>
  )
}

// ── Versiones ─────────────────────────────────────────────────────────────
export function Versiones({ flujo }: { flujo: FlujoDetalle }) {
  const [lista, setLista] = useState<VersionFlujo[]>([])
  useEffect(() => { getFlujoVersiones(flujo.id).then(r => setLista(r.data ?? [])).catch(() => setLista([])) }, [flujo.id, flujo.version])
  return (
    <Seccion titulo="Versiones" sub="Cada cambio en el flujo crea una versión. Un trámite recuerda con cuál nació.">
      <table className="w-full text-[13px]">
        <thead><tr className="text-left text-slate-500"><th className="py-1.5 font-medium">Versión</th><th className="py-1.5 font-medium">Grupos</th><th className="py-1.5 font-medium">Creada por</th><th className="py-1.5 font-medium">Cuándo</th><th /></tr></thead>
        <tbody>
          {lista.map(v => (
            <tr key={v.id} className="border-t border-slate-200">
              <td className="py-2 font-mono">v{v.numero}</td><td className="py-2">{v.grupos}</td><td className="py-2">{v.creada_por || '—'}</td><td className="py-2 text-slate-500">{fmtFecha(v.creada_en)}</td>
              <td className="py-2">{v.vigente && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[12px] font-medium text-emerald-700">vigente</span>}</td>
            </tr>
          ))}
          {lista.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-slate-400">Sin versiones.</td></tr>}
        </tbody>
      </table>
    </Seccion>
  )
}

// ── Nuevo flujo ───────────────────────────────────────────────────────────
export function FormNuevoFlujo({ onClose, onCreado }: { onClose: () => void; onCreado: (id: string) => void }) {
  const [conexiones, setConexiones] = useState<ConexionResumen[]>([])
  const [f, setF] = useState({ conexion_id: '', nombre: '', process_id: '', result_service: '', descripcion: '' })
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  useEffect(() => { getConexionesFlujos().then(r => { setConexiones(r.data ?? []); setF(s => ({ ...s, conexion_id: r.data?.[0]?.id ?? '' })) }).catch(() => setError('No se pudieron cargar las conexiones')) }, [])
  const crear = async () => {
    setError(null); setGuardando(true)
    try { const r = await createFlujo({ conexion_id: f.conexion_id, nombre: f.nombre.trim(), process_id: f.process_id.trim(), result_service: f.result_service.trim(), descripcion: f.descripcion.trim() || undefined }); onCreado(r.data.id) }
    catch (e) { setError(errMsg(e, 'No se pudo crear el flujo')) } finally { setGuardando(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="px-6 pt-5 pb-3"><h2 className="text-base font-semibold text-slate-800">Nuevo flujo</h2></div>
        <div className="px-6 pb-6 grid gap-4">
          <div><label className={labelCls}>Plataforma</label>
            <select className={`${inputCls} w-full`} value={f.conexion_id} onChange={e => setF(s => ({ ...s, conexion_id: e.target.value }))}>
              {conexiones.map(c => <option key={c.id} value={c.id}>{c.titulo}</option>)}
            </select></div>
          <div><label className={labelCls}>Nombre</label><input className={`${inputCls} w-full`} value={f.nombre} onChange={e => setF(s => ({ ...s, nombre: e.target.value }))} placeholder="Solicitud de compra directa" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>processId</label><input className={`${inputCls} w-full font-mono`} value={f.process_id} onChange={e => setF(s => ({ ...s, process_id: e.target.value }))} placeholder="CompraDirecta" /></div>
            <div><label className={labelCls}>resultService</label><input className={`${inputCls} w-full font-mono`} value={f.result_service} onChange={e => setF(s => ({ ...s, result_service: e.target.value }))} placeholder="WFM110RESULT" /></div>
          </div>
          <div><label className={labelCls}>Descripción (opcional)</label><input className={`${inputCls} w-full`} value={f.descripcion} onChange={e => setF(s => ({ ...s, descripcion: e.target.value }))} /></div>
          {error && <p className="text-[13px] text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className={btnSecundario} onClick={onClose}>Cancelar</button>
            <button type="button" className={btnPrimario} onClick={crear} disabled={guardando || !f.conexion_id || !f.nombre.trim() || !f.process_id.trim()}>{guardando ? 'Creando…' : 'Crear flujo'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
