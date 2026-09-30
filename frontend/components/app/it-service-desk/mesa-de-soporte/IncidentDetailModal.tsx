'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/store/authStore'
import { getIncidentDetail, getSystems, getSeverities, resolveIncident } from '@/services/itServiceDeskService'
import { getSignedUrl } from '@/services/uploadService'
import { X, Phone, Briefcase, Building2, UserCog, ImageOff, CheckCircle2, Paperclip } from 'lucide-react'
import AssignIncidentModal from './AssignIncidentModal'

interface Attachment { id: string; attachment_type: string; object_key: string; bucket: string; mime_type: string }

interface Detail {
  id: string; folio: string; title: string; description: string; status: string
  system_id: string; module_id: string | null; reported_type: string | null
  severity_reported_id: string; severity_validated_id: string | null
  requester_name: string; requester_phone: string | null; requester_puesto: string | null
  requester_area: string | null; requester_company_name: string; requester_photo_object_key: string | null
  assigned_team: string | null; assigned_to_user_id: string | null; assigned_at: string | null
  assigned_to_name: string | null; assigned_to_phone: string | null
  assigned_to_puesto: string | null; assigned_to_photo_object_key: string | null
  sla_response_limit: string | null; sla_resolution_limit: string | null; is_sla_breached: boolean
  resolved_at: string | null; resolution_type: string | null; closed_at: string | null
  created_at: string
  attachments: Attachment[]
  activity_log: { action: string; performed_by_name: string; performed_by_role: string; performed_at: string; detail: any }[]
}

const STATUS_LABEL: Record<string, string> = {
  en_backlog: 'En backlog', asignado: 'Asignado', en_atencion: 'En atención',
  escalado: 'Escalado', resuelto: 'Resuelto', cerrado: 'Cerrado',
}
const STATUS_CLASS: Record<string, string> = {
  en_backlog: 'bg-slate-100 text-slate-600',
  asignado: 'bg-blue-100 text-blue-700',
  en_atencion: 'bg-[#7c2d12]/10 text-[#7c2d12]',
  escalado: 'bg-red-100 text-red-700',
  resuelto: 'bg-emerald-100 text-emerald-700',
  cerrado: 'bg-slate-200 text-slate-600',
}
const SEV_CLASS: Record<string, string> = {
  S1: 'bg-red-50 text-red-700 border-red-300',
  S2: 'bg-orange-50 text-orange-700 border-orange-300',
  S3: 'bg-amber-50 text-amber-700 border-amber-300',
  S4: 'bg-emerald-50 text-emerald-700 border-emerald-300',
}
const ACTION_LABEL: Record<string, string> = {
  ticket_creado: 'Ticket creado',
  motor_asigno: 'Asignado automáticamente',
  motor_sin_especialista: 'Sin especialista disponible',
  asignacion_manual: 'Asignado manualmente',
  reasignacion_manual: 'Reasignado',
  redirigido_no_corresponde: 'Redirigido (no correspondía)',
  ticket_resuelto_via_token: 'Resuelto (vía enlace de correo)',
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

function PersonAvatar({ name, photoObjectKey }: { name: string; photoObjectKey: string | null }) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!photoObjectKey) return
    getSignedUrl(photoObjectKey, 'dirdoc')
      .then(res => setPhotoUrl(res.data?.data?.url || res.data?.url || null))
      .catch(() => setFailed(true))
  }, [photoObjectKey])

  if (photoObjectKey && photoUrl && !failed) {
    return <img src={photoUrl} alt={name} onError={() => setFailed(true)} className="w-14 h-14 rounded-xl object-cover shrink-0" />
  }
  return (
    <div className={`w-14 h-14 rounded-xl ${avatarColor(name)} text-white flex items-center justify-center font-bold text-lg shrink-0`}>
      {initialsOf(name)}
    </div>
  )
}

function AttachmentThumb({ a, index, label }: { a: Attachment; index: number; label: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getSignedUrl(a.object_key, a.bucket)
      .then(res => setUrl(res.data?.data?.url || res.data?.url || null))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
  }, [a.object_key, a.bucket])

  const inner = (
    <>
      {loading ? (
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-slate-300 border-t-[#7c2d12] rounded-full animate-spin" />
        </div>
      ) : failed || !url ? (
        <div className="w-full h-full flex items-center justify-center text-slate-300">
          <ImageOff size={20} />
        </div>
      ) : (
        <img src={url} alt={label} className="w-full h-full object-cover group-hover:scale-105 transition duration-200" />
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] text-center py-0.5">
        {label} {index + 1}
      </div>
    </>
  )

  return (
    <a href={url ?? undefined} target="_blank" rel="noopener noreferrer" className="group relative w-24 h-24 rounded-xl overflow-hidden border-2 border-slate-200 hover:border-[#7c2d12] transition shrink-0 bg-slate-100">
      {inner}
    </a>
  )
}

export default function IncidentDetailModal({ incidentId, onClose, onChanged }: {
  incidentId: string
  onClose: () => void
  onChanged?: () => void
}) {
  const { user } = useAuthStore()
  const [detail, setDetail] = useState<Detail | null>(null)
  const [systems, setSystems] = useState<{ id: string; name: string }[]>([])
  const [severities, setSeverities] = useState<{ id: string; code: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [showResolveForm, setShowResolveForm] = useState(false)
  const [resolutionType, setResolutionType] = useState('causa_raiz')
  const [rcaText, setRcaText] = useState('')
  const [resolveFiles, setResolveFiles] = useState<File[]>([])
  const [submittingResolve, setSubmittingResolve] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [detRes, sysRes, sevRes] = await Promise.all([
        getIncidentDetail(incidentId), getSystems(), getSeverities(),
      ])
      setDetail(detRes.data)
      setSystems(sysRes.data?.data ?? [])
      setSeverities(sevRes.data?.data ?? [])
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo cargar el ticket')
    } finally {
      setLoading(false)
    }
  }, [incidentId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const roles: string[] = user?.roles ?? []
  const isIncidentManager = roles.includes('it-service-desk:incident-manager') || roles.includes('super_admin')
  const isEspecialistaFuncional = roles.includes('it-service-desk:especialista-funcional')
  const isEspecialistaTecnico = roles.includes('it-service-desk:especialista-tecnico')
  const canAssign = isIncidentManager || isEspecialistaFuncional || isEspecialistaTecnico
  const canResolve = detail
    ? (isIncidentManager || user?.user_id === detail.assigned_to_user_id) && !['resuelto', 'cerrado'].includes(detail.status)
    : false

  const handleResolve = async () => {
    if (!detail) return
    setSubmittingResolve(true)
    setResolveError(null)
    try {
      const formData = new FormData()
      formData.append('resolution_type', resolutionType)
      if (rcaText) formData.append('rca_text', rcaText)
      resolveFiles.forEach(f => formData.append('files', f))
      await resolveIncident(detail.id, formData)
      setShowResolveForm(false)
      fetchAll()
      onChanged?.()
    } catch (err: any) {
      setResolveError(err?.response?.data?.detail ?? 'No se pudo marcar como resuelto')
    } finally {
      setSubmittingResolve(false)
    }
  }

  const systemName = (id: string) => systems.find(s => s.id === id)?.name ?? '—'
  const sevInfo = (id: string | null) => id ? severities.find(s => s.id === id) : null
  const sev = detail ? sevInfo(detail.severity_validated_id ?? detail.severity_reported_id) : null

  const reportEvidence = detail?.attachments.filter(a => a.attachment_type === 'evidencia_reporte') ?? []
  const resolutionEvidence = detail?.attachments.filter(a => a.attachment_type === 'evidencia_resolucion') ?? []

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />

      <div className="fixed right-0 top-0 h-full z-50 w-full flex flex-col bg-white shadow-2xl" style={{ maxWidth: '58vw' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-300 shrink-0 bg-white">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-mono text-slate-400">{detail?.folio ?? '...'}</p>
              {detail && (
                <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${STATUS_CLASS[detail.status] ?? ''}`}>
                  {STATUS_LABEL[detail.status] ?? detail.status}
                </span>
              )}
            </div>
            <h2 className="font-bold text-slate-900 text-2xl truncate mt-0.5">{detail?.title ?? 'Cargando...'}</h2>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {sev && (
              <span className={`px-4 py-2 rounded-xl border-2 text-base font-bold ${SEV_CLASS[sev.code] ?? 'bg-slate-50 text-slate-600 border-slate-300'}`}>
                {sev.code} · {sev.name}
              </span>
            )}
            <button onClick={onClose} className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto px-6 py-5 bg-white">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-[#7c2d12] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error || !detail ? (
            <div className="text-center py-12 text-red-500 text-sm">{error ?? 'No se pudo cargar el ticket'}</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
              {/* Columna izquierda: Datos generales + Asignacion/Resolucion */}
              <div className="flex flex-col gap-5">
                {/* Datos generales */}
                <div className="bg-white rounded-2xl border border-slate-300 shadow-md p-5">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">Datos generales</p>

                  <div className="flex items-center gap-4 mb-4">
                    <PersonAvatar name={detail.requester_name} photoObjectKey={detail.requester_photo_object_key} />
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{detail.requester_name}</p>
                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                        {detail.requester_puesto && <span className="flex items-center gap-1"><Briefcase size={12} />{detail.requester_puesto}</span>}
                        {detail.requester_phone && <span className="flex items-center gap-1"><Phone size={12} />{detail.requester_phone}</span>}
                        <span className="flex items-center gap-1"><Building2 size={12} />{detail.requester_company_name}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-sm mb-3 border-t border-slate-100 pt-3">
                    <div><p className="text-[10px] text-slate-400 uppercase">Sistema</p><p className="font-medium text-slate-800">{systemName(detail.system_id)}</p></div>
                    <div><p className="text-[10px] text-slate-400 uppercase">Tipo</p><p className="font-medium text-slate-800 capitalize">{detail.reported_type ?? '—'}</p></div>
                    <div><p className="text-[10px] text-slate-400 uppercase">Creado</p><p className="font-medium text-slate-800">{fmt(detail.created_at)}</p></div>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed border border-slate-200 rounded-lg p-3">{detail.description}</p>

                  {reportEvidence.length > 0 && (
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {reportEvidence.map((a, i) => <AttachmentThumb key={a.id} a={a} index={i} label="Evidencia" />)}
                    </div>
                  )}
                </div>

                {/* Asignacion y resolucion */}
                <div className="bg-white rounded-2xl border border-slate-300 shadow-md p-5 flex-1">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Asignación y resolución</p>
                    {canAssign && (
                      <button
                        onClick={() => setShowAssignModal(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-[#7c2d12] hover:bg-[#6b2610] shadow-sm transition"
                      >
                        <UserCog size={16} />
                        {detail.assigned_to_user_id ? 'Reasignar' : 'Asignar'}
                      </button>
                    )}
                  </div>

                  {detail.assigned_to_user_id ? (
                    <>
                      <div className="flex items-center gap-4 mb-4">
                        <PersonAvatar name={detail.assigned_to_name ?? '?'} photoObjectKey={detail.assigned_to_photo_object_key} />
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 truncate">{detail.assigned_to_name ?? 'Sin nombre'}</p>
                          <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                            {detail.assigned_to_puesto && <span className="flex items-center gap-1"><Briefcase size={12} />{detail.assigned_to_puesto}</span>}
                            {detail.assigned_to_phone && <span className="flex items-center gap-1"><Phone size={12} />{detail.assigned_to_phone}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm border-t border-slate-100 pt-3">
                        <div><p className="text-[10px] text-slate-400 uppercase">Equipo</p><p className="font-medium text-slate-800">{detail.assigned_team}</p></div>
                        <div><p className="text-[10px] text-slate-400 uppercase">Fecha de asignación</p><p className="font-medium text-slate-800">{fmt(detail.assigned_at)}</p></div>
                      </div>
                    </>
                  ) : (
                    <p className="text-slate-400 italic mb-3">Aún sin asignar</p>
                  )}

                  <div className="border-t border-slate-100 mt-4 pt-4">
                    <p className="text-[10px] text-slate-400 uppercase mb-2">Resolución</p>
                    {detail.resolved_at ? (
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div><p className="text-[10px] text-slate-400 uppercase">Resuelto</p><p className="font-medium text-slate-800">{fmt(detail.resolved_at)}</p></div>
                        <div><p className="text-[10px] text-slate-400 uppercase">Tipo</p><p className="font-medium text-slate-800 capitalize">{detail.resolution_type?.replace('_', ' ')}</p></div>
                      </div>
                    ) : canResolve && !showResolveForm ? (
                      <button
                        onClick={() => setShowResolveForm(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition"
                      >
                        <CheckCircle2 size={16} />
                        Marcar como resuelto
                      </button>
                    ) : canResolve && showResolveForm ? (
                      <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Tipo de resolución</label>
                          <select
                            value={resolutionType}
                            onChange={e => setResolutionType(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:border-emerald-500"
                          >
                            <option value="causa_raiz">Causa raíz</option>
                            <option value="workaround">Workaround</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Notas (opcional)</label>
                          <textarea
                            value={rcaText}
                            onChange={e => setRcaText(e.target.value)}
                            rows={3}
                            placeholder="Describe brevemente la solución aplicada"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:border-emerald-500 resize-none"
                          />
                        </div>
                        <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 cursor-pointer hover:border-emerald-400 transition">
                          <Paperclip size={14} />
                          {resolveFiles.length > 0 ? `${resolveFiles.length} archivo(s) seleccionado(s)` : 'Adjuntar evidencia de resolución (opcional)'}
                          <input type="file" multiple accept="image/*" className="hidden" onChange={e => setResolveFiles(Array.from(e.target.files ?? []))} />
                        </label>
                        {resolveError && <p className="text-xs text-red-600">{resolveError}</p>}
                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowResolveForm(false)}
                            className="flex-1 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={handleResolve}
                            disabled={submittingResolve}
                            className="flex-1 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition"
                          >
                            {submittingResolve ? 'Guardando...' : 'Confirmar resolución'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-slate-400 italic text-sm">Aún no se ha resuelto</p>
                    )}
                    {resolutionEvidence.length > 0 && (
                      <div className="flex gap-2 mt-3 flex-wrap">
                        {resolutionEvidence.map((a, i) => <AttachmentThumb key={a.id} a={a} index={i} label="Resolución" />)}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Columna derecha: SLA y bitacora -- mismo alto que la columna izquierda completa */}
              <div className="bg-white rounded-2xl border border-slate-300 shadow-md p-5 h-full flex flex-col">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">SLA y bitácora</p>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="border-2 border-amber-300 rounded-xl p-3">
                    <p className="text-[10px] font-bold uppercase text-amber-700">Respuesta</p>
                    <p className="text-sm font-bold text-slate-800 mt-1">{fmt(detail.sla_response_limit)}</p>
                  </div>
                  <div className="border-2 border-amber-300 rounded-xl p-3">
                    <p className="text-[10px] font-bold uppercase text-amber-700">Resolución</p>
                    <p className="text-sm font-bold text-slate-800 mt-1">{fmt(detail.sla_resolution_limit)}</p>
                  </div>
                </div>
                {detail.is_sla_breached && <p className="text-xs text-red-600 font-medium mb-3">⚠ SLA incumplido</p>}

                <div className="relative pl-5 flex-1">
                  <div className="absolute left-[5px] top-1 bottom-1 w-px bg-slate-200" />
                  {detail.activity_log.map((ev, i) => (
                    <div key={i} className="relative pb-3 last:pb-0">
                      <div className="absolute -left-5 top-0.5 w-3 h-3 rounded-full bg-white border-2 border-[#7c2d12]" />
                      <p className="text-[10px] font-mono text-slate-400">{fmt(ev.performed_at)}</p>
                      <p className="text-sm font-semibold text-slate-800">{ACTION_LABEL[ev.action] ?? ev.action}</p>
                      <p className="text-xs text-slate-500">{ev.performed_by_name} · {ev.performed_by_role}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showAssignModal && detail && (
        <AssignIncidentModal
          incidentId={detail.id}
          folio={detail.folio}
          onClose={() => setShowAssignModal(false)}
          onAssigned={() => { setShowAssignModal(false); fetchAll(); onChanged?.() }}
        />
      )}
    </>
  )
}
