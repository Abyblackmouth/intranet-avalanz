'use client'
// ----------------------------------------------------------------------
// Ticket desde el chat
// Controles de cada paso (tipo, sistema, modulo, severidad, capturas y
// resumen), la linea viva de asignacion y el indicador de envio. El
// estado vive en el store; aqui solo se muestra y se elige.
// ----------------------------------------------------------------------
import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Check, Loader, Paperclip, X } from 'lucide-react'
import type { ChatMessage, TicketDraft, TicketInfo, TicketStep } from '@/store/assistantStore'
import type { TicketCatalogs } from '@/services/assistantService'

// Limites de las capturas (los mismos que valida el dialog-service)
export const MAX_FILES = 3
export const MAX_BYTES = 5 * 1024 * 1024

export const TYPE_LABEL = { funcional: 'Duda de uso o proceso', tecnico: 'Falla o error del sistema' } as const

// Severidad explicada en palabras simples
export const SEVERITY_LABEL: Record<string, string> = {
  S1: 'No puedo trabajar',
  S2: 'Algo importante no funciona',
  S3: 'Me afecta, pero puedo seguir',
  S4: 'Es una duda o algo menor',
}

// Nivel y color de cada severidad (los mismos tonos que la tabla de la mesa)
export const SEVERITY_LEVEL: Record<string, string> = { S1: 'Crítica', S2: 'Alta', S3: 'Media', S4: 'Baja' }
const SEVERITY_STYLE: Record<string, string> = {
  S1: 'bg-red-50 text-red-700 border-red-200',
  S2: 'bg-orange-50 text-orange-700 border-orange-200',
  S3: 'bg-amber-50 text-amber-700 border-amber-200',
  S4: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

export const severityText = (code: string, name: string) =>
  `${code} · ${SEVERITY_LEVEL[code] ?? name} — ${SEVERITY_LABEL[code] ?? name}`

// Etiqueta de color de la severidad
const SeverityBadge = ({ code, name }: { code: string; name: string }) => (
  <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-bold ${SEVERITY_STYLE[code] ?? 'bg-slate-50 text-slate-700 border-slate-200'}`}>
    {code} · {SEVERITY_LEVEL[code] ?? name}
  </span>
)

// "ANA MARCELA RODRIGUEZ" -> "Ana Marcela Rodriguez"
const titleCase = (name: string) =>
  name.toLocaleLowerCase('es-MX').replace(/(^|\s)(\p{L})/gu, (_, space: string, letter: string) => space + letter.toLocaleUpperCase('es-MX'))

// Pregunta del asistente en cada paso
export const STEP_PROMPT: Record<TicketStep, string> = {
  describe: 'Cuéntame brevemente qué está pasando.',
  type: '¿Qué tipo de problema es?',
  system: '¿En qué sistema?',
  module: '¿Qué módulo?',
  severity: '¿Qué tan grave es? Elige la severidad:',
  attach: '¿Quieres agregar capturas de pantalla? Ayudan a resolverlo más rápido. Puedes pegarlas con Ctrl + V o arrastrarlas aquí.',
  review: 'Revisa el ticket antes de enviarlo:',
  sending: '',
}

const plain = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

// ----------------------------------------------------------------------
// Contexto del ticket: lo que el usuario pregunto en la conversacion
// reciente (hasta `window` mensajes, sin pasar de un ticket anterior) y
// los documentos que el asistente le mostro. La platica ("hola", "si")
// no cuenta, y las busquedas de confianza baja tampoco aportan temas ni
// documentos: suelen ser ruido.
// ----------------------------------------------------------------------
export interface TicketContext {
  title: string
  description: string
  topics: string[]
  questions: string[]
}

export const ticketContext = (messages: ChatMessage[], uptoIndex = messages.length, window = 8): TicketContext => {
  const end = Math.min(uptoIndex, messages.length)
  const recent: ChatMessage[] = []
  for (let i = end - 1; i >= 0 && end - i <= window; i -= 1) {
    if (messages[i].ticket) break
    recent.unshift(messages[i])
  }
  const questions: string[] = []
  const docs: string[] = []
  const topics: string[] = []
  recent.forEach((m, i) => {
    const next = recent[i + 1]
    if (m.role === 'user' && next && (next.results !== undefined || next.showTicket)) questions.push(m.text)
    if (m.role === 'assistant' && m.results?.length && m.confidence !== 'baja') {
      const top = m.results[0]
      const section = top.context.split(' > ').slice(2).pop()
      const label = section ? `${top.title} (${section}${top.location ? ` · ${top.location}` : ''})` : top.title
      if (!docs.includes(label)) docs.push(label)
      m.results.forEach((r) => {
        const topic = r.context.split(' > ')[0]
        if (topic && !topics.includes(topic)) topics.push(topic)
      })
    }
  })
  if (!questions.length) return { title: '', description: '', topics, questions }
  const parts = [`Lo que pregunté al asistente:\n${questions.map((q) => `- ${q}`).join('\n')}`]
  if (docs.length) parts.push(`Documentos que me mostró:\n${docs.slice(0, 3).map((d) => `- ${d}`).join('\n')}`)
  parts.push('Levantado desde el Asistente Avalanz.')
  return { title: questions[0].slice(0, 150), description: parts.join('\n\n'), topics, questions }
}

// El texto menciona el nombre como palabra completa ("otro" no coincide con "otros")
const mentions = (text: string, name: string) => {
  const n = plain(name).trim()
  if (!n) return false
  return new RegExp(`(^|[^a-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(text)
}

// ----------------------------------------------------------------------
// Suma capturas respetando los limites; regresa el error a mostrar
// ----------------------------------------------------------------------
export const mergeFiles = (current: File[], incoming: File[]): { files: File[]; error: string | null } => {
  const images = incoming.filter((f) => f.type.startsWith('image/'))
  let error: string | null = images.length < incoming.length ? 'Solo se pueden adjuntar imágenes.' : null
  const ok = images.filter((f) => f.size <= MAX_BYTES)
  if (ok.length < images.length) error = 'Cada imagen debe pesar 5 MB o menos.'
  if (current.length + ok.length > MAX_FILES) error = 'Puedes adjuntar hasta 3 imágenes.'
  return { files: [...current, ...ok].slice(0, MAX_FILES), error }
}

const chip = 'rounded-full border px-3 py-1.5 text-[12.5px] transition-colors'
const chipIdle = `${chip} border-[#b8c4d4] bg-white text-slate-700 hover:border-[#1a4fa0] hover:text-[#1a4fa0]`
const chipSuggested = `${chip} border-[#1a4fa0] bg-blue-50 text-[#1a4fa0] font-medium`
const box = 'rounded-xl border border-[#b8c4d4] bg-white p-3 space-y-2.5'
const field = 'mt-1 w-full border border-[#b8c4d4] rounded-lg px-3 py-1.5 text-[13px] text-slate-800 outline-none focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#1a4fa0]/10'

// ----------------------------------------------------------------------
// Tres puntos con texto: "Generando ticket..."
// ----------------------------------------------------------------------
export const SendingDots = ({ label }: { label: string }) => (
  <div className="flex items-center gap-1.5 px-4 py-3 bg-white border border-[#b8c4d4] rounded-2xl rounded-bl-md w-fit shadow-sm">
    {[0, 1, 2].map((i) => (
      <motion.span
        key={i}
        className="block w-2 h-2 rounded-full bg-[#1a4fa0]"
        animate={{ scale: [0.55, 1, 0.55], opacity: [0.45, 1, 0.45] }}
        transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut', delay: i * 0.18 }}
      />
    ))}
    <span className="ml-1.5 text-[12.5px] text-slate-500">{label}</span>
  </div>
)

// ----------------------------------------------------------------------
// Linea viva bajo el mensaje del ticket creado
// ----------------------------------------------------------------------
export const TicketStatusLine = ({ ticket }: { ticket: TicketInfo }) => {
  if (ticket.assignState === 'done') return null
  if (ticket.assignState === 'assigned') {
    return (
      <span className="mt-1.5 flex items-center gap-1.5 text-[12.5px] font-medium text-emerald-700">
        <Check size={14} /> Asignado a {titleCase(ticket.assignedTo ?? '')}
      </span>
    )
  }
  return (
    <span className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-slate-500">
      <Loader size={13} className="animate-spin" /> Buscando a quién asignarlo...
    </span>
  )
}

// ----------------------------------------------------------------------
// Miniaturas de las capturas con boton para quitarlas
// ----------------------------------------------------------------------
const Thumbs = ({ files, onRemove }: { files: File[]; onRemove: (index: number) => void }) => {
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls])
  if (!files.length) return null
  return (
    <div className="flex flex-wrap gap-2">
      {urls.map((url, i) => (
        <div key={url} className="relative w-16 h-16 rounded-lg overflow-hidden border border-[#b8c4d4]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={`Captura ${i + 1}`} className="w-full h-full object-cover" />
          <button type="button" onClick={() => onRemove(i)} aria-label="Quitar captura"
            className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-slate-900/70 text-white flex items-center justify-center hover:bg-slate-900">
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}

// ----------------------------------------------------------------------
// Controles del paso actual
// ----------------------------------------------------------------------
interface TicketControlsProps {
  draft: TicketDraft
  catalogs: TicketCatalogs | null
  catalogsError: boolean
  onAdvance: (answer: string, patch: Partial<TicketDraft>, next: TicketStep) => void
  onPatch: (patch: Partial<TicketDraft>) => void
  onAddFiles: (files: File[]) => void
  onSubmit: () => void
  onCancel: () => void
}

const TicketControls = ({ draft, catalogs, catalogsError, onAdvance, onPatch, onAddFiles, onSubmit, onCancel }: TicketControlsProps) => {
  const [filter, setFilter] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const systems = catalogs?.systems ?? []
  const system = systems.find((s) => s.id === draft.systemId)
  const selectedModule = system?.modules.find((m) => m.id === draft.moduleId)
  const severity = catalogs?.severities.find((s) => s.id === draft.severityId)
  // Sugerencias: sistema mencionado en la pregunta o el del tema de los documentos
  const asked = plain(draft.title)
  const topicText = plain(draft.topics.join(' ')).replace(/[^a-z0-9]+/g, ' ')
  const suggestedSystem = systems.find((s) => mentions(asked, s.name))
    ?? systems.find((s) => !!draft.suggestedSystem && plain(s.name) === plain(draft.suggestedSystem))
  const removeFile = (index: number) => onPatch({ files: draft.files.filter((_, k) => k !== index), error: null })

  const picker = (
    <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
      onChange={(e) => { onAddFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
  )
  const attachButton = draft.files.length < MAX_FILES && (
    <button type="button" className={chipIdle} onClick={() => fileRef.current?.click()}>
      <Paperclip size={13} className="inline mr-1 -mt-0.5" />Adjuntar captura
    </button>
  )
  const cancel = (
    <button type="button" onClick={onCancel} className="text-[12px] text-slate-500 hover:text-slate-700 hover:underline">
      Cancelar ticket
    </button>
  )
  const error = draft.error && <p className="text-[12px] text-red-600">{draft.error}</p>

  // Los pasos con catalogo esperan a que este cargado
  if ((draft.step === 'system' || draft.step === 'module' || draft.step === 'severity') && !catalogs) {
    return (
      <div className={box}>
        <p className="text-[12.5px] text-slate-500">
          {catalogsError ? 'No pude cargar los catálogos. Intenta más tarde o crea el ticket desde la Mesa de soporte.' : 'Cargando catálogos...'}
        </p>
        {cancel}
      </div>
    )
  }

  if (draft.step === 'type') {
    return (
      <div className={box}>
        <div className="flex flex-wrap gap-2">
          {(['funcional', 'tecnico'] as const).map((t) => (
            <button key={t} type="button" className={draft.suggestedType === t ? chipSuggested : chipIdle}
              onClick={() => onAdvance(TYPE_LABEL[t], { reportedType: t }, 'system')}>
              {TYPE_LABEL[t]}
              {draft.suggestedType === t && <span className="ml-1.5 text-[10.5px] uppercase tracking-wide">Sugerido</span>}
            </button>
          ))}
        </div>
        {cancel}
      </div>
    )
  }

  if (draft.step === 'system') {
    const list = systems.filter((s) => !filter || plain(s.name).includes(plain(filter)))
    const ordered = suggestedSystem && list.some((s) => s.id === suggestedSystem.id)
      ? [suggestedSystem, ...list.filter((s) => s.id !== suggestedSystem.id)]
      : list
    return (
      <div className={box}>
        {systems.length > 8 && (
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar sistema" className={field} />
        )}
        <div className="flex flex-wrap gap-2 max-h-44 overflow-y-auto">
          {ordered.map((s) => (
            <button key={s.id} type="button" className={suggestedSystem?.id === s.id ? chipSuggested : chipIdle}
              onClick={() => { setFilter(''); onAdvance(s.name, { systemId: s.id, moduleId: null }, s.modules.length ? 'module' : 'severity') }}>
              {s.name}
            </button>
          ))}
          {!ordered.length && <p className="text-[12px] text-slate-500">Sin coincidencias.</p>}
        </div>
        {cancel}
      </div>
    )
  }

  if (draft.step === 'module') {
    const modules = system?.modules ?? []
    const suggestedModule = modules.find((m) => mentions(`${topicText} ${asked}`, m.name))
    const ordered = suggestedModule ? [suggestedModule, ...modules.filter((m) => m.id !== suggestedModule.id)] : modules
    return (
      <div className={box}>
        <div className="flex flex-wrap gap-2 max-h-44 overflow-y-auto">
          {ordered.map((m) => (
            <button key={m.id} type="button" className={suggestedModule?.id === m.id ? chipSuggested : chipIdle}
              onClick={() => onAdvance(m.name, { moduleId: m.id }, 'severity')}>
              {m.name}
            </button>
          ))}
          <button type="button" className={chipIdle} onClick={() => onAdvance('No sé', { moduleId: null }, 'severity')}>No sé</button>
        </div>
        {cancel}
      </div>
    )
  }

  if (draft.step === 'severity') {
    return (
      <div className={box}>
        <div className="flex flex-col gap-1.5">
          {(catalogs?.severities ?? []).map((s) => (
            <button key={s.id} type="button"
              className="flex items-center gap-2.5 rounded-lg border border-[#b8c4d4] bg-white px-3 py-2 text-left text-[12.5px] text-slate-700 transition-colors hover:border-[#1a4fa0] hover:bg-blue-50/40"
              onClick={() => onAdvance(severityText(s.code, s.name), { severityId: s.id }, 'attach')}>
              <SeverityBadge code={s.code} name={s.name} />
              <span>{SEVERITY_LABEL[s.code] ?? s.name}</span>
            </button>
          ))}
        </div>
        {cancel}
      </div>
    )
  }

  if (draft.step === 'attach') {
    const n = draft.files.length
    return (
      <div className={box}>
        <Thumbs files={draft.files} onRemove={removeFile} />
        {error}
        <div className="flex flex-wrap gap-2">
          {attachButton}
          <button type="button" className={chipSuggested}
            onClick={() => onAdvance(n ? `Adjunté ${n} ${n === 1 ? 'captura' : 'capturas'}` : 'Sin capturas', { error: null }, 'review')}>
            {n ? 'Continuar' : 'Omitir'}
          </button>
        </div>
        {picker}
        {cancel}
      </div>
    )
  }

  // Resumen editable y envio
  return (
    <div className={box}>
      <label className="block text-[11px] font-medium text-slate-500">
        Título
        <input value={draft.title} maxLength={150} onChange={(e) => onPatch({ title: e.target.value })} className={field} />
      </label>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
        <dt className="text-slate-500">Tipo</dt>
        <dd className="text-slate-800">{draft.reportedType ? TYPE_LABEL[draft.reportedType] : '-'}</dd>
        <dt className="text-slate-500">Sistema</dt>
        <dd className="text-slate-800">{system?.name ?? '-'}{selectedModule ? ` › ${selectedModule.name}` : ''}</dd>
        <dt className="text-slate-500">Severidad</dt>
        <dd className="flex items-center gap-2 text-slate-800">
          {severity ? (<><SeverityBadge code={severity.code} name={severity.name} /><span>{SEVERITY_LABEL[severity.code] ?? severity.name}</span></>) : '-'}
        </dd>
      </dl>
      <label className="block text-[11px] font-medium text-slate-500">
        Descripción
        <textarea rows={4} value={draft.description} maxLength={5000} onChange={(e) => onPatch({ description: e.target.value })}
          className={`${field} resize-none`} />
      </label>
      <Thumbs files={draft.files} onRemove={removeFile} />
      {attachButton}
      {error}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-lg text-[12.5px] text-slate-600 hover:bg-slate-100">
          Cancelar
        </button>
        <button type="button" onClick={onSubmit} className="px-4 py-1.5 rounded-lg bg-[#1a4fa0] text-white text-[12.5px] font-medium hover:bg-blue-800">
          Enviar ticket
        </button>
      </div>
      {picker}
    </div>
  )
}

export default TicketControls
