'use client'

// Resumen por secciones de una solicitud de acceso, para el panel del ticket.
import { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import { accGenerarPdfSolicitud, accResumenSolicitud, accAprobar, accRechazar } from '@/services/itServiceDeskService'
import { useAuthStore } from '@/store/authStore'

interface Resumen {
  movimiento: 'alta' | 'modificacion'
  tipo: { motivo: string; auditoria: boolean; usuario_modelo: string; reemplaza_a: string }
  familias: { id: string; nombre: string; empresas: string[] }[]
  modulos: { nombre: string; exclusivo_admin: boolean; perfil: string; rutinas: string[] }[]
  vigencia: string; observaciones: string; jefe: { nombre?: string; correo?: string }; tiene_pdf: boolean
  estado_firma?: string | null
  revision?: { aprobada_por?: string; aprobada_en?: string; rechazada_por?: string; rechazada_en?: string; motivo?: string;
               jefe_admin?: { nombre: string; correo: string } | null } | null
}

const Etiqueta = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 mb-1">{children}</p>
)

export default function AccResumenSolicitud({ incidentId, fallback, estado, asignadoId, onCambio }: {
  incidentId: string; fallback: string; estado?: string; asignadoId?: string | null; onCambio?: () => void
}) {
  const [r, setR] = useState<Resumen | null>(null)
  const [error, setError] = useState(false)
  const [accion, setAccion] = useState<'' | 'aprobar' | 'rechazar'>('')
  const [conAdmin, setConAdmin] = useState(false)
  const [adminNombre, setAdminNombre] = useState('')
  const [adminCorreo, setAdminCorreo] = useState('')
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [errorRev, setErrorRev] = useState<string | null>(null)
  const yo: any = (useAuthStore.getState() as any).user ?? {}
  const misRoles: string[] = yo.roles ?? []
  const puedeRevisar = misRoles.includes('it-service-desk:incident-manager') || misRoles.includes('super_admin')
    || (!!asignadoId && String(asignadoId) === String(yo.user_id ?? yo.id ?? ''))
  const recargar = () => accResumenSolicitud(incidentId).then(x => setR(x.data)).catch(() => {})
  const enviarRevision = async () => {
    setEnviando(true); setErrorRev(null)
    try {
      if (accion === 'aprobar') await accAprobar(incidentId, conAdmin ? { jefe_admin_nombre: adminNombre.trim(), jefe_admin_correo: adminCorreo.trim() } : { jefe_admin_nombre: '', jefe_admin_correo: '' })
      else await accRechazar(incidentId, motivo.trim())
      setAccion(''); await recargar(); onCambio?.()
    } catch (e: any) { const d = e?.response?.data?.detail; setErrorRev(typeof d === 'string' ? d : 'No se pudo completar la revisión') }
    finally { setEnviando(false) }
  }
  const fechaCorta = (iso?: string) => iso ? new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Monterrey', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
  const [pdf, setPdf] = useState<'' | 'generando' | 'listo' | string>('')
  useEffect(() => { accResumenSolicitud(incidentId).then(x => setR(x.data)).catch(() => setError(true)) }, [incidentId])

  if (error) return <p className="text-sm text-slate-700 leading-relaxed border border-slate-200 rounded-lg p-3 whitespace-pre-line">{fallback}</p>
  if (!r) return <div className="border border-slate-200 rounded-lg p-6 flex justify-center"><div className="w-5 h-5 border-2 border-slate-300 border-t-[#1a4fa0] rounded-full animate-spin" /></div>

  return (
    <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 text-[13px]">
      {!r.tiene_pdf && (
        <div className="p-3 flex flex-wrap items-center gap-2 bg-amber-50/70">
          <p className="flex-1 text-[12.5px] text-amber-900">
            {pdf === 'listo' ? 'PDF adjuntado. Cierra y vuelve a abrir el ticket para verlo en las evidencias.'
              : pdf && pdf !== 'generando' ? pdf : 'Esta solicitud no tiene su PDF adjunto.'}
          </p>
          {pdf !== 'listo' && (
            <button type="button" disabled={pdf === 'generando'}
              onClick={() => { setPdf('generando'); accGenerarPdfSolicitud(incidentId).then(() => setPdf('listo')).catch(e => setPdf(e?.response?.data?.detail ?? 'No se pudo generar el PDF')) }}
              className="px-3 py-1.5 rounded-lg text-[12.5px] font-medium text-white bg-[#1a4fa0] hover:bg-blue-700 disabled:opacity-60">
              {pdf === 'generando' ? 'Generando…' : 'Generar y adjuntar PDF'}
            </button>
          )}
        </div>
      )}
      <div className="p-3 flex flex-wrap items-center gap-1.5">
        <span className={`px-2 py-0.5 rounded-full text-[11.5px] font-semibold ${r.movimiento === 'modificacion' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
          {r.movimiento === 'modificacion' ? 'Modificación' : 'Alta'}
        </span>
        <span className="px-2 py-0.5 rounded-full text-[11.5px] font-medium bg-slate-100 text-slate-700">{r.tipo.motivo}</span>
        {r.tipo.auditoria && <span className="px-2 py-0.5 rounded-full text-[11.5px] font-medium bg-blue-50 text-[#1a4fa0]">Auditoría (visor)</span>}
        {r.tipo.reemplaza_a && <span className="text-[12px] text-slate-600">· Reemplaza a <b className="text-slate-800">{r.tipo.reemplaza_a}</b></span>}
        {r.tipo.usuario_modelo && <span className="text-[12px] text-slate-600">· Usuario modelo <b className="text-slate-800">{r.tipo.usuario_modelo}</b></span>}
      </div>

      <div className="p-3">
        <Etiqueta>Empresas · {r.familias.reduce((n, f) => n + f.empresas.length, 0)}</Etiqueta>
        <div className="grid gap-1.5">
          {r.familias.map(f => (
            <div key={f.id} className="flex gap-2">
              <span className="w-24 shrink-0 text-[11.5px] font-bold text-slate-500 pt-0.5">{f.nombre}</span>
              <div className="flex flex-wrap gap-1">
                {f.empresas.map(e => <span key={e} className="px-1.5 py-0.5 rounded bg-slate-100 text-[12px] text-slate-700">{e}</span>)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="p-3">
        <Etiqueta>Módulos · {r.modulos.length}</Etiqueta>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead><tr className="text-left text-[10.5px] uppercase tracking-wide text-slate-400"><th className="pb-1 pr-3 font-semibold">Módulo</th><th className="pb-1 pr-3 font-semibold">Perfil</th><th className="pb-1 font-semibold">Rutinas o menús</th></tr></thead>
            <tbody>
              {r.modulos.map(m => (
                <tr key={m.nombre} className="border-t border-slate-100 align-top">
                  <td className="py-1.5 pr-3 font-semibold text-slate-800 whitespace-nowrap">{m.exclusivo_admin && <Lock size={11} className="inline -mt-0.5 mr-1 text-amber-600" />}{m.nombre}</td>
                  <td className="py-1.5 pr-3 text-slate-700 whitespace-nowrap">{m.perfil}</td>
                  <td className="py-1.5"><div className="flex flex-wrap gap-1">{m.rutinas.map(x => <span key={x} className="px-1.5 py-0.5 rounded bg-blue-50 text-[#1a4fa0] text-[12px]">{x}</span>)}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="p-3 grid sm:grid-cols-2 gap-3">
        <div><Etiqueta>Vigencia</Etiqueta><p className="text-slate-800 font-medium">{r.vigencia}</p></div>
        <div><Etiqueta>Jefe directo</Etiqueta><p className="text-slate-800 font-medium break-words">{r.jefe.nombre || '—'}</p><p className="text-[12px] text-slate-500 break-words">{r.jefe.correo}</p></div>
        {r.observaciones && <div className="sm:col-span-2"><Etiqueta>Observaciones</Etiqueta><p className="text-slate-700">{r.observaciones}</p></div>}
      </div>
      <div className="p-3">
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Revisión de TI</p>
        {estado === 'en_revision' && !puedeRevisar && <p className="text-[13px] text-slate-600">En revisión por TI.</p>}
        {estado === 'en_revision' && puedeRevisar && !accion && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { setAccion('aprobar'); setErrorRev(null) }}
              className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700">Aprobar y enviar a firma</button>
            <button type="button" onClick={() => { setAccion('rechazar'); setErrorRev(null) }}
              className="px-4 py-2 rounded-lg text-[13px] font-semibold text-red-700 border border-red-300 hover:bg-red-50">Rechazar</button>
          </div>
        )}
        {estado === 'en_revision' && accion === 'aprobar' && (
          <div className="grid gap-2.5 border border-emerald-200 bg-emerald-50/40 rounded-lg p-3">
            <label className="flex items-center gap-2 text-[13px] text-slate-700 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-[#1a4fa0]" checked={conAdmin} onChange={e => setConAdmin(e.target.checked)} />
              Lleva firma del jefe administrativo
            </label>
            {conAdmin && (
              <div className="grid sm:grid-cols-2 gap-2">
                <input value={adminNombre} onChange={e => setAdminNombre(e.target.value)} placeholder="Nombre del jefe administrativo" aria-label="Nombre del jefe administrativo"
                  className="h-9 px-3 border border-slate-300 rounded-lg text-sm bg-white outline-none focus:border-[#1a4fa0]" />
                <input value={adminCorreo} onChange={e => setAdminCorreo(e.target.value)} type="email" placeholder="correo@avalanz.com" aria-label="Correo del jefe administrativo"
                  className="h-9 px-3 border border-slate-300 rounded-lg text-sm bg-white outline-none focus:border-[#1a4fa0]" />
              </div>
            )}
            <p className="text-[12px] text-slate-600">Orden de firma en DocuSign: <b>Usuario → Jefe directo{conAdmin ? ' → Jefe administrativo' : ''} → TI</b>. TI captura el usuario asignado al firmar.</p>
            {errorRev && <p role="alert" className="text-[12.5px] text-red-600">{errorRev}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" disabled={enviando} onClick={() => setAccion('')} className="px-3 py-1.5 text-[13px] text-slate-600 border border-slate-300 rounded-lg bg-white">Cancelar</button>
              <button type="button" disabled={enviando || (conAdmin && (!adminNombre.trim() || !adminCorreo.includes('@')))} onClick={enviarRevision}
                className="px-4 py-1.5 text-[13px] font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50">{enviando ? 'Enviando a DocuSign…' : 'Confirmar y enviar'}</button>
            </div>
          </div>
        )}
        {estado === 'en_revision' && accion === 'rechazar' && (
          <div className="grid gap-2.5 border border-red-200 bg-red-50/40 rounded-lg p-3">
            <textarea rows={3} value={motivo} onChange={e => setMotivo(e.target.value)} aria-label="Motivo del rechazo"
              placeholder="Ej. El perfil Aprobador no corresponde al puesto; solicita el perfil Comprador"
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white outline-none focus:border-[#1a4fa0] resize-none" />
            {errorRev && <p role="alert" className="text-[12.5px] text-red-600">{errorRev}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" disabled={enviando} onClick={() => setAccion('')} className="px-3 py-1.5 text-[13px] text-slate-600 border border-slate-300 rounded-lg bg-white">Cancelar</button>
              <button type="button" disabled={enviando || motivo.trim().length < 5} onClick={enviarRevision}
                className="px-4 py-1.5 text-[13px] font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50">{enviando ? 'Rechazando…' : 'Rechazar solicitud'}</button>
            </div>
          </div>
        )}
        {estado === 'en_firma' && (
          <p className="text-[13px] text-slate-700">
            Aprobada{r.revision?.aprobada_por ? ` por ${r.revision.aprobada_por}` : ''}{r.revision?.aprobada_en ? ` el ${fechaCorta(r.revision.aprobada_en)}` : ''}. En firma en DocuSign:{' '}
            <b>Usuario → Jefe directo{r.revision?.jefe_admin ? ` → ${r.revision.jefe_admin.nombre} (jefe administrativo)` : ''} → TI</b>.
          </p>
        )}
        {estado === 'rechazado' && (
          <p className="text-[13px] text-red-700">
            Rechazada{r.revision?.rechazada_por ? ` por ${r.revision.rechazada_por}` : ''}{r.revision?.rechazada_en ? ` el ${fechaCorta(r.revision.rechazada_en)}` : ''}. Motivo: {r.revision?.motivo ?? '—'}
          </p>
        )}
        {estado === 'terminado' && <p className="text-[13px] text-emerald-700">Firmada por todos. Acceso registrado.</p>}
      </div>
    </div>
  )
}
