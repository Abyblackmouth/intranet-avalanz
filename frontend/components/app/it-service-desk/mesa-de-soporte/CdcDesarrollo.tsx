'use client'

import { useCallback, useEffect, useState } from 'react'
import { getDesarrollo, registrarAvance, saveEntregaBorrador, generarEntrega, liberarPruebas, getDesarrolloCandidatos, reasignarDesarrollo } from '@/services/itServiceDeskService'
import { getSignedUrl } from '@/services/uploadService'
import { Lock, Paperclip, X } from 'lucide-react'
import { Campo, inputCls, btnSec, btnPri } from './CdcArranque'

type EstadoRt = 'pendiente' | 'en_progreso' | 'terminado'
interface Rt { id: string; rf: string; descripcion: string; horas_estimadas: number | null; estado: EstadoRt; horas_reales: number | null; actualizado_por: string | null }
interface Avance { id: string; rt_id: string | null; estado: string | null; horas: number | null; comentario: string | null; anexos: any[]; autor_nombre: string; created_at: string }
interface Doc { id: string; version: number; estado: string; datos: any; nombre: string | null; object_key: string | null; bucket: string }
interface Data {
  status: string; puede_editar: boolean; puede_cerrar: boolean; puede_reasignar: boolean
  responsable: { id: string; name: string } | null
  rts: Rt[]; avances: Avance[]; entrega: Doc[]
  observaciones_produccion: { fecha: string; comentarios: string; confirmo: string } | null
  observaciones_uat: { ciclo: number; fecha: string; no_cumple: { id: string; descripcion: string; comentario: string; evidencias: { nombre: string; object_key: string; bucket: string }[] }[] } | null
  resumen: { total: number; terminados: number; horas_estimadas: number; horas_reales: number; inicio: string | null; fecha_compromiso: string | null; dias_restantes: number | null }
  solicitante: { id: string; name: string }; project_manager: { id: string; name: string } | null
}

const ESTADO: Record<EstadoRt, { label: string; cls: string }> = {
  pendiente: { label: 'Pendiente', cls: 'bg-slate-100 text-slate-600' },
  en_progreso: { label: 'En progreso', cls: 'bg-blue-100 text-blue-800' },
  terminado: { label: 'Terminado', cls: 'bg-emerald-100 text-emerald-800' },
}
const TZ = 'America/Monterrey'
const fmt = (iso: string) => new Date(iso).toLocaleString('es-MX', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const ddmm = (iso: string | null) => { if (!iso) return '—'; const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}` }
const h = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${n % 1 === 0 ? n : n.toFixed(1)} h`)
const errMsg = (err: any, fb: string) => { const d = err?.response?.data?.detail; return typeof d === 'string' ? d : fb }

async function abrir(key: string | null, bucket = 'dirdoc') {
  if (!key) return
  const r = await getSignedUrl(key, bucket)
  const url = r.data?.data?.url || r.data?.url
  if (url) window.open(url, '_blank', 'noopener,noreferrer')
}

function Tarjeta({ titulo, valor, detalle, tono = 'slate' }: { titulo: string; valor: string; detalle?: string; tono?: 'slate' | 'green' | 'amber' | 'red' }) {
  const c = { slate: 'text-slate-900', green: 'text-emerald-700', amber: 'text-amber-700', red: 'text-red-700' }[tono]
  return (
    <div className="border border-slate-200 rounded-xl bg-white px-4 py-3">
      <p className="text-[12px] text-slate-500">{titulo}</p>
      <p className={`text-[20px] font-semibold leading-tight mt-0.5 ${c}`}>{valor}</p>
      {detalle && <p className="text-[12px] text-slate-500 mt-0.5">{detalle}</p>}
    </div>
  )
}

function NotaForm({ inicial, busy, onSave, onGenerate }: { inicial: any; busy: boolean; onSave: (d: any) => void; onGenerate: (d: any) => void }) {
  const [d, setD] = useState({
    entregado: inicial?.entregado ?? '', ambiente: inicial?.ambiente ?? '', instrucciones: inicial?.instrucciones ?? '',
    datos_prueba: inicial?.datos_prueba ?? '', limitaciones: inicial?.limitaciones ?? '',
  })
  const hint = "Las líneas que empiezan con '-' se vuelven viñetas en el PDF."
  const area = (k: keyof typeof d, label: string, req: boolean, ph: string) => (
    <Campo label={label} req={req} hint={hint}>
      <textarea className={`${inputCls} min-h-[90px]`} placeholder={ph} value={d[k]} onChange={e => setD({ ...d, [k]: e.target.value })} />
    </Campo>
  )
  return (
    <div className="mt-4 pt-4 border-t border-slate-100 grid gap-4">
      {area('entregado', 'Qué se entrega', true, '- Rutina de carga de proveedores\n- Reporte ajustado')}
      {area('ambiente', 'Ambiente de pruebas', true, 'Dónde probar: ambiente, empresa/filial, URL o acceso')}
      {area('instrucciones', 'Instrucciones para la validación', true, '- Paso 1\n- Paso 2')}
      {area('datos_prueba', 'Datos de prueba', false, 'Usuarios, folios o registros sugeridos para probar')}
      {area('limitaciones', 'Limitaciones conocidas', false, 'Lo que todavía no incluye esta entrega')}
      <div className="flex flex-wrap gap-2 justify-end">
        <button type="button" disabled={busy} className={btnSec} onClick={() => onSave(d)}>Guardar borrador</button>
        <button type="button" disabled={busy} className={btnPri} onClick={() => onGenerate(d)}>{busy ? 'Procesando…' : 'Generar PDF'}</button>
      </div>
    </div>
  )
}

export default function CdcDesarrollo({ incidentId, onChanged }: { incidentId: string; onChanged: () => void }) {
  const [data, setData] = useState<Data | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [cambios, setCambios] = useState<Record<string, { estado: EstadoRt; horas: string }>>({})
  const [comentario, setComentario] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [notaAbierta, setNotaAbierta] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ donde: string; ok: boolean; text: string } | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [reasignando, setReasignando] = useState(false)
  const [candidatos, setCandidatos] = useState<{ id: string; name: string; rol: string }[]>([])
  const [elegido, setElegido] = useState('')

  const load = useCallback(async () => {
    try { const r = await getDesarrollo(incidentId); setData(r.data); setLoadError(null) }
    catch (e) { setLoadError(errMsg(e, 'No se pudo cargar el desarrollo')) }
  }, [incidentId])
  useEffect(() => { load() }, [load])

  const run = async (donde: string, fn: () => Promise<any>, okText?: string) => {
    setBusy(donde); setMsg(null)
    try { await fn(); await load(); onChanged(); if (okText) setMsg({ donde, ok: true, text: okText }); return true }
    catch (e) { setMsg({ donde, ok: false, text: errMsg(e, 'No se pudo completar la acción') }); return false }
    finally { setBusy(null) }
  }

  if (loadError) return <div className="px-5 py-6 text-[13.5px] text-red-600">{loadError}</div>
  if (!data) return <div className="px-5 py-8 flex justify-center"><div className="w-5 h-5 border-2 border-slate-300 border-t-[#1a4fa0] rounded-full animate-spin" /></div>

  const r = data.resumen
  const pct = r.total ? Math.round((r.terminados / r.total) * 100) : 0
  const dias = r.dias_restantes
  const tonoDias = dias === null ? 'slate' : dias < 0 ? 'red' : dias <= 7 ? 'amber' : 'green'
  const nota = [...data.entrega].sort((a, b) => b.version - a.version)[0]
  const notaGenerada = nota?.estado === 'generado'
  const pendientes = data.rts.filter(x => x.estado !== 'terminado').map(x => x.id)
  const bloqueo = pendientes.length ? `Faltan por terminar: ${pendientes.join(', ')}.` : !notaGenerada ? 'Genera la nota de entrega a pruebas.' : null
  const hayCambios = Object.keys(cambios).length > 0 || comentario.trim() || files.length

  const setRt = (rt: Rt, k: 'estado' | 'horas', v: string) => setCambios(c => {
    const actual = c[rt.id] ?? { estado: rt.estado, horas: rt.horas_reales?.toString() ?? '' }
    return { ...c, [rt.id]: { ...actual, [k]: v } as { estado: EstadoRt; horas: string } }
  })

  const guardarAvance = async () => {
    const fd = new FormData()
    fd.append('payload', JSON.stringify({
      comentario: comentario.trim() || null,
      rts: Object.entries(cambios).map(([id, c]) => ({ id, estado: c.estado, horas: c.horas === '' ? null : Number(c.horas) })),
    }))
    files.forEach(f => fd.append('files', f))
    if (await run('avance', () => registrarAvance(incidentId, fd), 'Avance registrado.')) { setCambios({}); setComentario(''); setFiles([]) }
  }

  const aviso = (donde: string) => msg?.donde === donde && <p role="status" className={`mt-3 text-[13px] font-medium ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.text}</p>

  return (
    <div>
      <div className="px-5 py-5">
        {data.observaciones_produccion && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 mb-4">
            <p className="text-[13.5px] font-semibold text-red-900">Se revirtió la instalación en producción</p>
            <p className="text-[13px] text-slate-800 mt-1 whitespace-pre-line">{data.observaciones_produccion.comentarios}</p>
            <p className="text-[12px] text-slate-500 mt-1">Confirmó: {data.observaciones_produccion.confirmo}</p>
          </div>
        )}
        {data.observaciones_uat && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3.5 mb-4">
            <p className="text-[13.5px] font-semibold text-amber-900">Regresó de pruebas · ciclo {data.observaciones_uat.ciclo}</p>
            <p className="text-[12.5px] text-amber-800 mb-2">El solicitante marcó estos criterios como no cumplidos:</p>
            <ul className="grid gap-2">
              {data.observaciones_uat.no_cumple.map(c => (
                <li key={c.id} className="text-[13px] text-slate-800 bg-white border border-amber-200 rounded-lg px-3 py-2">
                  <span className="font-mono text-slate-500">{c.id}</span> · {c.descripcion}
                  <span className="block text-slate-700 mt-0.5 whitespace-pre-line">{c.comentario}</span>
                  {c.evidencias?.length > 0 && (
                    <span className="flex flex-wrap gap-2 mt-1">{c.evidencias.map((e, i) => (
                      <button key={i} type="button" className="text-[12.5px] text-[#1a4fa0] hover:underline inline-flex items-center gap-1" onClick={() => abrir(e.object_key, e.bucket)}><Paperclip className="w-3 h-3" />{e.nombre}</button>
                    ))}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Responsable del desarrollo */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-[13.5px]">
            <p className="text-slate-500 text-[12.5px]">Desarrolla</p>
            <p className="font-medium text-slate-900">{data.responsable?.name || 'Sin asignar'}</p>
            {data.project_manager?.name && data.project_manager.id !== data.responsable?.id && <p className="text-xs text-slate-500 mt-0.5">Project Manager: {data.project_manager.name}</p>}
          </div>
          {data.puede_reasignar && !reasignando && (
            <button type="button" className={btnSec} onClick={async () => {
              setReasignando(true)
              try { const r = await getDesarrolloCandidatos(incidentId); setCandidatos(r.data ?? []) } catch { setCandidatos([]) }
            }}>Reasignar</button>
          )}
        </div>
        {reasignando && (
          <div className="mb-4 flex flex-wrap gap-2 items-center">
            <select className={`${inputCls} !w-auto min-w-[280px]`} value={elegido} onChange={e => setElegido(e.target.value)}>
              <option value="">Selecciona quién desarrolla</option>
              {candidatos.map(c => <option key={c.id} value={c.id}>{c.name} · {c.rol}</option>)}
            </select>
            <button type="button" className={btnPri} disabled={!elegido || !!busy}
              onClick={async () => { if (await run('reasignar', () => reasignarDesarrollo(incidentId, elegido), 'Desarrollo reasignado y notificado.')) { setReasignando(false); setElegido('') } }}>Asignar</button>
            <button type="button" className="px-3 py-1.5 text-sm text-slate-600" onClick={() => setReasignando(false)}>Cancelar</button>
          </div>
        )}
        {aviso('reasignar')}

        {/* Resumen */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tarjeta titulo="Avance" valor={r.total ? `${r.terminados} de ${r.total}` : 'Sin RT'} detalle={r.total ? `${pct}% de requerimientos terminados` : 'Sin diseño técnico'} tono={pct === 100 ? 'green' : 'slate'} />
          <Tarjeta titulo="Horas reales" valor={h(r.horas_reales)} detalle={`Estimadas: ${h(r.horas_estimadas)}`} tono={r.horas_estimadas && r.horas_reales > r.horas_estimadas ? 'amber' : 'slate'} />
          <Tarjeta titulo="Entrega comprometida" valor={ddmm(r.fecha_compromiso)} detalle={dias === null ? undefined : dias < 0 ? `Vencida hace ${-dias} días` : dias === 0 ? 'Vence hoy' : `Faltan ${dias} días`} tono={tonoDias as any} />
          <Tarjeta titulo="Inicio del desarrollo" valor={ddmm(r.inicio)} detalle={data.project_manager?.name ? `PM: ${data.project_manager.name}` : undefined} />
        </div>
        {r.total > 0 && (
          <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        )}

        {/* Requerimientos técnicos */}
        <h4 className="text-[14.5px] font-semibold text-slate-900 mt-7">Requerimientos técnicos</h4>
        {data.rts.length === 0 ? (
          <p className="text-[13px] text-slate-500 mt-1">Este proyecto no tiene diseño técnico generado; registra solo avances generales.</p>
        ) : (
          <>
            <p className="text-[13px] text-slate-500 mt-0.5 mb-3">Las horas son las <b>reales acumuladas</b> de cada requerimiento a la fecha, no solo las de hoy.</p>
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-slate-50 text-[12px] text-slate-500">
                  <tr><th className="text-left font-medium px-3 py-2">RT</th><th className="text-left font-medium px-3 py-2">Requerimiento</th>
                    <th className="text-right font-medium px-3 py-2">Estimadas</th><th className="text-left font-medium px-3 py-2">Estado</th>
                    <th className="text-left font-medium px-3 py-2">Horas reales</th></tr>
                </thead>
                <tbody>
                  {data.rts.map(rt => {
                    const c = cambios[rt.id]
                    const estado = c?.estado ?? rt.estado
                    return (
                      <tr key={rt.id} className={`border-t border-slate-100 ${c ? 'bg-amber-50/50' : ''}`}>
                        <td className="px-3 py-2 align-top"><span className="font-mono text-[12.5px]">{rt.id}</span>{rt.rf && <span className="block text-[11px] text-slate-400">{rt.rf}</span>}</td>
                        <td className="px-3 py-2 align-top text-slate-800">{rt.descripcion}{rt.actualizado_por && <span className="block text-[11.5px] text-slate-400 mt-0.5">Actualizó: {rt.actualizado_por}</span>}</td>
                        <td className="px-3 py-2 align-top text-right text-slate-600">{h(rt.horas_estimadas)}</td>
                        <td className="px-3 py-2 align-top">
                          {data.puede_editar ? (
                            <select aria-label={`Estado de ${rt.id}`} className={`${inputCls} !py-1.5`} value={estado} onChange={e => setRt(rt, 'estado', e.target.value)}>
                              <option value="pendiente">Pendiente</option><option value="en_progreso">En progreso</option><option value="terminado">Terminado</option>
                            </select>
                          ) : <span className={`text-[12px] font-semibold px-2.5 py-0.5 rounded-full ${ESTADO[estado].cls}`}>{ESTADO[estado].label}</span>}
                        </td>
                        <td className="px-3 py-2 align-top w-[130px]">
                          {data.puede_editar
                            ? <input aria-label={`Horas reales de ${rt.id}`} inputMode="decimal" className={`${inputCls} !py-1.5`} placeholder="0" value={c?.horas ?? rt.horas_reales?.toString() ?? ''} onChange={e => setRt(rt, 'horas', e.target.value)} />
                            : <span className="text-slate-700">{h(rt.horas_reales)}</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Registrar avance */}
        {data.puede_editar && (
          <div className="mt-5 border border-slate-200 rounded-xl bg-white p-4">
            <p className="text-[13.5px] font-semibold text-slate-800">Registrar avance</p>
            <textarea className={`${inputCls} min-h-[70px] mt-2`} placeholder="Qué se hizo, qué falta, bloqueos… (opcional si solo actualizas requerimientos)" value={comentario} onChange={e => setComentario(e.target.value)} />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className={`${btnSec} cursor-pointer inline-flex items-center gap-1.5`}><Paperclip className="w-3.5 h-3.5" />Adjuntar evidencia
                <input type="file" multiple className="hidden" onChange={e => { const l = Array.from(e.target.files ?? []); setFiles(f => [...f, ...l]); e.target.value = '' }} />
              </label>
              {files.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-[12.5px] border border-slate-200 rounded-lg px-2 py-1">{f.name}
                  <button type="button" aria-label="Quitar" onClick={() => setFiles(x => x.filter((_, j) => j !== i))}><X className="w-3 h-3 text-slate-400 hover:text-red-600" /></button>
                </span>
              ))}
              <span className="flex-1" />
              {Object.keys(cambios).length > 0 && <span className="text-[12.5px] text-amber-700">{Object.keys(cambios).length} requerimiento(s) con cambios</span>}
              <button type="button" disabled={!hayCambios || !!busy} className={btnPri} onClick={guardarAvance}>{busy === 'avance' ? 'Guardando…' : 'Guardar avance'}</button>
            </div>
            {aviso('avance')}
          </div>
        )}

        {/* Bitácora */}
        <h4 className="text-[14.5px] font-semibold text-slate-900 mt-7 mb-2">Bitácora del desarrollo</h4>
        {data.avances.length === 0 ? <p className="text-[13px] text-slate-500">Todavía no hay avances registrados.</p> : (
          <ul className="border-l-2 border-slate-200 pl-4 flex flex-col gap-3">
            {data.avances.map(a => (
              <li key={a.id} className="relative pl-3 text-[13.5px] text-slate-700">
                <span className="absolute -left-[23px] top-1.5 w-2.5 h-2.5 rounded-full bg-white border-2 border-slate-400" />
                {a.rt_id
                  ? <><span className="font-mono text-[12.5px]">{a.rt_id}</span> → <span className={`text-[11.5px] font-semibold px-2 py-0.5 rounded-full ${ESTADO[(a.estado as EstadoRt) ?? 'pendiente']?.cls ?? ''}`}>{ESTADO[(a.estado as EstadoRt) ?? 'pendiente']?.label ?? a.estado}</span>{a.horas !== null && <span className="text-slate-500"> · {h(a.horas)} acumuladas</span>}</>
                  : <span className="whitespace-pre-line">{a.comentario}</span>}
                {a.anexos?.length > 0 && (
                  <span className="flex flex-wrap gap-2 mt-1">
                    {a.anexos.map((x: any, i: number) => <button key={i} type="button" className="text-[12.5px] text-[#1a4fa0] hover:underline inline-flex items-center gap-1" onClick={() => abrir(x.object_key, x.bucket)}><Paperclip className="w-3 h-3" />{x.nombre}</button>)}
                  </span>
                )}
                <span className="block text-xs text-slate-400 mt-0.5">{a.autor_nombre} · {fmt(a.created_at)}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Nota de entrega */}
        <div className="border border-slate-200 rounded-xl px-4 py-3.5 bg-white mt-7">
          <div className="flex items-start gap-3">
            <span className={`w-8 h-10 rounded-[5px] flex items-end justify-center pb-1 text-[9px] font-semibold text-white shrink-0 ${notaGenerada ? 'bg-red-600' : 'bg-slate-300'}`}>PDF</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[14.5px] font-semibold text-slate-900">Nota de entrega a pruebas</p>
                <span className={`text-[11.5px] font-semibold px-2.5 py-0.5 rounded-full ${!nota ? 'bg-slate-100 text-slate-600' : notaGenerada ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                  {!nota ? 'Pendiente · obligatoria' : `${notaGenerada ? 'Generada' : 'Borrador'} v${nota.version}`}
                </span>
              </div>
              <p className="text-[12.5px] text-slate-500 mt-0.5">Qué se entrega, dónde probarlo y cómo validarlo. Incluye los criterios de aceptación del diseño funcional y el avance real contra el estimado.</p>
              {notaGenerada && <p className="text-xs text-slate-500 mt-1 font-mono break-all">{nota.nombre}</p>}
            </div>
            <div className="flex gap-2 shrink-0">
              {notaGenerada && <button type="button" className={btnSec} onClick={() => abrir(nota.object_key, nota.bucket)}>Ver PDF</button>}
              {data.puede_editar && <button type="button" className={btnSec} onClick={() => setNotaAbierta(!notaAbierta)}>{notaAbierta ? 'Cerrar' : notaGenerada ? 'Nueva versión' : nota ? 'Continuar' : 'Capturar'}</button>}
            </div>
          </div>
          {notaAbierta && data.puede_editar && (
            <NotaForm inicial={nota?.datos} busy={!!busy}
              onSave={d => run('nota', () => saveEntregaBorrador(incidentId, d), 'Borrador guardado. Puedes continuar después.')}
              onGenerate={async d => {
                if (await run('nota', () => saveEntregaBorrador(incidentId, d)) && await run('nota', () => generarEntrega(incidentId), 'Nota de entrega generada.')) setNotaAbierta(false)
              }} />
          )}
          {aviso('nota')}
        </div>

        {!data.puede_editar && (
          <p className="mt-5 text-[13px] text-slate-500 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" />Los avances los registran el PM, el especialista técnico, quien desarrolla y el Incident Manager.</p>
        )}
        {data.puede_editar && !data.puede_cerrar && (
          <p className="mt-5 text-[13px] text-slate-500 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" />Cuando termines, el Project Manager o el Incident Manager liberan a pruebas.</p>
        )}
      </div>

      {data.puede_cerrar && (
        <footer className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          {confirmando ? (
            <>
              <p className="text-[13.5px] text-slate-700">¿Liberar a pruebas? El proyecto pasa a <b>En pruebas (UAT)</b>, asignado a <b>{data.solicitante.name}</b>, y se le notifica.</p>
              <div className="flex gap-2">
                <button type="button" disabled={!!busy} className="px-4 py-2 text-sm text-slate-600" onClick={() => setConfirmando(false)}>Volver</button>
                <button type="button" disabled={!!busy} className={btnPri} onClick={async () => { await run('liberar', () => liberarPruebas(incidentId), 'Liberado a pruebas.'); setConfirmando(false) }}>
                  {busy === 'liberar' ? 'Liberando…' : 'Sí, liberar a pruebas'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className={`text-[12.5px] max-w-[52ch] ${bloqueo ? 'text-amber-700' : 'text-slate-500'}`}>{bloqueo ?? 'Todo listo: requerimientos terminados y nota de entrega generada.'}</p>
              <button type="button" disabled={!!bloqueo || !!busy || !!hayCambios} title={hayCambios ? 'Guarda el avance antes de liberar' : ''} className={btnPri} onClick={() => setConfirmando(true)}>Liberar a pruebas</button>
            </>
          )}
          {msg?.donde === 'liberar' && <p className={`basis-full text-[13px] ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.text}</p>}
        </footer>
      )}
    </div>
  )
}
