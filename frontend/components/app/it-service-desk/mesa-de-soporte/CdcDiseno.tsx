'use client'

import { useCallback, useEffect, useState } from 'react'
import { getDiseno, saveDisenoBorrador, generarDiseno, cerrarDiseno, getDisenoCandidatos, reasignarDiseno } from '@/services/itServiceDeskService'
import { getSignedUrl } from '@/services/uploadService'
import { Lock } from 'lucide-react'
import { Campo, Seccion, TableEditor, inputCls, btnSec, btnPri } from './CdcArranque'

type Fase = 'funcional' | 'tecnico'
interface Sesion { fecha: string; tipo: string; participantes: string; notas: string }
interface Doc { id: string; version: number; estado: string; datos: any; nombre: string | null; object_key: string | null; bucket: string }
interface DisenoData {
  fase: Fase; status: string; puede_editar: boolean; puede_reasignar: boolean
  responsable: { id: string; name: string } | null; project_manager: { id: string; name: string } | null
  documentos: Doc[]; rf_ids: string[]; contexto: any
}

const FASE = {
  funcional: { doc: 'Documento de Requerimientos Funcionales', siguiente: 'Diseño técnico, asignado automáticamente al equipo técnico', rol: 'Especialista funcional' },
  tecnico: { doc: 'Documento de Diseño Técnico', siguiente: 'En desarrollo, de regreso con el Project Manager', rol: 'Especialista técnico' },
}
const errMsg = (err: any, fb: string) => { const d = err?.response?.data?.detail; return typeof d === 'string' ? d : fb }
const del = 'px-2 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50'

function SesionesEditor({ items, onChange }: { items: Sesion[]; onChange: (s: Sesion[]) => void }) {
  const vacia: Sesion = { fecha: '', tipo: '', participantes: '', notas: '' }
  const list = items.length ? items : [vacia]
  const set = (i: number, k: keyof Sesion, v: string) => onChange(list.map((s, j) => j === i ? { ...s, [k]: v } : s))
  return (
    <div className="flex flex-col gap-3">
      {list.map((s, i) => (
        <div key={i} className="border border-slate-200 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-[150px_1fr_1fr_auto] gap-2 bg-slate-50/60">
          <input type="date" aria-label="Fecha" className={inputCls} value={s.fecha} onChange={e => set(i, 'fecha', e.target.value)} />
          <input className={inputCls} placeholder="Tipo y duración (ej. Presencial · 1 h)" value={s.tipo} onChange={e => set(i, 'tipo', e.target.value)} />
          <input className={inputCls} placeholder="Participantes" value={s.participantes} onChange={e => set(i, 'participantes', e.target.value)} />
          <button type="button" aria-label="Quitar sesión" className={del} onClick={() => onChange(list.length > 1 ? list.filter((_, j) => j !== i) : [vacia])}>✕</button>
          <textarea className={`${inputCls} sm:col-span-4 min-h-15`} placeholder="Qué se entendió o acordó en la sesión" value={s.notas} onChange={e => set(i, 'notas', e.target.value)} />
        </div>
      ))}
      <button type="button" className="self-start text-[13px] font-medium text-[#1a4fa0] hover:underline" onClick={() => onChange([...list, vacia])}>+ Agregar sesión</button>
    </div>
  )
}

type Rf = { id: string; descripcion: string; prioridad: string; criterio: string }
function RfEditor({ rows, onChange }: { rows: Rf[]; onChange: (r: Rf[]) => void }) {
  const nueva = (n: number): Rf => ({ id: `RF-${String(n).padStart(2, '0')}`, descripcion: '', prioridad: 'media', criterio: '' })
  const list = rows.length ? rows : [nueva(1)]
  const set = (i: number, k: keyof Rf, v: string) => onChange(list.map((r, j) => j === i ? { ...r, [k]: v } : r))
  return (
    <div className="flex flex-col gap-3">
      {list.map((r, i) => (
        <div key={i} className="border border-slate-200 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-[90px_1fr_120px_auto] gap-2 bg-slate-50/60">
          <input aria-label="ID" className={`${inputCls} font-mono`} value={r.id} onChange={e => set(i, 'id', e.target.value)} />
          <input className={inputCls} placeholder="Qué debe hacer el sistema" value={r.descripcion} onChange={e => set(i, 'descripcion', e.target.value)} />
          <select aria-label="Prioridad" className={inputCls} value={r.prioridad} onChange={e => set(i, 'prioridad', e.target.value)}>
            <option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
          </select>
          <button type="button" aria-label="Quitar requerimiento" className={del} onClick={() => onChange(list.length > 1 ? list.filter((_, j) => j !== i) : [nueva(1)])}>✕</button>
          <input className={`${inputCls} sm:col-span-4`} placeholder="Criterio de aceptación: cómo se sabrá en UAT que se cumple" value={r.criterio} onChange={e => set(i, 'criterio', e.target.value)} />
        </div>
      ))}
      <button type="button" className="self-start text-[13px] font-medium text-[#1a4fa0] hover:underline" onClick={() => onChange([...list, nueva(list.length + 1)])}>+ Agregar requerimiento</button>
    </div>
  )
}

type Rt = { id: string; rf: string; descripcion: string; horas: string }
function RtEditor({ rows, rfIds, onChange }: { rows: Rt[]; rfIds: string[]; onChange: (r: Rt[]) => void }) {
  const nueva = (n: number): Rt => ({ id: `RT-${String(n).padStart(2, '0')}`, rf: rfIds[0] ?? '', descripcion: '', horas: '' })
  const list = rows.length ? rows : [nueva(1)]
  const set = (i: number, k: keyof Rt, v: string) => onChange(list.map((r, j) => j === i ? { ...r, [k]: v } : r))
  return (
    <div className="flex flex-col gap-2">
      {list.map((r, i) => (
        <div key={i} className="grid grid-cols-1 sm:grid-cols-[90px_110px_1fr_90px_auto] gap-2">
          <input aria-label="ID" className={`${inputCls} font-mono`} value={r.id} onChange={e => set(i, 'id', e.target.value)} />
          <select aria-label="Requerimiento funcional" className={inputCls} value={r.rf} onChange={e => set(i, 'rf', e.target.value)}>
            <option value="">RF…</option>{rfIds.map(id => <option key={id} value={id}>{id}</option>)}
          </select>
          <input className={inputCls} placeholder="Qué se construye o configura" value={r.descripcion} onChange={e => set(i, 'descripcion', e.target.value)} />
          <input aria-label="Horas" inputMode="decimal" className={inputCls} placeholder="Horas" value={r.horas} onChange={e => set(i, 'horas', e.target.value)} />
          <button type="button" aria-label="Quitar requerimiento" className={del} onClick={() => onChange(list.length > 1 ? list.filter((_, j) => j !== i) : [nueva(1)])}>✕</button>
        </div>
      ))}
      <button type="button" className="self-start text-[13px] font-medium text-[#1a4fa0] hover:underline" onClick={() => onChange([...list, nueva(list.length + 1)])}>+ Agregar requerimiento técnico</button>
    </div>
  )
}

function Botones({ busy, onSave, onGenerate }: { busy: boolean; onSave: () => void; onGenerate: () => void }) {
  return (
    <div className="flex flex-wrap gap-2 justify-end pt-4 mt-4 border-t border-slate-100">
      <button type="button" disabled={busy} className={btnSec} onClick={onSave}>Guardar borrador</button>
      <button type="button" disabled={busy} className={btnPri} onClick={onGenerate}>{busy ? 'Procesando…' : 'Generar PDF'}</button>
    </div>
  )
}

type FormProps = { inicial: any; ctx: any; rfIds: string[]; busy: boolean; onSave: (d: any) => void; onGenerate: (d: any) => void }

function FuncionalForm({ inicial, ctx, busy, onSave, onGenerate }: FormProps) {
  const [d, setD] = useState({
    sesiones: (inicial?.sesiones ?? []) as Sesion[], objetivo: inicial?.objetivo ?? ctx?.descripcion ?? '',
    proceso_actual: inicial?.proceso_actual ?? '', proceso_propuesto: inicial?.proceso_propuesto ?? '',
    requerimientos: (inicial?.requerimientos ?? []) as Rf[],
    reglas: Array.isArray(inicial?.reglas) ? inicial.reglas.map((x: string) => `- ${x}`).join('\n') : (inicial?.reglas ?? ''),
    pantallas: Array.isArray(inicial?.pantallas) ? inicial.pantallas.map((x: string) => `- ${x}`).join('\n') : (inicial?.pantallas ?? ''),
  })
  return (
    <div className="mt-4 pt-4 border-t border-slate-100">
      <Seccion titulo="Sesiones de entendimiento"><SesionesEditor items={d.sesiones} onChange={x => setD({ ...d, sesiones: x })} /></Seccion>
      <Seccion titulo="Objetivo"><textarea className={`${inputCls} min-h-17.5`} value={d.objetivo} onChange={e => setD({ ...d, objetivo: e.target.value })} /></Seccion>
      <Seccion titulo="Proceso">
        <Campo label="Proceso actual" hint="Cómo se hace hoy. Las líneas que empiezan con '-' se vuelven viñetas."><textarea className={`${inputCls} min-h-20`} value={d.proceso_actual} onChange={e => setD({ ...d, proceso_actual: e.target.value })} /></Campo>
        <Campo label="Proceso propuesto" req hint="Cómo se hará con el cambio."><textarea className={`${inputCls} min-h-20`} value={d.proceso_propuesto} onChange={e => setD({ ...d, proceso_propuesto: e.target.value })} /></Campo>
      </Seccion>
      <Seccion titulo="Requerimientos funcionales">
        <p className="text-[13px] text-slate-500 -mt-1">Cada requerimiento necesita un criterio de aceptación: es lo que el solicitante validará en las pruebas UAT.</p>
        <RfEditor rows={d.requerimientos} onChange={x => setD({ ...d, requerimientos: x })} />
      </Seccion>
      <Seccion titulo="Reglas de negocio">
        <Campo label="Reglas que el sistema debe respetar" hint="Las líneas que empiezan con '-' se vuelven viñetas en el PDF.">
          <textarea className={`${inputCls} min-h-27.5`} placeholder={"- El RFC es obligatorio y único por empresa"} value={d.reglas} onChange={e => setD({ ...d, reglas: e.target.value })} />
        </Campo>
      </Seccion>
      <Seccion titulo="Pantallas, reportes y procesos afectados">
        <Campo label="Pantallas, reportes o procesos que cambian" hint="Las líneas que empiezan con '-' se vuelven viñetas en el PDF.">
          <textarea className={`${inputCls} min-h-27.5`} placeholder={"- Alta de proveedores\n- Reporte de antigüedad de saldos"} value={d.pantallas} onChange={e => setD({ ...d, pantallas: e.target.value })} />
        </Campo>
      </Seccion>
      <Botones busy={busy} onSave={() => onSave(d)} onGenerate={() => onGenerate(d)} />
    </div>
  )
}

function TecnicoForm({ inicial, rfIds, busy, onSave, onGenerate }: FormProps) {
  const [d, setD] = useState({
    sesiones: (inicial?.sesiones ?? []) as Sesion[], solucion: inicial?.solucion ?? '',
    objetos: (inicial?.objetos ?? []) as Record<string, string>[], integraciones: inicial?.integraciones ?? '',
    requerimientos: (inicial?.requerimientos ?? []) as Rt[], plan_pruebas: Array.isArray(inicial?.plan_pruebas) ? inicial.plan_pruebas.map((x: string) => `- ${x}`).join('\n') : (inicial?.plan_pruebas ?? ''),
    riesgos: inicial?.riesgos ?? '',
  })
  return (
    <div className="mt-4 pt-4 border-t border-slate-100">
      <Seccion titulo="Sesiones de entendimiento"><SesionesEditor items={d.sesiones} onChange={x => setD({ ...d, sesiones: x })} /></Seccion>
      <Seccion titulo="Solución técnica">
        <Campo label="Descripción de la solución" req><textarea className={`${inputCls} min-h-22.5`} value={d.solucion} onChange={e => setD({ ...d, solucion: e.target.value })} /></Campo>
      </Seccion>
      <Seccion titulo="Objetos a crear o modificar">
        <TableEditor cols={[{ key: 'tipo', label: 'Tipo (rutina, PE, tabla…)' }, { key: 'nombre', label: 'Objeto' }, { key: 'accion', label: 'Crear / Modificar' }, { key: 'descripcion', label: 'Descripción' }]}
          rows={d.objetos} onChange={x => setD({ ...d, objetos: x })} addLabel="+ Agregar objeto" />
      </Seccion>
      <Seccion titulo="Integraciones"><textarea className={`${inputCls} min-h-15`} placeholder="Sistemas externos, servicios o interfaces involucradas" value={d.integraciones} onChange={e => setD({ ...d, integraciones: e.target.value })} /></Seccion>
      <Seccion titulo="Requerimientos técnicos">
        {rfIds.length
          ? <p className="text-[13px] text-slate-500 -mt-1">Liga cada requerimiento técnico a un RF del documento funcional: {rfIds.join(', ')}.</p>
          : <p className="text-[13px] text-amber-700 -mt-1">No se encontró un documento funcional generado para ligar los requerimientos.</p>}
        <RtEditor rows={d.requerimientos} rfIds={rfIds} onChange={x => setD({ ...d, requerimientos: x })} />
      </Seccion>
      <Seccion titulo="Plan de pruebas técnicas">
        <Campo label="Pruebas a realizar antes de UAT" hint="Las líneas que empiezan con '-' se vuelven viñetas en el PDF.">
          <textarea className={`${inputCls} min-h-30`} placeholder={"- Carga en ambiente de pruebas\n- Validar bitácora de errores"} value={d.plan_pruebas} onChange={e => setD({ ...d, plan_pruebas: e.target.value })} />
        </Campo>
      </Seccion>
      <Seccion titulo="Riesgos técnicos">
        <Campo label="Riesgos y cómo mitigarlos" hint="Las líneas que empiezan con '-' se vuelven viñetas en el PDF.">
          <textarea className={`${inputCls} min-h-30`} placeholder={"- Riesgo y su mitigación"} value={d.riesgos} onChange={e => setD({ ...d, riesgos: e.target.value })} />
        </Campo>
      </Seccion>
      <Botones busy={busy} onSave={() => onSave(d)} onGenerate={() => onGenerate(d)} />
    </div>
  )
}

export default function CdcDiseno({ incidentId, fase, onChanged }: { incidentId: string; fase: Fase; onChanged: () => void }) {
  const [data, setData] = useState<DisenoData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [reasignando, setReasignando] = useState(false)
  const [candidatos, setCandidatos] = useState<{ id: string; name: string; rol: string }[]>([])
  const [elegido, setElegido] = useState('')

  const load = useCallback(async () => {
    try { const r = await getDiseno(incidentId, fase); setData(r.data); setLoadError(null) }
    catch (e) { setLoadError(errMsg(e, 'No se pudo cargar la etapa')) }
  }, [incidentId, fase])
  useEffect(() => { load() }, [load])

  const run = async (key: string, fn: () => Promise<any>, okText?: string) => {
    setBusy(key); setMsg(null)
    try { await fn(); await load(); onChanged(); if (okText) setMsg({ ok: true, text: okText }); return true }
    catch (e) { setMsg({ ok: false, text: errMsg(e, 'No se pudo completar la acción') }); return false }
    finally { setBusy(null) }
  }

  if (loadError) return <div className="px-5 py-6 text-[13.5px] text-red-600">{loadError}</div>
  if (!data) return <div className="px-5 py-8 flex justify-center"><div className="w-5 h-5 border-2 border-slate-300 border-t-[#1a4fa0] rounded-full animate-spin" /></div>

  const cfg = FASE[fase]
  const doc = [...data.documentos].sort((a, b) => b.version - a.version)[0]
  const generado = doc?.estado === 'generado'
  const abrirPdf = async () => {
    if (!doc?.object_key) return
    const r = await getSignedUrl(doc.object_key, doc.bucket || 'dirdoc')
    const url = r.data?.data?.url || r.data?.url
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }
  const guardarYGenerar = async (d: any) => {
    if (await run('save', () => saveDisenoBorrador(incidentId, fase, d)) &&
        await run('gen', () => generarDiseno(incidentId, fase), `${cfg.doc} generado.`)) setAbierto(false)
  }
  const abrirReasignar = async () => {
    setReasignando(true)
    try { const r = await getDisenoCandidatos(incidentId); setCandidatos(r.data ?? []) } catch { setCandidatos([]) }
  }

  return (
    <div>
      <div className="px-5 py-5">
        {/* Responsable */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-[13.5px]">
            <p className="text-slate-500 text-[12.5px]">Responsable de la etapa</p>
            <p className="font-medium text-slate-900">{data.responsable?.name || 'Sin asignar'}</p>
            {data.project_manager?.name && <p className="text-xs text-slate-500 mt-0.5">Project Manager: {data.project_manager.name}</p>}
          </div>
          {data.puede_reasignar && !reasignando && <button type="button" className={btnSec} onClick={abrirReasignar}>Reasignar</button>}
        </div>
        {reasignando && (
          <div className="mt-3 flex flex-wrap gap-2 items-center">
            <select className={`${inputCls} !w-auto min-w-65`} value={elegido} onChange={e => setElegido(e.target.value)}>
              <option value="">Selecciona a quién asignar</option>
              {candidatos.map(c => <option key={c.id} value={c.id}>{c.name} · {c.rol}</option>)}
            </select>
            <button type="button" className={btnPri} disabled={!elegido || !!busy}
              onClick={async () => { if (await run('reasignar', () => reasignarDiseno(incidentId, elegido), 'Etapa reasignada y notificada.')) { setReasignando(false); setElegido('') } }}>Asignar</button>
            <button type="button" className="px-3 py-1.5 text-sm text-slate-600" onClick={() => setReasignando(false)}>Cancelar</button>
          </div>
        )}

        {/* Documento de la etapa */}
        <div className="border border-slate-200 rounded-xl px-4 py-3.5 bg-white mt-5">
          <div className="flex items-start gap-3">
            <span className={`w-8 h-10 rounded-[5px] flex items-end justify-center pb-1 text-[9px] font-semibold text-white shrink-0 ${generado ? 'bg-red-600' : 'bg-slate-300'}`}>PDF</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[14.5px] font-semibold text-slate-900">{cfg.doc}</p>
                <span className={`text-[11.5px] font-semibold px-2.5 py-0.5 rounded-full ${!doc ? 'bg-slate-100 text-slate-600' : generado ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                  {!doc ? 'Pendiente' : `${generado ? 'Generado' : 'Borrador'} v${doc.version}`}
                </span>
              </div>
              <p className="text-[12.5px] text-slate-500 mt-0.5">Registra tus sesiones de entendimiento y genera el documento. Puedes guardarlo como borrador y continuar después.</p>
              {generado && <p className="text-xs text-slate-500 mt-1 font-mono break-all">{doc.nombre}</p>}
            </div>
            <div className="flex gap-2 shrink-0">
              {generado && <button type="button" className={btnSec} onClick={abrirPdf}>Ver PDF</button>}
              {data.puede_editar && (
                <button type="button" className={btnSec} onClick={() => setAbierto(!abierto)}>
                  {abierto ? 'Cerrar' : generado ? 'Nueva versión' : doc ? 'Continuar' : 'Capturar'}
                </button>
              )}
            </div>
          </div>
          {!data.puede_editar && (
            <p className="mt-3 text-[13px] text-slate-500 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" />Esta etapa la atiende {data.responsable?.name || 'el responsable asignado'}.</p>
          )}
          {abierto && data.puede_editar && (() => {
            const props: FormProps = {
              inicial: doc?.datos, ctx: data.contexto, rfIds: data.rf_ids, busy: !!busy,
              onSave: d => run('save', () => saveDisenoBorrador(incidentId, fase, d), 'Borrador guardado. Puedes continuar después.'),
              onGenerate: guardarYGenerar,
            }
            return fase === 'funcional' ? <FuncionalForm {...props} /> : <TecnicoForm {...props} />
          })()}
          {msg && <p role="status" className={`mt-3 text-[13px] font-medium ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.text}</p>}
        </div>
      </div>

      {data.puede_editar && (
        <footer className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          {confirmando ? (
            <>
              <p className="text-[13.5px] text-slate-700">¿Cerrar la etapa? El proyecto pasa a <b>{cfg.siguiente}</b>.</p>
              <div className="flex gap-2">
                <button type="button" disabled={!!busy} className="px-4 py-2 text-sm text-slate-600" onClick={() => setConfirmando(false)}>Volver</button>
                <button type="button" disabled={!!busy} className={btnPri}
                  onClick={async () => { await run('cerrar', () => cerrarDiseno(incidentId, fase), 'Etapa cerrada.'); setConfirmando(false) }}>
                  {busy === 'cerrar' ? 'Cerrando…' : 'Sí, cerrar etapa'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className={`text-[12.5px] max-w-[52ch] ${generado ? 'text-slate-500' : 'text-amber-700'}`}>
                {generado ? 'El documento está generado. Cuando termines, cierra la etapa.' : `Genera el ${cfg.doc} para poder cerrar la etapa.`}
              </p>
              <button type="button" disabled={!generado || !!busy} className={btnPri} onClick={() => setConfirmando(true)}>Cerrar etapa</button>
            </>
          )}
        </footer>
      )}
    </div>
  )
}
