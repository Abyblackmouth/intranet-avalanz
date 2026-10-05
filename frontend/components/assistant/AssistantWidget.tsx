'use client'
// ----------------------------------------------------------------------
// Widget del Asistente Avalanz
// Esfera flotante abajo a la derecha de la pantalla (viewport). Al
// darle clic despliega el chat. Aparece solo en los modulos donde el
// asistente esta activo para el usuario. La conversacion se conserva al
// cerrar y abrir; se reinicia con el boton, con un inicio de sesion nuevo
// o al cerrar sesion.
// ----------------------------------------------------------------------
import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowUp, ArrowUpRight, ChevronDown, Download, FileText, LifeBuoy, RotateCcw, Table, Video, X } from 'lucide-react'
import FluidOrb from '@/components/assistant/FluidOrb'
import { readSessionClaims } from '@/components/assistant/session'
import TicketControls, { SendingDots, STEP_PROMPT, TicketStatusLine, ticketContext, mergeFiles, type TicketContext } from '@/components/assistant/TicketFlow'
import { useWSEvent } from '@/hooks/useWebSocket'
import { useAssistantStore, type ChatMessage, type TicketDraft, type TicketStep } from '@/store/assistantStore'
import { useAuthStore } from '@/store/authStore'
import {
  getAssistantAvailability,
  sendDialogMessage,
  getTicketCatalogs,
  getDocumentLink,
  suggestTicketType,
  createChatTicket,
  type TicketCatalogs,
  type AssistantConfidence,
  type AssistantResult,
} from '@/services/assistantService'

// Modulo con alta de ticket conocida
const TICKET_ROUTES: Record<string, string> = {
  'it-service-desk': '/app/it-service-desk/mesa-de-soporte?nuevo=1',
}

// Mensaje que acompana a los resultados segun la confianza
const INTRO: Record<AssistantConfidence, string> = {
  alta: 'Esto es lo que encontré:',
  media: 'Encontré esto. Revisa si responde tu duda:',
  baja: 'No encontré una respuesta clara. Esto es lo más cercano:',
}

// Mensaje de error segun el estado HTTP
const errorText = (status?: number) => {
  if (status === 403) return 'El asistente no está disponible para ti en este módulo.'
  if (status === 503) return 'La búsqueda no está disponible en este momento. Intenta en unos minutos.'
  return 'No pude completar la búsqueda. Intenta de nuevo.'
}

// ----------------------------------------------------------------------
// Tres puntos que crecen y se encogen en secuencia
// ----------------------------------------------------------------------
const TypingDots = () => (
  <div className="flex items-center gap-1.5 px-4 py-3 bg-white border border-[#b8c4d4] rounded-2xl rounded-bl-md w-fit shadow-sm" aria-label="Escribiendo">
    {[0, 1, 2].map((i) => (
      <motion.span
        key={i}
        className="block w-2 h-2 rounded-full bg-[#1a4fa0]"
        animate={{ scale: [0.55, 1, 0.55], opacity: [0.45, 1, 0.45] }}
        transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut', delay: i * 0.18 }}
      />
    ))}
  </div>
)

// ----------------------------------------------------------------------
// Agrupacion de resultados por documento
// Conserva el orden de relevancia y quita secciones repetidas (mismo
// documento, seccion y ubicacion). En transcripciones, los nombres de
// quienes hablan se muestran como vinetas.
// ----------------------------------------------------------------------
const KIND_ICON = { text: FileText, table: Table, speech: Video }

interface ResultGroup {
  document: string
  title: string
  kind: AssistantResult['kind']
  items: AssistantResult[]
}

const groupResults = (results: AssistantResult[]): ResultGroup[] => {
  const groups = new Map<string, ResultGroup>()
  const seen = new Set<string>()
  for (const result of results) {
    const key = `${result.document}|${result.context}|${result.location}`
    if (seen.has(key)) continue
    seen.add(key)
    const group = groups.get(result.document) ?? { document: result.document, title: result.title, kind: result.kind, items: [] }
    group.items.push(result)
    groups.set(result.document, group)
  }
  return [...groups.values()]
}

const sectionPath = (result: AssistantResult) => result.context.split(' > ').slice(2).join(' › ')

// Etiqueta corta: la ultima seccion y la ubicacion
const sectionLabel = (result: AssistantResult) => {
  const parts = result.context.split(' > ').slice(2)
  const last = parts[parts.length - 1]
  if (!last) return result.location || 'Fragmento'
  return result.location ? `${last} · ${result.location}` : last
}

const cleanText = (result: AssistantResult) =>
  result.kind === 'speech' ? result.text.replace(/^(?!•)[^:\n]{2,40}:\s*/gm, '• ') : result.text

// ----------------------------------------------------------------------
// Tarjeta por documento
// Muestra la seccion mas relevante; las demas secciones del mismo
// documento quedan como etiquetas que, al hacer clic, se muestran aqui.
// ----------------------------------------------------------------------
// ----------------------------------------------------------------------
// Extracto con tablas: las lineas "| a | b |" se muestran como tabla real.
// Se omiten la fila separadora (| --- |) y, al inicio de una tabla, la
// fila casi vacia que deja una tabla partida por un salto de pagina en el
// PDF. Las filas casi vacias en medio de una tabla se conservan (hay
// tablas legitimas con columnas en blanco, como los checklists).
// ----------------------------------------------------------------------
type Segmento = { tipo: 'texto'; texto: string } | { tipo: 'tabla'; filas: string[][]; encabezado: boolean }

const segmentar = (texto: string): Segmento[] => {
  const segmentos: Segmento[] = []
  let parrafo: string[] = []
  let filas: string[][] = []
  let encabezado = false
  const cerrarParrafo = () => {
    if (parrafo.join('').trim()) segmentos.push({ tipo: 'texto', texto: parrafo.join('\n').trim() })
    parrafo = []
  }
  const cerrarTabla = () => {
    if (filas.length) segmentos.push({ tipo: 'tabla', filas, encabezado })
    filas = []; encabezado = false
  }
  for (const linea of texto.split('\n')) {
    const l = linea.trim()
    if (l.length > 2 && l.startsWith('|') && l.endsWith('|')) {
      cerrarParrafo()
      const celdas = l.slice(1, -1).split('|').map((c) => c.trim())
      if (celdas.every((c) => /^:?-{2,}:?$/.test(c))) { if (filas.length === 1) encabezado = true; continue }
      const llenas = celdas.filter((c) => c.replace(/["'.\s]/g, '')).length
      if (filas.length === 0 && celdas.length >= 3 && llenas <= 1) continue
      filas.push(celdas)
    } else {
      cerrarTabla(); parrafo.push(linea)
    }
  }
  cerrarParrafo(); cerrarTabla()
  return segmentos
}

const RichExcerpt = ({ text, expanded }: { text: string; expanded: boolean }) => (
  <div className={`mt-2 space-y-2 text-[12.5px] leading-relaxed text-slate-600 ${expanded ? '' : 'max-h-28 overflow-hidden'}`}>
    {segmentar(text).map((s, i) => (s.tipo === 'texto' ? (
      <p key={i} className="whitespace-pre-line">{s.texto}</p>
    ) : (
      <div key={i} className="overflow-x-auto">
        <table className="w-full border-collapse text-[11.5px]">
          <tbody>
            {s.filas.map((fila, r) => (
              <tr key={r} className={r === 0 && s.encabezado ? 'bg-slate-50 font-semibold text-slate-700' : ''}>
                {fila.map((celda, k) => (
                  <td key={k} className="border border-[#b8c4d4] px-1.5 py-1 align-top">{celda}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )))}
  </div>
)

// Accion para abrir la fuente: video, manual en PDF o descarga
const openAction = (result: AssistantResult) => {
  if (result.kind === 'speech') return { label: 'Ver en el video', Icon: Video }
  if (result.document.toLowerCase().endsWith('.pdf')) return { label: 'Abrir en el manual', Icon: FileText }
  return { label: 'Descargar', Icon: Download }
}

const DocumentCard = ({ group, onOpen }: { group: ResultGroup; onOpen: (result: AssistantResult) => void }) => {
  const [selected, setSelected] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const Icon = KIND_ICON[group.kind] ?? FileText
  const current = group.items[selected]
  const body = cleanText(current)
  const path = sectionPath(current)
  const long = body.length > 260 || /^\s*\|/m.test(body)

  return (
    <div className="bg-white border border-[#b8c4d4] rounded-xl p-3 hover:border-[#1a4fa0]/40 transition-colors">
      <div className="flex items-start gap-2">
        <Icon size={15} className="text-[#1a4fa0] mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-slate-800 leading-snug">{group.title}</p>
          {path && <p className="text-[11px] text-slate-500 truncate" title={path}>{path}</p>}
        </div>
        {current.location && (
          <span className="shrink-0 text-[11px] font-medium text-[#1a4fa0] bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5">
            {current.location}
          </span>
        )}
      </div>
      <RichExcerpt text={body} expanded={expanded} />
      <div className="mt-1.5 flex items-center gap-3">
        {long && (
          <button type="button" onClick={() => setExpanded(!expanded)} className="text-[12px] font-medium text-[#1a4fa0] hover:underline">
            {expanded ? 'Ver menos' : 'Ver más'}
          </button>
        )}
        {(() => {
          const { label, Icon } = openAction(current)
          return (
            <button type="button" onClick={() => onOpen(current)}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-[#b8c4d4] px-2.5 py-1 text-[12px] font-medium text-[#1a4fa0] transition-colors hover:border-[#1a4fa0] hover:bg-blue-50">
              <Icon size={13} />{label}
            </button>
          )
        })()}
      </div>
      {group.items.length > 1 && (
        <div className="mt-2.5 pt-2.5 border-t border-slate-200">
          <p className="text-[11px] text-slate-500 mb-1.5">También en este documento:</p>
          <div className="flex flex-wrap gap-1.5">
            {group.items.map((item, i) => (i === selected ? null : (
              <button
                key={`${item.context}-${item.location}`}
                type="button"
                onClick={() => { setSelected(i); setExpanded(false) }}
                className="max-w-full truncate text-[11px] text-slate-600 bg-slate-50 border border-[#b8c4d4] rounded-full px-2 py-0.5 hover:border-[#1a4fa0] hover:text-[#1a4fa0] transition-colors"
                title={sectionPath(item) || item.location}
              >
                {sectionLabel(item)}
              </button>
            )))}
          </div>
        </div>
      )}
    </div>
  )
}

// ----------------------------------------------------------------------
// Burbuja de mensaje
// ----------------------------------------------------------------------
const MessageBubble = ({ message, onTicket, onOpenDocument }: {
  message: ChatMessage
  onTicket: (messageId: string) => void
  onOpenDocument: (result: AssistantResult, module?: string) => void
}) => {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-[#1a4fa0] text-white text-[13.5px] leading-relaxed px-4 py-2.5 rounded-2xl rounded-br-md whitespace-pre-line">
          {message.text}
        </div>
      </div>
    )
  }
  const ticketRoute = message.module ? TICKET_ROUTES[message.module] : undefined
  const strong = message.confidence === 'baja' || (message.results?.length ?? 0) === 0
  return (
    <div className="flex flex-col gap-2 max-w-[92%]">
      <div className="bg-white border border-[#b8c4d4] text-slate-800 text-[13.5px] leading-relaxed px-4 py-2.5 rounded-2xl rounded-bl-md shadow-sm w-fit">
        {message.text}
        {message.ticket && <TicketStatusLine ticket={message.ticket} />}
      </div>
      {groupResults(message.results ?? []).slice(0, 3).map((group) => (
        <DocumentCard key={`${message.id}-${group.document}`} group={group} onOpen={(r) => onOpenDocument(r, message.module)} />
      ))}
      {message.showTicket && ticketRoute && (
        <button
          type="button"
          onClick={() => onTicket(message.id)}
          className={strong
            ? 'flex items-center justify-center gap-2 w-fit px-4 py-2 rounded-xl bg-[#1a4fa0] text-white text-[13px] font-medium hover:bg-blue-800 transition-colors'
            : 'flex items-center gap-1.5 w-fit text-[12.5px] font-medium text-[#1a4fa0] hover:underline'}
        >
          <LifeBuoy size={15} />
          {strong ? 'Levantar un ticket' : '¿No resolvió tu duda? Levanta un ticket'}
        </button>
      )}
    </div>
  )
}

// ----------------------------------------------------------------------
// Widget
// ----------------------------------------------------------------------
const AssistantWidget = () => {
  const pathname = usePathname()
  const router = useRouter()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const { isOpen, greeted, messages, setOpen, addMessage, markGreeted, resetChat, clearAll, syncSession,
    ticketDraft, setTicketDraft, patchTicketDraft, updateTicket } = useAssistantStore()

  const [mounted, setMounted] = useState(false)
  const [available, setAvailable] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [typing, setTyping] = useState(false)
  const [pending, setPending] = useState(false)
  const [draft, setDraft] = useState('')
  const [catalogs, setCatalogs] = useState<TicketCatalogs | null>(null)
  const [catalogsError, setCatalogsError] = useState(false)
  // Asignaciones que llegan antes que la respuesta del alta (motor muy rapido)
  const earlyAssignments = useRef(new Map<string, string>())
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const module = pathname?.match(/^\/app\/([^/]+)/)?.[1] ?? null

  useEffect(() => setMounted(true), [])

  // Sesion: conversacion ligada al inicio de sesion del JWT
  useEffect(() => {
    if (!mounted) return
    const claims = readSessionClaims()
    setFirstName(claims.firstName)
    syncSession(claims.sessionKey)
  }, [mounted, pathname, syncSession])

  // Cerrar sesion borra la conversacion
  useEffect(() => {
    if (mounted && !isAuthenticated) clearAll()
  }, [mounted, isAuthenticated, clearAll])

  // Disponibilidad del asistente en el modulo actual
  useEffect(() => {
    let active = true
    if (!mounted || !module) {
      setAvailable(false)
      return
    }
    getAssistantAvailability(module)
      .then((value) => active && setAvailable(value))
      .catch(() => active && setAvailable(false))
    return () => {
      active = false
    }
  }, [mounted, module])

  // Saludo: una sola vez por inicio de sesion, con los tres puntos antes
  useEffect(() => {
    if (!isOpen || greeted || messages.length > 0) return
    setTyping(true)
    const timer = setTimeout(() => {
      addMessage({ role: 'assistant', text: `Hola${firstName ? ` ${firstName}` : ''}, ¿en qué te puedo ayudar?` })
      markGreeted()
      setTyping(false)
    }, 900)
    return () => clearTimeout(timer)
  }, [isOpen, greeted, messages.length, firstName, addMessage, markGreeted])

  // Al abrir, el cursor queda en el campo de pregunta
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 250)
  }, [isOpen])

  // Desplazamiento al ultimo mensaje
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, typing, pending, isOpen])

  // ------------------------------------------------------------------
  // Ticket desde el chat
  // ------------------------------------------------------------------
  const startTicketFlow = useCallback((ctx: TicketContext) => {
    const q = ctx.title.trim()
    setTicketDraft({
      step: q ? 'type' : 'describe', title: q, description: ctx.description,
      suggestedType: null, suggestedSystem: null, topics: ctx.topics,
      reportedType: null, systemId: null, moduleId: null, severityId: null, files: [], error: null,
    })
    addMessage({ role: 'assistant', text: q ? STEP_PROMPT.type : STEP_PROMPT.describe })
    if (!catalogs) {
      setCatalogsError(false)
      getTicketCatalogs().then(setCatalogs).catch(() => setCatalogsError(true))
    }
    if (q) {
      suggestTicketType(ctx.questions.join('\n'), ctx.topics)
        .then((r) => patchTicketDraft({ suggestedType: r.reported_type, suggestedSystem: r.system ?? null }))
        .catch(() => undefined)
    }
  }, [addMessage, catalogs, patchTicketDraft, setTicketDraft])

  const describeProblem = (text: string) => {
    patchTicketDraft({ step: 'type', title: text.slice(0, 150), description: `${text}\n\nLevantado desde el Asistente Avalanz.` })
    addMessage({ role: 'assistant', text: STEP_PROMPT.type })
    suggestTicketType(text).then((r) => patchTicketDraft({ suggestedType: r.reported_type })).catch(() => undefined)
  }

  const advanceTicket = (answer: string, patch: Partial<TicketDraft>, next: TicketStep) => {
    addMessage({ role: 'user', text: answer })
    patchTicketDraft({ ...patch, step: next })
    addMessage({ role: 'assistant', text: STEP_PROMPT[next] })
  }

  const cancelTicketFlow = () => {
    setTicketDraft(null)
    addMessage({ role: 'assistant', text: 'Listo, cancelé el ticket. ¿En qué más te ayudo?' })
  }

  const addTicketFiles = (incoming: File[]) => {
    const current = useAssistantStore.getState().ticketDraft
    if (!current || !incoming.length) return
    const { files, error } = mergeFiles(current.files, incoming)
    patchTicketDraft({ files, error })
  }

  // Pegar (Ctrl + V) o soltar imagenes en el panel durante el ticket
  const acceptsFiles = () => ['attach', 'review'].includes(useAssistantStore.getState().ticketDraft?.step ?? '')
  const handlePaste = (e: ClipboardEvent) => {
    if (!acceptsFiles()) return
    const images = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'))
    if (!images.length) return
    e.preventDefault()
    addTicketFiles(images)
  }
  const handleDrop = (e: DragEvent) => {
    if (!useAssistantStore.getState().ticketDraft) return
    e.preventDefault()
    if (acceptsFiles()) addTicketFiles(Array.from(e.dataTransfer.files))
  }

  const submitTicket = async () => {
    const t = useAssistantStore.getState().ticketDraft
    if (!t || !t.reportedType || !t.systemId || !t.severityId) return
    if (!t.title.trim() || !t.description.trim()) {
      patchTicketDraft({ error: 'El título y la descripción no pueden quedar vacíos.' })
      return
    }
    patchTicketDraft({ step: 'sending', error: null })
    try {
      const created = await createChatTicket({
        title: t.title.trim(), description: t.description.trim(), system_id: t.systemId, module_id: t.moduleId,
        reported_type: t.reportedType, severity_reported_id: t.severityId,
      }, t.files)
      setTicketDraft(null)
      const early = earlyAssignments.current.get(String(created.id))
      addMessage({
        role: 'assistant',
        text: `Listo, se generó el ticket ${created.folio}. Revisa tu correo: te llegó la confirmación.`,
        ticket: { id: String(created.id), folio: created.folio, assignState: early ? 'assigned' : 'pending', assignedTo: early ?? null },
      })
    } catch {
      patchTicketDraft({ step: 'review', error: 'No pude generar el ticket. Intenta de nuevo o créalo desde la Mesa de soporte.' })
    }
  }

  // Asignacion en vivo: el IT Service Desk avisa al solicitante por WebSocket
  const onTicketEvent = useCallback((payload: unknown) => {
    const data = payload as { id?: string; assigned_to_name?: string | null }
    if (!data?.id || !data.assigned_to_name) return
    earlyAssignments.current.set(String(data.id), data.assigned_to_name)
    updateTicket(String(data.id), { assignState: 'assigned', assignedTo: data.assigned_to_name })
  }, [updateTicket])
  useWSEvent('it_service_desk.ticket_updated', onTicketEvent)
  useWSEvent('it_service_desk.ticket_created', onTicketEvent)

  // Si en 20 segundos no llega la asignacion (backlog), la linea viva se retira
  useEffect(() => {
    const pendientes = messages.filter((m) => m.ticket?.assignState === 'pending')
    const timers = pendientes.map((m) =>
      setTimeout(() => updateTicket(m.ticket!.id, { assignState: 'done' }), Math.max(0, m.createdAt + 20000 - Date.now()))
    )
    return () => timers.forEach(clearTimeout)
  }, [messages, updateTicket])

  const send = useCallback(async () => {
    const question = draft.trim()
    if (!question || pending || !module) return
    if (ticketDraft && ticketDraft.step !== 'sending') {
      setDraft('')
      addMessage({ role: 'user', text: question })
      if (/^(cancelar|cancela|salir)$/i.test(question)) { cancelTicketFlow(); return }
      if (ticketDraft.step === 'describe') { describeProblem(question); return }
      addMessage({ role: 'assistant', text: 'Para continuar, elige una de las opciones de abajo, o escribe «cancelar».' })
      return
    }
    // Ultimo mensaje del asistente: si ofrecio el ticket, un "si" lo arranca
    const previous = [...useAssistantStore.getState().messages].reverse().find((m) => m.role === 'assistant')
    setDraft('')
    addMessage({ role: 'user', text: question })
    setPending(true)
    try {
      const data = await sendDialogMessage(question, module)
      // Platica basica: respuesta directa, sin resultados
      if (data.reply) {
        if (data.intent === 'confirmacion' && previous?.showTicket && !useAssistantStore.getState().ticketDraft) {
          const all = useAssistantStore.getState().messages
          startTicketFlow(ticketContext(all, all.findIndex((m) => m.id === previous.id) + 1))
          return
        }
        addMessage({ role: 'assistant', text: data.reply, showTicket: Boolean(data.show_ticket), module })
        if (data.action === 'open_ticket_flow' && !useAssistantStore.getState().ticketDraft) {
          startTicketFlow(ticketContext(useAssistantStore.getState().messages))
        }
        return
      }
      const empty = data.results.length === 0
      addMessage({
        role: 'assistant',
        text: empty ? 'No encontré información sobre eso en el material de capacitación.' : INTRO[data.confidence as AssistantConfidence],
        results: data.results,
        confidence: data.confidence as AssistantConfidence,
        showTicket: empty || data.confidence !== 'alta',
        module,
      })
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status
      addMessage({ role: 'assistant', text: errorText(status) })
    } finally {
      setPending(false)
    }
  }, [draft, pending, module, addMessage, ticketDraft, startTicketFlow]) // eslint-disable-line react-hooks/exhaustive-deps

  const restart = () => {
    resetChat()
    setTyping(true)
    setTimeout(() => {
      addMessage({ role: 'assistant', text: 'Listo, empecemos de nuevo. ¿En qué te ayudo?' })
      setTyping(false)
    }, 600)
  }

  // ------------------------------------------------------------------
  // Visor de documentos: PDF en la pagina citada y video en el minuto
  // citado; Word y PowerPoint se descargan
  // ------------------------------------------------------------------
  const [viewer, setViewer] = useState<{
    url: string; mode: 'pdf' | 'video'; title: string; location: string; page: number | null; start: number | null
  } | null>(null)

  useEffect(() => {
    if (!viewer) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setViewer(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewer])

  const openDocument = async (result: AssistantResult, target?: string) => {
    if (!target) return
    try {
      const link = await getDocumentLink(result.document, target)
      if (link.mode === 'download') {
        const a = document.createElement('a')
        a.href = link.url
        a.download = link.filename
        document.body.appendChild(a)
        a.click()
        a.remove()
        return
      }
      setViewer({ url: link.url, mode: link.mode, title: result.title, location: result.location,
                  page: result.page, start: result.start_seconds })
    } catch {
      addMessage({ role: 'assistant', text: 'No pude abrir el documento en este momento. Intenta de nuevo.' })
    }
  }

  const openTicket = (messageId: string) => {
    if (useAssistantStore.getState().ticketDraft) return
    const all = useAssistantStore.getState().messages
    startTicketFlow(ticketContext(all, all.findIndex((m) => m.id === messageId) + 1))
  }

  if (!mounted || !available) return null

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.section
            key="panel"
            role="dialog"
            aria-label="Asistente Avalanz"
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            style={{ transformOrigin: 'bottom right' }}
            onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
            onPaste={handlePaste}
            onDragOver={(e) => { if (ticketDraft) e.preventDefault() }}
            onDrop={handleDrop}
            className="fixed inset-0 z-50 flex flex-col bg-white sm:inset-auto sm:bottom-24 sm:right-[34px] sm:w-[380px] sm:h-[560px] sm:max-h-[calc(100vh-8rem)] sm:rounded-2xl sm:border sm:border-[#b8c4d4] sm:shadow-[0_24px_48px_-12px_rgba(15,23,42,0.28),0_8px_16px_-8px_rgba(15,23,42,0.18)] overflow-hidden"
          >
            <header className="flex items-center gap-3 px-4 py-3 border-b border-[#b8c4d4] bg-white">
              <FluidOrb size={30} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800 leading-tight">Asistente Avalanz</p>
                <p className="text-[11px] text-slate-500 leading-tight">Responde con manuales y sesiones de capacitación</p>
              </div>
              <button type="button" onClick={restart} aria-label="Reiniciar chat" title="Reiniciar chat"
                className="p-2 rounded-lg text-slate-500 hover:text-[#1a4fa0] hover:bg-slate-100 transition-colors">
                <RotateCcw size={16} />
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" title="Cerrar"
                className="p-2 rounded-lg text-slate-500 hover:text-[#1a4fa0] hover:bg-slate-100 transition-colors">
                <ChevronDown size={18} />
              </button>
            </header>

            <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-slate-50">
              <AnimatePresence initial={false}>
                {messages.map((message) => (
                  <motion.div key={message.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
                    <MessageBubble message={message} onTicket={openTicket} onOpenDocument={(r, m) => void openDocument(r, m)} />
                  </motion.div>
                ))}
              </AnimatePresence>
              {(typing || pending) && <TypingDots />}
              {ticketDraft?.step === 'sending' && <SendingDots label="Generando ticket..." />}
              {ticketDraft && ticketDraft.step !== 'sending' && ticketDraft.step !== 'describe' && (
                <TicketControls draft={ticketDraft} catalogs={catalogs} catalogsError={catalogsError}
                  onAdvance={advanceTicket} onPatch={patchTicketDraft} onAddFiles={addTicketFiles}
                  onSubmit={() => void submitTicket()} onCancel={cancelTicketFlow} />
              )}
            </div>

            <div className="border-t border-[#b8c4d4] bg-white p-3">
              <div className="flex items-end gap-2 border border-[#b8c4d4] rounded-xl px-3 py-2 focus-within:border-[#1a4fa0] focus-within:ring-2 focus-within:ring-[#1a4fa0]/10 transition-all">
                <textarea
                  ref={inputRef}
                  value={draft}
                  rows={1}
                  maxLength={500}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void send()
                    }
                  }}
                  placeholder={ticketDraft?.step === 'describe' ? 'Describe el problema' : ticketDraft ? 'Elige una opción o escribe «cancelar»' : 'Escribe tu pregunta'}
                  className="flex-1 resize-none bg-transparent outline-none text-[13.5px] text-slate-800 placeholder:text-slate-400 max-h-28 py-1"
                />
                <button type="button" onClick={() => void send()} aria-label="Enviar"
                  className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${draft.trim() && !pending ? 'bg-[#1a4fa0] text-white hover:bg-blue-800' : 'bg-slate-100 text-slate-400'}`}>
                  <ArrowUp size={16} />
                </button>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {viewer && (
          <motion.div key="visor" className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setViewer(null)}>
            <motion.div role="dialog" aria-label={viewer.title}
              className="flex h-[88vh] w-[min(1100px,94vw)] flex-col overflow-hidden rounded-2xl border border-[#b8c4d4] bg-white shadow-2xl"
              initial={{ scale: 0.96, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 12 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3 border-b border-[#b8c4d4] px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{viewer.title}</p>
                  {viewer.location && <p className="text-[11px] text-slate-500">{viewer.location}</p>}
                </div>
                {viewer.mode === 'pdf' && (
                  <a href={`${viewer.url}#page=${viewer.page ?? 1}`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-[#1a4fa0] hover:bg-blue-50">
                    <ArrowUpRight size={14} />Abrir en pestaña nueva
                  </a>
                )}
                <button type="button" onClick={() => setViewer(null)} aria-label="Cerrar" title="Cerrar"
                  className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-[#1a4fa0]">
                  <X size={18} />
                </button>
              </div>
              {viewer.mode === 'pdf' ? (
                <iframe title={viewer.title} src={`${viewer.url}#page=${viewer.page ?? 1}`} className="w-full flex-1" />
              ) : (
                <video src={viewer.url} controls autoPlay className="w-full flex-1 bg-black"
                  onLoadedMetadata={(e) => { if (viewer.start) e.currentTarget.currentTime = viewer.start }} />
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={() => setOpen(!isOpen)}
        aria-label={isOpen ? 'Cerrar asistente' : 'Abrir asistente'}
        title="Asistente Avalanz"
        whileHover={{ scale: 1.18, y: -3 }}
        whileTap={{ scale: 0.92, y: 0 }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        className="fixed bottom-6 right-[34px] z-40 rounded-full focus:outline-none focus-visible:ring-4 focus-visible:ring-[#1a4fa0]/30"
      >
        <FluidOrb size={44} blink={!isOpen} elevated />
      </motion.button>
    </>
  )
}

export default AssistantWidget
