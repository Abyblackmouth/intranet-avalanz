'use client'

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Lock, Paperclip, Send, X, Hourglass, Camera, CalendarClock, ListOrdered, CircleHelp, Check } from 'lucide-react'
import { getComentarios, enviarComentario } from '@/services/itServiceDeskService'
import { useWSEvent } from '@/hooks/useWebSocket'
import { useAuthStore } from '@/store/authStore'

// Conversacion del ticket con estilo de mensajeria: burbujas, separador por dia,
// hora y palomita dentro de la burbuja. Comentarios de ida y vuelta (solicitante
// <-> TI) y notas internas solo para TI; las notas internas las filtra el backend.

interface Comentario {
  id: string; autor: string; autor_id: string; rol: 'ti' | 'solicitante'; texto: string
  interna: boolean; pide_respuesta: boolean; adjuntos: any[]; creado: string; autor_foto?: string | null
}
const TZ = 'America/Monterrey'
const MAX_MB = 50
const PREGUNTAS = [
  { icono: Camera, txt: 'Captura', pregunta: '¿Me compartes una captura de pantalla del error?' },
  { icono: CalendarClock, txt: 'Fecha y hora', pregunta: '¿En qué fecha y hora ocurrió?' },
  { icono: ListOrdered, txt: 'Pasos', pregunta: '¿Me describes los pasos que seguiste para que vuelva a pasar?' },
  { icono: CircleHelp, txt: '¿Ya quedó?', pregunta: '¿Me confirmas si ya quedó resuelto de tu lado?' },
]
const diaClave = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })
function diaEtiqueta(iso: string) {
  const hoy = diaClave(new Date().toISOString())
  const ayer = diaClave(new Date(Date.now() - 86400000).toISOString())
  const d = diaClave(iso)
  if (d === hoy) return 'Hoy'
  if (d === ayer) return 'Ayer'
  return new Date(iso).toLocaleDateString('es-MX', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' })
}
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })
function hace(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'hace un momento'
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`
  return `desde el ${new Date(iso).toLocaleString('es-MX', { timeZone: TZ, day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' })}`
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
  // El cuadro para escribir crece con el texto
  useEffect(() => {
    const t = caja.current; if (!t) return
    t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'
    t.style.overflowY = t.scrollHeight > 120 ? 'auto' : 'hidden'   // sin barra mientras crece
  }, [texto])

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
      setError(e?.response?.data?.detail ?? 'No se pudo enviar el mensaje')
    } finally { setEnviando(false) }
  }

  // Participantes (sin repetir) para el encabezado
  const participantes = Array.from(new Map(lista.map(c => [String(c.autor_id), c])).values()).slice(0, 3)

  return (
    <section aria-label="Conversación" className="h-full min-h-0 flex flex-col bg-white rounded-[18px] border border-[#c5d0de] overflow-hidden">
      {/* Encabezado */}
      <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-[#dbe2ec]">
        {participantes.length > 0 && renderAvatar && (
          <div className="flex -space-x-2">
            {participantes.map(p => <span key={String(p.autor_id)} className="rounded-full ring-2 ring-white">{renderAvatar(p.autor, p.autor_foto ?? null)}</span>)}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-[14px] font-bold text-[#0f2440] leading-tight">Conversación</p>
          <p className="text-[11.5px] text-slate-400">{lista.length ? `${lista.length} mensaje${lista.length === 1 ? '' : 's'}` : 'Sin mensajes todavía'}</p>
        </div>
      </div>

      {esperando && !cerrada && (
        <div className="mx-3 mt-2.5 flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-1.5 text-[12px] text-amber-800">
          <Hourglass size={13} className="shrink-0" />
          <span>Esperando respuesta de <b className="font-semibold">{esperando.por}</b> {hace(esperando.desde)}</span>
        </div>
      )}

      {/* Mensajes */}
      <div ref={hilo}
        className="flex-1 min-h-0 overflow-y-auto px-3 pt-3 pb-2 bg-[#e8eef6]"
        style={{ backgroundImage: 'radial-gradient(rgba(26,79,160,0.07) 1px, transparent 1px)', backgroundSize: '16px 16px' }}>
        {lista.length === 0 ? (
          <div className="h-full grid place-items-center">
            <p className="max-w-60 text-center text-[13px] text-slate-500 bg-white/80 rounded-2xl px-4 py-3">
              Escribe aquí lo que necesites para resolver el ticket. La otra persona recibe el aviso al instante.
            </p>
          </div>
        ) : lista.map((c, i) => {
          const mio = String(c.autor_id) === String(miId)
          const previo = lista[i - 1]
          const nuevoDia = !previo || diaClave(previo.creado) !== diaClave(c.creado)
          const mismoGrupo = !!previo && !nuevoDia && String(previo.autor_id) === String(c.autor_id)
          const siguiente = lista[i + 1]
          const finGrupo = !siguiente || String(siguiente.autor_id) !== String(c.autor_id) || diaClave(siguiente.creado) !== diaClave(c.creado)
          const burbuja = c.interna
            ? 'bg-[#fff7e6] border border-[#f3d79b] text-slate-800'
            : mio ? 'bg-[#1a4fa0] text-white' : 'bg-white text-slate-800'
          return (
            <Fragment key={c.id}>
              {nuevoDia && (
                <div className="flex justify-center my-2">
                  <span className="text-[11px] font-semibold text-slate-600 bg-white/85 rounded-full px-2.5 py-0.5 first-letter:uppercase">{diaEtiqueta(c.creado)}</span>
                </div>
              )}
              <div className={`flex items-end gap-1.5 ${mio ? 'justify-end' : ''} ${mismoGrupo ? 'mt-0.5' : 'mt-2'}`}>
                {!mio && (
                  <span className="w-7 shrink-0">
                    {finGrupo && (renderAvatar ? renderAvatar(c.autor, c.autor_foto ?? null)
                      : <span className="w-7 h-7 grid place-items-center rounded-full bg-slate-300 text-[10.5px] font-bold text-slate-700">{c.autor.slice(0, 1)}</span>)}
                  </span>
                )}
                <div title={completa(c.creado)}
                  className={`max-w-[80%] px-2.5 pt-1.5 pb-1 rounded-2xl shadow-[0_1px_1px_rgba(15,36,64,0.08)] ${burbuja} ${
                    finGrupo ? (mio ? 'rounded-br-[5px]' : 'rounded-bl-[5px]') : ''}`}>
                  {!mio && !mismoGrupo && !c.interna && <p className="text-[11.5px] font-semibold text-[#1a4fa0] leading-tight mb-0.5">{c.autor}</p>}
                  {c.interna && (
                    <p className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-amber-700 mb-0.5">
                      <Lock size={10} /> Nota interna · solo TI{!mio && ` · ${c.autor}`}
                    </p>
                  )}
                  {c.pide_respuesta && !c.interna && <p className={`text-[10.5px] font-semibold mb-0.5 ${mio ? 'text-white/80' : 'text-[#1a4fa0]'}`}>Pide respuesta</p>}
                  {c.adjuntos?.length > 0 && <div className="flex flex-wrap gap-1.5 my-1">{c.adjuntos.map((a, k) => renderAdjunto(a, k))}</div>}
                  {c.texto && <p className="text-[13.5px] leading-snug whitespace-pre-wrap wrap-break-word">{c.texto}</p>}
                  <p className={`flex items-center justify-end gap-0.5 text-[10.5px] mt-0.5 ${mio && !c.interna ? 'text-white/75' : 'text-slate-400'}`}>
                    {hora(c.creado)} {mio && <Check size={12} aria-label="Enviado" />}
                  </p>
                </div>
              </div>
            </Fragment>
          )
        })}
      </div>

      {/* Escribir */}
      {cerrada ? (
        <div className="flex items-center justify-center gap-2 border-t border-[#dbe2ec] px-3 py-3 text-[12.5px] text-slate-500 bg-slate-50">
          <Lock size={13} /> La conversación está cerrada porque el ticket ya se cerró.
        </div>
      ) : (
        <div
          onDragOver={e => { e.preventDefault(); setArrastrando(true) }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={e => { e.preventDefault(); setArrastrando(false); agregarArchivos(Array.from(e.dataTransfer.files || [])) }}
          className={`border-t border-[#dbe2ec] px-2.5 pt-2 pb-2.5 transition ${arrastrando ? 'bg-[#eaf1fb]' : 'bg-white'}`}>
          {puedeInterna && (
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="inline-flex rounded-full bg-[#eef2f7] p-0.5 text-[12px] font-semibold">
                <button type="button" aria-pressed={!interna} onClick={() => setInterna(false)}
                  className={`px-2.5 py-1 rounded-full transition ${!interna ? 'bg-white text-[#1a4fa0] shadow-sm' : 'text-slate-500'}`}>Comentario</button>
                <button type="button" aria-pressed={interna} onClick={() => { setInterna(true); setPide(false) }}
                  className={`px-2.5 py-1 rounded-full inline-flex items-center gap-1 transition ${interna ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500'}`}><Lock size={11} /> Nota interna</button>
              </div>
              {!interna && (
                <label className="ml-auto inline-flex items-center gap-1 text-[11.5px] text-slate-500 cursor-pointer select-none">
                  <input type="checkbox" checked={pide} onChange={e => setPide(e.target.checked)} className="accent-[#1a4fa0]" /> Pedir respuesta
                </label>
              )}
            </div>
          )}
          {puedeInterna && !interna && (
            <div className="flex flex-wrap gap-1.5 pb-1.5">
              {PREGUNTAS.map(p => (
                <button key={p.txt} type="button" onClick={() => preguntar(p.pregunta)}
                  className="shrink-0 inline-flex items-center gap-1 rounded-full border border-[#dbe2ec] px-2.5 py-1 text-[11.5px] text-slate-600 hover:border-[#1a4fa0] hover:text-[#1a4fa0] transition">
                  <p.icono size={12} /> {p.txt}
                </button>
              ))}
            </div>
          )}
          {archivos.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pb-1.5">
              {archivos.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1 max-w-52 rounded-full bg-[#eef2f7] px-2.5 py-0.5 text-[11.5px] text-slate-700">
                  <span className="truncate">{f.name}</span>
                  <button type="button" aria-label={`Quitar ${f.name}`} onClick={() => setArchivos(a => a.filter((_, k) => k !== i))} className="text-slate-400 hover:text-red-600"><X size={12} /></button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-end gap-1.5">
            <input ref={archivoRef} type="file" multiple hidden accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
              onChange={e => { agregarArchivos(Array.from(e.target.files || [])); e.target.value = '' }} />
            <button type="button" onClick={() => archivoRef.current?.click()} aria-label="Adjuntar archivos"
              className="w-9.5 h-9.5 shrink-0 grid place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-[#1a4fa0]"><Paperclip size={17} /></button>
            <textarea
              ref={caja} value={texto} rows={1}
              onChange={e => setTexto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); enviar() } }}
              onPaste={e => {
                const fs = Array.from(e.clipboardData?.files || [])
                if (fs.length) { e.preventDefault(); agregarArchivos(fs) }
              }}
              aria-label={interna ? 'Escribir nota interna' : 'Escribir mensaje'}
              placeholder={interna ? 'Nota interna: solo la ve TI' : 'Escribe un mensaje'}
              className={`flex-1 resize-none rounded-[20px] border px-3.5 py-2 text-[13.5px] text-slate-800 outline-none placeholder:text-slate-400 focus:border-[#1a4fa0] ${
                interna ? 'bg-[#fff7e6] border-[#f3d79b]' : 'bg-[#f8fafc] border-[#dbe2ec]'}`}
            />
            <button type="button" onClick={enviar} disabled={enviando || (!texto.trim() && !archivos.length)} aria-label={interna ? 'Guardar nota' : 'Enviar'}
              className={`w-9.5 h-9.5 shrink-0 grid place-items-center rounded-full text-white transition disabled:opacity-40 ${interna ? 'bg-amber-500 hover:bg-amber-600' : 'bg-[#1a4fa0] hover:bg-[#153f82]'}`}>
              <Send size={15} />
            </button>
          </div>
          {error && <p role="alert" className="mt-1.5 text-[12px] text-red-600">{error}</p>}
          <p className="mt-1 px-1 flex justify-between text-[10.5px] text-slate-400"><span>Ctrl + Enter para enviar</span><span>Pega capturas con Ctrl + V</span></p>
        </div>
      )}
    </section>
  )
}
