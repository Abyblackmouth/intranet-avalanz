'use client'

import { useState, useEffect, useCallback, type CSSProperties } from 'react'
import { getControlCambioDetail } from '@/services/itServiceDeskService'
import { getSignedUrl } from '@/services/uploadService'
import { X, ChevronDown, Check, Lock, FileText, Paperclip } from 'lucide-react'
import { STATUS_CLASS, PRIO_CODE, PRIO_CLASS } from './TicketRow'
import CdcRevisionForm from './CdcRevisionForm'
import CdcPriorizacionForm from './CdcPriorizacionForm'
import CdcArranque from './CdcArranque'
import CdcDiseno from './CdcDiseno'
import CdcDesarrollo from './CdcDesarrollo'
import CdcUat from './CdcUat'

// ════════════════════════════════════════════════════════════════════
// TEMA -- colores del detalle en un solo lugar. En la v2 de la intranet
// pasan a tokens de Tailwind y el resto del componente no cambia.
//   current: etapa en curso (mismo azul que la etiqueta de la tabla)
//   done:    etapas completadas
// ════════════════════════════════════════════════════════════════════
const THEME = { current: '#1a4fa0', currentSoft: '#dbeafe', done: '#059669' }
const themeVars = { '--cdc-current': THEME.current, '--cdc-current-soft': THEME.currentSoft, '--cdc-done': THEME.done } as CSSProperties

interface Documento { tipo: string; etapa: string; nombre: string; object_key: string; bucket: string; fecha: string | null }
interface LogEntry { action: string; performed_by_name: string; performed_by_role: string; performed_at: string; detail: any }
interface Etapa { id: string; etapa: string; resultado: string | null; datos: any; anexos: any[]; documento_object_key: string | null; realizado_por_nombre: string; created_at: string }
interface CdcDetail {
  id: string; folio: string; title: string; description: string; status: string; created_at: string
  requester: { id: string; name: string; email: string | null; puesto: string | null; area: string | null; company_name: string; photo_object_key: string | null }
  assigned_to: { id: string; name: string | null; puesto: string | null; assigned_at: string | null } | null
  detalle: {
    system_name: string | null; module_name: string | null; area_departamento: string | null
    tipo_solicitud: string | null; justificacion: string | null
    impacto_si_no_se_realiza: string | null; urgencia_solicitada: string | null
    fecha_requerida: string | null; comentarios_adicionales: string | null
    prioridad: string | null; impacto_confirmado: string | null; fecha_compromiso: string | null
    clasificacion: string | null
    project_manager: { id: string; name: string | null } | null
  }
  sla_resolution_limit: string | null
  documentos: Documento[]; activity_log: LogEntry[]; etapas: Etapa[]
  ajuste_pendiente: boolean; can_manage: boolean
}

const STAGES = [
  { key: 'registrado', label: 'Registrado', who: 'Solicitante' },
  { key: 'en_revision', label: 'En revisión', who: 'Project Manager' },
  { key: 'aprobado', label: 'Aprobado', who: 'Project Manager' },
  { key: 'priorizado', label: 'Priorizado', who: 'Project Manager' },
  { key: 'en_arranque', label: 'Arranque', who: 'Project Manager' },
  { key: 'en_diseno_funcional', label: 'Diseño funcional', who: 'Equipo funcional' },
  { key: 'en_diseno_tecnico', label: 'Diseño técnico', who: 'Equipo técnico' },
  { key: 'en_desarrollo', label: 'En desarrollo', who: 'Equipo / proveedor' },
  { key: 'en_pruebas', label: 'En pruebas (UAT)', who: 'Solicitante' },
  { key: 'en_paso_produccion', label: 'Paso a producción', who: 'PM / Equipo técnico' },
  { key: 'terminado', label: 'Terminado', who: 'En garantía' },
  { key: 'cerrado', label: 'Cerrado', who: 'Automático' },
]
const STAGE_INDEX: Record<string, number> = {
  en_backlog: 0, registrado: 0, en_revision: 1, rechazado: 1, aprobado: 2,
  priorizado: 3, en_arranque: 4, en_diseno_funcional: 5, en_diseno_tecnico: 6, en_desarrollo: 7, en_pruebas: 8, en_paso_produccion: 9, terminado: 10, cerrado: 11,
}
const STATUS_LABEL: Record<string, string> = {
  en_backlog: 'Registrado', registrado: 'Registrado', en_revision: 'En revisión', aprobado: 'Aprobado',
  rechazado: 'Rechazado', priorizado: 'Priorizado', en_arranque: 'Arranque', en_diseno_funcional: 'Diseño funcional', en_diseno_tecnico: 'Diseño técnico', en_desarrollo: 'En desarrollo',
  en_pruebas: 'En pruebas (UAT)', en_paso_produccion: 'Paso a producción', terminado: 'Terminado', cerrado: 'Cerrado', cancelado: 'Cancelado',
}
const REQUESTER_SEES: Record<string, string> = {
  en_backlog: 'Registrado', registrado: 'Registrado', en_revision: 'En revisión por Gerencia de Proyectos',
  aprobado: 'Aprobado · en espera de priorización', rechazado: 'Rechazado · ver motivo en el dictamen',
  priorizado: 'Priorizado', en_arranque: 'Arranque del proyecto', en_diseno_funcional: 'En diseño funcional', en_diseno_tecnico: 'En diseño técnico', en_desarrollo: 'En desarrollo', en_pruebas: 'En pruebas · requiere tu validación',
  en_paso_produccion: 'Pruebas aceptadas · en paso a producción', terminado: 'Terminado · en garantía', cerrado: 'Cerrado', cancelado: 'Cancelado',
}
const TIPO_LABEL: Record<string, string> = { nueva_funcionalidad: 'Nueva funcionalidad', mejora_existente: 'Mejora a funcionalidad existente' }
const NIVEL_LABEL: Record<string, string> = { alta: 'Alta', media: 'Media', baja: 'Baja', alto: 'Alto', medio: 'Medio', bajo: 'Bajo' }
const NIVEL_CLASS: Record<string, string> = { alta: 'text-red-700', alto: 'text-red-700', media: 'text-amber-700', medio: 'text-amber-700', baja: 'text-emerald-700', bajo: 'text-emerald-700' }
const ESFUERZO_LABEL: Record<string, string> = { bajo: 'Bajo · menos de 1 semana', medio: 'Medio · 1 a 3 semanas', alto: 'Alto · más de 3 semanas' }
const RES: Record<string, { label: string; chip: string; icon: string }> = {
  procede: { label: 'Procede', chip: 'bg-emerald-50 text-emerald-700', icon: 'bg-emerald-600' },
  ajuste_alcance: { label: 'Ajuste de alcance', chip: 'bg-amber-50 text-amber-700', icon: 'bg-amber-600' },
  no_procede: { label: 'No procede', chip: 'bg-red-50 text-red-700', icon: 'bg-red-600' },
}
const ACTION_LABEL: Record<string, (l: LogEntry, d: CdcDetail) => string> = {
  motor_asigno_cdc: (_l, d) => `El sistema asignó el proyecto a ${d.assigned_to?.name ?? 'Gerencia de Proyectos'} y lo pasó a En revisión`,
  cdc_dictamen_emitido: l => `${l.performed_by_name} emitió el dictamen: ${RES[l.detail?.resultado]?.label ?? l.detail?.resultado}`,
  cdc_arranque_iniciado: l => `${l.performed_by_name} inició el arranque`,
  cdc_documento_generado: l => `${l.performed_by_name} generó ${DOC_LABEL[l.detail?.tipo] ?? l.detail?.tipo} v${l.detail?.version ?? ''}`,
  cdc_documento_subido: l => `${l.performed_by_name} subió ${DOC_LABEL[l.detail?.tipo] ?? l.detail?.tipo}: ${l.detail?.nombre ?? ''}`,
  cdc_desarrollo_iniciado: l => `${l.performed_by_name} inició el desarrollo`,
  cdc_avance_registrado: l => `${l.performed_by_name} registró un avance${l.detail?.rts?.length ? ` (${l.detail.rts.map((r: any) => r.id).join(', ')})` : ''}`,
  cdc_desarrollo_reasignado: l => `${l.performed_by_name} asignó el desarrollo a ${l.detail?.nuevo_nombre ?? ''}`,
  cdc_uat_emitida: l => `${l.performed_by_name}${l.detail?.en_nombre_de ? ` (en nombre de ${l.detail.en_nombre_de})` : ''} ${l.detail?.resultado === 'aceptado' ? 'aceptó las pruebas' : `regresó el proyecto a desarrollo (ciclo ${l.detail?.ciclo}; no cumple: ${(l.detail?.no_cumple ?? []).join(', ')})`}`,
  cdc_liberado_pruebas: l => `${l.performed_by_name} liberó el proyecto a pruebas`,
  cdc_arranque_cerrado: l => `${l.performed_by_name} cerró el arranque; pasa a Diseño funcional`,
  cdc_diseno_cerrado: l => `${l.performed_by_name} cerró el ${l.detail?.fase === 'tecnico' ? 'diseño técnico; pasa a En desarrollo' : 'diseño funcional; pasa a Diseño técnico'}`,
  cdc_diseno_reasignado: l => `${l.performed_by_name} reasignó el ${l.detail?.fase === 'tecnico' ? 'diseño técnico' : 'diseño funcional'} a ${l.detail?.nuevo_nombre ?? ''}`,
  cdc_priorizado: l => `${l.performed_by_name} priorizó el proyecto: ${l.detail?.prioridad ?? ''}, entrega ${l.detail?.fecha_compromiso ? fmtDate(l.detail.fecha_compromiso) : '—'}`,
}

const TZ = 'America/Monterrey'
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('es-MX', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const fmtDate = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }
const sinceLabel = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  return days <= 0 ? 'hoy' : days === 1 ? 'hace 1 día' : `hace ${days} días`
}
const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()

async function openSigned(objectKey: string, bucket = 'dirdoc') {
  const res = await getSignedUrl(objectKey, bucket)
  const url = res.data?.data?.url || res.data?.url
  if (url) window.open(url, '_blank', 'noopener,noreferrer')
}

function Avatar({ name, photoKey }: { name: string; photoKey: string | null }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!photoKey) return
    getSignedUrl(photoKey, 'dirdoc').then(r => setUrl(r.data?.data?.url || r.data?.url || null)).catch(() => setUrl(null))
  }, [photoKey])
  if (url) return <img src={url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
  return <div className="w-10 h-10 rounded-full bg-violet-500 text-white flex items-center justify-center text-sm font-semibold shrink-0">{initials(name)}</div>
}

function DocRow({ doc }: { doc: Documento }) {
  const [opening, setOpening] = useState(false)
  const pdf = /\.pdf$/i.test(doc.nombre ?? '')
  const etapaLabel = doc.tipo === 'solicitud' ? 'Registrado' : doc.tipo === 'dictamen' ? 'En revisión' : (doc.tipo === 'etapa' || doc.tipo === 'arranque') ? (STATUS_LABEL[doc.etapa] ?? doc.etapa) : `Anexo · ${STATUS_LABEL[doc.etapa] ?? doc.etapa}`
  return (
    <li className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0">
      <span className={`w-8 h-10 rounded-[5px] flex items-end justify-center pb-1 text-[9px] font-semibold text-white shrink-0 ${pdf ? 'bg-red-600' : 'bg-slate-500'}`}>
        {pdf ? 'PDF' : <Paperclip className="w-3.5 h-3.5 mb-0.5" />}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-medium text-slate-800 break-all">{doc.nombre}</p>
        <p className="text-xs text-slate-500">{etapaLabel}{doc.fecha ? ` · ${fmtDateTime(doc.fecha).split(',')[0]}` : ''}</p>
      </div>
      <button type="button" disabled={opening} onClick={async () => { setOpening(true); try { await openSigned(doc.object_key, doc.bucket) } finally { setOpening(false) } }}
        className="text-[13px] font-medium text-[#1a4fa0] hover:underline disabled:opacity-50 shrink-0">{opening ? 'Abriendo…' : 'Ver'}</button>
    </li>
  )
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm">
      <header className="px-5 py-4 border-b border-slate-100">
        <h3 className="font-[family-name:var(--font-jakarta)] text-base font-bold text-slate-900">{title}</h3>
        {subtitle && <p className="text-[13px] text-slate-500 mt-0.5">{subtitle}</p>}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}

function ClosedStage({ icon, title, sub, chip, children }: { icon: string; title: string; sub: string; chip?: { label: string; cls: string }; children: React.ReactNode }) {
  return (
    <details className="group bg-white border border-slate-200 rounded-2xl shadow-sm">
      <summary className="list-none cursor-pointer px-5 py-4 flex items-center gap-3 [&::-webkit-details-marker]:hidden">
        <span className={`w-7 h-7 rounded-full ${icon} flex items-center justify-center shrink-0`}>
          {icon.includes('red') ? <X className="w-3.5 h-3.5 text-white" strokeWidth={3.5} /> : <Check className="w-3.5 h-3.5 text-white" strokeWidth={3.5} />}
        </span>
        <div className="min-w-0">
          <p className="font-[family-name:var(--font-jakarta)] font-bold text-[15.5px] text-slate-900">{title}</p>
          <p className="text-[13px] text-slate-500">{sub}</p>
        </div>
        {chip && <span className={`ml-auto text-[12.5px] font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap ${chip.cls}`}>{chip.label}</span>}
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform group-open:rotate-180 ${chip ? 'ml-2' : 'ml-auto'}`} />
      </summary>
      <div className="border-t border-slate-100 px-5 py-4">{children}</div>
    </details>
  )
}

function Dl({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-x-4 gap-y-2.5 text-sm">
      {rows.filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-[13px] text-slate-500">{k}</dt>
          <dd className="text-slate-800 whitespace-pre-line max-w-[68ch]">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function RevisionSummary({ e }: { e: Etapa }) {
  const d = e.datos || {}
  const doc = e.documento_object_key
  return (
    <>
      <Dl rows={[
        ['Factibilidad', d.factibilidad],
        ['Impacto', NIVEL_LABEL[d.impacto] ?? d.impacto],
        ['Esfuerzo', ESFUERZO_LABEL[d.esfuerzo] ?? d.esfuerzo],
        ['Riesgos', d.riesgos],
        ['Alcance propuesto', e.resultado === 'ajuste_alcance' ? d.alcance_propuesto : null],
        ['Motivo del ajuste', e.resultado === 'ajuste_alcance' ? d.motivo_ajuste : null],
        ['Motivo del rechazo', e.resultado === 'no_procede' ? `${d.motivo_rechazo_categoria}\n${d.motivo_rechazo}` : null],
        ['Sesiones', (d.sesiones ?? []).length ? (d.sesiones as any[]).map((s: any) => `${s.fecha} · ${s.notas}`).join('\n') : null],
        ['Comentarios', d.comentarios],
        ['Anexos', (e.anexos ?? []).length ? e.anexos.map((a: any) => a.nombre).join('\n') : null],
      ]} />
      {doc && (
        <button type="button" onClick={() => openSigned(doc)} className="mt-4 inline-flex items-center gap-2 text-[13px] font-medium text-[#1a4fa0] hover:underline">
          <FileText className="w-4 h-4" />Ver dictamen en PDF
        </button>
      )}
    </>
  )
}

const DESARROLLA_LABEL: Record<string, string> = { equipo_interno: 'Equipo interno', proveedor_totvs: 'Proveedor TOTVS', proveedor_externo: 'Proveedor externo' }
const DOC_LABEL: Record<string, string> = { uat: 'Acta de pruebas UAT', entrega_pruebas: 'Nota de entrega a pruebas', diseno_funcional: 'Requerimientos funcionales', diseno_tecnico: 'Diseño técnico', plan_breve: 'Plan de arranque', acta: 'Acta de Constitución', alcance: 'Alcance', resumen: 'Resumen ejecutivo y técnico', cronograma: 'Cronograma', diagrama: 'Diagrama', otro: 'Documento de soporte', acta_firmada: 'Acta firmada' }
const GOB_LABEL: Record<string, string> = { patrocinador: 'Patrocinador', gerente_proyecto: 'Gerente del proyecto', project_manager: 'Project Manager', lider_tecnico: 'Líder técnico', validador: 'Usuario validador' }

function PriorizacionSummary({ e }: { e: Etapa }) {
  const d = e.datos || {}
  const sol = d.solicitado || {}
  const c = d.confirmaciones || {}
  const nota = (campo: string, original: string) => c[campo] === 'ajustado' ? ` · ajustado (el solicitante indicó ${original})` : ' · confirmado'
  const doc = e.documento_object_key
  return (
    <>
      <Dl rows={[
        ['Prioridad', `${PRIO_CODE[d.urgencia] ?? ''} · ${NIVEL_LABEL[d.urgencia] ?? d.urgencia}${nota('urgencia', NIVEL_LABEL[sol.urgencia] ?? 'sin dato')}`],
        ['Impacto', `${NIVEL_LABEL[d.impacto] ?? d.impacto}${nota('impacto', NIVEL_LABEL[sol.impacto] ?? 'sin dato')}`],
        ['Fecha comprometida', `${d.fecha_compromiso ? fmtDate(d.fecha_compromiso) : '—'}${nota('fecha', sol.fecha ? fmtDate(sol.fecha) : 'sin fecha')}`],
        ['Se gestiona como', d.clasificacion === 'proyecto' ? 'Proyecto' : d.clasificacion === 'cambio' ? 'Cambio' : null],
        ['Desarrolla', DESARROLLA_LABEL[d.desarrolla] ?? d.desarrolla],
        ['Responsable', d.responsable_desarrollo],
        ['Notas para el Comité', d.notas_comite],
        ['Roles del proyecto', d.gobierno ? Object.entries(GOB_LABEL).map(([k, l]) => `${l}: ${d.gobierno[k]?.name ?? '—'}`).join('\n') : null],
        ['Anexos', (e.anexos ?? []).length ? e.anexos.map((a: any) => a.nombre).join('\n') : null],
      ]} />
      {doc && (
        <button type="button" onClick={() => openSigned(doc)} className="mt-4 inline-flex items-center gap-2 text-[13px] font-medium text-[#1a4fa0] hover:underline">
          <FileText className="w-4 h-4" />Ver priorización en PDF
        </button>
      )}
    </>
  )
}

function LockedStage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-slate-200 border-t-[3px] border-t-[var(--cdc-current)] rounded-2xl shadow-sm">
      <header className="px-5 py-4 border-b border-slate-100"><h3 className="font-[family-name:var(--font-jakarta)] text-[17px] font-bold text-slate-900">{title}</h3></header>
      <div className="px-5 py-7 flex items-center gap-3 text-[13.5px] text-slate-600"><Lock className="w-4 h-4 shrink-0 text-slate-400" />{children}</div>
    </section>
  )
}

export default function CdcDetailModal({ incidentId, onClose, onChanged }: { incidentId: string; onClose: () => void; onChanged?: () => void }) {
  const [detail, setDetail] = useState<CdcDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [shown, setShown] = useState(false)

  const fetchDetail = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try { const res = await getControlCambioDetail(incidentId); setDetail(res.data) }
    catch (err: any) { setError(err?.response?.data?.detail ?? 'No se pudo cargar el proyecto') }
    finally { setLoading(false) }
  }, [incidentId])

  useEffect(() => { fetchDetail() }, [fetchDetail])
  useEffect(() => { const id = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(id) }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  const status = detail?.status ?? ''
  const current = STAGE_INDEX[status] ?? 0
  const isStopped = status === 'rechazado' || status === 'cancelado'
  const d = detail?.detalle
  const lastEtapa = detail?.etapas?.[detail.etapas.length - 1]
  const sinceIso = lastEtapa && status !== 'en_revision' ? lastEtapa.created_at : status === 'en_revision' ? detail?.assigned_to?.assigned_at : detail?.created_at

  const onRevisionDone = async () => { await fetchDetail(true); onChanged?.() }

  const activeStage = () => {
    if (!detail) return null
    if (status === 'en_revision' && detail.ajuste_pendiente) {
      return (
        <section className="bg-white border border-amber-200 border-t-[3px] border-t-amber-500 rounded-2xl shadow-sm px-5 py-5">
          <h3 className="font-[family-name:var(--font-jakarta)] text-[17px] font-bold text-amber-800">Esperando aprobación del solicitante</h3>
          <p className="text-[13.5px] text-slate-600 mt-1.5 max-w-[64ch]">{detail.requester.name} recibió el ajuste de alcance por correo. El proyecto continúa a priorización cuando lo apruebe; si lo rechaza, se conserva el alcance original y vuelve a revisión.</p>
        </section>
      )
    }
    if (status === 'en_revision') {
      if (!detail.can_manage) return <LockedStage title="En revisión">Esta etapa la atiende {detail.assigned_to?.name ?? 'Gerencia de Proyectos'}. Te notificaremos por correo con el dictamen.</LockedStage>
      return (
        <section className="bg-white border border-slate-200 border-t-[3px] border-t-[var(--cdc-current)] rounded-2xl shadow-sm">
          <header className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-[family-name:var(--font-jakarta)] text-[17px] font-bold text-slate-900">Dictamen de revisión</h3>
              <p className="text-[13px] text-slate-500 mt-0.5">Lo que captures aquí genera el documento de dictamen y se agrega al expediente.</p>
            </div>
            <span className="text-xs font-semibold text-[var(--cdc-current)] bg-[var(--cdc-current-soft)] rounded-full px-2.5 py-0.5">Etapa 2 de 12</span>
          </header>
          <CdcRevisionForm incidentId={detail.id} originalDescription={detail.description} onDone={onRevisionDone} />
        </section>
      )
    }
    if (status === 'rechazado') {
      return (
        <section className="bg-white border border-red-200 border-t-[3px] border-t-red-600 rounded-2xl shadow-sm px-5 py-5">
          <h3 className="font-[family-name:var(--font-jakarta)] text-[17px] font-bold text-red-700">Proyecto rechazado</h3>
          <p className="text-[13.5px] text-slate-600 mt-1.5 max-w-[64ch]">Se notificó a {detail.requester.name} con el motivo y el dictamen adjunto. El folio se conserva con su historial para el reporte al Comité Directivo.</p>
        </section>
      )
    }
    if (status === 'aprobado') {
      if (!detail.can_manage) return <LockedStage title="Priorización">Gerencia de Proyectos está definiendo la prioridad y la fecha de entrega. Te notificaremos por correo.</LockedStage>
      return (
        <section className="bg-white border border-slate-200 border-t-[3px] border-t-[var(--cdc-current)] rounded-2xl shadow-sm">
          <header className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-[family-name:var(--font-jakarta)] text-[17px] font-bold text-slate-900">Priorización</h3>
              <p className="text-[13px] text-slate-500 mt-0.5">Confirma lo que indicó el solicitante y define el compromiso de entrega. Esta fecha es la que se reporta al Comité Directivo.</p>
            </div>
            <span className="text-xs font-semibold text-[var(--cdc-current)] bg-[var(--cdc-current-soft)] rounded-full px-2.5 py-0.5">Etapa 4 de 12</span>
          </header>
          <CdcPriorizacionForm incidentId={detail.id}
            solicitado={{ urgencia: detail.detalle.urgencia_solicitada, impacto: detail.detalle.impacto_si_no_se_realiza, fecha: detail.detalle.fecha_requerida }}
            esfuerzoRevision={detail.etapas.filter(e => e.etapa === 'en_revision').slice(-1)[0]?.datos?.esfuerzo ?? null}
            defaults={{
              project_manager: detail.assigned_to?.id ? { id: detail.assigned_to.id, name: detail.assigned_to.name ?? '', puesto: detail.assigned_to.puesto } : null,
              validador: { id: detail.requester.id, name: detail.requester.name, puesto: detail.requester.puesto },
            }}
            onDone={onRevisionDone} />
        </section>
      )
    }
    if (status === 'en_pruebas') {
      return (
        <section className="bg-white border border-slate-200 border-t-[3px] border-t-[var(--cdc-current)] rounded-2xl shadow-sm">
          <header className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-[family-name:var(--font-jakarta)] text-[17px] font-bold text-slate-900">En pruebas (UAT)</h3>
              <p className="text-[13px] text-slate-500 mt-0.5">El solicitante valida cada criterio de aceptación con evidencia.</p>
            </div>
            <span className="text-xs font-semibold text-[var(--cdc-current)] bg-[var(--cdc-current-soft)] rounded-full px-2.5 py-0.5">Etapa 9 de 12</span>
          </header>
          <CdcUat incidentId={detail.id} onChanged={onRevisionDone} />
        </section>
      )
    }
    if (status === 'en_paso_produccion') return <LockedStage title="Paso a producción">Se habilita en la siguiente entrega: ventana de instalación, responsable, plan de reversa y confirmación.</LockedStage>
    if (status === 'en_desarrollo') {
      return (
        <section className="bg-white border border-slate-200 border-t-[3px] border-t-[var(--cdc-current)] rounded-2xl shadow-sm">
          <header className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-[family-name:var(--font-jakarta)] text-[17px] font-bold text-slate-900">En desarrollo</h3>
              <p className="text-[13px] text-slate-500 mt-0.5">Seguimiento por requerimiento técnico hasta liberar a pruebas con el solicitante.</p>
            </div>
            <span className="text-xs font-semibold text-[var(--cdc-current)] bg-[var(--cdc-current-soft)] rounded-full px-2.5 py-0.5">Etapa 8 de 12</span>
          </header>
          <CdcDesarrollo incidentId={detail.id} onChanged={onRevisionDone} />
        </section>
      )
    }
    if (status === 'en_diseno_funcional' || status === 'en_diseno_tecnico') {
      const fase = status === 'en_diseno_funcional' ? 'funcional' : 'tecnico'
      return (
        <section className="bg-white border border-slate-200 border-t-[3px] border-t-[var(--cdc-current)] rounded-2xl shadow-sm">
          <header className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-[family-name:var(--font-jakarta)] text-[17px] font-bold text-slate-900">{fase === 'funcional' ? 'Diseño funcional' : 'Diseño técnico'}</h3>
              <p className="text-[13px] text-slate-500 mt-0.5">{fase === 'funcional' ? 'Sesiones de entendimiento con el área y documento de requerimientos funcionales.' : 'Diseño de la solución y requerimientos técnicos ligados a cada requerimiento funcional.'}</p>
            </div>
            <span className="text-xs font-semibold text-[var(--cdc-current)] bg-[var(--cdc-current-soft)] rounded-full px-2.5 py-0.5">Etapa {fase === 'funcional' ? 6 : 7} de 12</span>
          </header>
          <CdcDiseno key={fase} incidentId={detail.id} fase={fase} onChanged={onRevisionDone} />
        </section>
      )
    }
    if (status === 'priorizado' || status === 'en_arranque') {
      if (!detail.can_manage) return <LockedStage title="Arranque">Gerencia de Proyectos está preparando el arranque del proyecto. Te notificaremos cuando inicie el desarrollo.</LockedStage>
      return (
        <section className="bg-white border border-slate-200 border-t-[3px] border-t-[var(--cdc-current)] rounded-2xl shadow-sm">
          <header className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-[family-name:var(--font-jakarta)] text-[17px] font-bold text-slate-900">Arranque</h3>
              <p className="text-[13px] text-slate-500 mt-0.5">{detail.detalle.clasificacion === 'proyecto'
                ? 'Arma el expediente del proyecto. Cada documento se guarda por separado, así que puedes avanzar en varios días.'
                : 'Un plan breve basta para un Cambio. Se llena en un par de minutos.'}</p>
            </div>
            <span className="text-xs font-semibold text-[var(--cdc-current)] bg-[var(--cdc-current-soft)] rounded-full px-2.5 py-0.5">Etapa 5 de 12</span>
          </header>
          <CdcArranque incidentId={detail.id} fechaCompromiso={detail.detalle.fecha_compromiso} onChanged={onRevisionDone} />
        </section>
      )
    }
    if (status === 'terminado' || status === 'cancelado') return null
    return <LockedStage title={STATUS_LABEL[status] ?? status}>El formulario de esta etapa se habilita en una fase posterior.</LockedStage>
  }

  return (
    <div style={themeVars} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="cdc-title">
      <div className={`absolute inset-0 bg-slate-900/40 transition-opacity duration-200 motion-reduce:transition-none ${shown ? 'opacity-100' : 'opacity-0'}`} onClick={onClose} />

      <div className={`absolute inset-y-0 right-0 w-full md:w-[85vw] bg-slate-100 shadow-2xl flex flex-col transition-transform duration-200 ease-out motion-reduce:transition-none ${shown ? 'translate-x-0' : 'translate-x-full'}`}>
        {loading && (
          <div className="flex-1 flex items-center justify-center"><div className="w-6 h-6 border-2 border-slate-300 border-t-[#1a4fa0] rounded-full animate-spin" /></div>
        )}

        {!loading && error && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-slate-700">{error}</p>
            <div className="flex gap-2">
              <button onClick={() => fetchDetail()} className="border-[1.5px] border-slate-300 rounded-lg px-4 py-2 text-sm font-medium hover:border-[#1a4fa0]">Reintentar</button>
              <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500">Cerrar</button>
            </div>
          </div>
        )}

        {!loading && detail && d && (
          <>
            <header className="bg-white border-b border-slate-200 px-6 md:px-7 py-5 flex flex-wrap gap-5 items-start justify-between">
              <div className="min-w-0">
                <span className="inline-block font-mono text-[13px] text-[#1a4fa0] bg-white border border-slate-200 rounded-md px-2.5 py-0.5">{detail.folio}</span>
                <h2 id="cdc-title" className="font-[family-name:var(--font-jakarta)] font-bold text-xl md:text-2xl leading-tight tracking-tight text-slate-900 mt-2 mb-1.5 max-w-[44ch]">{detail.title}</h2>
                <p className="text-[13.5px] text-slate-500 flex flex-wrap gap-x-5 gap-y-1">
                  <span>Control de Cambios{d.clasificacion ? <> · <b className="font-medium text-slate-700">{d.clasificacion === 'proyecto' ? 'Proyecto' : 'Cambio'}</b></> : null} · <b className="font-medium text-slate-700">{TIPO_LABEL[d.tipo_solicitud ?? ''] ?? d.tipo_solicitud ?? '—'}</b></span>
                  <span>{d.system_name ?? '—'}{d.module_name ? <> / <b className="font-medium text-slate-700">{d.module_name}</b></> : null}</span>
                  <span>Registrado <b className="font-medium text-slate-700">{fmtDateTime(detail.created_at)}</b></span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-2 text-[13px] font-medium px-3 py-1 rounded-full ${STATUS_CLASS[status] ?? 'bg-slate-100 text-slate-600'}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />{STATUS_LABEL[status] ?? status}
                </span>
                <button onClick={onClose} aria-label="Cerrar detalle" className="w-9 h-9 rounded-lg border-[1.5px] border-slate-200 flex items-center justify-center text-slate-500 hover:border-red-300 hover:text-red-600"><X className="w-4 h-4" /></button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto overscroll-contain px-6 md:px-7 py-6">
              <section className="bg-white border border-slate-200 rounded-2xl shadow-sm px-5 pt-5 pb-4 mb-6 overflow-x-auto" aria-label="Etapas del Control de Cambios">
                <ol className="grid grid-cols-12 min-w-[1260px]">
                  {STAGES.map((s, i) => {
                    const done = i < current || (i === current && status === 'cerrado')
                    const now = i === current && !done
                    const stop = now && isStopped
                    const hold = now && status === 'en_revision' && detail.ajuste_pendiente
                    const label = stop && status === 'rechazado' ? 'Rechazado' : s.label
                    return (
                      <li key={s.key} className="relative pt-8 text-[13px]">
                        <span className={`absolute top-[10px] h-[3px] ${i === 0 ? 'left-2.5' : 'left-0'} ${i === STAGES.length - 1 ? 'right-[calc(100%-10px)]' : 'right-0'} ${done ? 'bg-[var(--cdc-done)]' : 'bg-slate-200'}`} />
                        <span className={`absolute top-0.5 left-0 w-5 h-5 rounded-full border-[3px] z-10 flex items-center justify-center
                          ${done ? 'bg-[var(--cdc-done)] border-[var(--cdc-done)]' : stop ? 'bg-red-600 border-red-600' : hold ? 'bg-white border-amber-500 ring-4 ring-amber-100' : now ? 'bg-white border-[var(--cdc-current)] ring-4 ring-[var(--cdc-current-soft)]' : 'bg-white border-slate-300'}`}>
                          {done && <Check className="w-3 h-3 text-white" strokeWidth={3.5} />}
                        </span>
                        <span className="block font-mono text-[11px] text-slate-400">{i + 1}</span>
                        <span className={`block ${stop ? 'text-red-700 font-semibold' : hold ? 'text-amber-700 font-semibold' : now ? 'text-[var(--cdc-current)] font-semibold' : done ? 'text-slate-700' : 'text-slate-400'}`}>{label}</span>
                        <span className={`block text-xs mt-0.5 ${now ? 'text-slate-700' : 'text-slate-400'}`}>{s.who}</span>
                      </li>
                    )
                  })}
                </ol>
                <div className="flex flex-wrap justify-between gap-3 mt-4 pt-3 border-t border-dashed border-slate-200 text-[12.5px] text-slate-500">
                  <span>En esta etapa desde <b className="font-medium text-slate-700">{sinceLabel(sinceIso)}</b></span>
                  <span>El solicitante ve: <b className="font-medium text-slate-700">{detail.ajuste_pendiente && status === 'en_revision' ? 'Requiere tu aprobación de un ajuste de alcance' : REQUESTER_SEES[status] ?? STATUS_LABEL[status]}</b></span>
                </div>
              </section>

              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
                <div className="min-w-0">
                  {activeStage()}

                  <p className="text-[13px] font-medium text-slate-500 mt-7 mb-2.5 px-0.5">Etapas cerradas</p>
                  <div className="flex flex-col gap-3.5">
                    {[...detail.etapas].reverse().map(e => e.etapa === 'en_pruebas' ? (
                      <ClosedStage key={e.id} icon={e.resultado === 'aceptado' ? 'bg-[var(--cdc-done)]' : 'bg-amber-600'} title={`En pruebas · ciclo ${e.datos?.ciclo ?? 1}`}
                        sub={`${e.datos?.registro ?? e.realizado_por_nombre} · ${fmtDateTime(e.created_at)}`}
                        chip={{ label: e.resultado === 'aceptado' ? 'Aceptado' : 'Regresado a desarrollo', cls: e.resultado === 'aceptado' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700' }}>
                        <Dl rows={(e.datos?.criterios ?? []).map((c: any) => [c.id, `${c.cumple ? 'Cumple' : 'No cumple'}${c.comentario ? ` · ${c.comentario}` : ''}`] as [string, React.ReactNode])} />
                        {e.documento_object_key && (
                          <button type="button" onClick={() => openSigned(e.documento_object_key!)} className="mt-4 inline-flex items-center gap-2 text-[13px] font-medium text-[#1a4fa0] hover:underline">
                            <FileText className="w-4 h-4" />Ver acta de pruebas en PDF
                          </button>
                        )}
                      </ClosedStage>
                    ) : e.etapa === 'en_desarrollo' ? (
                      <ClosedStage key={e.id} icon="bg-[var(--cdc-done)]" title="En desarrollo" sub={`${e.realizado_por_nombre} · ${fmtDateTime(e.created_at)}`}
                        chip={{ label: `Liberado · ${e.datos?.rts?.horas_reales ?? 0} h reales de ${e.datos?.rts?.horas_estimadas ?? 0} h`, cls: 'bg-emerald-50 text-emerald-700' }}>
                        <Dl rows={[['Requerimientos', `${e.datos?.rts?.total ?? 0} terminados`], ['Horas', `${e.datos?.rts?.horas_reales ?? 0} reales · ${e.datos?.rts?.horas_estimadas ?? 0} estimadas`], ['Nota de entrega', e.datos?.nota?.nombre ?? '—']]} />
                        {e.documento_object_key && (
                          <button type="button" onClick={() => openSigned(e.documento_object_key!)} className="mt-4 inline-flex items-center gap-2 text-[13px] font-medium text-[#1a4fa0] hover:underline">
                            <FileText className="w-4 h-4" />Ver nota de entrega en PDF
                          </button>
                        )}
                      </ClosedStage>
                    ) : (e.etapa === 'en_diseno_funcional' || e.etapa === 'en_diseno_tecnico') ? (
                      <ClosedStage key={e.id} icon="bg-[var(--cdc-done)]" title={e.etapa === 'en_diseno_funcional' ? 'Diseño funcional' : 'Diseño técnico'}
                        sub={`${e.datos?.responsable?.name || e.realizado_por_nombre} · ${fmtDateTime(e.created_at)}`}
                        chip={{ label: `${e.etapa === 'en_diseno_funcional' ? 'Requerimientos funcionales' : 'Diseño técnico'} v${e.datos?.documento?.version ?? 1}`, cls: 'bg-emerald-50 text-emerald-700' }}>
                        <Dl rows={[['Documento', e.datos?.documento?.nombre ?? '—'], ['Responsable', e.datos?.responsable?.name ?? '—'], ['Cerró', e.realizado_por_nombre]]} />
                        {e.documento_object_key && (
                          <button type="button" onClick={() => openSigned(e.documento_object_key!)} className="mt-4 inline-flex items-center gap-2 text-[13px] font-medium text-[#1a4fa0] hover:underline">
                            <FileText className="w-4 h-4" />Ver documento en PDF
                          </button>
                        )}
                      </ClosedStage>
                    ) : e.etapa === 'en_arranque' ? (
                      <ClosedStage key={e.id} icon="bg-[var(--cdc-done)]" title="Arranque"
                        sub={`${e.realizado_por_nombre} · ${fmtDateTime(e.created_at)}`}
                        chip={{ label: e.resultado === 'proyecto' ? 'Proyecto · expediente completo' : 'Cambio · plan de arranque', cls: 'bg-emerald-50 text-emerald-700' }}>
                        <Dl rows={Object.entries(e.datos?.documentos ?? {}).map(([tipo, x]: [string, any]) => [DOC_LABEL[tipo] ?? tipo, `${x.nombre ?? '—'} · v${x.version}`] as [string, React.ReactNode])} />
                      </ClosedStage>
                    ) : e.etapa === 'priorizado' ? (
                      <ClosedStage key={e.id} icon="bg-[var(--cdc-done)]" title="Priorizado"
                        sub={`${e.realizado_por_nombre} · ${fmtDateTime(e.created_at)}`}
                        chip={{ label: `${PRIO_CODE[e.datos?.urgencia] ?? ''} · entrega ${e.datos?.fecha_compromiso ? fmtDate(e.datos.fecha_compromiso) : '—'}`, cls: 'bg-emerald-50 text-emerald-700' }}>
                        <PriorizacionSummary e={e} />
                      </ClosedStage>
                    ) : e.etapa === 'en_revision' && (
                      <ClosedStage key={e.id} icon={RES[e.resultado ?? '']?.icon ?? 'bg-[var(--cdc-done)]'} title="En revisión"
                        sub={`Dictamen de ${e.realizado_por_nombre} · ${fmtDateTime(e.created_at)}`}
                        chip={e.resultado ? { label: RES[e.resultado]?.label ?? e.resultado, cls: RES[e.resultado]?.chip ?? '' } : undefined}>
                        <RevisionSummary e={e} />
                      </ClosedStage>
                    ))}
                    <ClosedStage icon="bg-[var(--cdc-done)]" title="Registrado" sub={`Solicitud original · ${fmtDateTime(detail.created_at)}`}>
                      <Dl rows={[
                        ['Descripción', detail.description],
                        ['Justificación', d.justificacion],
                        ['Área', d.area_departamento],
                        ['Comentarios', d.comentarios_adicionales],
                      ]} />
                    </ClosedStage>
                  </div>
                </div>

                <aside className="flex flex-col gap-5">
                  <Card title="Solicitud">
                    <div className="flex flex-col gap-3.5 text-sm">
                      <div className="flex items-center gap-3">
                        <Avatar name={detail.requester.name} photoKey={detail.requester.photo_object_key} />
                        <div className="min-w-0">
                          <p className="text-slate-900 font-medium leading-snug">{detail.requester.name}</p>
                          <p className="text-[12.5px] text-slate-500">{[d.area_departamento ?? detail.requester.area, detail.requester.company_name].filter(Boolean).join(' · ')}</p>
                        </div>
                      </div>
                      <div><p className="text-[12.5px] text-slate-500">Alcance</p><p className="text-slate-800">{d.system_name ?? '—'}{d.module_name ? ` → ${d.module_name}` : ''}</p></div>
                      <div className="flex gap-7">
                        <div><p className="text-[12.5px] text-slate-500">Urgencia · solicitante</p><p className={`font-semibold ${NIVEL_CLASS[d.urgencia_solicitada ?? ''] ?? 'text-slate-800'}`}>{NIVEL_LABEL[d.urgencia_solicitada ?? ''] ?? '—'}</p></div>
                        <div><p className="text-[12.5px] text-slate-500">Impacto si no se hace</p><p className={`font-semibold ${NIVEL_CLASS[d.impacto_si_no_se_realiza ?? ''] ?? 'text-slate-800'}`}>{NIVEL_LABEL[d.impacto_si_no_se_realiza ?? ''] ?? '—'}</p></div>
                      </div>
                      <div><p className="text-[12.5px] text-slate-500">Requerido para · solicitante</p><p className="text-slate-800">{d.fecha_requerida ? fmtDate(d.fecha_requerida) : 'Sin fecha definida'}</p></div>
                      {d.prioridad && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
                          <p className="text-[12.5px] text-slate-500">{status === 'rechazado' ? 'Urgencia del solicitante · no llegó a priorización' : 'Definido por Gerencia de Proyectos'}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold ${PRIO_CLASS[d.prioridad] ?? ''}`}>{PRIO_CODE[d.prioridad]}</span>
                            {d.fecha_compromiso && <span className="text-slate-800">Entrega {fmtDate(d.fecha_compromiso)}</span>}
                          </div>
                        </div>
                      )}
                      <div><p className="text-[12.5px] text-slate-500">Project Manager</p><p className="text-slate-800">{d.project_manager?.name ?? detail.assigned_to?.name ?? 'Sin asignar'}</p></div>
                      {d.project_manager && detail.assigned_to?.id !== d.project_manager.id && (
                        <div><p className="text-[12.5px] text-slate-500">Responsable actual</p><p className="text-slate-800">{detail.assigned_to?.name ?? 'Sin asignar'}</p></div>
                      )}
                    </div>
                  </Card>

                  <Card title="Expediente" subtitle="Un documento por etapa">
                    {detail.documentos.length === 0
                      ? <p className="text-[13.5px] text-slate-500 flex items-center gap-2"><FileText className="w-4 h-4" />Aún no hay documentos.</p>
                      : <ul className="-my-3">{detail.documentos.map(doc => <DocRow key={doc.object_key} doc={doc} />)}</ul>}
                  </Card>

                  <Card title="Bitácora">
                    {detail.activity_log.length === 0
                      ? <p className="text-[13.5px] text-slate-500">Sin movimientos todavía.</p>
                      : (
                        <ul className="border-l-2 border-slate-200 pl-4">
                          {detail.activity_log.map((l, i) => (
                            <li key={i} className="relative pb-4 last:pb-0 pl-3.5 text-[13.5px] text-slate-700">
                              <span className={`absolute -left-[23px] top-1.5 w-2.5 h-2.5 rounded-full bg-white border-2 ${l.performed_by_role === 'sistema' ? 'border-[#1a4fa0]' : 'border-slate-400'}`} />
                              {ACTION_LABEL[l.action]?.(l, detail) ?? `${l.performed_by_name}: ${l.action.replace(/_/g, ' ')}`}
                              <span className="block text-xs text-slate-500">{fmtDateTime(l.performed_at)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                  </Card>
                </aside>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
