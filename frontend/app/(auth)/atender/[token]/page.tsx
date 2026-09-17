'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import api from '@/services/api'
import { CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'

interface TicketPreview {
  folio: string
  title: string
  description: string
  status: string
  requester_name: string
  requester_area: string | null
  requester_company_name: string
  created_at: string
  sla_resolution_limit: string | null
  already_resolved: boolean
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
  const [submitting, setSubmitting] = useState(false)
  const [resolved, setResolved] = useState(false)

  useEffect(() => {
    api.get(`/api/v1/it-service-desk/mesa-de-soporte/atender/${token}`)
      .then(res => setTicket(res.data))
      .catch(err => setError(err?.response?.data?.detail ?? 'No se pudo cargar el ticket'))
      .finally(() => setLoading(false))
  }, [token])

  const handleResolve = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await api.post(`/api/v1/it-service-desk/mesa-de-soporte/atender/${token}/resolver`, {
        resolution_type: resolutionType,
        rca_text: rcaText || undefined,
      })
      setResolved(true)
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo marcar como resuelto')
    } finally {
      setSubmitting(false)
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
      <p className="text-xs font-mono text-slate-400">{ticket.folio}</p>
      <h1 className="text-lg font-semibold text-slate-800 mt-0.5 mb-4">{ticket.title}</h1>

      <div className="grid grid-cols-2 gap-3 text-sm mb-4 bg-slate-50 rounded-xl p-4">
        <div><p className="text-[10px] text-slate-400 uppercase">Solicitante</p><p className="font-medium text-slate-800">{ticket.requester_name}</p></div>
        <div><p className="text-[10px] text-slate-400 uppercase">Empresa</p><p className="font-medium text-slate-800">{ticket.requester_company_name}</p></div>
        <div><p className="text-[10px] text-slate-400 uppercase">Creado</p><p className="font-medium text-slate-800">{fmt(ticket.created_at)}</p></div>
        <div><p className="text-[10px] text-slate-400 uppercase">Límite de resolución</p><p className="font-medium text-slate-800">{fmt(ticket.sla_resolution_limit)}</p></div>
      </div>

      <p className="text-sm text-slate-700 leading-relaxed mb-5">{ticket.description}</p>

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

      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

      <button
        onClick={handleResolve}
        disabled={submitting}
        className="w-full py-2.5 text-sm font-medium text-white bg-[#7c2d12] rounded-lg hover:bg-[#6b2610] disabled:opacity-50 transition"
      >
        {submitting ? 'Marcando como resuelto...' : 'Marcar como resuelto'}
      </button>
    </div>
  )
}
