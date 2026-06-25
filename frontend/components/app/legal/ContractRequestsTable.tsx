'use client'
import { useState, useRef, useEffect } from 'react'
import {
  MoreHorizontal, Eye, CheckCircle, XCircle, AlertCircle, Users,
  ChevronLeft, ChevronRight, X, Flag, FileText, RotateCcw,
  Clock, Calendar, Building2, User, Scale, ChevronRight as Arrow, Mail, FileDown, History,
} from 'lucide-react'
import { EnvelopeListItem, SLAColor, LegalRole } from '@/types/contract.types'
import {
  approveEnvelope, requestCorrections, rejectEnvelope, completeEnvelope, sendForSigning,
  getEnvelope, assignLawyer,
} from '@/services/legalService'
import { getSignedUrl } from '@/services/uploadService'

// ── Helpers ───────────────────────────────────────────────────────────────────

const formatDate = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  const m = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  return `${String(d.getDate()).padStart(2,'0')} ${m[d.getMonth()]} ${d.getFullYear()}`
}

const formatRelative = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const days = Math.floor(diff / 86400000)
  const timeStr = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true })
  if (days === 0) return `Hoy ${timeStr}`
  if (days === 1) return `Ayer ${timeStr}`
  if (days < 7)  return `Hace ${days} días`
  return formatDate(iso)
}

const avatarColors = [
  'bg-[#1a4fa0]','bg-violet-500','bg-teal-500',
  'bg-orange-400','bg-rose-500','bg-emerald-500',
]

const Avatar = ({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) => {
  const initials = name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
  const colorIdx = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % avatarColors.length
  const sz = size === 'sm' ? 'w-6 h-6 text-[10px]' : size === 'lg' ? 'w-9 h-9 text-sm' : 'w-7 h-7 text-xs'
  return (
    <div className={`${sz} ${avatarColors[colorIdx]} rounded-lg flex items-center justify-center shrink-0`}>
      <span className="text-white font-bold">{initials}</span>
    </div>
  )
}

// ── Estado ────────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  borrador:          { label: 'Borrador',          bg: 'bg-slate-100',   text: 'text-slate-600',  dot: 'bg-slate-400'  },
  pendiente_legal:   { label: 'Pendiente legal',   bg: 'bg-amber-50',    text: 'text-amber-700',  dot: 'bg-amber-400'  },
  pendiente_cliente: { label: 'Pendiente cliente', bg: 'bg-orange-50',   text: 'text-orange-700', dot: 'bg-orange-400' },
  en_revision_legal: { label: 'En revisión',       bg: 'bg-blue-50',     text: 'text-blue-700',   dot: 'bg-blue-400'   },
  en_firmas:         { label: 'En firmas',         bg: 'bg-violet-50',   text: 'text-violet-700', dot: 'bg-violet-400' },
  firmado_parcial:   { label: 'Firmado parcial',   bg: 'bg-purple-50',   text: 'text-purple-700', dot: 'bg-purple-400' },
  completado:        { label: 'Completado',        bg: 'bg-green-50',    text: 'text-green-700',  dot: 'bg-green-500'  },
  rechazado:         { label: 'Rechazado',         bg: 'bg-red-50',      text: 'text-red-700',    dot: 'bg-red-500'    },
}

const StatusBadge = ({ status }: { status: string }) => {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG['borrador']
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

// ── SLA ───────────────────────────────────────────────────────────────────────

const SLADot = ({ color, status }: { color: SLAColor, status?: string }) => {
  if (status === 'completado' || status === 'rechazado')
    return <span className="w-2.5 h-2.5 rounded-full ring-4 inline-block shrink-0 bg-slate-300 ring-slate-100" />
  const styles = { green: 'bg-green-500 ring-green-200', yellow: 'bg-amber-400 ring-amber-100', red: 'bg-red-500 ring-red-200' }
  return <span className={`w-2.5 h-2.5 rounded-full ring-4 inline-block shrink-0 ${styles[color]}`} />
}

const SLAPill = ({ item }: { item: EnvelopeListItem }) => {
  if (!item.submitted_at)
    return <span className="text-xs text-slate-400">—</span>
  const endTime = (item.status === 'completado' || item.status === 'rechazado') && item.sla_closed_at
    ? new Date(item.sla_closed_at).getTime()
    : Date.now()
  const diffMs = Math.max(0, endTime - new Date(item.submitted_at).getTime())
  const diffHrs = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  const isClosed = item.status === 'completado' || item.status === 'rechazado'
  const colorClass = isClosed ? 'text-slate-400' : item.sla_color === 'red' ? 'text-red-600' : item.sla_color === 'yellow' ? 'text-amber-600' : 'text-green-600'
  if (item.is_sla_breached && !isClosed)
    return (<span className="flex items-center gap-1 text-red-600"><span className="text-sm">{diffDays}</span><span className="text-xs"> {diffDays === 1 ? "día" : "días"}</span></span>)
  if (diffDays === 0)
    return <span className={`text-xs font-medium ${colorClass}`}><span className="text-sm">{diffHrs}</span><span className="text-xs"> {diffHrs === 1 ? "hr" : "hrs"}</span></span>
  return <span className={`text-xs font-medium ${colorClass}`}><span className="text-sm">{diffDays}</span><span className="text-xs"> {diffDays === 1 ? "día" : "días"}</span></span>
}

// ── Modal de motivo ───────────────────────────────────────────────────────────

const ReasonModal = ({
  title, description, confirmLabel, danger = false,
  onConfirm, onClose, isLoading,
}: {
  title: string; description: string; confirmLabel: string
  danger?: boolean; onConfirm: (r: string) => void
  onClose: () => void; isLoading: boolean
}) => {
  const [reason, setReason] = useState('')
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <p className="text-sm text-slate-600 mb-4">{description}</p>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Escribe el motivo detallado..."
          rows={3}
          className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4fa0] resize-none mb-5"
        />
        <div className="flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-100">Cancelar</button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={!reason.trim() || isLoading}
            className={`px-5 py-2 text-sm font-medium rounded-lg disabled:opacity-50 flex items-center gap-2 ${danger ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-[#1a4fa0] text-white hover:bg-blue-700'}`}
          >
            {isLoading && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Slide-over de detalle ─────────────────────────────────────────────────────

const EnvelopeSlideOver = ({
  envelopeId,
  role,
  onClose,
  onRefresh,
}: {
  envelopeId: string
  role: LegalRole
  onClose: () => void
  onRefresh: () => void
}) => {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showCorrections, setShowCorrections] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [acting, setActing] = useState(false)

  useEffect(() => {
    setLoading(true)
    getEnvelope(envelopeId)
      .then(res => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [envelopeId])

  const isLegal = role === 'abogado' || role === 'coordinador_legal' || role === 'super_admin'
  const isClosed = data?.envelope?.status === 'completado' || data?.envelope?.status === 'rechazado'
  const canAct = isLegal && !isClosed && (
    data?.envelope?.status === 'pendiente_legal' || data?.envelope?.status === 'en_revision_legal'
  )

  const handleApprove = async () => {
    setActing(true)
    try {
      await approveEnvelope(envelopeId)
      try { await sendForSigning(envelopeId) } catch (e) { console.error('DocuSign send-for-signing error:', e) }
      onRefresh(); onClose()
    }
    catch (e) { console.error(e) }
    finally { setActing(false) }
  }

  const handleCorrections = async (reason: string) => {
    setActing(true)
    try { await requestCorrections(envelopeId, reason); setShowCorrections(false); onRefresh(); onClose() }
    catch (e) { console.error(e) }
    finally { setActing(false) }
  }

  const handleReject = async (reason: string) => {
    setActing(true)
    try { await rejectEnvelope(envelopeId, reason); setShowReject(false); onRefresh(); onClose() }
    catch (e) { console.error(e) }
    finally { setActing(false) }
  }

  const env = data?.envelope

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full z-50 w-full max-w-xl bg-white shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#1a4fa0]/10 flex items-center justify-center">
              <Scale size={15} className="text-[#1a4fa0]" />
            </div>
            <div>
              {env ? (
                <>
                  <p className="font-bold text-slate-900 font-mono text-sm">{env.folio}</p>
                  <p className="text-xs text-slate-400">{env.contract_type_name}</p>
                </>
              ) : (
                <p className="text-sm text-slate-400">Cargando...</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-[#1a4fa0] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !env ? (
            <div className="text-center py-12 text-slate-400 text-sm">No se pudo cargar el sobre</div>
          ) : (
            <div className="space-y-5">

              {/* Estado + SLA */}
              <div className="flex items-center gap-3 flex-wrap">
                <StatusBadge status={env.status} />
                {env.sla && !isClosed && (
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    env.sla.color === 'red' ? 'bg-red-50 text-red-600' :
                    env.sla.color === 'yellow' ? 'bg-amber-50 text-amber-600' :
                    'bg-green-50 text-green-600'
                  }`}>
                    {env.sla.is_breached
                      ? 'SLA vencido'
                      : env.sla.business_days_remaining !== null
                      ? `${env.sla.business_days_elapsed ?? 0} ${(env.sla.business_days_elapsed ?? 0) === 1 ? "día" : "días"} transcurridos`
                      : 'Sin enviar'}
                  </span>
                )}
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3">
                <InfoCard icon={<Building2 size={14} />} label="Empresa" value={env.company_name} />
                <InfoCard icon={<User size={14} />} label="Solicitante" value={env.requested_by_name} />
                <InfoCard icon={<Calendar size={14} />} label="Enviado" value={formatDate(env.submitted_at)} />
                <InfoCard icon={<Clock size={14} />} label="Límite SLA" value={formatDate(env.sla_due_at)} />
                {env.assigned_lawyer_name && (
                  <InfoCard icon={<User size={14} />} label="Abogado" value={env.assigned_lawyer_name} />
                )}
                {env.counterparty_name && (
                  <InfoCard icon={<User size={14} />} label="Contraparte" value={env.counterparty_name} />
                )}
              </div>

              {/* Documentos */}
              {data?.attachments?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Documentos</p>
                  {/* Activos */}
                  <div className="space-y-2 mb-3">
                    {data.attachments.filter((a: any) => a.is_current !== false).map((a: any) => (
                      <div key={a.id} className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
                        <FileText size={16} className="text-[#1a4fa0] shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-slate-800 truncate">{a.original_name}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{a.uploaded_by_name} · {formatDate(a.uploaded_at)}{a.version_number > 1 ? ` · v${a.version_number}` : ''}</p>
                        </div>
                        <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium shrink-0">Actual</span>
                        {a.object_key && (
                          <button
                            onClick={async () => {
                              try {
                                const res = await getSignedUrl(a.object_key, a.bucket || 'dirdoc')
                                window.open(res.data.data?.url || res.data.url, '_blank')
                              } catch (e) { console.error(e) }
                            }}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-[#1a4fa0] hover:bg-blue-50 transition shrink-0"
                            title="Descargar"
                          >
                            <FileDown size={17} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {/* Historial de versiones — oculto para solicitante */}
                  {role !== 'solicitante' && data.attachments.filter((a: any) => a.is_current === false).length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1"><History size={10} />Versiones anteriores</p>
                      <div className="space-y-1.5">
                        {data.attachments.filter((a: any) => a.is_current === false).map((a: any) => (
                          <div key={a.id} className="flex items-center gap-3 bg-slate-50 border border-dashed border-slate-200 rounded-lg px-3 py-2">
                            <FileText size={14} className="text-slate-300 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs text-slate-400 truncate">{a.original_name}</p>
                              <p className="text-[10px] text-slate-300 mt-0.5">{formatDate(a.uploaded_at)} · v{a.version_number}</p>
                            </div>
                            <span className="text-[10px] text-slate-300 shrink-0">Anterior</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Bitácora de estados y actividad */}
              {(data?.status_log?.length > 0 || data?.activity_log?.length > 0) && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Historial</p>
                  <div className="space-y-2">
                    {[
                      ...(data.status_log || []).map((s: any) => ({
                        id: s.id, date: s.changed_at, who: s.changed_by_name,
                        text: STATUS_CFG[s.to_status]?.label ?? s.to_status,
                        reason: s.reason, type: 'status'
                      })),
                      ...(data.activity_log || [])
                        .filter((a: any) => !['viewed'].includes(a.action))
                        .map((a: any) => {
                          const labels: Record<string, string> = {
                            created: 'Sobre creado',
                            submitted: 'Enviado al área legal',
                            lawyer_reassigned: `Abogado asignado: ${a.detail?.new_lawyer || ''}`,
                            attachment_uploaded: 'Documento adjuntado',
                            approved: 'Aprobado por el abogado',
                            rejected: 'Rechazado',
                            corrections_requested: 'Correcciones solicitadas',
                            lawyer_started_review: 'Abogado inició revisión del contrato',
                          }
                          return {
                            id: a.id, date: a.performed_at, who: a.performed_by_name,
                            text: labels[a.action] || a.action, reason: null, type: 'activity'
                          }
                        })
                    ]
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((item: any) => (
                      <div key={item.id} className="flex items-start gap-3">
                        <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${item.type === 'status' ? 'bg-[#1a4fa0]' : 'bg-slate-300'}`} />
                        <div className="min-w-0">
                          <p className="text-xs text-slate-700">
                            <span className="font-medium">{item.who}</span>
                            {' — '}<span>{item.text}</span>
                          </p>
                          {item.reason && <p className="text-xs text-slate-500 mt-0.5 italic">"{item.reason}"</p>}
                          <p className="text-[10px] text-slate-400 mt-0.5">{formatRelative(item.date)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Comentarios */}
              {data?.comments?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Comentarios</p>
                  <div className="space-y-2">
                    {data.comments.map((c: any) => (
                      <div key={c.id} className={`rounded-lg p-3 text-xs ${c.is_internal ? 'bg-amber-50 border border-amber-100' : 'bg-slate-50'}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-slate-700">{c.author_name}</span>
                          {c.is_internal && <span className="text-[10px] bg-amber-200 text-amber-700 px-1.5 rounded">Interno</span>}
                        </div>
                        <p className="text-slate-600">{c.body}</p>
                        <p className="text-slate-400 mt-1">{formatRelative(c.created_at)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>

        {/* Acciones */}
        {canAct && (
          <div className="px-6 py-4 border-t border-slate-200 shrink-0 flex gap-2">
            <button
              onClick={handleApprove}
              disabled={acting}
              className="flex-1 flex items-center justify-center gap-2 bg-[#1a4fa0] text-white text-sm font-medium py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
            >
              <CheckCircle size={15} />
              Aprobar
            </button>
            <button
              onClick={() => setShowCorrections(true)}
              disabled={acting}
              className="flex-1 flex items-center justify-center gap-2 border border-slate-300 text-slate-700 text-sm font-medium py-2.5 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition"
            >
              <AlertCircle size={15} />
              Correcciones
            </button>
            <button
              onClick={() => setShowReject(true)}
              disabled={acting}
              className="w-10 flex items-center justify-center border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 transition"
            >
              <XCircle size={15} />
            </button>
          </div>
        )}
      </div>

      {showCorrections && (
        <ReasonModal
          title="Solicitar correcciones"
          description={`Indica al solicitante qué debe corregir en el sobre ${env?.folio}.`}
          confirmLabel="Solicitar correcciones"
          onConfirm={handleCorrections}
          onClose={() => setShowCorrections(false)}
          isLoading={acting}
        />
      )}
      {showReject && (
        <ReasonModal
          title="Rechazar sobre"
          description={`El sobre ${env?.folio} quedará cerrado e inmutable.`}
          confirmLabel="Rechazar"
          danger
          onConfirm={handleReject}
          onClose={() => setShowReject(false)}
          isLoading={acting}
        />
      )}
    </>
  )
}

const InfoCard = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="bg-slate-50 rounded-lg p-3">
    <div className="flex items-center gap-1.5 text-slate-400 mb-1">
      {icon}
      <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
    </div>
    <p className="text-sm font-medium text-slate-900 truncate">{value}</p>
  </div>
)

// ── Action Menu (tabla desktop) ───────────────────────────────────────────────

const ActionMenu = ({
  item, role, onRefresh, onViewDetail,
}: {
  item: EnvelopeListItem; role: LegalRole
  onRefresh: () => void; onViewDetail: () => void
}) => {
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })
  const [showCorrections, setShowCorrections] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [acting, setActing] = useState(false)
  const [showAssign, setShowAssign] = useState(false)
  const [lawyers, setLawyers] = useState<{id: string; name: string}[]>([])
  const [selectedLawyer, setSelectedLawyer] = useState('')
  const btnRef = useRef<HTMLButtonElement>(null)

  const openMenu = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const top = spaceBelow < 200
        ? rect.top + window.scrollY - 200 - 4
        : rect.bottom + window.scrollY + 4
      setMenuPos({ top, right: window.innerWidth - rect.right })
    }
    setOpen(true)
  }

  const isLegal = role === 'abogado' || role === 'coordinador_legal' || role === 'super_admin'
  const isCoord = role === 'coordinador_legal' || role === 'super_admin'
  const isClosed = item.status === 'completado' || item.status === 'rechazado'
  const canLegalAct = isLegal && !isClosed && (item.status === 'pendiente_legal' || item.status === 'en_revision_legal')

  const handleApprove = async () => {
    setOpen(false); setActing(true)
    try {
      await approveEnvelope(item.id)
      try { await sendForSigning(item.id) } catch (e) { console.error('DocuSign send-for-signing error:', e) }
      onRefresh()
    }
    catch (e) { console.error(e) }
    finally { setActing(false) }
  }

  const handleAssign = async () => {
    if (!selectedLawyer) return
    setActing(true)
    try { await assignLawyer(item.id, selectedLawyer); setShowAssign(false); onRefresh() }
    catch (e) { console.error(e) }
    finally { setActing(false) }
  }
  const openAssign = async () => {
    setOpen(false)
    try {
      const res = await import('@/services/api').then(m => m.default.get('/api/v1/legal/envelopes/lawyers'))
      setLawyers(res.data || [])
    } catch (e) { setLawyers([]) }
    setSelectedLawyer('')
    setShowAssign(true)
  }
  const handleComplete = async () => {
    setOpen(false); setActing(true)
    try { await completeEnvelope(item.id); onRefresh() }
    catch (e) { console.error(e) }
    finally { setActing(false) }
  }

  const handleCorrections = async (reason: string) => {
    setActing(true)
    try { await requestCorrections(item.id, reason); setShowCorrections(false); onRefresh() }
    catch (e) { console.error(e) }
    finally { setActing(false) }
  }

  const handleReject = async (reason: string) => {
    setActing(true)
    try { await rejectEnvelope(item.id, reason); setShowReject(false); onRefresh() }
    catch (e) { console.error(e) }
    finally { setActing(false) }
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={openMenu}
        disabled={acting}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
      >
        {acting
          ? <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
          : <MoreHorizontal size={20} />
        }
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed z-50 w-52 bg-white border border-slate-200 rounded-xl shadow-2xl py-1.5"
            style={{ top: menuPos.top, right: menuPos.right }}>
            <MI icon={<Eye size={14} />} label="Ver detalle" onClick={() => { setOpen(false); onViewDetail() }} />
            {canLegalAct && <>
              <div className="h-px bg-slate-100 my-1" />
              <MI icon={<CheckCircle size={14} />} label="Aprobar" onClick={handleApprove} />
              <MI icon={<AlertCircle size={14} />} label="Solicitar correcciones" onClick={() => { setOpen(false); setShowCorrections(true) }} />
              <MI icon={<XCircle size={14} />} label="Rechazar" onClick={() => { setOpen(false); setShowReject(true) }} danger />
            </>}
            {(item.status === 'en_firmas' || item.status === 'firmado_parcial') && isLegal && (
              <MI icon={<CheckCircle size={14} />} label="Marcar completado" onClick={handleComplete} />
            )}
            {isCoord && !isClosed && <>
              <div className="h-px bg-slate-100 my-1" />
              <MI icon={<Users size={14} />} label={item.assigned_lawyer_name ? 'Reasignar abogado' : 'Asignar abogado'} onClick={openAssign} />
              <MI icon={<RotateCcw size={14} />} label="Actualizar SLA" onClick={() => setOpen(false)} />
            </>}
          </div>
        </>
      )}

      {showAssign && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowAssign(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">{item.assigned_lawyer_name ? 'Reasignar abogado' : 'Asignar abogado'}</h3>
              <button onClick={() => setShowAssign(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <p className="text-sm text-slate-500 mb-4">Sobre <span className="font-mono font-bold text-slate-700">{item.folio}</span></p>
            <select
              value={selectedLawyer}
              onChange={e => setSelectedLawyer(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4fa0] mb-5"
            >
              <option value="">Selecciona un abogado...</option>
              {lawyers.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setShowAssign(false)} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-100">Cancelar</button>
              <button
                onClick={handleAssign}
                disabled={!selectedLawyer || acting}
                className="px-5 py-2 text-sm font-medium rounded-lg bg-[#1a4fa0] text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {acting && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                Asignar
              </button>
            </div>
          </div>
        </div>
      )}
      {showCorrections && (
        <ReasonModal title="Solicitar correcciones"
          description={`Indica al solicitante qué debe corregir en el sobre ${item.folio}.`}
          confirmLabel="Solicitar correcciones"
          onConfirm={handleCorrections} onClose={() => setShowCorrections(false)} isLoading={acting} />
      )}
      {showReject && (
        <ReasonModal title="Rechazar sobre"
          description={`El sobre ${item.folio} quedará cerrado e inmutable.`}
          confirmLabel="Rechazar" danger
          onConfirm={handleReject} onClose={() => setShowReject(false)} isLoading={acting} />
      )}
    </>
  )
}

const MI = ({ icon, label, onClick, danger = false }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) => (
  <button onClick={onClick}
    className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition ${danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-100'}`}>
    <span className="shrink-0">{icon}</span>{label}
  </button>
)

// ── Tarjeta móvil ─────────────────────────────────────────────────────────────

const EnvelopeCard = ({
  item, role, onRefresh, onViewDetail,
}: {
  item: EnvelopeListItem; role: LegalRole
  onRefresh: () => void; onViewDetail: () => void
}) => (
  <div
    className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-3 cursor-pointer active:bg-slate-50 transition"
    onClick={onViewDetail}
  >
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <SLADot color={item.sla_color} status={item.status} />
        <span className="font-bold text-[#1a4fa0] font-mono text-sm">{item.folio}</span>
        {item.is_open_request && (
          <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">Abierta</span>
        )}
      </div>
      <StatusBadge status={item.status} />
    </div>

    <div>
      <p className="text-sm font-medium text-slate-900">{item.contract_type_name}</p>
      <div className="flex items-center gap-1.5 mt-0.5">
        <Avatar name={item.requested_by_name} size="sm" />
        <p className="text-xs text-slate-500">{item.requested_by_name} · {item.company_name}</p>
      </div>
    </div>

    <div className="flex items-center justify-between pt-1 border-t border-slate-100">
      <SLAPill item={item} />
      <div className="flex items-center gap-1 text-xs text-slate-400">
        <span>{formatRelative(item.submitted_at)}</span>
        <Arrow size={12} className="text-slate-300" />
      </div>
    </div>
  </div>
)

// ── Componente principal ──────────────────────────────────────────────────────

interface Props {
  items: EnvelopeListItem[]
  isLoading: boolean
  onRefresh: (silent?: boolean) => void
  page: number
  perPage: number
  total: number
  onPageChange: (p: number) => void
  role: LegalRole
}

export default function ContractRequestsTable({
  items, isLoading, onRefresh, page, perPage, total, onPageChange, role,
}: Props) {
  const totalPages = Math.ceil(total / perPage)
  const [detailId, setDetailId] = useState<string | null>(null)

  const showSolicitante = role !== 'solicitante'
  const showAbogado = role === 'coordinador_legal' || role === 'director' || role === 'super_admin'

  const EmptyState = () => (
    <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
      <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
        <FileText size={22} className="text-slate-400" />
      </div>
      <p className="text-slate-600 text-sm font-medium">Sin sobres</p>
      <p className="text-slate-400 text-xs mt-1">Ajusta los filtros o crea un nuevo sobre</p>
    </div>
  )

  const Loader = () => (
    <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
      <div className="w-8 h-8 border-2 border-[#1a4fa0] border-t-transparent rounded-full animate-spin mx-auto" />
      <p className="text-slate-400 text-sm mt-3">Cargando sobres...</p>
    </div>
  )

  const Pagination = () => totalPages <= 1 ? null : (
    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
      <p className="text-xs text-slate-400">
        {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} de {total} sobres
      </p>
      <div className="flex items-center gap-1">
        <button onClick={() => onPageChange(page - 1)} disabled={page === 1}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition">
          <ChevronLeft size={15} />
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
          .map((p, idx, arr) => (
            <span key={p} className="flex items-center">
              {idx > 0 && arr[idx - 1] !== p - 1 && <span className="text-slate-300 text-xs px-1">…</span>}
              <button onClick={() => onPageChange(p)}
                className={`w-8 h-8 rounded-lg text-sm transition ${p === page ? 'bg-[#1a4fa0] text-white font-medium' : 'text-slate-600 hover:bg-slate-100'}`}>
                {p}
              </button>
            </span>
          ))}
        <button onClick={() => onPageChange(page + 1)} disabled={page === totalPages}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition">
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  )

  if (isLoading) return <Loader />
  if (!items.length) return <EmptyState />

  return (
    <>
      {/* ── DESKTOP: Tabla ── */}
      <div className="hidden md:block bg-white rounded-xl border-2 border-slate-200 overflow-hidden">
        <div style={{ overflowX: 'auto' }}>
          <table className="w-full table-fixed" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                                    <colgroup>
              <col style={{ width: '3%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '9%' }} />
              {showSolicitante && <><col style={{ width: '7%' }} /><col style={{ width: '21%' }} /></>}
              <col style={{ width: '9%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '13%' }} />
              {showAbogado && <col style={{ width: '13%' }} />}
              <col style={{ width: '4%' }} />
            </colgroup>
            <thead>
              <tr className="bg-slate-50 border-b-2 border-slate-200">
                <th className="px-3 py-3 bg-slate-50" />
                <th className="text-left text-xs font-bold text-slate-500 uppercase tracking-widest px-4 py-3 bg-slate-50">Folio</th>
                <th className="text-left text-xs font-bold text-slate-500 uppercase tracking-widest px-4 py-3 bg-slate-50">Tipo</th>
                {showSolicitante && <><th className="text-left text-xs font-bold text-slate-500 uppercase tracking-widest px-4 py-3 bg-slate-50">Empresa</th><th className="text-left text-xs font-bold text-slate-500 uppercase tracking-widest px-4 py-3 bg-slate-50">Solicitante</th></>}
                <th className="text-left text-xs font-bold text-slate-500 uppercase tracking-widest px-4 py-3 bg-slate-50">{role === 'solicitante' ? "Enviado" : "Recibido"}</th>
                <th className="text-left text-xs font-bold text-slate-500 uppercase tracking-widest px-4 py-3 bg-slate-50">Días</th>
                <th className="text-left text-xs font-bold text-slate-500 uppercase tracking-widest px-4 py-3 bg-slate-50">Estado</th>
                {showAbogado && <th className="text-left text-xs font-bold text-slate-500 uppercase tracking-widest px-4 py-3 bg-slate-50">Abogado</th>}
                <th className="px-4 py-3 bg-slate-50 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-slate-100 transition-colors cursor-pointer">
                  <td className="px-3 py-4 text-center"><SLADot color={item.sla_color} status={item.status} /></td>
                  <td className="px-4 py-3">
                    <span
                      className="font-bold text-[#1a4fa0] font-mono cursor-pointer hover:underline"
                      onClick={() => setDetailId(item.id)}
                    >
                      {item.folio}
                    </span>

                  </td>
                  <td className="px-4 py-4 text-slate-700">{item.contract_type_name}</td>
                  {showSolicitante && (
                    <>
                      <td className="px-4 py-4 text-xs text-slate-600 font-medium uppercase">{item.company_name}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar name={item.requested_by_name} size="sm" />
                          <p className="text-sm text-slate-700 truncate leading-tight">{item.requested_by_name}</p>
                        </div>
                      </td>
                    </>
                  )}
                  <td className="px-4 py-4 text-xs text-slate-500">{formatDate(item.submitted_at)}</td>
                  <td className="px-4 py-4"><SLAPill item={item} /></td>
                  <td className="px-4 py-4"><StatusBadge status={item.status} /></td>
                  {showAbogado && (
                    <td className="px-4 py-3">
                      {item.assigned_lawyer_name ? (
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar name={item.assigned_lawyer_name} size="sm" />
                          <span className="text-sm text-slate-700 truncate">{item.assigned_lawyer_name}</span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs text-slate-400 border border-dashed border-slate-300">
                          Sin asignar
                        </span>
                      )}
                    </td>
                  )}
                  <td className="px-2 py-4">
                    <ActionMenu item={item} role={role} onRefresh={() => onRefresh(true)} onViewDetail={() => setDetailId(item.id)} />
                  </td>
                </tr>
              ))}
              {Array.from({ length: Math.max(0, 8 - items.length) }).map((_, i) => (
                <tr key={`empty-${i}`} className="pointer-events-none">
                  <td className="px-3 py-4" />
                  <td className="px-4 py-4" />
                  <td className="px-4 py-4" />
                  {showSolicitante && <><td className="px-4 py-4" /><td className="px-4 py-4" /></>}
                  <td className="px-4 py-4" />
                  <td className="px-4 py-4" />
                  <td className="px-4 py-4" />
                  {showAbogado && <td className="px-4 py-4" />}
                  <td className="px-4 py-4" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination />
      </div>

      {/* ── MÓVIL: Tarjetas ── */}
      <div className="md:hidden flex flex-col gap-3">
        {items.map(item => (
          <EnvelopeCard
            key={item.id}
            item={item}
            role={role}
            onRefresh={() => onRefresh(true)}
            onViewDetail={() => setDetailId(item.id)}
          />
        ))}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <Pagination />
        </div>
      </div>

      {/* ── Slide-over ── */}
      {detailId && (
        <EnvelopeSlideOver
          envelopeId={detailId}
          role={role}
          onClose={() => setDetailId(null)}
          onRefresh={() => { onRefresh(true); setDetailId(null) }}
        />
      )}
    </>
  )
}
