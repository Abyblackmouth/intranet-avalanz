'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import PageWrapper from '@/components/layout/PageWrapper'
import { getIncidentDetail, getSystems, getSeverities } from '@/services/itServiceDeskService'
import { ArrowLeft, Paperclip } from 'lucide-react'

const STATUS_LABEL: Record<string, string> = {
  en_backlog: 'En backlog', asignado: 'Asignado', en_atencion: 'En atención',
  escalado: 'Escalado', resuelto: 'Resuelto', cerrado: 'Cerrado',
}
const STATUS_CLASS: Record<string, string> = {
  en_backlog: 'bg-slate-500/[0.12] text-slate-600',
  asignado: 'bg-blue-500/[0.12] text-blue-700',
  en_atencion: 'bg-[#7c2d12]/[0.10] text-[#7c2d12]',
  escalado: 'bg-red-500/[0.12] text-red-700',
  resuelto: 'bg-emerald-500/[0.14] text-emerald-700',
  cerrado: 'bg-slate-500/[0.14] text-slate-600',
}
const SEV_CLASS: Record<string, string> = {
  S1: 'bg-red-500/[0.10] text-red-700 border border-red-500/25',
  S2: 'bg-orange-500/[0.12] text-orange-700 border border-orange-500/25',
  S3: 'bg-amber-500/[0.12] text-amber-700 border border-amber-500/25',
  S4: 'bg-emerald-500/[0.12] text-emerald-700 border border-emerald-500/25',
}

interface Detail {
  id: string; folio: string; title: string; description: string; status: string
  system_id: string; module_id: string | null; reported_type: string | null
  severity_reported_id: string; severity_validated_id: string | null
  requester_name: string; requester_phone: string | null; requester_puesto: string | null
  requester_area: string | null; requester_company_name: string
  assigned_team: string | null; assigned_to_user_id: string | null; assigned_at: string | null
  sla_response_limit: string | null; sla_resolution_limit: string | null; is_sla_breached: boolean
  resolved_at: string | null; resolution_type: string | null; closed_at: string | null
  created_at: string
  attachments: { id: string; attachment_type: string; object_key: string; bucket: string; mime_type: string }[]
  activity_log: { action: string; performed_by_name: string; performed_by_role: string; performed_at: string; detail: any }[]
}

const ACTION_LABEL: Record<string, string> = {
  ticket_creado: 'Ticket creado',
  motor_asigno: 'Asignado automáticamente',
  motor_sin_especialista: 'Sin especialista disponible',
  asignacion_manual: 'Asignado manualmente',
  reasignacion_manual: 'Reasignado',
  ticket_resuelto_via_token: 'Resuelto (vía enlace de correo)',
}

function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function IncidentDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuthStore()
  const [detail, setDetail] = useState<Detail | null>(null)
  const [systems, setSystems] = useState<{ id: string; name: string }[]>([])
  const [severities, setSeverities] = useState<{ id: string; code: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [detRes, sysRes, sevRes] = await Promise.all([
        getIncidentDetail(params.id as string), getSystems(), getSeverities(),
      ])
      setDetail(detRes.data)
      setSystems(sysRes.data?.data ?? [])
      setSeverities(sevRes.data?.data ?? [])
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo cargar el ticket')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => { fetchAll() }, [fetchAll])

  const roles: string[] = user?.roles ?? []
  const isIncidentManager = roles.includes('it-service-desk:incident-manager') || roles.includes('super_admin')

  const systemName = (id: string) => systems.find(s => s.id === id)?.name ?? '—'
  const sevInfo = (id: string | null) => id ? severities.find(s => s.id === id) : null

  if (loading) {
    return (
      <PageWrapper title="Cargando..." description="" actions={null}>
        <div className="flex items-center justify-center py-32 text-slate-400 text-sm">Cargando ticket...</div>
      </PageWrapper>
    )
  }

  if (error || !detail) {
    return (
      <PageWrapper title="Ticket" description="" actions={null}>
        <div className="flex flex-col items-center justify-center py-32 gap-3">
          <p className="text-sm text-red-600">{error ?? 'Ticket no encontrado'}</p>
          <button onClick={() => router.push('/app/it-service-desk/mesa-de-soporte')} className="text-sm text-[#1a4fa0] hover:underline">
            Volver a la tabla
          </button>
        </div>
      </PageWrapper>
    )
  }

  const proposedSev = sevInfo(detail.severity_reported_id)
  const validatedSev = sevInfo(detail.severity_validated_id)

  return (
    <PageWrapper title={detail.folio} description={detail.title} actions={null}>
      <button
        onClick={() => router.push('/app/it-service-desk/mesa-de-soporte')}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 mb-4 transition"
      >
        <ArrowLeft size={14} /> Volver a la tabla
      </button>

      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-500/[0.14] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_24px_-10px_rgba(15,23,42,0.14)] p-6">
        <div className="flex items-start justify-between gap-2 mb-6">
          <div>
            <p className="text-xs font-mono text-slate-400">{detail.folio}</p>
            <h1 className="text-lg font-semibold text-slate-800 mt-0.5">{detail.title}</h1>
          </div>
          <div className="flex gap-2 shrink-0">
            {(validatedSev ?? proposedSev) && (
              <span className={`px-2 py-1 rounded-md text-xs font-semibold ${SEV_CLASS[(validatedSev ?? proposedSev)!.code] ?? ''}`}>
                {(validatedSev ?? proposedSev)!.code}
              </span>
            )}
            <span className={`px-2 py-1 rounded-md text-xs font-medium ${STATUS_CLASS[detail.status] ?? ''}`}>
              {STATUS_LABEL[detail.status] ?? detail.status}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="flex flex-col gap-5">
            <section>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Solicitante</p>
              <div className="bg-white/50 rounded-xl border border-slate-500/10 p-4 grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-[10px] text-slate-400 uppercase">Nombre</p><p className="font-medium text-slate-800">{detail.requester_name}</p></div>
                <div><p className="text-[10px] text-slate-400 uppercase">Teléfono</p><p className="font-medium text-slate-800">{detail.requester_phone ?? '—'}</p></div>
                <div><p className="text-[10px] text-slate-400 uppercase">Puesto</p><p className="font-medium text-slate-800">{detail.requester_puesto ?? '—'}</p></div>
                <div><p className="text-[10px] text-slate-400 uppercase">Departamento</p><p className="font-medium text-slate-800">{detail.requester_area ?? '—'}</p></div>
                <div><p className="text-[10px] text-slate-400 uppercase">Empresa</p><p className="font-medium text-slate-800">{detail.requester_company_name}</p></div>
                <div><p className="text-[10px] text-slate-400 uppercase">Fecha de creación</p><p className="font-medium text-slate-800">{fmt(detail.created_at)}</p></div>
              </div>
            </section>

            <section>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Detalle del ticket</p>
              <div className="bg-white/50 rounded-xl border border-slate-500/10 p-4">
                <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                  <div><p className="text-[10px] text-slate-400 uppercase">Sistema</p><p className="font-medium text-slate-800">{systemName(detail.system_id)}</p></div>
                  <div><p className="text-[10px] text-slate-400 uppercase">Tipo</p><p className="font-medium text-slate-800 capitalize">{detail.reported_type ?? '—'}</p></div>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">{detail.description}</p>
                {detail.attachments.length > 0 && (
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {detail.attachments.map(a => (
                      <div key={a.id} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-500/[0.06] rounded-lg text-xs text-slate-600">
                        <Paperclip size={12} /> {a.attachment_type === 'evidencia_reporte' ? 'Evidencia' : 'Evidencia de resolución'}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Asignación</p>
              <div className="bg-white/50 rounded-xl border border-slate-500/10 p-4 text-sm">
                {detail.assigned_to_user_id ? (
                  <>
                    <p className="text-[10px] text-slate-400 uppercase">Equipo</p>
                    <p className="font-medium text-slate-800 mb-2">{detail.assigned_team}</p>
                    <p className="text-[10px] text-slate-400 uppercase">Fecha de asignación</p>
                    <p className="font-medium text-slate-800">{fmt(detail.assigned_at)}</p>
                  </>
                ) : (
                  <p className="text-slate-400 italic">Aún sin asignar</p>
                )}
              </div>
            </section>
          </div>

          <div className="flex flex-col gap-5">
            <section>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">SLA</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-amber-500/[0.08] border border-amber-500/20 rounded-xl p-3">
                  <p className="text-[10px] font-bold uppercase text-amber-700">Respuesta</p>
                  <p className="text-sm font-bold text-slate-800 mt-1">{fmt(detail.sla_response_limit)}</p>
                </div>
                <div className="bg-amber-500/[0.08] border border-amber-500/20 rounded-xl p-3">
                  <p className="text-[10px] font-bold uppercase text-amber-700">Resolución</p>
                  <p className="text-sm font-bold text-slate-800 mt-1">{fmt(detail.sla_resolution_limit)}</p>
                </div>
              </div>
              {detail.is_sla_breached && (
                <p className="text-xs text-red-600 font-medium mt-2">⚠ SLA incumplido</p>
              )}
            </section>

            <section>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Bitácora del ticket</p>
              <div className="bg-white/50 rounded-xl border border-slate-500/10 p-4">
                <div className="relative pl-5">
                  <div className="absolute left-[5px] top-1 bottom-1 w-px bg-slate-500/20" />
                  {detail.activity_log.map((ev, i) => (
                    <div key={i} className="relative pb-4 last:pb-0">
                      <div className="absolute -left-5 top-0.5 w-3 h-3 rounded-full bg-white border-2 border-[#7c2d12]" />
                      <p className="text-[10px] font-mono text-slate-400">{fmt(ev.performed_at)}</p>
                      <p className="text-sm font-semibold text-slate-800">{ACTION_LABEL[ev.action] ?? ev.action}</p>
                      <p className="text-xs text-slate-500">{ev.performed_by_name} · {ev.performed_by_role}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Resolución</p>
              <div className="bg-white/50 rounded-xl border border-slate-500/10 p-4 text-sm">
                {detail.resolved_at ? (
                  <>
                    <p className="text-[10px] text-slate-400 uppercase">Fecha</p>
                    <p className="font-medium text-slate-800 mb-2">{fmt(detail.resolved_at)}</p>
                    <p className="text-[10px] text-slate-400 uppercase">Tipo</p>
                    <p className="font-medium text-slate-800 capitalize">{detail.resolution_type?.replace('_', ' ')}</p>
                  </>
                ) : (
                  <p className="text-slate-400 italic">Aún no se ha marcado como resuelto</p>
                )}
              </div>
            </section>
          </div>
        </div>

        {!isIncidentManager && (
          <div className="mt-6 p-3 bg-slate-500/[0.06] border border-dashed border-slate-500/20 rounded-xl text-xs text-slate-500 italic">
            Como solicitante, ves el estatus y la evidencia. Las acciones de asignación son exclusivas de Incident Manager.
          </div>
        )}
      </div>
    </PageWrapper>
  )
}
