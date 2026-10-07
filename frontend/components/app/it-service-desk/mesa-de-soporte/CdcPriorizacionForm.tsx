'use client'

import { usePegarImagenes } from '@/hooks/usePegarImagenes'
import { useState } from 'react'
import { submitCdcPriorizacion } from '@/services/itServiceDeskService'
import { X, Paperclip, Check, Pencil } from 'lucide-react'
import { PRIO_CODE, PRIO_CLASS } from './TicketRow'
import CdcUserPicker, { type PickedUser } from './CdcUserPicker'

type Estado = 'pendiente' | 'confirmado' | 'ajustado'
type Clasificacion = 'cambio' | 'proyecto'
interface Solicitado { urgencia: string | null; impacto: string | null; fecha: string | null }
interface Opt { v: string; l: string }

const inputCls = 'w-full bg-white border-[1.5px] border-slate-200 rounded-[10px] px-3 py-2 text-sm outline-none transition focus:border-[#1a4fa0] focus:ring-[3.5px] focus:ring-[#1a4fa0]/10'
const URG: Opt[] = [{ v: 'alta', l: 'Alta' }, { v: 'media', l: 'Media' }, { v: 'baja', l: 'Baja' }]
const IMP: Opt[] = [{ v: 'alto', l: 'Alto' }, { v: 'medio', l: 'Medio' }, { v: 'bajo', l: 'Bajo' }]
const DESARROLLA: Opt[] = [{ v: 'equipo_interno', l: 'Equipo interno' }, { v: 'proveedor_totvs', l: 'Proveedor TOTVS' }, { v: 'proveedor_externo', l: 'Proveedor externo' }]
const ESFUERZO_LABEL: Record<string, string> = { bajo: 'Bajo', medio: 'Medio', alto: 'Alto' }
const GOBIERNO: { key: string; label: string; hint?: string }[] = [
  { key: 'patrocinador', label: 'Patrocinador', hint: 'Quien aprueba y respalda el proyecto con recursos.' },
  { key: 'gerente_proyecto', label: 'Gerente del proyecto', hint: 'Responsable de la planificación y ejecución.' },
  { key: 'project_manager', label: 'Project Manager', hint: 'Da seguimiento a avances y fechas.' },
  { key: 'lider_tecnico', label: 'Líder técnico', hint: 'Responsable de la solución técnica.' },
  { key: 'validador', label: 'Usuario validador', hint: 'Valida el resultado en pruebas (UAT).' },
]
const CLASIF: { v: Clasificacion; title: string; desc: string }[] = [
  { v: 'cambio', title: 'Cambio', desc: 'Acotado. En Arranque solo se llena un plan breve.' },
  { v: 'proyecto', title: 'Proyecto', desc: 'Requiere formalización: acta de constitución, alcance, resumen y cronograma.' },
]
const lbl = (list: Opt[], v: string | null) => list.find(x => x.v === v)?.l ?? 'Sin dato'
const ddmm = (iso: string | null) => { if (!iso) return 'Sin fecha'; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }
const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' })

const ESTADO_UI: Record<Estado, { box: string; badge: string; text: string }> = {
  pendiente: { box: 'border-amber-300 bg-amber-50/50', badge: 'bg-amber-100 text-amber-800', text: 'Dato del solicitante · sin confirmar' },
  confirmado: { box: 'border-emerald-300 bg-emerald-50/40', badge: 'bg-emerald-100 text-emerald-800', text: 'Confirmado' },
  ajustado: { box: 'border-blue-300 bg-blue-50/40', badge: 'bg-blue-100 text-blue-800', text: 'Ajustado por el PM' },
}

function useConfirmable(original: string | null) {
  const [value, setValue] = useState(original ?? '')
  const [draft, setDraft] = useState(original ?? '')
  const [estado, setEstado] = useState<Estado>('pendiente')
  const [editing, setEditing] = useState(false)
  return { original, value, draft, setDraft, estado, editing,
    confirm: () => { setValue(original ?? ''); setEstado('confirmado'); setEditing(false) },
    startEdit: () => { setDraft(value); setEditing(true) },
    cancelEdit: () => setEditing(false),
    apply: () => { setValue(draft); setEstado(draft === (original ?? '') ? 'confirmado' : 'ajustado'); setEditing(false) },
  }
}

function ConfirmField({ title, originalLabel, finalLabel, f, canConfirm, editor, error }: {
  title: string; originalLabel: string; finalLabel: string; f: ReturnType<typeof useConfirmable>
  canConfirm: boolean; editor: React.ReactNode; error?: string | null
}) {
  const ui = ESTADO_UI[f.estado]
  return (
    <div className={`border-[1.5px] rounded-xl px-4 py-3.5 transition ${ui.box}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[13px] font-medium text-slate-700">{title}<span className="text-red-600 ml-0.5">*</span></p>
          <p className="text-[15px] font-semibold text-slate-900 mt-0.5">
            {finalLabel}
            {f.estado === 'ajustado' && <span className="ml-2 text-[13px] font-normal text-slate-500">el solicitante indicó <s>{originalLabel}</s></span>}
          </p>
        </div>
        <span className={`text-[11.5px] font-semibold px-2.5 py-0.5 rounded-full ${ui.badge}`}>{ui.text}</span>
      </div>
      {f.editing ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[180px]">{editor}</div>
          <button type="button" onClick={f.cancelEdit} className="px-3 py-2 text-sm text-slate-600">Cancelar</button>
          <button type="button" onClick={f.apply} disabled={!f.draft} className="border-[1.5px] border-slate-300 rounded-lg px-3.5 py-2 text-sm font-medium bg-white hover:border-[#1a4fa0] hover:text-[#1a4fa0] disabled:opacity-50">Aplicar</button>
          {error && <p className="basis-full text-xs text-red-600">{error}</p>}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {f.estado !== 'confirmado' && (
            <button type="button" onClick={f.confirm} disabled={!canConfirm} title={canConfirm ? '' : 'El solicitante no indicó este dato; usa Cambiar para definirlo'}
              className="inline-flex items-center gap-1.5 bg-white border-[1.5px] border-emerald-600 text-emerald-700 rounded-lg px-3 py-1.5 text-[13px] font-medium hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed">
              <Check className="w-3.5 h-3.5" />Confirmar
            </button>
          )}
          <button type="button" onClick={f.startEdit} className="inline-flex items-center gap-1.5 bg-white border-[1.5px] border-slate-300 text-slate-700 rounded-lg px-3 py-1.5 text-[13px] font-medium hover:border-[#1a4fa0] hover:text-[#1a4fa0]">
            <Pencil className="w-3.5 h-3.5" />Cambiar
          </button>
        </div>
      )}
    </div>
  )
}

export default function CdcPriorizacionForm({ incidentId, solicitado, esfuerzoRevision, defaults, onDone }: {
  incidentId: string; solicitado: Solicitado; esfuerzoRevision: string | null
  defaults: { project_manager: PickedUser | null; validador: PickedUser | null }; onDone: () => void
}) {
  const sugerida: Clasificacion = esfuerzoRevision === 'alto' ? 'proyecto' : 'cambio'
  const [clasificacion, setClasificacion] = useState<Clasificacion>(sugerida)
  const [gobierno, setGobierno] = useState<Record<string, PickedUser | null>>({
    patrocinador: null, gerente_proyecto: null, project_manager: defaults.project_manager, lider_tecnico: null, validador: defaults.validador,
  })
  const urg = useConfirmable(solicitado.urgencia)
  const imp = useConfirmable(solicitado.impacto)
  const fec = useConfirmable(solicitado.fecha)
  const [fechaError, setFechaError] = useState<string | null>(null)
  const [desarrolla, setDesarrolla] = useState('')
  const [responsable, setResponsable] = useState('')
  const [notas, setNotas] = useState('')
  const [files, setFiles] = useState<File[]>([])
  usePegarImagenes(imgs => setFiles(prev => [...prev, ...imgs]))   // Ctrl + V pega capturas como evidencia
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const resueltos = [urg, imp, fec].filter(f => f.estado !== 'pendiente').length
  const fechaPasada = !!fec.value && fec.value < todayIso()
  const rolesFaltantes = clasificacion === 'proyecto' ? GOBIERNO.filter(g => !gobierno[g.key]).map(g => g.label) : []
  const motivoBloqueo = resueltos < 3 ? `Confirma o ajusta los datos del solicitante (${resueltos} de 3).`
    : fechaPasada ? 'La fecha comprometida no puede ser anterior a hoy.'
    : rolesFaltantes.length ? `Asigna los roles del proyecto: ${rolesFaltantes.join(', ')}.`
    : !desarrolla ? 'Indica quién lo desarrolla.' : null

  const applyFecha = () => {
    if (fec.draft < todayIso()) { setFechaError('La fecha comprometida no puede ser anterior a hoy.'); return }
    setFechaError(null); fec.apply()
  }

  const submit = async () => {
    setSubmitting(true); setSubmitError(null)
    try {
      const fd = new FormData()
      fd.append('payload', JSON.stringify({
        urgencia: urg.value, impacto: imp.value, fecha_compromiso: fec.value,
        confirmaciones: { urgencia: urg.estado, impacto: imp.estado, fecha: fec.estado },
        desarrolla, responsable_desarrollo: responsable || null, notas_comite: notas || null,
        clasificacion,
        gobierno: clasificacion === 'proyecto'
          ? Object.fromEntries(GOBIERNO.map(g => [g.key, { id: gobierno[g.key]!.id, name: gobierno[g.key]!.name }]))
          : null,
      }))
      files.forEach(f => fd.append('files', f))
      await submitCdcPriorizacion(incidentId, fd)
      onDone()
    } catch (err: any) {
      const det = err?.response?.data?.detail
      setSubmitError(typeof det === 'string' ? det : 'No se pudo guardar la priorización. Intenta de nuevo.')
      if (typeof det !== 'string') console.error('Error al priorizar:', det)
      setConfirming(false)
    } finally { setSubmitting(false) }
  }

  return (
    <div>
      <div className="px-5 py-5">
        {/* Clasificación */}
        <h4 className="text-[14.5px] font-semibold text-slate-900">¿Cómo se va a gestionar?<span className="text-red-600 ml-0.5">*</span></h4>
        <p className="text-[13px] text-slate-500 mt-0.5 mb-3 max-w-[62ch]">Pasa por las mismas etapas en ambos casos; lo que cambia es cuánta documentación se pide en el Arranque.</p>
        <div role="radiogroup" aria-label="Clasificación" className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {CLASIF.map(c => {
            const on = clasificacion === c.v
            return (
              <button key={c.v} type="button" role="radio" aria-checked={on} onClick={() => setClasificacion(c.v)}
                className={`text-left border-[1.5px] rounded-xl px-3.5 py-3 transition ${on ? 'border-[#1a4fa0] bg-blue-50 text-[#1a4fa0]' : 'border-slate-300 bg-white hover:border-slate-400'}`}>
                <span className="flex items-center gap-2 font-semibold text-[14.5px]">
                  <span className={`w-2.5 h-2.5 rounded-full ${on ? 'bg-[#1a4fa0]' : 'bg-slate-300'}`} />{c.title}
                  {c.v === sugerida && <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 rounded-full px-2 py-0.5">Sugerido</span>}
                </span>
                <span className="block text-[12.5px] text-slate-500 mt-1 leading-snug">{c.desc}</span>
              </button>
            )
          })}
        </div>
        {esfuerzoRevision && (
          <p className="text-xs text-slate-500 mt-2">Sugerencia basada en el esfuerzo estimado en la revisión: <b className="font-medium text-slate-700">{ESFUERZO_LABEL[esfuerzoRevision] ?? esfuerzoRevision}</b>.</p>
        )}

        {/* Datos del solicitante */}
        <div className="mt-6 pt-5 border-t border-slate-100">
          <div className="flex items-start justify-between gap-3 flex-wrap mb-3.5">
            <div>
              <h4 className="text-[14.5px] font-semibold text-slate-900">Datos que indicó el solicitante</h4>
              <p className="text-[13px] text-slate-500 mt-0.5 max-w-[62ch]">Son su referencia, no una decisión. Confirma cada uno o cámbialo; lo que definas aquí es lo que se muestra en el ticket.</p>
            </div>
            <span className={`text-[12.5px] font-semibold px-3 py-1 rounded-full ${resueltos === 3 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>Confirmados {resueltos} de 3</span>
          </div>
          <div className="grid gap-3">
            <ConfirmField title="Urgencia" f={urg} canConfirm={!!urg.original} originalLabel={lbl(URG, urg.original)} finalLabel={lbl(URG, urg.value)}
              editor={<select className={inputCls} value={urg.draft} onChange={e => urg.setDraft(e.target.value)}><option value="">Selecciona</option>{URG.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select>} />
            <ConfirmField title="Impacto" f={imp} canConfirm={!!imp.original} originalLabel={lbl(IMP, imp.original)} finalLabel={lbl(IMP, imp.value)}
              editor={<select className={inputCls} value={imp.draft} onChange={e => imp.setDraft(e.target.value)}><option value="">Selecciona</option>{IMP.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select>} />
            <ConfirmField title="Fecha comprometida de entrega" f={{ ...fec, apply: applyFecha }} canConfirm={!!fec.original && fec.original >= todayIso()}
              originalLabel={ddmm(fec.original)} finalLabel={ddmm(fec.value || null)} error={fechaError}
              editor={<input type="date" min={todayIso()} className={inputCls} value={fec.draft} onChange={e => fec.setDraft(e.target.value)} />} />
          </div>
          {urg.estado !== 'pendiente' && (
            <p className="mt-3 text-[13px] text-slate-600 flex items-center gap-2">
              Prioridad que se mostrará en la tabla:
              <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold ${PRIO_CLASS[urg.value] ?? ''}`}>{PRIO_CODE[urg.value]}</span>
            </p>
          )}
        </div>

        {/* Roles de gobierno (solo Proyecto) */}
        {clasificacion === 'proyecto' && (
          <div className="mt-6 pt-5 border-t border-slate-100">
            <h4 className="text-[14.5px] font-semibold text-slate-900">Roles del proyecto</h4>
            <p className="text-[13px] text-slate-500 mt-0.5 mb-3.5 max-w-[62ch]">Aparecen en el acta de constitución y son quienes la firman. Deben ser usuarios de la intranet.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {GOBIERNO.map(g => (
                <CdcUserPicker key={g.key} label={g.label} hint={g.hint} value={gobierno[g.key]}
                  onChange={u => setGobierno(prev => ({ ...prev, [g.key]: u }))} />
              ))}
            </div>
          </div>
        )}

        {/* Desarrollo */}
        <div className="mt-6 pt-5 border-t border-slate-100">
          <h4 className="text-[14.5px] font-semibold text-slate-900">Desarrollo</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
            <div>
              <label className="block text-[13px] font-medium text-slate-700 mb-1.5">Quién lo desarrolla<span className="text-red-600 ml-0.5">*</span></label>
              <select className={inputCls} value={desarrolla} onChange={e => setDesarrolla(e.target.value)}><option value="">Selecciona</option>{DESARROLLA.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-slate-700 mb-1.5">Responsable <span className="font-normal text-slate-400">(opcional)</span></label>
              <input className={inputCls} placeholder="Persona o empresa a cargo" value={responsable} onChange={e => setResponsable(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[13px] font-medium text-slate-700 mb-1.5">Notas para el Comité Directivo <span className="font-normal text-slate-400">(opcional, no se envían al solicitante)</span></label>
              <textarea className={`${inputCls} min-h-[70px]`} placeholder="Dependencias, costo estimado, por qué esta prioridad…" value={notas} onChange={e => setNotas(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Anexos */}
        <div className="mt-6 pt-5 border-t border-slate-100">
          <h4 className="text-[14.5px] font-semibold text-slate-900">Anexos de esta etapa <span className="font-normal text-slate-400 text-[13px]">(opcional)</span></h4>
          <p className="text-[13px] text-slate-500 mt-0.5 mb-3">Cotización del proveedor, plan de trabajo o minutas. Máximo 10 MB por archivo.</p>
          <label className="block border-[1.5px] border-dashed border-slate-300 rounded-xl p-4 text-center text-[13.5px] text-slate-500 cursor-pointer hover:border-[#1a4fa0] hover:text-[#1a4fa0]">
            Arrastra archivos o <u>selecciónalos</u>
            <input type="file" multiple className="hidden" onChange={e => { const list = Array.from(e.target.files ?? []); setFiles(f => [...f, ...list]); e.target.value = '' }} />
          </label>
          {files.length > 0 && (
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {files.map((f, i) => (
                <li key={i} className="flex items-center gap-2.5 text-[13.5px] border border-slate-200 rounded-lg px-3 py-1.5 bg-white">
                  <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" /><span className="flex-1 truncate">{f.name}</span>
                  <span className="text-xs text-slate-400">{Math.max(1, Math.round(f.size / 1024))} KB</span>
                  <button type="button" onClick={() => setFiles(x => x.filter((_, j) => j !== i))} aria-label="Quitar archivo" className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"><X className="w-3.5 h-3.5" /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
        {confirming ? (
          <>
            <p className="text-[13.5px] text-slate-700">¿Guardar como <b>{clasificacion === 'proyecto' ? 'Proyecto' : 'Cambio'}</b> con prioridad <b>{PRIO_CODE[urg.value]}</b> y entrega el <b>{ddmm(fec.value)}</b>? El SLA empieza a correr y se notificará al solicitante.</p>
            <div className="flex gap-2">
              <button type="button" disabled={submitting} onClick={() => setConfirming(false)} className="px-4 py-2 text-sm text-slate-600 disabled:opacity-50">Volver</button>
              <button type="button" disabled={submitting} onClick={submit} className="bg-[#1a4fa0] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-60">{submitting ? 'Guardando…' : 'Sí, guardar priorización'}</button>
            </div>
          </>
        ) : (
          <>
            <p className={`text-[12.5px] max-w-[52ch] ${motivoBloqueo ? 'text-amber-700' : 'text-slate-500'}`}>
              {motivoBloqueo ?? 'Al guardar se genera el PDF de priorización, arranca el SLA con la fecha comprometida y se notifica al solicitante.'}
            </p>
            <button type="button" disabled={!!motivoBloqueo} onClick={() => { setSubmitError(null); setConfirming(true) }}
              className="bg-[#1a4fa0] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">Guardar priorización</button>
          </>
        )}
        {submitError && <p className="basis-full text-[13px] text-red-600">{submitError}</p>}
      </footer>
    </div>
  )
}
