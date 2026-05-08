'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import {
  MoreHorizontal, Eye, Pencil, Send, CheckCircle, XCircle, AlertCircle,
  Users, ChevronLeft, ChevronRight, X, Flag, FileText, RotateCcw, Download,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { ContractRequestListItem, SLAColor } from '@/types/contract.types'
import {
  approveContractRequest, requestCorrections, rejectContractRequest,
  completeContractRequest, reassignLawyer,
} from '@/services/legalService'

// ── Helpers ───────────────────────────────────────────────────────────────────

const formatDate = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  const m = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  return `${String(d.getDate()).padStart(2,'0')} ${m[d.getMonth()]} ${d.getFullYear()}`
}

const avatarColors = [
  'bg-[#1a4fa0]', 'bg-violet-500', 'bg-teal-500',
  'bg-orange-400', 'bg-rose-500', 'bg-emerald-500',
]

// ── Sub-components ────────────────────────────────────────────────────────────

const Avatar = ({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) => {
  const initials = name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
  const colorIndex = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % avatarColors.length
  const sizeClass = size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-7 h-7 text-xs'
  return (
    <div className={`${sizeClass} ${avatarColors[colorIndex]} rounded-lg flex items-center justify-center shrink-0`}>
      <span className="text-white font-bold">{initials}</span>
    </div>
  )
}

const SLADot = ({ color }: { color: SLAColor }) => {
  const styles: Record<SLAColor, string> = {
    green: 'bg-green-500',
    yellow: 'bg-amber-400',
    red: 'bg-red-500',
  }
  const rings: Record<SLAColor, string> = {
    green: 'ring-green-200',
    yellow: 'ring-amber-100',
    red: 'ring-red-200',
  }
  return (
    <span className={`w-2.5 h-2.5 rounded-full ${styles[color]} ring-4 ${rings[color]} inline-block shrink-0`} />
  )
}

const SLAPill = ({ item }: { item: ContractRequestListItem }) => {
  if (!item.submitted_at || item.status === 'borrador') {
    return <span className="text-xs text-slate-400">—</span>
  }
  if (item.status === 'completado' || item.status === 'rechazado') {
    return <span className="text-xs text-slate-400">Cerrado</span>
  }
  if (item.is_sla_breached) {
    return (
      <span className="text-xs font-semibold text-red-600 flex items-center gap-1">
        <Flag size={11} className="shrink-0" />
        Atrasado
      </span>
    )
  }
  const remaining = item.sla_due_at
    ? Math.ceil((new Date(item.sla_due_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  const colorClass = item.sla_color === 'red'
    ? 'text-red-600'
    : item.sla_color === 'yellow'
    ? 'text-amber-600'
    : 'text-slate-500'

  return (
    <span className={`text-xs font-medium ${colorClass}`}>
      {remaining !== null ? `${remaining}d restante${remaining !== 1 ? 's' : ''}` : '—'}
    </span>
  )
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  borrador:          { label: 'Borrador',          bg: 'bg-slate-100',   text: 'text-slate-600',  dot: 'bg-slate-400'  },
  pendiente_legal:   { label: 'Pendiente legal',   bg: 'bg-amber-50',    text: 'text-amber-700',  dot: 'bg-amber-400'  },
  pendiente_cliente: { label: 'Pendiente cliente', bg: 'bg-orange-50',   text: 'text-orange-700', dot: 'bg-orange-400' },
  en_revision_legal: { label: 'En revisión legal', bg: 'bg-blue-50',     text: 'text-blue-700',   dot: 'bg-blue-400'   },
  en_firmas:         { label: 'En firmas',         bg: 'bg-violet-50',   text: 'text-violet-700', dot: 'bg-violet-400' },
  firmado_parcial:   { label: 'Firmado parcial',   bg: 'bg-purple-50',   text: 'text-purple-700', dot: 'bg-purple-400' },
  completado:        { label: 'Completado',        bg: 'bg-green-50',    text: 'text-green-700',  dot: 'bg-green-500'  },
  rechazado:         { label: 'Rechazado',         bg: 'bg-red-50',      text: 'text-red-700',    dot: 'bg-red-500'    },
}

const StatusBadge = ({ status }: { status: string }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG['borrador']
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text} border border-transparent`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

// ── Modals ────────────────────────────────────────────────────────────────────

const ReasonModal = ({
  title,
  description,
  confirmLabel,
  danger = false,
  onConfirm,
  onClose,
  isLoading,
}: {
  title: string
  description: string
  confirmLabel: string
  danger?: boolean
  onConfirm: (reason: string) => void
  onClose: () => void
  isLoading: boolean
}) => {
  const [reason, setReason] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <p className="text-sm text-slate-600 mb-4">{description}</p>
        <div className="mb-5">
          <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
            Motivo <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Escribe el motivo detallado..."
            rows={3}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4fa0] resize-none"
          />
        </div>
        <div className="flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-100">
            Cancelar
          </button>
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

// ── Action Menu ───────────────────────────────────────────────────────────────

type LegalRole = 'solicitante' | 'abogado' | 'coordinador_legal' | 'director' | 'super_admin'

const ActionMenu = ({
  item,
  role,
  onRefresh,
  onViewDetail,
}: {
  item: ContractRequestListItem
  role: LegalRole
  onRefresh: () => void
  onViewDetail: () => void
}) => {
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })
  const [showCorrectionsModal, setShowCorrectionsModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [loadingAction, setLoadingAction] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)

  const openMenu = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      const menuHeight = 300
      const spaceBelow = window.innerHeight - rect.bottom
      const top = spaceBelow < menuHeight
        ? rect.top + window.scrollY - menuHeight - 4
        : rect.bottom + window.scrollY + 4
      setMenuPos({ top, right: window.innerWidth - rect.right })
    }
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const handleScroll = () => setOpen(false)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [open])

  const handleApprove = async () => {
    setOpen(false)
    setLoadingAction(true)
    try { await approveContractRequest(item.id); onRefresh() }
    catch (e) { console.error(e) }
    finally { setLoadingAction(false) }
  }

  const handleComplete = async () => {
    setOpen(false)
    setLoadingAction(true)
    try { await completeContractRequest(item.id); onRefresh() }
    catch (e) { console.error(e) }
    finally { setLoadingAction(false) }
  }

  const handleCorrections = async (reason: string) => {
    setLoadingAction(true)
    try { await requestCorrections(item.id, reason); setShowCorrectionsModal(false); onRefresh() }
    catch (e) { console.error(e) }
    finally { setLoadingAction(false) }
  }

  const handleReject = async (reason: string) => {
    setLoadingAction(true)
    try { await rejectContractRequest(item.id, reason); setShowRejectModal(false); onRefresh() }
    catch (e) { console.error(e) }
    finally { setLoadingAction(false) }
  }

  const isLegal = role === 'abogado' || role === 'coordinador_legal' || role === 'super_admin'
  const isCoordinator = role === 'coordinador_legal' || role === 'super_admin'
  const isClosed = item.status === 'completado' || item.status === 'rechazado'

  return (
    <>
      <button
        ref={btnRef}
        onClick={openMenu}
        disabled={loadingAction}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
      >
        {loadingAction
          ? <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
          : <MoreHorizontal size={20} />
        }
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="fixed z-50 w-56 bg-white border-2 border-slate-300 rounded-xl shadow-2xl py-1.5"
            style={{ top: menuPos.top, right: menuPos.right }}
          >
            <MenuItem icon={<Eye size={14} />} label="Ver detalle" onClick={() => { setOpen(false); onViewDetail() }} />
            <MenuItem icon={<FileText size={14} />} label="Ver bitácora" onClick={() => { setOpen(false); onViewDetail() }} />

            {!isClosed && isLegal && (
              <>
                <div className="h-px bg-slate-100 my-1" />
                {(item.status === 'pendiente_legal' || item.status === 'en_revision_legal') && (
                  <>
                    <MenuItem icon={<CheckCircle size={14} />} label="Aprobar solicitud" onClick={handleApprove} />
                    <MenuItem icon={<AlertCircle size={14} />} label="Solicitar correcciones" onClick={() => { setOpen(false); setShowCorrectionsModal(true) }} />
                    <MenuItem icon={<XCircle size={14} />} label="Rechazar" onClick={() => { setOpen(false); setShowRejectModal(true) }} danger />
                  </>
                )}
                {(item.status === 'en_firmas' || item.status === 'firmado_parcial') && (
                  <MenuItem icon={<CheckCircle size={14} />} label="Marcar completado" onClick={handleComplete} />
                )}
              </>
            )}

            {isCoordinator && !isClosed && (
              <>
                <div className="h-px bg-slate-100 my-1" />
                <MenuItem icon={<Users size={14} />} label={item.assigned_lawyer_name ? 'Reasignar abogado' : 'Asignar abogado'} onClick={() => setOpen(false)} />
                <MenuItem icon={<RotateCcw size={14} />} label="Actualizar SLA" onClick={() => setOpen(false)} />
              </>
            )}

            <div className="h-px bg-slate-100 my-1" />
            <MenuItem icon={<Download size={14} />} label="Exportar PDF" onClick={() => setOpen(false)} />
          </div>
        </>
      )}

      {showCorrectionsModal && (
        <ReasonModal
          title="Solicitar correcciones"
          description={`Indica al solicitante qué debe corregir en la solicitud ${item.folio}.`}
          confirmLabel="Solicitar correcciones"
          onConfirm={handleCorrections}
          onClose={() => setShowCorrectionsModal(false)}
          isLoading={loadingAction}
        />
      )}
      {showRejectModal && (
        <ReasonModal
          title="Rechazar solicitud"
          description={`La solicitud ${item.folio} quedará cerrada e inmutable. Esta acción no se puede deshacer.`}
          confirmLabel="Rechazar"
          danger
          onConfirm={handleReject}
          onClose={() => setShowRejectModal(false)}
          isLoading={loadingAction}
        />
      )}
    </>
  )
}

const MenuItem = ({
  icon, label, onClick, danger = false,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
}) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition ${danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-100'}`}
  >
    <span className="shrink-0">{icon}</span>
    {label}
  </button>
)

// ── Main Component ────────────────────────────────────────────────────────────

interface ContractRequestsTableProps {
  items: ContractRequestListItem[]
  isLoading: boolean
  onRefresh: (silent?: boolean) => void
  page: number
  perPage: number
  total: number
  onPageChange: (page: number) => void
  role: LegalRole
}

export default function ContractRequestsTable({
  items,
  isLoading,
  onRefresh,
  page,
  perPage,
  total,
  onPageChange,
  role,
}: ContractRequestsTableProps) {
  const totalPages = Math.ceil(total / perPage)
  const [detailId, setDetailId] = useState<string | null>(null)

  const showSolicitante = role !== 'solicitante'
  const showAbogado = role === 'coordinador_legal' || role === 'director' || role === 'super_admin'

  if (isLoading) return (
    <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
      <div className="w-8 h-8 border-2 border-[#1a4fa0] border-t-transparent rounded-full animate-spin mx-auto" />
      <p className="text-slate-400 text-sm mt-3">Cargando solicitudes...</p>
    </div>
  )

  if (!items.length) return (
    <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
      <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
        <FileText size={22} className="text-slate-400" />
      </div>
      <p className="text-slate-600 text-sm font-medium">Sin solicitudes</p>
      <p className="text-slate-400 text-xs mt-1">Ajusta los filtros o crea una nueva solicitud</p>
    </div>
  )

  return (
    <>
      <div
        className="bg-white rounded-xl border border-slate-200 overflow-hidden"
        style={{ display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ overflowX: 'auto', flex: 1 }}>
          <table className="w-full" style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 13 }}>
            <colgroup>
              <col style={{ width: 36 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 180 }} />
              {showSolicitante && <col style={{ width: showAbogado ? 200 : 240 }} />}
              <col style={{ width: 120 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 170 }} />
              {showAbogado && <col style={{ width: 180 }} />}
              <col style={{ width: 44 }} />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-3 py-2.5 w-9" />
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-2.5">Folio</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-2.5">Tipo de contrato</th>
                {showSolicitante && (
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-2.5">Solicitante</th>
                )}
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-2.5">Enviado</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-2.5">SLA</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-2.5">Estado</th>
                {showAbogado && (
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-2.5">Abogado</th>
                )}
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/60 transition">
                  <td className="px-3 py-3 text-center">
                    <SLADot color={item.sla_color} />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="font-semibold text-[#1a4fa0] text-sm cursor-pointer hover:underline font-mono"
                      onClick={() => setDetailId(item.id)}
                    >
                      {item.folio}
                    </span>
                    {item.is_open_request && (
                      <span className="ml-2 text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">Abierta</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-slate-700 font-medium">{item.contract_type_name}</span>
                  </td>
                  {showSolicitante && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar name={item.requested_by_name} size="sm" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 leading-tight truncate">{item.requested_by_name}</p>
                          <p className="text-xs text-slate-400 leading-tight truncate">{item.company_name}</p>
                        </div>
                      </div>
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <span className="text-xs text-slate-500">{formatDate(item.submitted_at)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <SLAPill item={item} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.status} />
                  </td>
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
                  <td className="px-2 py-3">
                    <ActionMenu
                      item={item}
                      role={role}
                      onRefresh={() => onRefresh(true)}
                      onViewDetail={() => setDetailId(item.id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <p className="text-xs text-slate-400">
              Mostrando {(page - 1) * perPage + 1} a {Math.min(page * perPage, total)} de {total} solicitudes
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onPageChange(page - 1)}
                disabled={page === 1}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft size={15} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .map((p, idx, arr) => (
                  <span key={p} className="flex items-center">
                    {idx > 0 && arr[idx - 1] !== p - 1 && (
                      <span className="text-slate-300 text-xs px-1">...</span>
                    )}
                    <button
                      onClick={() => onPageChange(p)}
                      className={`w-8 h-8 rounded-lg text-sm transition ${p === page ? 'bg-[#1a4fa0] text-white font-medium' : 'text-slate-600 hover:bg-slate-100'}`}
                    >
                      {p}
                    </button>
                  </span>
                ))
              }
              <button
                onClick={() => onPageChange(page + 1)}
                disabled={page === totalPages}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
