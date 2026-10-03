'use client'
// ----------------------------------------------------------------------
// Widget del Asistente Avalanz
// Esfera flotante abajo a la derecha de la pantalla (viewport). Al
// darle clic despliega el chat. Aparece solo en los modulos donde el
// asistente esta activo para el usuario. La conversacion se conserva al
// cerrar y abrir; se reinicia con el boton, con un inicio de sesion nuevo
// o al cerrar sesion.
// ----------------------------------------------------------------------
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowUp, ChevronDown, FileText, LifeBuoy, RotateCcw, Table, Video } from 'lucide-react'
import FluidOrb from '@/components/assistant/FluidOrb'
import { readSessionClaims } from '@/components/assistant/session'
import { useAssistantStore, type ChatMessage } from '@/store/assistantStore'
import { useAuthStore } from '@/store/authStore'
import {
  getAssistantAvailability,
  searchAssistant,
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
// Tarjeta de resultado: documento, ubicacion, secciones y extracto
// En transcripciones, los nombres de quienes hablan se muestran como vinetas.
// ----------------------------------------------------------------------
const KIND_ICON = { text: FileText, table: Table, speech: Video }

const ResultCard = ({ result }: { result: AssistantResult }) => {
  const [expanded, setExpanded] = useState(false)
  const Icon = KIND_ICON[result.kind] ?? FileText
  const sections = result.context.split(' > ').slice(2).join(' › ')
  const body = result.kind === 'speech' ? result.text.replace(/^[^:\n]{2,40}:\s*/gm, '• ') : result.text
  const long = body.length > 260

  return (
    <div className="bg-white border border-[#b8c4d4] rounded-xl p-3 hover:border-[#1a4fa0]/30 transition-colors">
      <div className="flex items-start gap-2">
        <Icon size={15} className="text-[#1a4fa0] mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-slate-800 leading-snug">{result.title}</p>
          {sections && <p className="text-[11px] text-slate-500 truncate" title={sections}>{sections}</p>}
        </div>
        {result.location && (
          <span className="shrink-0 text-[11px] font-medium text-[#1a4fa0] bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5">
            {result.location}
          </span>
        )}
      </div>
      <p className={`mt-2 text-[12.5px] text-slate-600 leading-relaxed whitespace-pre-line ${expanded ? '' : 'line-clamp-4'}`}>
        {body}
      </p>
      {long && (
        <button type="button" onClick={() => setExpanded(!expanded)} className="mt-1 text-[12px] font-medium text-[#1a4fa0] hover:underline">
          {expanded ? 'Ver menos' : 'Ver más'}
        </button>
      )}
    </div>
  )
}

// ----------------------------------------------------------------------
// Burbuja de mensaje
// ----------------------------------------------------------------------
const MessageBubble = ({ message, onTicket }: { message: ChatMessage; onTicket: (module?: string) => void }) => {
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
      </div>
      {message.results?.map((result, i) => <ResultCard key={`${message.id}-${i}`} result={result} />)}
      {message.showTicket && ticketRoute && (
        <button
          type="button"
          onClick={() => onTicket(message.module)}
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
  const { isOpen, greeted, messages, setOpen, addMessage, markGreeted, resetChat, clearAll, syncSession } = useAssistantStore()

  const [mounted, setMounted] = useState(false)
  const [available, setAvailable] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [typing, setTyping] = useState(false)
  const [pending, setPending] = useState(false)
  const [draft, setDraft] = useState('')
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

  const send = useCallback(async () => {
    const question = draft.trim()
    if (!question || pending || !module) return
    setDraft('')
    addMessage({ role: 'user', text: question })
    setPending(true)
    try {
      const data = await searchAssistant(question, module)
      const empty = data.results.length === 0
      addMessage({
        role: 'assistant',
        text: empty ? 'No encontré información sobre eso en el material de capacitación.' : INTRO[data.confidence],
        results: data.results,
        confidence: data.confidence,
        showTicket: empty || data.confidence !== 'alta',
        module,
      })
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status
      addMessage({ role: 'assistant', text: errorText(status) })
    } finally {
      setPending(false)
    }
  }, [draft, pending, module, addMessage])

  const restart = () => {
    resetChat()
    setTyping(true)
    setTimeout(() => {
      addMessage({ role: 'assistant', text: 'Listo, empecemos de nuevo. ¿En qué te ayudo?' })
      setTyping(false)
    }, 600)
  }

  const openTicket = (target?: string) => {
    const route = target ? TICKET_ROUTES[target] : undefined
    if (!route) return
    setOpen(false)
    router.push(route)
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
                    <MessageBubble message={message} onTicket={openTicket} />
                  </motion.div>
                ))}
              </AnimatePresence>
              {(typing || pending) && <TypingDots />}
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
                  placeholder="Escribe tu pregunta"
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
