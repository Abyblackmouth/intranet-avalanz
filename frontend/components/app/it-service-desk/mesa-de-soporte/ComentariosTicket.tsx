'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { MessagesSquare, Lock, Paperclip, Send, X, Hourglass, Camera, CalendarClock, ListOrdered, CircleHelp } from 'lucide-react'
import { getComentarios, enviarComentario } from '@/services/itServiceDeskService'
import { useWSEvent } from '@/hooks/useWebSocket'
import { useAuthStore } from '@/store/authStore'

// Conversacion del ticket: comentarios de ida y vuelta (solicitante <-> TI) y
// notas internas solo para TI. Las notas internas las filtra el backend.

interface Comentario {
  id: string; autor: string; autor_id: string; rol: 'ti' | 'solicitante'; texto: string
  interna: boolean; pide_respuesta: boolean; adjuntos: any[]; creado: string; autor_foto?: string | null
}
const TZ = 'America/Monterrey'
const MAX_MB = 50
const PREGUNTAS = [
  { icono: Camera, txt: 'Captura del error', pregunta: '¿Me compartes una captura de pantalla del error?' },
  { icono: CalendarClock, txt: 'Fecha y hora', pregunta: '¿En qué fecha y hora ocurrió?' },
  { icono: ListOrdered, txt: 'Pasos para reproducirlo', pregunta: '¿Me describes los pasos que seguiste para que vuelva a pasar?' },
  { icono: CircleHelp, txt: '¿Ya quedó?', pregunta: '¿Me confirmas si ya quedó resuelto de tu lado?' },
]
const iniciales = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()
function hace(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'justo ahora'
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`
  return new Date(iso).toLocaleString('es-MX', { timeZone: TZ, day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' })
}
const completa = (iso: string) => new Date(iso).toLocaleString('es-MX', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' })

export default function ComentariosTicket({ incidentId, renderAdjunto, renderAvatar }: {
  incidentId: string; renderAdjunto: (a: any, i: number) => ReactNode
  renderAvatar?: (nombre: string, foto: string | null) => ReactNode
}) {
  const miId = useAuthStore((s: any) => s.user?.user_id)
  const [lista, setLista] = useState<Comentario[]>([])
  const [puedeInterna, setPuedeInterna] = useState(false)
  const [esperando, setEsperando] = useState<{ desde: string; por: string } | null>(null)
  const [cerrada, setCerrada] = useState(false)
  const [texto, setTexto] = useState('')
  const [interna, setInterna] = useState(false)
  const [pide, setPide] = useState(false)
  const [archivos, setArchivos] = useState<File[]>([])
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const hilo = useRef<HTMLDivElement>(null)
  const caja = useRef<HTMLTextAreaElement>(null)
  const archivoRef = useRef<HTMLInputElement>(null)

  const cargar = useCallback(() => {
    getComentarios(incidentId).then(r => {
      const d = r.data?.data ?? r.data ?? {}
      setLista(d.comentarios ?? []); setPuedeInterna(!!d.puede_nota_interna); setEsperando(d.esperando ?? null); setCerrada(!!d.cerrada)
    }).catch(() => {})
  }, [incidentId])
  useEffect(() => { cargar() }, [cargar])
  // En vivo: cualquier actualizacion de este ticket recarga la conversacion
  useWSEvent('*', useCallback((data: any) => {
    const id = data?.incident_id ?? data?.id ?? data?.ticket?.id
    if (id && String(id) === String(incidentId)) cargar()
  }, [incidentId, cargar]))
  useEffect(() => { hilo.current?.scrollTo({ top: hilo.current.scrollHeight, behavior: 'smooth' }) }, [lista.length])

  const agregarArchivos = (nuevos: File[]) => {
    const grandes = nuevos.filter(f => f.size > MAX_MB * 1024 * 1024)
    if (grandes.length) setError(`${grandes[0].name} pesa más de ${MAX_MB} MB`)
    setArchivos(prev => [...prev, ...nuevos.filter(f => f.size <= MAX_MB * 1024 * 1024)])
  }
  const preguntar = (p: string) => {
    setInterna(false); setPide(true)
    setTexto(t => (t.trim() ? t.trim() + '\n' : '') + p)
    caja.current?.focus()
  }
  const enviar = async () => {
    if (enviando || (!texto.trim() && !archivos.length)) return
    setEnviando(true); setError(null)
    try {
      const fd = new FormData()
      fd.append('texto', texto.trim())
      fd.append('interna', String(interna))
      fd.append('pide_respuesta', String(pide && !interna))
      archivos.forEach(f => fd.append('files', f))
      await enviarComentario(incidentId, fd)
      setTexto(''); setArchivos([]); setPide(false); setInterna(false)
      cargar()
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'No se pudo enviar el comentario')
    } finally { setEnviando(false) }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-300 shadow-sm p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <MessagesSquare size={16} className="text-[#1a4fa0]" />
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Conversación</p>
        {lista.length > 0 && <span className="text-[11px] font-semibold text-[#1a4fa0] bg-[#eef4fc] rounded-full px-2 py-0.5">{lista.length}</span>}
      </div>

      {esperando && (
        <div className="flex items-center gap-2 mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
          <Hourglass size={14} className="shrink-0" />
          <span>Esperando respuesta de <b className="font-semibold">{esperando.por}</b> {hace(esperando.desde)}</span>
        </div>
      )}

      <div ref={hilo} className="max-h-96 overflow-y-auto pr-1 space-y-3">
        {lista.length === 0 ? (
          <div className="text-center py-6 text-[13px] text-slate-400">
            Aún no hay comentarios. Pregunta o comparte lo que haga falta para resolver el ticket.
          </div>
        ) : lista.map(c => {
          const mio = String(c.autor_id) === String(miId)
          return (
            <div key={c.id} className={`flex items-end gap-2 ${mio ? 'flex-row-reverse' : ''}`}>
              {renderAvatar ? renderAvatar(c.autor, c.autor_foto ?? null) : (
                <span className={`w-7 h-7 shrink-0 grid place-items-center rounded-full text-[10.5px] font-bold ${c.rol === 'ti' ? 'bg-[#1a4fa0] text-white' : 'bg-slate-200 text-slate-700'}`}>{iniciales(c.autor)}</span>
              )}
              <div className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 border ${
                c.interna ? 'bg-amber-50 border-amber-200' : mio ? 'bg-[#eef4fc] border-[#d3e2f5]' : 'bg-white border-slate-200'
              } ${mio ? 'rounded-br-md' : 'rounded-bl-md'}`}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[12px] font-semibold text-slate-800">{mio ? 'Tú' : c.autor}</span>
                  {c.interna && <span className="inline-flex items-center gap-0.5 text-[10.5px] font-semibold text-amber-700"><Lock size={10} /> Nota interna · solo TI</span>}
                  {c.pide_respuesta && !c.interna && <span className="text-[10.5px] font-semibold text-[#1a4fa0]">· Pide respuesta</span>}
                  <span className="text-[11px] text-slate-400" title={completa(c.creado)}>{hace(c.creado)}</span>
                </div>
                {c.texto && <p className="text-[13.5px] leading-relaxed text-slate-700 whitespace-pre-wrap wrap-break-word">{c.texto}</p>}
                {c.adjuntos?.length > 0 && <div className="flex flex-wrap gap-2 mt-2">{c.adjuntos.map((a, i) => renderAdjunto(a, i))}</div>}
              </div>
            </div>
          )
        })}
      </div>

      {cerrada ? (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12.5px] text-slate-500">
          <Lock size={13} className="shrink-0" /> La conversación está cerrada porque el ticket ya se cerró.
        </div>
      ) : (
      <>
      {/* Escribir */}
      <div
        onDragOver={e => { e.preventDefault(); setArrastrando(true) }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={e => { e.preventDefault(); setArrastrando(false); agregarArchivos(Array.from(e.dataTransfer.files || [])) }}
        className={`mt-3 rounded-xl border-2 transition ${arrastrando ? 'border-[#1a4fa0] bg-[#eef4fc]' : interna ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 bg-white'}`}
      >
        {puedeInterna && (
          <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2.5">
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-[12px] font-medium">
              <button type="button" onClick={() => setInterna(false)} className={`px-2.5 py-1 rounded-md ${!interna ? 'bg-[#1a4fa0] text-white' : 'text-slate-600'}`}>Comentario</button>
              <button type="button" onClick={() => { setInterna(true); setPide(false) }} className={`px-2.5 py-1 rounded-md inline-flex items-center gap-1 ${interna ? 'bg-amber-500 text-white' : 'text-slate-600'}`}><Lock size={11} /> Nota interna</button>
            </div>
            {!interna && PREGUNTAS.map(p => (
              <button key={p.txt} type="button" onClick={() => preguntar(p.pregunta)}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[11.5px] text-slate-600 hover:border-[#1a4fa0] hover:text-[#1a4fa0] transition">
                <p.icono size={12} /> {p.txt}
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={caja} value={texto} rows={2}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); enviar() } }}
          onPaste={e => {
            const fs = Array.from(e.clipboardData?.files || [])
            if (fs.length) { e.preventDefault(); agregarArchivos(fs) }
          }}
          placeholder={interna ? 'Nota interna: solo la ve el equipo de TI…' : 'Escribe un comentario… Puedes pegar capturas con Ctrl + V o arrastrar archivos aquí'}
          className="w-full resize-y bg-transparent px-3 py-2.5 text-[13.5px] text-slate-800 outline-none placeholder:text-slate-400"
        />
        {archivos.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pb-2">
            {archivos.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1 max-w-56 rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11.5px] text-slate-700">
                <span className="truncate">{f.name}</span>
                <button type="button" aria-label={`Quitar ${f.name}`} onClick={() => setArchivos(a => a.filter((_, k) => k !== i))} className="text-slate-400 hover:text-red-600"><X size={12} /></button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5">
          <div className="flex items-center gap-2">
            <input ref={archivoRef} type="file" multiple hidden accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
              onChange={e => { agregarArchivos(Array.from(e.target.files || [])); e.target.value = '' }} />
            <button type="button" onClick={() => archivoRef.current?.click()} title="Adjuntar archivos"
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-[#1a4fa0]"><Paperclip size={16} /></button>
            {puedeInterna && !interna && (
              <label className="inline-flex items-center gap-1.5 text-[12px] text-slate-600 cursor-pointer select-none">
                <input type="checkbox" checked={pide} onChange={e => setPide(e.target.checked)} className="accent-[#1a4fa0]" />
                Pedir respuesta al usuario
              </label>
            )}
          </div>
          <button type="button" onClick={enviar} disabled={enviando || (!texto.trim() && !archivos.length)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-semibold text-white disabled:opacity-50 ${interna ? 'bg-amber-500 hover:bg-amber-600' : 'bg-[#1a4fa0] hover:bg-[#173f82]'}`}>
            <Send size={13} /> {enviando ? 'Enviando…' : interna ? 'Guardar nota' : 'Enviar'}
          </button>
        </div>
      </div>
      {error && <p role="alert" className="mt-1.5 text-[12.5px] text-red-600">{error}</p>}
      <p className="mt-1.5 text-[11px] text-slate-400">Ctrl + Enter para enviar · hasta {MAX_MB} MB por archivo</p>
      </>
      )}
    </div>
  )
}
