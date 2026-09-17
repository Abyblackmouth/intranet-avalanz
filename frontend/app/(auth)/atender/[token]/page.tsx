'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import api from '@/services/api'
import { getSignedUrl } from '@/services/uploadService'
import { CheckCircle2, AlertTriangle, Loader2, Phone, Briefcase, Building2, Paperclip, ArrowRightLeft } from 'lucide-react'

interface AttachmentRef { id: string; object_key: string; bucket: string }

interface TicketPreview {
  folio: string
  title: string
  description: string
  status: string
  requester_name: string
  requester_phone: string | null
  requester_puesto: string | null
  requester_area: string | null
  requester_company_name: string
  severity_code: string | null
  severity_name: string | null
  created_at: string
  sla_resolution_limit: string | null
  already_resolved: boolean
  attachments: AttachmentRef[]
}

const SEV_CLASS: Record<string, string> = {
  S1: 'bg-red-50 text-red-700 border-red-300',
  S2: 'bg-orange-50 text-orange-700 border-orange-300',
  S3: 'bg-amber-50 text-amber-700 border-amber-300',
  S4: 'bg-emerald-50 text-emerald-700 border-emerald-300',
}

const AVATAR_COLORS = ['bg-[#1a4fa0]', 'bg-violet-500', 'bg-teal-500', 'bg-orange-400', 'bg-rose-500', 'bg-emerald-500']

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
}

function avatarColor(name: string) {
  const sum = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return AVATAR_COLORS[sum % AVATAR_COLORS.length]
}

function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function AtenderTicketPage() {
  const params = useParams()
  const token = params.token as string

  const [ticket, setTicket] = useState<TicketPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resolutionType, setResolutionType] = useState('causa_raiz')
  const [rcaText, setRcaText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [resolved, setResolved] = useState(false)
  const [openingAttachmentId, setOpeningAttachmentId] = useState<string | null>(null)

  const [showRedirect, setShowRedirect] = useState(false)
  const [redirectReason, setRedirectReason] = useState('')
  const [redirecting, setRedirecting] = useState(false)
  const [redirected, setRedirected] = useState(false)

  useEffect(() => {
    api.get(`/api/v1/it-service-desk/mesa-de-soporte/atender/${token}`)
      .then(res => setTicket(res.data))
      .catch(err => setError(err?.response?.data?.detail ?? 'No se pudo cargar el ticket'))
      .finally(() => setLoading(false))
  }, [token])

  const handleOpenAttachment = async (a: AttachmentRef) => {
    setOpeningAttachmentId(a.id)
    try {
      const res = await getSignedUrl(a.object_key, a.bucket)
      const url = res.data?.data?.url || res.data?.url
      if (url) window.open(url, '_blank')
    } catch {
      // silencioso
    } finally {
      setOpeningAttachmentId(null)
    }
  }

  const handleResolve = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('resolution_type', resolutionType)
      if (rcaText) formData.append('rca_text', rcaText)
      files.forEach(f => formData.append('files', f))

      await api.post(`/api/v1/it-service-desk/mesa-de-soporte/atender/${token}/resolver`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResolved(true)
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo marcar como resuelto')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRedirect = async () => {
    if (!redirectReason.trim()) return setError('Indica un motivo para redirigir')
    setRedirecting(true)
    setError(null)
    try {
      await api.post(`/api/v1/it-service-desk/mesa-de-soporte/atender/${token}/redirigir`, { reason: redirectReason.trim() })
      setRedirected(true)
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo redirigir el ticket')
    } finally {
      setRedirecting(false)
    }
  }

  if (loading) {
    return (
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-8 flex flex-col items-center gap-3">
        <Loader2 size={28} className="animate-spin text-[#7c2d12]" />
        <p className="text-sm text-slate-500">Cargando ticket...</p>
      </div>
    )
  }

  if (error && !ticket) {
    return (
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-8 flex flex-col items-center gap-3 text-center">
        <AlertTriangle size={28} className="text-red-500" />
        <p className="text-sm font-medium text-slate-700">{error}</p>
        <p className="text-xs text-slate-400">Este enlace puede haber expirado o ya fue utilizado.</p>
      </div>
    )
  }

  if (!ticket) return null

  if (redirected) {
    return (
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-8 flex flex-col items-center gap-3 text-center">
        <ArrowRightLeft size={32} className="text-[#1a4fa0]" />
        <p className="text-base font-semibold text-slate-800">Ticket {ticket.folio} redirigido</p>
        <p className="text-xs text-slate-400">Ya puedes cerrar esta ventana.</p>
      </div>
    )
  }

  if (resolved || ticket.already_resolved) {
    return (
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-8 flex flex-col items-center gap-3 text-center">
        <CheckCircle2 size={32} className="text-emerald-500" />
        <p className="text-base font-semibold text-slate-800">Ticket {ticket.folio} marcado como resuelto</p>
        <p className="text-xs text-slate-400">Ya puedes cerrar esta ventana.</p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs font-mono text-slate-400">{ticket.folio}</p>
          <h1 className="text-lg font-semibold text-slate-800 mt-0.5">{ticket.title}</h1>
        </div>
        {ticket.severity_code && (
          <span className={`shrink-0 px-3 py-1.5 rounded-lg border-2 text-sm font-bold ${SEV_CLASS[ticket.severity_code] ?? 'bg-slate-50 text-slate-600 border-slate-300'}`}>
            {ticket.severity_code}
          </span>
        )}
      </div>

      {/* Con quien es */}
      <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-4 mb-4">
        <div className={`w-11 h-11 rounded-full ${avatarColor(ticket.requester_name)} text-white flex items-center justify-center font-semibold text-sm shrink-0`}>
          {initialsOf(ticket.requester_name)}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-slate-800 text-sm truncate">{ticket.requester_name}</p>
          <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5 flex-wrap">
            {ticket.requester_puesto && <span className="flex items-center gap-1"><Briefcase size={11} />{ticket.requester_puesto}</span>}
            {ticket.requester_phone && <span className="flex items-center gap-1"><Phone size={11} />{ticket.requester_phone}</span>}
            <span className="flex items-center gap-1"><Building2 size={11} />{ticket.requester_company_name}</span>
          </div>
        </div>
      </div>

      {/* Datos del ticket */}
      <div className="grid grid-cols-2 gap-3 text-sm mb-3">
        <div><p className="text-[10px] text-slate-400 uppercase">Creado</p><p className="font-medium text-slate-800">{fmt(ticket.created_at)}</p></div>
        <div><p className="text-[10px] text-slate-400 uppercase">Límite de resolución</p><p className="font-medium text-slate-800">{fmt(ticket.sla_resolution_limit)}</p></div>
      </div>
      <p className="text-sm text-slate-700 leading-relaxed mb-3 bg-slate-50/50 border border-slate-100 rounded-lg p-3">{ticket.description}</p>

      {ticket.attachments.length > 0 && (
        <div className="mb-5">
          <p className="text-[10px] text-slate-400 uppercase mb-1.5">Evidencia del solicitante</p>
          <div className="flex gap-2 flex-wrap">
            {ticket.attachments.map(a => (
              <button
                key={a.id}
                onClick={() => handleOpenAttachment(a)}
                disabled={openingAttachmentId === a.id}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs text-slate-600 transition disabled:opacity-50"
              >
                <Paperclip size={12} /> {openingAttachmentId === a.id ? 'Abriendo...' : 'Ver imagen'}
              </button>
            ))}
          </div>
        </div>
      )}

      {!showRedirect ? (
        <>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Tipo de resolución</label>
          <select
            value={resolutionType}
            onChange={(e) => setResolutionType(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-[#7c2d12] mb-3"
          >
            <option value="causa_raiz">Causa raíz</option>
            <option value="workaround">Workaround</option>
          </select>

          <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Notas (opcional)</label>
          <textarea
            value={rcaText}
            onChange={(e) => setRcaText(e.target.value)}
            rows={3}
            placeholder="Describe brevemente la solución aplicada"
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-[#7c2d12] mb-3 resize-none"
          />

          <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Evidencia de resolución (opcional)</label>
          <label className="flex items-center gap-2 px-3 py-2.5 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 cursor-pointer hover:border-[#7c2d12]/40 transition mb-3">
            <Paperclip size={15} />
            {files.length > 0 ? `${files.length} archivo(s) seleccionado(s)` : 'Adjuntar capturas de la solución'}
            <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          </label>

          {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

          <button
            onClick={handleResolve}
            disabled={submitting}
            className="w-full py-2.5 text-sm font-medium text-white bg-[#7c2d12] rounded-lg hover:bg-[#6b2610] disabled:opacity-50 transition mb-2"
          >
            {submitting ? 'Marcando como resuelto...' : 'Marcar como resuelto'}
          </button>
          <button
            onClick={() => setShowRedirect(true)}
            className="w-full py-2 text-xs font-medium text-slate-500 hover:text-slate-700 transition"
          >
            No es conmigo — redirigir
          </button>
        </>
      ) : (
        <>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Motivo de la redirección</label>
          <textarea
            value={redirectReason}
            onChange={(e) => setRedirectReason(e.target.value)}
            rows={3}
            placeholder="Explica por qué este ticket no te corresponde"
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-[#1a4fa0] mb-3 resize-none"
          />
          {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
          <div className="flex gap-2">
            <button onClick={() => setShowRedirect(false)} className="flex-1 py-2.5 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition">
              Cancelar
            </button>
            <button
              onClick={handleRedirect}
              disabled={redirecting}
              className="flex-1 py-2.5 text-sm font-medium text-white bg-[#1a4fa0] rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {redirecting ? 'Redirigiendo...' : 'Confirmar redirección'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
