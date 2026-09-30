'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  getArranque, setArranqueClasificacion, saveArranqueBorrador, generarArranqueDoc, subirArranqueDoc, iniciarDesarrollo,
} from '@/services/itServiceDeskService'
import { getSignedUrl } from '@/services/uploadService'
import { Check, Lock } from 'lucide-react'

interface Doc {
  id: string; tipo: string; label: string; version: number; estado: 'borrador' | 'generado' | 'subido'; origen: string
  datos: any; nombre: string | null; object_key: string | null; bucket: string; creado_por_nombre: string; created_at: string
}
interface ArranqueData {
  status: string; clasificacion: string | null; requisitos: string[]; faltantes: string[]; documentos: Doc[]
  permitir_documento_propio: boolean; formatos_disponibles: string[]; contexto: any
}

const LABEL: Record<string, string> = {
  plan_breve: 'Plan de arranque', acta: 'Acta de Constitución', alcance: 'Alcance del proyecto', resumen: 'Resumen ejecutivo y técnico',
  cronograma: 'Cronograma', diagrama: 'Diagramas', otro: 'Documentos de soporte', acta_firmada: 'Acta firmada', clasificacion: 'Clasificación',
}
const DESC: Record<string, string> = {
  plan_breve: 'Fecha de inicio, responsable, objetivo y entregables. Genera un PDF de una página.',
  acta: 'Información general, objetivo y alcance, stakeholders y roles, supuestos y restricciones, aprobaciones.',
  alcance: 'Visión general del proyecto, qué incluye, qué no incluye y requerimientos.',
  resumen: 'Componentes y tecnologías, fases de implementación y requerimientos de infraestructura.',
}
const inputCls = 'w-full bg-white border-[1.5px] border-slate-200 rounded-[10px] px-3 py-2 text-sm outline-none transition focus:border-[#1a4fa0] focus:ring-[3.5px] focus:ring-[#1a4fa0]/10'
const btnSec = 'bg-white border-[1.5px] border-slate-300 text-slate-700 rounded-lg px-3 py-1.5 text-[13px] font-medium hover:border-[#1a4fa0] hover:text-[#1a4fa0] disabled:opacity-40 disabled:cursor-not-allowed'
const btnPri = 'bg-[#1a4fa0] text-white rounded-lg px-3.5 py-1.5 text-[13px] font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed'
const ddmm = (iso: string | null | undefined) => { if (!iso) return '—'; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }
const errMsg = (err: any, fallback: string) => { const d = err?.response?.data?.detail; return typeof d === 'string' ? d : fallback }

const vigente = (docs: Doc[], tipo: string) => docs.filter(d => d.tipo === tipo).sort((a, b) => b.version - a.version)[0]

async function openDoc(d: Doc) {
  if (!d.object_key) return
  const r = await getSignedUrl(d.object_key, d.bucket || 'dirdoc')
  const url = r.data?.data?.url || r.data?.url
  if (url) window.open(url, '_blank', 'noopener,noreferrer')
}

function Chip({ doc, opcional }: { doc?: Doc; opcional?: boolean }) {
  if (!doc) return <span className={`text-[11.5px] font-semibold px-2.5 py-0.5 rounded-full ${opcional ? 'bg-slate-50 text-slate-500 border border-slate-200' : 'bg-slate-100 text-slate-600'}`}>{opcional ? 'Opcional' : 'Pendiente'}</span>
  const m = doc.estado === 'borrador' ? ['Borrador', 'bg-amber-100 text-amber-800'] : [doc.estado === 'subido' ? 'Subido' : 'Generado', 'bg-emerald-100 text-emerald-800']
  return <span className={`text-[11.5px] font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap ${m[1]}`}>{m[0]} v{doc.version}</span>
}

function FileBadge({ nombre, pdf }: { nombre?: string | null; pdf?: boolean }) {
  const ext = pdf ? 'PDF' : (nombre?.split('.').pop() ?? 'doc').slice(0, 4).toUpperCase()
  return <span className={`w-8 h-10 rounded-[5px] flex items-end justify-center pb-1 text-[8.5px] font-semibold text-white shrink-0 ${pdf ? 'bg-red-600' : 'bg-slate-500'}`}>{ext}</span>
}

function PlanBreveEditor({ inicial, fechaCompromiso, busy, onSave, onGenerate }: {
  inicial: any; fechaCompromiso: string | null; busy: boolean; onSave: (d: any) => void; onGenerate: (d: any) => void
}) {
  const [d, setD] = useState({
    fecha_inicio: inicial?.fecha_inicio ?? '', responsable: inicial?.responsable ?? '', objetivo: inicial?.objetivo ?? '',
    entregables: (inicial?.entregables?.length ? inicial.entregables : [{ descripcion: '', fecha: '' }]) as { descripcion: string; fecha: string }[],
    consideraciones: inicial?.consideraciones ?? '',
  })
  const setEnt = (i: number, k: 'descripcion' | 'fecha', v: string) => setD(x => ({ ...x, entregables: x.entregables.map((e, j) => j === i ? { ...e, [k]: v } : e) }))
  return (
    <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label className="block text-[13px] font-medium text-slate-700 mb-1.5">Inicio de desarrollo<span className="text-red-600">*</span></label>
        <input type="date" max={fechaCompromiso ?? undefined} className={inputCls} value={d.fecha_inicio} onChange={e => setD({ ...d, fecha_inicio: e.target.value })} />
      </div>
      <div>
        <label className="block text-[13px] font-medium text-slate-700 mb-1.5">Responsable<span className="text-red-600">*</span></label>
        <input className={inputCls} placeholder="Persona o empresa a cargo" value={d.responsable} onChange={e => setD({ ...d, responsable: e.target.value })} />
      </div>
      <div className="sm:col-span-2">
        <label className="block text-[13px] font-medium text-slate-700 mb-1.5">Objetivo<span className="text-red-600">*</span></label>
        <textarea className={`${inputCls} min-h-[70px]`} placeholder="Qué se va a lograr con este cambio" value={d.objetivo} onChange={e => setD({ ...d, objetivo: e.target.value })} />
      </div>
      <div className="sm:col-span-2">
        <label className="block text-[13px] font-medium text-slate-700 mb-1.5">Entregables<span className="text-red-600">*</span></label>
        <div className="flex flex-col gap-2">
          {d.entregables.map((e, i) => (
            <div key={i} className="grid grid-cols-[1fr_150px_auto] gap-2">
              <input className={inputCls} placeholder={`Entregable ${i + 1}`} value={e.descripcion} onChange={ev => setEnt(i, 'descripcion', ev.target.value)} />
              <input type="date" className={inputCls} value={e.fecha} onChange={ev => setEnt(i, 'fecha', ev.target.value)} />
              <button type="button" aria-label="Quitar entregable" className="px-2 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"
                onClick={() => setD(x => ({ ...x, entregables: x.entregables.length > 1 ? x.entregables.filter((_, j) => j !== i) : [{ descripcion: '', fecha: '' }] }))}>✕</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setD(x => ({ ...x, entregables: [...x.entregables, { descripcion: '', fecha: '' }] }))} className="mt-2 text-[13px] font-medium text-[#1a4fa0] hover:underline">+ Agregar entregable</button>
      </div>
      <div className="sm:col-span-2">
        <label className="block text-[13px] font-medium text-slate-700 mb-1.5">Consideraciones <span className="font-normal text-slate-400">(opcional)</span></label>
        <textarea className={`${inputCls} min-h-[60px]`} placeholder="Ventanas de liberación, dependencias, comunicación a usuarios…" value={d.consideraciones} onChange={e => setD({ ...d, consideraciones: e.target.value })} />
      </div>
      <div className="sm:col-span-2 flex flex-wrap gap-2 justify-end">
        <button type="button" disabled={busy} className={btnSec} onClick={() => onSave(d)}>Guardar borrador</button>
        <button type="button" disabled={busy} className={btnPri} onClick={() => onGenerate(d)}>{busy ? 'Procesando…' : 'Generar PDF'}</button>
      </div>
    </div>
  )
}

// ── Editores del paquete de Proyecto ─────────────────────────────────
type EditorProps = { inicial: any; ctx: any; busy: boolean; onSave: (d: any) => void; onGenerate: (d: any) => void }
interface Col { key: string; label: string }
const lineas = (t?: string | null) => (t ?? '').split('\n').map(x => x.replace(/^[-•]\s*/, '').trim()).filter(Boolean)

function Campo({ label, hint, req, children }: { label: string; hint?: string; req?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-slate-700 mb-1.5">{label}{req && <span className="text-red-600">*</span>}</label>
      {children}
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  )
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="pt-4 mt-4 border-t border-slate-100 first:border-t-0 first:mt-0 first:pt-0">
      <h5 className="text-[13.5px] font-semibold text-[#1a4fa0] uppercase tracking-wide mb-3">{titulo}</h5>
      <div className="grid gap-4">{children}</div>
    </div>
  )
}

function ListEditor({ items, onChange, placeholder, addLabel }: { items: string[]; onChange: (x: string[]) => void; placeholder: string; addLabel: string }) {
  const list = items.length ? items : ['']
  return (
    <div className="flex flex-col gap-2">
      {list.map((it, i) => (
        <div key={i} className="flex gap-2">
          <input className={inputCls} placeholder={placeholder} value={it} onChange={e => onChange(list.map((x, j) => j === i ? e.target.value : x))} />
          <button type="button" aria-label="Quitar" className="px-2 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"
            onClick={() => onChange(list.length > 1 ? list.filter((_, j) => j !== i) : [''])}>✕</button>
        </div>
      ))}
      <button type="button" className="self-start text-[13px] font-medium text-[#1a4fa0] hover:underline" onClick={() => onChange([...list, ''])}>{addLabel}</button>
    </div>
  )
}

function TableEditor({ cols, rows, onChange, addLabel }: { cols: Col[]; rows: Record<string, string>[]; onChange: (r: Record<string, string>[]) => void; addLabel: string }) {
  const vacia = () => Object.fromEntries(cols.map(c => [c.key, ''])) as Record<string, string>
  const list = rows.length ? rows : [vacia()]
  const tpl = { gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr)) 28px` }
  const set = (i: number, k: string, v: string) => onChange(list.map((r, j) => j === i ? { ...r, [k]: v } : r))
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[620px] flex flex-col gap-2">
        <div className="grid gap-2 text-[12px] font-medium text-slate-500 px-0.5" style={tpl}>{cols.map(c => <span key={c.key}>{c.label}</span>)}<span /></div>
        {list.map((r, i) => (
          <div key={i} className="grid gap-2 items-start" style={tpl}>
            {cols.map(c => <input key={c.key} aria-label={c.label} className={inputCls} value={r[c.key] ?? ''} onChange={e => set(i, c.key, e.target.value)} />)}
            <button type="button" aria-label="Quitar fila" className="h-9 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"
              onClick={() => onChange(list.length > 1 ? list.filter((_, j) => j !== i) : [vacia()])}>✕</button>
          </div>
        ))}
        <button type="button" className="self-start text-[13px] font-medium text-[#1a4fa0] hover:underline" onClick={() => onChange([...list, vacia()])}>{addLabel}</button>
      </div>
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

function ActaEditor({ inicial, ctx, busy, onSave, onGenerate }: EditorProps) {
  const gob = ctx?.gobierno ?? {}
  const nom = (k: string): string => gob[k]?.name ?? ''
  const base: [string, string, string][] = [
    ['patrocinador', 'Patrocinador', 'Aprobaciones y respaldo de recursos'],
    ['gerente_proyecto', 'Gerente del proyecto', 'Planificación y ejecución'],
    ['project_manager', 'Project Manager', 'Seguimiento de avances y fechas'],
    ['lider_tecnico', 'Líder técnico', 'Solución técnica'],
    ['validador', 'Usuario validador', 'Validación en pruebas (UAT)'],
  ]
  const stakeDefault: Record<string, string>[] = base.filter(([k]) => nom(k)).map(([k, rol, resp]) => ({ nombre: nom(k), rol, area: '', responsabilidad: resp }))
  if (ctx?.solicitante?.nombre) stakeDefault.push({ nombre: ctx.solicitante.nombre, rol: 'Solicitante', area: ctx.solicitante.area ?? '', responsabilidad: 'Usuario final del proyecto' })

  const [d, setD] = useState({
    codigo: inicial?.codigo ?? ctx?.folio ?? '', area: inicial?.area ?? ctx?.area ?? '', estado: inicial?.estado ?? 'En planificación',
    objetivo: inicial?.objetivo ?? ctx?.descripcion ?? '',
    incluye: (inicial?.incluye ?? lineas(ctx?.alcance_propuesto)) as string[],
    excluye: (inicial?.excluye ?? []) as string[],
    stakeholders: (inicial?.stakeholders ?? stakeDefault) as Record<string, string>[],
    supuestos: (inicial?.supuestos ?? []) as string[],
    restricciones: (inicial?.restricciones ?? lineas(ctx?.riesgos)) as string[],
  })
  const faltan = ['patrocinador', 'gerente_proyecto', 'project_manager'].filter(k => !nom(k))
  return (
    <div className="mt-4 pt-4 border-t border-slate-100">
      <Seccion titulo="1. Información general del proyecto">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] grid sm:grid-cols-3 gap-2">
          <div><span className="block text-slate-500">Patrocinador</span>{nom('patrocinador') || '—'}</div>
          <div><span className="block text-slate-500">Gerente del proyecto</span>{nom('gerente_proyecto') || '—'}</div>
          <div><span className="block text-slate-500">Project Manager</span>{nom('project_manager') || '—'}</div>
          <p className="sm:col-span-3 text-xs text-slate-500">Vienen de los roles asignados en la priorización.</p>
        </div>
        {faltan.length > 0 && <p className="text-[13px] text-red-600">Faltan roles en la priorización; el acta no se podrá generar.</p>}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Campo label="Código / ID"><input className={inputCls} value={d.codigo} onChange={e => setD({ ...d, codigo: e.target.value })} /></Campo>
          <Campo label="Área / Departamento"><input className={inputCls} value={d.area} onChange={e => setD({ ...d, area: e.target.value })} /></Campo>
          <Campo label="Estado"><input className={inputCls} value={d.estado} onChange={e => setD({ ...d, estado: e.target.value })} /></Campo>
        </div>
      </Seccion>
      <Seccion titulo="2. Objetivo">
        <Campo label="2.1 Objetivo del proyecto" req><textarea className={`${inputCls} min-h-[80px]`} value={d.objetivo} onChange={e => setD({ ...d, objetivo: e.target.value })} /></Campo>
        <Campo label="2.2 Alcance (dentro del proyecto)" req><ListEditor items={d.incluye} onChange={x => setD({ ...d, incluye: x })} placeholder="Qué sí incluye" addLabel="+ Agregar punto" /></Campo>
        <Campo label="2.3 Fuera del alcance (exclusiones)"><ListEditor items={d.excluye} onChange={x => setD({ ...d, excluye: x })} placeholder="Qué no incluye" addLabel="+ Agregar exclusión" /></Campo>
      </Seccion>
      <Seccion titulo="3. Stakeholders y roles">
        <TableEditor cols={[{ key: 'nombre', label: 'Nombre' }, { key: 'rol', label: 'Rol / Cargo' }, { key: 'area', label: 'Área' }, { key: 'responsabilidad', label: 'Responsabilidad' }]}
          rows={d.stakeholders} onChange={x => setD({ ...d, stakeholders: x })} addLabel="+ Agregar stakeholder" />
      </Seccion>
      <Seccion titulo="4. Supuestos y restricciones">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo label="Supuestos"><ListEditor items={d.supuestos} onChange={x => setD({ ...d, supuestos: x })} placeholder="Lo que se da por hecho" addLabel="+ Agregar supuesto" /></Campo>
          <Campo label="Restricciones"><ListEditor items={d.restricciones} onChange={x => setD({ ...d, restricciones: x })} placeholder="Límites del proyecto" addLabel="+ Agregar restricción" /></Campo>
        </div>
      </Seccion>
      <Seccion titulo="5. Aprobaciones">
        <p className="text-[13px] text-slate-600">Patrocinador, gerente del proyecto y PM firman sobre el acta impresa; después se sube como "Acta firmada".</p>
      </Seccion>
      <Botones busy={busy} onSave={() => onSave(d)} onGenerate={() => onGenerate(d)} />
    </div>
  )
}

function AlcanceEditor({ inicial, ctx, busy, onSave, onGenerate }: EditorProps) {
  const [d, setD] = useState({
    vision_general: inicial?.vision_general ?? ctx?.descripcion ?? '',
    secciones: (inicial?.secciones ?? []) as { titulo: string; contenido: string }[],
  })
  const setSec = (i: number, k: 'titulo' | 'contenido', v: string) => setD(x => ({ ...x, secciones: x.secciones.map((s, j) => j === i ? { ...s, [k]: v } : s) }))
  return (
    <div className="mt-4 pt-4 border-t border-slate-100">
      <Seccion titulo="Visión general">
        <Campo label="Descripción general del alcance" req hint="Las líneas que empiezan con '-' se vuelven viñetas en el PDF.">
          <textarea className={`${inputCls} min-h-[110px]`} value={d.vision_general} onChange={e => setD({ ...d, vision_general: e.target.value })} />
        </Campo>
      </Seccion>
      <Seccion titulo="Secciones del documento">
        <p className="text-[13px] text-slate-500 -mt-1">Agrega las que necesites, por ejemplo: Modelo de administración, Módulos incluidos, Infraestructura, Seguridad.</p>
        {d.secciones.map((s, i) => (
          <div key={i} className="border border-slate-200 rounded-xl p-3.5 grid gap-2.5 bg-slate-50/60">
            <div className="flex gap-2">
              <input className={inputCls} placeholder="Título de la sección" value={s.titulo} onChange={e => setSec(i, 'titulo', e.target.value)} />
              <button type="button" aria-label="Quitar sección" className="px-2 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"
                onClick={() => setD(x => ({ ...x, secciones: x.secciones.filter((_, j) => j !== i) }))}>✕</button>
            </div>
            <textarea className={`${inputCls} min-h-[80px]`} placeholder="Contenido. Usa '-' al inicio de la línea para viñetas." value={s.contenido} onChange={e => setSec(i, 'contenido', e.target.value)} />
          </div>
        ))}
        <button type="button" className="self-start text-[13px] font-medium text-[#1a4fa0] hover:underline"
          onClick={() => setD(x => ({ ...x, secciones: [...x.secciones, { titulo: '', contenido: '' }] }))}>+ Agregar sección</button>
      </Seccion>
      <Botones busy={busy} onSave={() => onSave(d)} onGenerate={() => onGenerate(d)} />
    </div>
  )
}

function ResumenEditor({ inicial, ctx, busy, onSave, onGenerate }: EditorProps) {
  const [d, setD] = useState({
    resumen: inicial?.resumen ?? ctx?.justificacion ?? '',
    componentes: (inicial?.componentes ?? []) as Record<string, string>[],
    arquitectura: inicial?.arquitectura ?? '',
    fases: (inicial?.fases ?? []) as Record<string, string>[],
    infraestructura: (inicial?.infraestructura ?? []) as Record<string, string>[],
  })
  return (
    <div className="mt-4 pt-4 border-t border-slate-100">
      <Seccion titulo="Resumen ejecutivo">
        <Campo label="Qué se hace y por qué" hint="Para la dirección: un párrafo corto."><textarea className={`${inputCls} min-h-[80px]`} value={d.resumen} onChange={e => setD({ ...d, resumen: e.target.value })} /></Campo>
      </Seccion>
      <Seccion titulo="Stack tecnológico">
        <TableEditor cols={[{ key: 'categoria', label: 'Categoría' }, { key: 'componente', label: 'Componente' }, { key: 'tecnologia', label: 'Tecnología' }, { key: 'funcion', label: 'Función específica' }]}
          rows={d.componentes} onChange={x => setD({ ...d, componentes: x })} addLabel="+ Agregar componente" />
      </Seccion>
      <Seccion titulo="Arquitectura de alto nivel">
        <Campo label="Descripción" hint="Los diagramas que subas en el expediente se mencionan automáticamente en esta sección."><textarea className={`${inputCls} min-h-[70px]`} value={d.arquitectura} onChange={e => setD({ ...d, arquitectura: e.target.value })} /></Campo>
      </Seccion>
      <Seccion titulo="Fases de implementación">
        <TableEditor cols={[{ key: 'fase', label: 'Fase' }, { key: 'nombre', label: 'Nombre' }, { key: 'componentes', label: 'Componentes' }, { key: 'entregable', label: 'Entregable' }]}
          rows={d.fases} onChange={x => setD({ ...d, fases: x })} addLabel="+ Agregar fase" />
      </Seccion>
      <Seccion titulo="Requerimientos de infraestructura">
        <TableEditor cols={[{ key: 'recurso', label: 'Recurso' }, { key: 'especificacion', label: 'Especificación' }, { key: 'proposito', label: 'Propósito' }]}
          rows={d.infraestructura} onChange={x => setD({ ...d, infraestructura: x })} addLabel="+ Agregar recurso" />
      </Seccion>
      <Botones busy={busy} onSave={() => onSave(d)} onGenerate={() => onGenerate(d)} />
    </div>
  )
}

export default function CdcArranque({ incidentId, fechaCompromiso, onChanged }: { incidentId: string; fechaCompromiso: string | null; onChanged: () => void }) {
  const [data, setData] = useState<ArranqueData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [cronoFile, setCronoFile] = useState<File | null>(null)
  const [cronoFin, setCronoFin] = useState('')
  const [diagTipo, setDiagTipo] = useState('Flujo')

  const load = useCallback(async () => {
    try { const r = await getArranque(incidentId); setData(r.data); setLoadError(null) }
    catch (e) { setLoadError(errMsg(e, 'No se pudo cargar el arranque')) }
    finally { setLoading(false) }
  }, [incidentId])
  useEffect(() => { load() }, [load])

  const run = async (key: string, fn: () => Promise<any>, okText?: string) => {
    setBusy(key); setMsg(null)
    try { await fn(); await load(); onChanged(); if (okText) setMsg({ ok: true, text: okText }); return true }
    catch (e) { setMsg({ ok: false, text: errMsg(e, 'No se pudo completar la acción') }); return false }
    finally { setBusy(null) }
  }

  if (loading) return <div className="px-5 py-8 flex justify-center"><div className="w-5 h-5 border-2 border-slate-300 border-t-[#1a4fa0] rounded-full animate-spin" /></div>
  if (loadError || !data) return <div className="px-5 py-6 text-[13.5px] text-red-600">{loadError}</div>

  // CDC priorizados antes de que existiera la clasificación
  if (!data.clasificacion) {
    return (
      <div className="px-5 py-5">
        <h4 className="text-[14.5px] font-semibold text-slate-900">¿Cómo se va a gestionar?</h4>
        <p className="text-[13px] text-slate-500 mt-0.5 mb-3 max-w-[62ch]">Este proyecto se priorizó antes de que existiera la clasificación. Elige una para continuar con el arranque.</p>
        <div className="flex flex-wrap gap-2">
          {[['cambio', 'Cambio'], ['proyecto', 'Proyecto']].map(([v, l]) => (
            <button key={v} type="button" disabled={!!busy} className={btnSec}
              onClick={() => run('clasif', () => setArranqueClasificacion(incidentId, v), `Clasificado como ${l}.`)}>{l}</button>
          ))}
        </div>
        {msg && <p className={`mt-3 text-[13px] ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.text}</p>}
      </div>
    )
  }

  const docs = data.documentos
  const esProyecto = data.clasificacion === 'proyecto'
  const formales = esProyecto ? ['acta', 'alcance', 'resumen'] : ['plan_breve']
  const cumplidos = data.requisitos.length - data.faltantes.filter(f => f !== 'clasificacion').length
  const actaGenerada = vigente(docs, 'acta')?.estado === 'generado'

  const guardarYGenerar = async (tipo: string, datos: any) => {
    const ok = await run(`save:${tipo}`, () => saveArranqueBorrador(incidentId, tipo, datos))
    if (ok && await run(`gen:${tipo}`, () => generarArranqueDoc(incidentId, tipo), `${LABEL[tipo]} generado.`)) setAbierto(null)
  }
  const subir = (tipo: string, file: File, extra: Record<string, string> = {}) => {
    const fd = new FormData()
    fd.append('file', file)
    Object.entries(extra).forEach(([k, v]) => fd.append(k, v))
    return run(`up:${tipo}`, () => subirArranqueDoc(incidentId, tipo, fd), `${file.name} agregado al expediente.`)
  }

  const docCard = (tipo: string) => {
    const doc = vigente(docs, tipo)
    const disponible = data.formatos_disponibles.includes(tipo)
    const open = abierto === tipo
    return (
      <div key={tipo} className="border border-slate-200 rounded-xl px-4 py-3.5 bg-white">
        <div className="flex items-start gap-3">
          <FileBadge pdf />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap"><p className="text-[14.5px] font-semibold text-slate-900">{LABEL[tipo]}</p><Chip doc={doc} /></div>
            <p className="text-[12.5px] text-slate-500 mt-0.5">{DESC[tipo]}</p>
            {doc?.estado === 'generado' && <p className="text-xs text-slate-500 mt-1 font-mono break-all">{doc.nombre}</p>}
            {!disponible && <p className="text-xs text-amber-700 mt-1">Formato disponible en la siguiente entrega.</p>}
          </div>
          <div className="flex gap-2 shrink-0">
            {doc?.estado === 'generado' && <button type="button" className={btnSec} onClick={() => openDoc(doc)}>Ver PDF</button>}
            {disponible && (
              <button type="button" className={btnSec} onClick={() => setAbierto(open ? null : tipo)}>
                {open ? 'Cerrar' : doc?.estado === 'generado' ? 'Nueva versión' : doc?.estado === 'borrador' ? 'Continuar' : 'Capturar'}
              </button>
            )}
          </div>
        </div>
        {open && (() => {
          const onSave = (d: any) => run(`save:${tipo}`, () => saveArranqueBorrador(incidentId, tipo, d), 'Borrador guardado. Puedes continuar después.')
          const onGenerate = (d: any) => guardarYGenerar(tipo, d)
          const props = { inicial: doc?.datos, ctx: data.contexto, busy: !!busy, onSave, onGenerate }
          if (tipo === 'plan_breve') return <PlanBreveEditor inicial={doc?.datos} fechaCompromiso={fechaCompromiso} busy={!!busy} onSave={onSave} onGenerate={onGenerate} />
          if (tipo === 'acta') return <ActaEditor {...props} />
          if (tipo === 'alcance') return <AlcanceEditor {...props} />
          if (tipo === 'resumen') return <ResumenEditor {...props} />
          return null
        })()}
        {doc?.estado === 'generado' && open && <p className="text-xs text-slate-500 mt-2">Al guardar se crea la versión {doc.version + 1}; la versión {doc.version} se conserva en el expediente.</p>}
      </div>
    )
  }

  const listaSubidos = (tipo: string) => {
    const lista = docs.filter(d => d.tipo === tipo)
    if (!lista.length) return null
    return (
      <ul className="mt-2.5 flex flex-col gap-1.5">
        {lista.map(d => (
          <li key={d.id} className="flex items-center gap-2.5 text-[13.5px] border border-slate-200 rounded-lg px-3 py-1.5">
            {d.datos?.descripcion && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">{d.datos.descripcion}</span>}
            <span className="flex-1 truncate">{d.nombre}</span>
            {d.datos?.fecha_fin && <span className="text-xs text-slate-500">termina {ddmm(d.datos.fecha_fin)}</span>}
            <span className="text-xs text-slate-400">v{d.version}</span>
            <button type="button" className="text-[13px] font-medium text-[#1a4fa0] hover:underline" onClick={() => openDoc(d)}>Ver</button>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div>
      <div className="px-5 py-5">
        {/* Checklist */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 mb-6">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-2.5">
            <p className="text-[13.5px] font-semibold text-slate-800">Para iniciar desarrollo</p>
            <span className={`text-[12.5px] font-semibold px-3 py-0.5 rounded-full ${data.faltantes.length ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{cumplidos} de {data.requisitos.length}</span>
          </div>
          <ul className="flex flex-wrap gap-2">
            {data.requisitos.map(t => {
              const ok = !data.faltantes.includes(t)
              return (
                <li key={t} className={`inline-flex items-center gap-1.5 text-[13px] px-2.5 py-1 rounded-lg border bg-white ${ok ? 'border-emerald-200 text-emerald-700' : 'border-slate-200 text-slate-600'}`}>
                  {ok ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : <span className="w-3 h-3 rounded-full border-2 border-slate-300" />}{LABEL[t]}
                </li>
              )
            })}
          </ul>
        </div>

        {/* Documentos del sistema */}
        <h4 className="text-[14.5px] font-semibold text-slate-900">Documentos del sistema</h4>
        <p className="text-[13px] text-slate-500 mt-0.5 mb-3">Se generan con el formato de la intranet. Cada uno se guarda por separado: puedes dejarlo en borrador y continuar después.</p>
        <div className="grid gap-3">{formales.map(docCard)}</div>

        {/* Documentos que se suben */}
        <h4 className="text-[14.5px] font-semibold text-slate-900 mt-7">Documentos que se suben</h4>
        <p className="text-[13px] text-slate-500 mt-0.5 mb-3">Los trabajas en tu herramienta y los adjuntas aquí. Máximo 20 MB por archivo. Si subes uno equivocado, sube la versión correcta: la anterior queda en el historial.</p>
        <div className="grid gap-3">
          {/* Cronograma */}
          <div className="border border-slate-200 rounded-xl px-4 py-3.5 bg-white">
            <div className="flex items-center gap-2 flex-wrap"><p className="text-[14.5px] font-semibold text-slate-900">Cronograma</p><Chip doc={vigente(docs, 'cronograma')} opcional={!esProyecto} /></div>
            <p className="text-[12.5px] text-slate-500 mt-0.5">Súbelo en tu formato (MS Project .mpp, XML, PDF o Excel). Indica su fecha de término para validarla contra la entrega comprometida{fechaCompromiso ? ` (${ddmm(fechaCompromiso)})` : ''}.</p>
            {listaSubidos('cronograma')}
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_170px_auto] gap-2 items-end">
              <div>
                <label className="block text-[12px] text-slate-500 mb-1">Archivo</label>
                <input type="file" accept=".mpp,.xml,.pdf,.xlsx,.xls" onChange={e => setCronoFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-[13px] text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-slate-700" />
              </div>
              <div>
                <label className="block text-[12px] text-slate-500 mb-1">Término según cronograma</label>
                <input type="date" max={fechaCompromiso ?? undefined} className={inputCls} value={cronoFin} onChange={e => setCronoFin(e.target.value)} />
              </div>
              <button type="button" disabled={!cronoFile || !cronoFin || !!busy} className={btnSec}
                onClick={async () => { if (cronoFile && await subir('cronograma', cronoFile, { fecha_fin: cronoFin })) { setCronoFile(null); setCronoFin('') } }}>
                {vigente(docs, 'cronograma') ? 'Subir nueva versión' : 'Subir'}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2">Sugerencia: sube también la exportación del Gantt en PDF como documento de soporte, para quien no tenga MS Project.</p>
          </div>

          {/* Diagramas */}
          <div className="border border-slate-200 rounded-xl px-4 py-3.5 bg-white">
            <div className="flex items-center gap-2 flex-wrap"><p className="text-[14.5px] font-semibold text-slate-900">Diagramas</p><Chip opcional /></div>
            <p className="text-[12.5px] text-slate-500 mt-0.5">Flujo, arquitectura o BPMN, en Visio, draw.io, PDF o imagen.</p>
            {listaSubidos('diagrama')}
            <div className="mt-3 flex flex-wrap gap-2 items-center">
              <select className={`${inputCls} !w-auto`} value={diagTipo} onChange={e => setDiagTipo(e.target.value)}>
                {['Flujo', 'Arquitectura', 'BPMN', 'Otro'].map(t => <option key={t}>{t}</option>)}
              </select>
              <label className={`${btnSec} cursor-pointer`}>Subir archivo
                <input type="file" className="hidden" disabled={!!busy} onChange={e => { const f = e.target.files?.[0]; if (f) subir('diagrama', f, { descripcion: diagTipo }); e.target.value = '' }} />
              </label>
            </div>
          </div>

          {/* Soporte */}
          <div className="border border-slate-200 rounded-xl px-4 py-3.5 bg-white">
            <div className="flex items-center gap-2 flex-wrap"><p className="text-[14.5px] font-semibold text-slate-900">Documentos de soporte</p><Chip opcional /></div>
            <p className="text-[12.5px] text-slate-500 mt-0.5">Cotizaciones, minutas, exportación del Gantt en PDF…</p>
            {listaSubidos('otro')}
            <label className={`${btnSec} cursor-pointer inline-block mt-3`}>Subir archivo
              <input type="file" className="hidden" disabled={!!busy} onChange={e => { const f = e.target.files?.[0]; if (f) subir('otro', f); e.target.value = '' }} />
            </label>
          </div>

          {/* Acta firmada */}
          {esProyecto && (
            <div className={`rounded-xl px-4 py-3.5 border ${actaGenerada ? 'border-slate-200 bg-white' : 'border-dashed border-slate-300 bg-slate-50'}`}>
              <div className="flex items-center gap-2 flex-wrap"><p className="text-[14.5px] font-semibold text-slate-900">Acta firmada</p><Chip doc={vigente(docs, 'acta_firmada')} /></div>
              <p className="text-[12.5px] text-slate-500 mt-0.5">{actaGenerada
                ? 'Imprime el acta generada, recaba las firmas del patrocinador, el gerente del proyecto y el PM, y súbela escaneada.'
                : 'Se habilita cuando generes el Acta de Constitución: se imprime, se firma y se sube aquí.'}</p>
              {listaSubidos('acta_firmada')}
              {actaGenerada ? (
                <label className={`${btnSec} cursor-pointer inline-block mt-3`}>{vigente(docs, 'acta_firmada') ? 'Subir nueva versión' : 'Subir'}
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" disabled={!!busy} onChange={e => { const f = e.target.files?.[0]; if (f) subir('acta_firmada', f); e.target.value = '' }} />
                </label>
              ) : <p className="mt-3 text-xs text-slate-500 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" />Pendiente del acta generada</p>}
            </div>
          )}
        </div>

        {msg && <p className={`mt-4 text-[13px] ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.text}</p>}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
        {confirmando ? (
          <>
            <p className="text-[13.5px] text-slate-700">¿Iniciar desarrollo? El arranque se cierra con los documentos vigentes y el proyecto pasa a <b>En desarrollo</b>.</p>
            <div className="flex gap-2">
              <button type="button" disabled={!!busy} className="px-4 py-2 text-sm text-slate-600" onClick={() => setConfirmando(false)}>Volver</button>
              <button type="button" disabled={!!busy} className={btnPri}
                onClick={async () => { await run('iniciar', () => iniciarDesarrollo(incidentId), 'El proyecto pasó a En desarrollo.'); setConfirmando(false) }}>
                {busy === 'iniciar' ? 'Iniciando…' : 'Sí, iniciar desarrollo'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className={`text-[12.5px] max-w-[52ch] ${data.faltantes.length ? 'text-amber-700' : 'text-slate-500'}`}>
              {data.faltantes.length ? `Falta: ${data.faltantes.map(t => LABEL[t] ?? t).join(', ')}.` : 'El expediente está completo.'}
            </p>
            <button type="button" disabled={!!data.faltantes.length || !!busy} className={btnPri} onClick={() => setConfirmando(true)}>Iniciar desarrollo</button>
          </>
        )}
      </footer>
    </div>
  )
}
