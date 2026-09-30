'use client'

import { useState } from 'react'
import { submitCdcRevision } from '@/services/itServiceDeskService'
import { X, Plus, Paperclip } from 'lucide-react'

type Resultado = 'procede' | 'ajuste_alcance' | 'no_procede'
interface Sesion { fecha: string; tipo: string; participantes: string; notas: string }

const inputCls = 'w-full bg-white border-[1.5px] border-slate-200 rounded-[10px] px-3 py-2 text-sm outline-none transition focus:border-[#1a4fa0] focus:ring-[3.5px] focus:ring-[#1a4fa0]/10'
const errCls = 'border-red-400'
const VERDICTS: { value: Resultado; title: string; desc: string; on: string; dot: string }[] = [
  { value: 'procede', title: 'Procede', desc: 'Pasa a Aprobado y después a priorización.', on: 'border-emerald-600 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-600' },
  { value: 'ajuste_alcance', title: 'Procede con ajuste de alcance', desc: 'El solicitante debe aprobar el cambio antes de continuar.', on: 'border-amber-600 bg-amber-50 text-amber-700', dot: 'bg-amber-600' },
  { value: 'no_procede', title: 'No procede', desc: 'El proyecto se cierra como Rechazado.', on: 'border-red-600 bg-red-50 text-red-700', dot: 'bg-red-600' },
]
const RECHAZO_CATS = ['No es viable técnicamente', 'Ya existe en el sistema', 'Costo mayor al beneficio', 'Fuera del alcance del proyecto Verus', 'Otro']
const ddmm = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }

function Field({ label, required, optional, error, children, full }: { label: string; required?: boolean; optional?: boolean; error?: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
        {label}{required && <span className="text-red-600 ml-0.5">*</span>}{optional && <span className="font-normal text-slate-400"> (opcional)</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="py-5 first:pt-0 border-t border-slate-100 first:border-t-0">
      <h4 className="text-[14.5px] font-semibold text-slate-900">{title}</h4>
      {hint && <p className="text-[13px] text-slate-500 mt-0.5 mb-3.5 max-w-[62ch]">{hint}</p>}
      {children}
    </div>
  )
}

export default function CdcRevisionForm({ incidentId, originalDescription, onDone }: { incidentId: string; originalDescription: string; onDone: () => void }) {
  const [sesiones, setSesiones] = useState<Sesion[]>([])
  const [adding, setAdding] = useState(false)
  const [nueva, setNueva] = useState<Sesion>({ fecha: '', tipo: '', participantes: '', notas: '' })
  const [factibilidad, setFactibilidad] = useState('')
  const [impacto, setImpacto] = useState('')
  const [esfuerzo, setEsfuerzo] = useState('')
  const [riesgos, setRiesgos] = useState('')
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [alcanceOriginal, setAlcanceOriginal] = useState(originalDescription.slice(0, 600))
  const [alcancePropuesto, setAlcancePropuesto] = useState('')
  const [motivoAjuste, setMotivoAjuste] = useState('')
  const [motivoCat, setMotivoCat] = useState('')
  const [motivo, setMotivo] = useState('')
  const [comentarios, setComentarios] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const saveSesion = () => {
    if (!nueva.fecha || !nueva.notas.trim()) { setErrors(e => ({ ...e, sesion: 'Agrega al menos la fecha y lo que se acordó.' })); return }
    setSesiones(s => [...s, nueva]); setNueva({ fecha: '', tipo: '', participantes: '', notas: '' }); setAdding(false)
    setErrors(({ sesion, ...rest }) => rest)
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (!factibilidad.trim()) e.factibilidad = 'Describe la factibilidad para poder emitir el dictamen.'
    if (!impacto) e.impacto = 'Elige el impacto.'
    if (!esfuerzo) e.esfuerzo = 'Elige el esfuerzo.'
    if (!resultado) e.resultado = 'Elige un dictamen.'
    if (resultado === 'ajuste_alcance') {
      if (!alcancePropuesto.trim()) e.alcancePropuesto = 'Describe el alcance propuesto.'
      if (!motivoAjuste.trim()) e.motivoAjuste = 'Explica el motivo del ajuste.'
    }
    if (resultado === 'no_procede') {
      if (!motivoCat) e.motivoCat = 'Elige una categoría.'
      if (!motivo.trim()) e.motivo = 'El solicitante necesita saber por qué no procede.'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const onEmit = () => { setSubmitError(null); if (validate()) setConfirming(true) }

  const submit = async () => {
    setSubmitting(true); setSubmitError(null)
    try {
      const fd = new FormData()
      fd.append('payload', JSON.stringify({
        sesiones: sesiones.map(s => ({ ...s, fecha: ddmm(s.fecha) })),
        factibilidad, impacto, esfuerzo, riesgos: riesgos || null, resultado,
        alcance_original: resultado === 'ajuste_alcance' ? alcanceOriginal : null,
        alcance_propuesto: resultado === 'ajuste_alcance' ? alcancePropuesto : null,
        motivo_ajuste: resultado === 'ajuste_alcance' ? motivoAjuste : null,
        motivo_rechazo_categoria: resultado === 'no_procede' ? motivoCat : null,
        motivo_rechazo: resultado === 'no_procede' ? motivo : null,
        comentarios: comentarios || null,
      }))
      files.forEach(f => fd.append('files', f))
      await submitCdcRevision(incidentId, fd)
      onDone()
    } catch (err: any) {
      // FastAPI regresa detail como texto (validaciones propias) o como lista de
      // objetos (validacion de la peticion) -- nunca se pinta un objeto crudo
      const det = err?.response?.data?.detail
      setSubmitError(typeof det === 'string' ? det : 'No se pudo emitir el dictamen. Intenta de nuevo.')
      if (typeof det !== 'string') console.error('Error al emitir dictamen:', det)
      setConfirming(false)
    } finally { setSubmitting(false) }
  }

  const label = VERDICTS.find(v => v.value === resultado)?.title

  return (
    <div>
      <div className="px-5 py-5">
        <Section title="Sesiones de revisión" hint="Registra las llamadas o reuniones que tuviste para evaluar la solicitud. Aparecen en el dictamen como respaldo del análisis.">
          <div className="flex flex-col gap-2.5 mb-3">
            {sesiones.map((s, i) => (
              <div key={i} className="grid grid-cols-[120px_1fr_auto] gap-3.5 items-start border border-slate-200 rounded-[10px] px-3.5 py-3 bg-white">
                <div className="text-[13px] font-medium text-slate-800">{ddmm(s.fecha)}<span className="block text-slate-500 font-normal">{s.tipo || 'Sesión'}</span></div>
                <div className="text-[13.5px] text-slate-700 whitespace-pre-line">{s.notas}{s.participantes && <span className="block text-[12.5px] text-slate-500 mt-0.5">{s.participantes}</span>}</div>
                <button type="button" onClick={() => setSesiones(x => x.filter((_, j) => j !== i))} aria-label="Quitar sesión" className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"><X className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
          {adding ? (
            <div className="border-[1.5px] border-dashed border-slate-300 rounded-[10px] p-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-3">
                <Field label="Fecha"><input type="date" className={inputCls} value={nueva.fecha} onChange={e => setNueva({ ...nueva, fecha: e.target.value })} /></Field>
                <Field label="Tipo y duración"><input className={inputCls} placeholder="Presencial · 1 h" value={nueva.tipo} onChange={e => setNueva({ ...nueva, tipo: e.target.value })} /></Field>
                <Field label="Participantes" full><input className={inputCls} placeholder="Nombres separados por coma" value={nueva.participantes} onChange={e => setNueva({ ...nueva, participantes: e.target.value })} /></Field>
                <Field label="Qué se acordó" full error={errors.sesion}><textarea className={`${inputCls} min-h-[70px]`} value={nueva.notas} onChange={e => setNueva({ ...nueva, notas: e.target.value })} /></Field>
              </div>
              <div className="flex justify-end gap-2 mt-3">
                <button type="button" onClick={() => { setAdding(false); setErrors(({ sesion, ...r }) => r) }} className="px-4 py-2 text-sm text-slate-600">Descartar</button>
                <button type="button" onClick={saveSesion} className="border-[1.5px] border-slate-300 rounded-lg px-4 py-2 text-sm font-medium hover:border-[#1a4fa0] hover:text-[#1a4fa0]">Guardar sesión</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 border-[1.5px] border-slate-300 rounded-lg px-3.5 py-2 text-sm font-medium text-slate-700 hover:border-[#1a4fa0] hover:text-[#1a4fa0]"><Plus className="w-4 h-4" />Agregar sesión</button>
          )}
        </Section>

        <Section title="Análisis" hint="Evalúa la solicitud antes de decidir. Estos campos son obligatorios para cualquier dictamen.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Factibilidad técnica y funcional" required full error={errors.factibilidad}>
              <textarea maxLength={1500} className={`${inputCls} min-h-[100px] ${errors.factibilidad ? errCls : ''}`} placeholder="¿Se puede hacer con lo que ya tiene el sistema? ¿Requiere desarrollo del proveedor?" value={factibilidad} onChange={e => setFactibilidad(e.target.value)} />
              <p className="text-xs text-slate-400 text-right mt-1">{factibilidad.length} / 1500</p>
            </Field>
            <Field label="Impacto en la operación" required error={errors.impacto}>
              <select className={`${inputCls} ${errors.impacto ? errCls : ''}`} value={impacto} onChange={e => setImpacto(e.target.value)}>
                <option value="">Selecciona</option><option value="alto">Alto</option><option value="medio">Medio</option><option value="bajo">Bajo</option>
              </select>
            </Field>
            <Field label="Esfuerzo estimado" required error={errors.esfuerzo}>
              <select className={`${inputCls} ${errors.esfuerzo ? errCls : ''}`} value={esfuerzo} onChange={e => setEsfuerzo(e.target.value)}>
                <option value="">Selecciona</option><option value="bajo">Bajo · menos de 1 semana</option><option value="medio">Medio · 1 a 3 semanas</option><option value="alto">Alto · más de 3 semanas</option>
              </select>
            </Field>
            <Field label="Riesgos o dependencias" optional full>
              <textarea className={`${inputCls} min-h-[70px]`} placeholder="Otros sistemas afectados, cierres contables, disponibilidad del proveedor…" value={riesgos} onChange={e => setRiesgos(e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="Dictamen" hint="Elige el resultado de la revisión. Cada opción pide la información que necesita el solicitante.">
          <div role="radiogroup" aria-label="Resultado de la revisión" className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {VERDICTS.map(v => {
              const on = resultado === v.value
              return (
                <button key={v.value} type="button" role="radio" aria-checked={on} onClick={() => { setResultado(v.value); setErrors(({ resultado, ...r }) => r) }}
                  className={`text-left border-[1.5px] rounded-xl px-3.5 py-3 transition ${on ? v.on : 'border-slate-300 bg-white hover:border-slate-400'}`}>
                  <span className="flex items-center gap-2 font-semibold text-[14.5px]"><span className={`w-2.5 h-2.5 rounded-full ${on ? v.dot : 'bg-slate-300'}`} />{v.title}</span>
                  <span className="block text-[12.5px] text-slate-500 mt-1 leading-snug">{v.desc}</span>
                </button>
              )
            })}
          </div>
          {errors.resultado && <p className="text-xs text-red-600 mt-2">{errors.resultado}</p>}

          {resultado === 'ajuste_alcance' && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 grid gap-3">
              <p className="text-[13.5px] font-semibold text-amber-800">Ajuste de alcance que se enviará al solicitante</p>
              <Field label="Qué pidió originalmente" required><textarea className={`${inputCls} min-h-[64px]`} value={alcanceOriginal} onChange={e => setAlcanceOriginal(e.target.value)} /></Field>
              <Field label="Alcance propuesto" required error={errors.alcancePropuesto}><textarea className={`${inputCls} min-h-[64px] ${errors.alcancePropuesto ? errCls : ''}`} placeholder="Qué sí se va a hacer" value={alcancePropuesto} onChange={e => setAlcancePropuesto(e.target.value)} /></Field>
              <Field label="Por qué se ajusta" required error={errors.motivoAjuste}><textarea className={`${inputCls} min-h-[64px] ${errors.motivoAjuste ? errCls : ''}`} value={motivoAjuste} onChange={e => setMotivoAjuste(e.target.value)} /></Field>
            </div>
          )}

          {resultado === 'no_procede' && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 grid gap-3">
              <p className="text-[13.5px] font-semibold text-red-800">Motivo del rechazo</p>
              <Field label="Categoría" required error={errors.motivoCat}>
                <select className={`${inputCls} ${errors.motivoCat ? errCls : ''}`} value={motivoCat} onChange={e => setMotivoCat(e.target.value)}>
                  <option value="">Selecciona</option>{RECHAZO_CATS.map(c => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Explicación para el solicitante" required error={errors.motivo}><textarea className={`${inputCls} min-h-[70px] ${errors.motivo ? errCls : ''}`} placeholder="Explica con claridad por qué no procede y, si aplica, qué alternativa tiene." value={motivo} onChange={e => setMotivo(e.target.value)} /></Field>
            </div>
          )}
        </Section>

        <Section title="Comentarios para el solicitante" hint="Se incluyen en el correo de notificación y en el dictamen.">
          <textarea className={`${inputCls} min-h-[70px]`} placeholder="Siguientes pasos, qué esperar, a quién contactar…" value={comentarios} onChange={e => setComentarios(e.target.value)} />
        </Section>

        <Section title="Anexos de esta etapa" hint="Minutas, cotizaciones del proveedor o capturas. Quedan en el expediente junto al dictamen. Máximo 10 MB por archivo.">
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
        </Section>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
        {confirming ? (
          <>
            <p className="text-[13.5px] text-slate-700">¿Emitir el dictamen <b>{label}</b>? Se generará el PDF y se notificará al solicitante. Ya no se podrá editar.</p>
            <div className="flex gap-2">
              <button type="button" disabled={submitting} onClick={() => setConfirming(false)} className="px-4 py-2 text-sm text-slate-600 disabled:opacity-50">Volver</button>
              <button type="button" disabled={submitting} onClick={submit} className="bg-[#1a4fa0] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-60">{submitting ? 'Emitiendo…' : 'Sí, emitir dictamen'}</button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[12.5px] text-slate-500 max-w-[52ch]">Al emitir se genera el PDF de dictamen, se notifica al solicitante por correo y el proyecto avanza según el resultado.</p>
            <button type="button" onClick={onEmit} className="bg-[#1a4fa0] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700">Emitir dictamen</button>
          </>
        )}
        {submitError && <p className="basis-full text-[13px] text-red-600">{submitError}</p>}
      </footer>
    </div>
  )
}
