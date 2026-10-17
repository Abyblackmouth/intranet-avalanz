'use client'

// VistaTramite: el detalle de un trámite con su riel real. La misma vista sirve en el modal
// de Bandeja/Seguimiento (modo privado, con JWT) y en la página pública de la liga del correo
// (modo liga: decide con el token). Tres columnas: datos, aprobación, historial.
import { useState } from 'react'
import { FileText, RefreshCw, UserCog, RotateCcw, ClipboardList, CheckSquare, History, Mail } from 'lucide-react'
import {
  TramiteDetalle, UsuarioIntranet, decidirTramite, decidirPorLiga, reenviarAviso, reasignarTramite, reprocesarTramite, buscarUsuariosFlujos,
} from '@/services/workflowsService'
import RielFlujo, { LeyendaRiel } from '@/components/app/workflows/RielFlujo'
import { Modal, BuscadorUsuario, inputCls, labelCls, btnPrimario, btnSecundario, btnPeligro, errMsg, fmtFecha } from '@/components/app/workflows/compartidos'

export const ESTADO_TRAMITE: Record<TramiteDetalle['status'], [string, string]> = {
  en_aprobacion: ['bg-blue-50 text-[#1a4fa0]', 'En aprobación'], aprobada: ['bg-emerald-50 text-emerald-700', 'Aprobada'], rechazada: ['bg-red-50 text-red-700', 'Rechazada'],
  sustituida: ['bg-slate-100 text-slate-500', 'Sustituida'], cancelada: ['bg-slate-100 text-slate-500', 'Cancelada'], error_configuracion: ['bg-amber-50 text-amber-700', 'Error de configuración'],
}
export const ESTADO_AFECTACION: Record<string, [string, string]> = {
  pendiente: ['bg-amber-50 text-amber-700', 'Plataforma: pendiente'], aplicada: ['bg-emerald-50 text-emerald-700', 'Plataforma: aplicada'], fallida: ['bg-red-50 text-red-700', 'Plataforma: sin respuesta'],
}
export function Chip({ par }: { par: [string, string] }) { return <span className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${par[0]}`}>{par[1]}</span> }
const ACCION: Record<string, string> = {
  recibido: 'recibido de la plataforma', grupo_resuelto: 'grupo de aprobación resuelto', en_turno: 'etapa en turno', aviso_enviado: 'aviso enviado',
  etapa_aprobada: 'etapa aprobada', rechazada: 'trámite rechazado', aprobada: 'trámite aprobado', resultado_encolado: 'resultado en cola hacia la plataforma',
  afectacion_aplicada: 'la plataforma aplicó el resultado', afectacion_fallida: 'la plataforma no respondió', afectacion_abandonada: 'envío abandonado',
  sustituida: 'sustituido por una modificación', error_configuracion: 'error de configuración', reenvio_ignorado: 'reenvío idéntico ignorado',
  reenvio_aviso: 'aviso reenviado', reasignada: 'aprobador reasignado', correo_decision: 'correo de decisión enviado', aviso_ti: 'aviso a TI', reenvio_manual: 'reenvío manual del resultado',
  aviso_pendiente_aplicar: 'aviso: aprobada pero sin aplicar',
}

export default function VistaTramite({ t, modo, token, onChange, onCerrado }: {
  t: TramiteDetalle; modo: 'privado' | 'liga'; token?: string; onChange: (t: TramiteDetalle) => void; onCerrado?: (msg: string) => void
}) {
  const [comentario, setComentario] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [reasignar, setReasignar] = useState(false)
  const [pestana, setPestana] = useState<'solicitud' | 'aprobacion' | 'historial' | 'correos'>('solicitud')
  const secc = t.secciones ?? { escalares: [], tablas: [] }
  const enTurno = t.vista === 'aprobador' ? (t.mi_etapa ?? null) : t.etapas.find(e => e.status === 'en_turno')
  const esAprobador = t.vista === 'aprobador'
  const esSolicitante = t.vista === 'solicitante'
  const puedoDecidir = modo === 'liga' ? t.liga?.estado === 'vigente' : t.puedo_decidir
  const comentarioObligatorio = true

  const decidir = async (aprobar: boolean) => {
    setError(null)
    if (!aprobar && comentarioObligatorio && !comentario.trim()) { setError('Escribe el motivo del rechazo'); return }
    setTrabajando(true)
    try {
      if (modo === 'liga' && token) {
        const r = await decidirPorLiga(token, { aprobar, comentario })
        onCerrado?.(r.data.mensaje)
      } else {
        const r = await decidirTramite(t.id, { aprobar, comentario }); onChange(r.data); setComentario('')
        setAviso(aprobar ? (r.data.status === 'aprobada' ? 'Aprobado. El resultado ya va en camino a la plataforma.' : 'Aprobado. Le toca al siguiente aprobador.') : 'Rechazado. La plataforma recibirá el resultado.')
      }
    } catch (e) { setError(errMsg(e, 'No se pudo registrar la decisión')) } finally { setTrabajando(false) }
  }
  const reenviar = async () => { setError(null); try { const r = await reenviarAviso(t.id); onChange(r.data); setAviso(`Aviso reenviado a ${enTurno?.aprobador_nombre ?? 'el aprobador'} con liga nueva.`) } catch (e) { setError(errMsg(e, 'No se pudo reenviar')) } }
  const reprocesar = async () => { setError(null); try { const r = await reprocesarTramite(t.id); onChange(r.data); setAviso('Reprocesado con la configuración vigente.') } catch (e) { setError(errMsg(e, 'No se pudo reprocesar')) } }


  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="font-mono text-[16px] font-semibold">{t.folio}</span>
        {t.resumen && !t.resumen.numero_es_folio && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[12px]">doc. {t.resumen.numero}</span>}
        <span className="text-[14px] text-slate-800">{t.flujo_nombre ?? t.process_id}</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[12px]">{t.company_name || t.origen_clave}</span>
        {t.grupo_nombre && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[12px]">grupo: {t.grupo_nombre}</span>}
        <Chip par={ESTADO_TRAMITE[t.status]} />{t.afectacion && <Chip par={ESTADO_AFECTACION[t.afectacion]} />}
      </div>
      {t.status === 'error_configuracion' && <div className="mb-3 rounded-xl border-l-4 border-red-500 bg-red-50 px-4 py-2.5 text-[13px] text-red-900">No hay grupo de aprobación para la empresa {t.origen_clave} en este flujo. Captúralo en Flujos y usa «Reprocesar».</div>}
      {t.afectacion === 'fallida' && <div className="mb-3 rounded-xl border-l-4 border-amber-500 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900">Decidido, pero la plataforma no ha confirmado. El resultado está en la cola y se reintenta solo; también se puede reenviar desde Seguimiento → Transacciones.</div>}
      {t.afectacion === 'aplicada' && t.mensaje_plataforma && <div className="mb-3 rounded-xl border-l-4 border-emerald-500 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-900">La plataforma respondió: «{t.mensaje_plataforma}»</div>}
      {t.liga && t.liga.estado !== 'vigente' && <div className="mb-3 rounded-xl border-l-4 border-slate-400 bg-slate-50 px-4 py-2.5 text-[13px] text-slate-700">{t.liga.mensaje}</div>}

      {!esAprobador && (
        <>
          <RielFlujo etapas={t.etapas} plataforma={{ titulo: `${t.conexion_titulo ?? 'Plataforma'} · ${t.result_service || '—'}`, estado: t.afectacion, detalle: t.afectacion === 'aplicada' ? 'Aplicada' : t.afectacion === 'fallida' ? 'Sin respuesta, reintentando' : t.afectacion === 'pendiente' ? 'Enviando resultado…' : 'Aplica el resultado' }} />
          <div className="mt-1 mb-4"><LeyendaRiel /></div>
        </>
      )}
      {esAprobador && enTurno && (
        <div className="mb-4 rounded-xl border-2 border-[#1a4fa0] bg-blue-50 px-4 py-3 text-[13px]"><b>Te toca decidir</b> · etapa {enTurno.orden} de {t.total_etapas} · {enTurno.nombre}{t.liga?.decido_como ? ` · decides como ${t.liga.decido_como}` : ''}</div>
      )}

      {!esAprobador && (
        <div className="flex items-center gap-1 border-b-2 border-slate-300 mb-4 overflow-x-auto">
          {([['solicitud', 'Solicitud', ClipboardList], ['aprobacion', enTurno && puedoDecidir ? 'Aprobación · me toca' : 'Aprobación', CheckSquare], ['historial', `Historial (${t.bitacora.length})`, History], ['correos', `Correos y plataforma (${t.correos.length + t.transacciones.length})`, Mail]] as [typeof pestana, string, typeof Mail][])
            .filter(([k]) => !(esSolicitante && k === 'correos'))
            .map(([k, l, Ic]) => (
              <button key={k} type="button" onClick={() => setPestana(k)} className={`flex shrink-0 items-center gap-2 whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 -mb-0.5 ${pestana === k ? 'border-[#1a4fa0] text-[#1a4fa0]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}><Ic size={14} /> {l}</button>
            ))}
        </div>
      )}
      <div className={`grid gap-5 ${esAprobador ? 'lg:grid-cols-[1.3fr_1fr]' : ''}`}>
        <section className={!esAprobador && pestana !== 'solicitud' ? 'hidden' : ''}>
          <h4 className="text-[12px] font-semibold text-slate-500 mb-2">Datos (como los mandó la plataforma)</h4>
          {t.resumen && t.resumen.campos.length > 0 && (
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {t.resumen.campos.map(c => <div key={c.clave} className="rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5"><p className="text-[11px] text-slate-500">{c.etiqueta}</p><p className="text-[13px] font-semibold truncate tabular-nums" title={c.valor}>{c.valor}</p></div>)}
            </div>
          )}
          <div className={!esAprobador ? 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]' : ''}><div>
          <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1 text-[13px]">
            <dt className="text-slate-500">Solicitante</dt><dd>{t.requester.name}{t.requester.id && <span className="text-slate-400"> · id {t.requester.id}</span>}{!t.requester.user_id && <span className="ml-1 rounded bg-amber-50 px-1 text-[11px] text-amber-700">sin ligar</span>}</dd>
            {secc.escalares.map(e => <div key={e.clave} className="contents"><dt className="text-slate-500 truncate" title={e.clave}>{e.etiqueta}</dt><dd className="break-words">{e.valor || <span className="text-slate-400">—</span>}</dd></div>)}
            {!esAprobador && <><dt className="text-slate-500">Origen</dt><dd>grupo {t.company_group} · tenant {t.tenant_id}</dd><dt className="text-slate-500">Clave externa</dt><dd className="font-mono text-[12px]">{t.external_key}</dd></>}
          </dl>
          </div><div>
          {secc.tablas.map(tb => (
            <div key={tb.clave} className="mt-3 overflow-x-auto">
              <p className="text-[12px] font-semibold text-slate-600 mb-1">{tb.titulo} <span className="font-normal text-slate-400">({tb.filas.length})</span></p>
              <table className="w-full text-[12px]">
                <thead><tr className="text-left text-slate-500">{tb.columnas.map(c => <th key={c} className="py-1 pr-2 font-medium whitespace-nowrap">{c}</th>)}</tr></thead>
                <tbody>{tb.filas.map((fila, i) => <tr key={i} className="border-t border-slate-200">{tb.columnas.map(c => <td key={c} className="py-1 pr-2">{fila[c] ?? ''}</td>)}</tr>)}</tbody>
              </table>
            </div>
          ))}
          <h4 className="mt-4 text-[12px] font-semibold text-slate-500 mb-1">Archivos</h4>
          {t.archivos.length ? t.archivos.map(a => (
            <div key={a.id} className="flex items-center gap-2 py-1 text-[13px]"><FileText size={14} className="text-slate-400" /><span>{a.nombre}</span><span className="text-[11px] text-slate-400">{a.tipo}</span>
              {a.url && <a href={a.url} target="_blank" rel="noreferrer" className="ml-auto text-[12.5px] text-[#1a4fa0] hover:underline">Descargar</a>}</div>
          )) : <p className="text-[13px] text-slate-400">Sin archivos</p>}
          </div></div>
        </section>

        <section className={!esAprobador && pestana !== 'aprobacion' ? 'hidden' : ''}>
          <h4 className="text-[12px] font-semibold text-slate-500 mb-2">Aprobación</h4>
          {enTurno ? (
            <dl className="grid grid-cols-[90px_1fr] gap-x-3 gap-y-1 text-[13px]">
              <dt className="text-slate-500">Etapa</dt><dd>{enTurno.orden} de {t.total_etapas} · {enTurno.nombre}</dd>
              {!esAprobador && <><dt className="text-slate-500">Aprobador</dt><dd>{enTurno.aprobador_nombre}{enTurno.suplente_nombre && <span className="text-slate-400"> (suplente: {enTurno.suplente_nombre})</span>}</dd></>}
              <dt className="text-slate-500">Desde</dt><dd>{fmtFecha(enTurno.en_turno_desde)}</dd>
            </dl>
          ) : <p className="text-[13px] text-slate-500">{t.status === 'en_aprobacion' ? (esAprobador ? 'Ya no te toca decidir en este trámite.' : 'Sin etapa en turno.') : 'Este trámite ya está cerrado.'}</p>}
          {puedoDecidir && enTurno && (
            <div className="mt-3">
              {modo === 'liga' && t.liga && <p className="mb-2 text-[12px] text-slate-500">Decides como <b>{t.liga.decido_como}</b>. Queda registrado con fecha, hora e IP.</p>}
              <label className={labelCls}>Comentario (obligatorio si rechazas)</label>
              <textarea rows={3} className={`${inputCls} w-full`} value={comentario} onChange={e => setComentario(e.target.value)} placeholder="Por qué apruebas o rechazas" />
              <div className="mt-2 flex gap-2">
                <button type="button" className={btnPrimario} onClick={() => decidir(true)} disabled={trabajando}>Aprobar</button>
                <button type="button" className={btnPeligro} onClick={() => decidir(false)} disabled={trabajando}>Rechazar</button>
              </div>
            </div>
          )}
          {!puedoDecidir && enTurno && modo === 'privado' && !esAprobador && <p className="mt-2 text-[12.5px] text-slate-400">Solo {enTurno.aprobador_nombre}{enTurno.suplente_nombre ? ` o ${enTurno.suplente_nombre}` : ''} puede decidir esta etapa.</p>}
          {modo === 'privado' && (t.puedo_administrar || t.soy_solicitante) && enTurno && (
            <div className="mt-4 pt-3 border-t border-slate-200 flex flex-wrap gap-2">
              <button type="button" className={btnSecundario} onClick={reenviar}><RefreshCw size={13} /> Reenviar aviso</button>
              {t.puedo_administrar && <button type="button" className={btnSecundario} onClick={() => setReasignar(true)}><UserCog size={13} /> Reasignar aprobador</button>}
            </div>
          )}
          {modo === 'privado' && t.puedo_administrar && t.status === 'error_configuracion' && (
            <div className="mt-4 pt-3 border-t border-slate-200"><button type="button" className={btnSecundario} onClick={reprocesar}><RotateCcw size={13} /> Reprocesar</button></div>
          )}
          {aviso && <p className="mt-3 text-[13px] text-emerald-700">{aviso}</p>}
          {error && <p className="mt-3 text-[13px] text-red-600">{error}</p>}
        </section>

        {!esAprobador && <section className={pestana !== 'historial' ? 'hidden' : ''}>
          <h4 className="text-[12px] font-semibold text-slate-500 mb-2">Historial</h4>
          <ul className="max-h-[28rem] overflow-y-auto divide-y divide-slate-200">
            {t.bitacora.map((b, i) => (
              <li key={i} className="py-1.5 text-[13px]">{ACCION[b.accion] ?? b.accion}{b.detail && typeof b.detail.etapa === 'number' ? ` · etapa ${b.detail.etapa}${typeof b.detail.nombre === 'string' ? ' · ' + b.detail.nombre : ''}` : ''}
                <span className="block text-[11.5px] text-slate-500">{fmtFecha(b.fecha)}{b.por ? ` · ${b.por}` : ''}{b.detail && typeof b.detail.comentario === 'string' && b.detail.comentario ? ` · «${b.detail.comentario}»` : ''}{b.detail && typeof b.detail.nota === 'string' ? ` · ${b.detail.nota}` : ''}</span>
              </li>
            ))}
          </ul>
        </section>}
        {!esAprobador && !esSolicitante && <section className={pestana !== 'correos' ? 'hidden' : ''}>
          {modo === 'privado' && (
            <>
              <h4 className="text-[12px] font-semibold text-slate-500 mb-1">Correos ({t.correos.length})</h4>
              <ul className="divide-y divide-slate-200">
                {t.correos.map(c => <li key={c.id} className="py-1.5 text-[13px]">{c.plantilla} → {c.para}{c.reenvio && <span className="ml-1 rounded bg-slate-100 px-1 text-[11px]">reenvío</span>}<span className="block text-[11.5px] text-slate-500">{fmtFecha(c.fecha)} · {c.resultado}</span></li>)}
                {t.correos.length === 0 && <li className="py-1.5 text-[13px] text-slate-400">Ninguno</li>}
              </ul>
              <h4 className="mt-4 text-[12px] font-semibold text-slate-500 mb-1">Transacciones con la plataforma ({t.transacciones.length})</h4>
              <ul className="divide-y divide-slate-200">
                {t.transacciones.map(x => <li key={x.id} className="py-1.5 text-[13px]">{x.direccion === 'entrada' ? 'Plataforma → Intranet' : 'Intranet → Plataforma'} · <b>{x.estado.replace('_', ' ')}</b>{x.intento > 1 ? ` · ${x.intento} intentos` : ''}<span className="block text-[11.5px] text-slate-500">{fmtFecha(x.created_at)}{x.error ? ` · ${x.error}` : x.respuesta_status ? ` · HTTP ${x.respuesta_status}` : ''}</span></li>)}
              </ul>
            </>
          )}
        </section>}
      </div>
      {reasignar && <ModalReasignar t={t} onClose={() => setReasignar(false)} onDone={d => { onChange(d); setReasignar(false); setAviso('Aprobador reasignado y avisado.') }} />}
    </div>
  )
}

function ModalReasignar({ t, onClose, onDone }: { t: TramiteDetalle; onClose: () => void; onDone: (t: TramiteDetalle) => void }) {
  const [u, setU] = useState<UsuarioIntranet | null>(null)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const ok = async () => {
    if (!u) return
    try { const r = await reasignarTramite(t.id, { user_id: u.id, nombre: u.name, email: u.email, motivo: motivo.trim() }); onDone(r.data) } catch (e) { setError(errMsg(e, 'No se pudo reasignar')) }
  }
  return (
    <Modal titulo="Reasignar aprobador de la etapa en turno" onClose={onClose}>
      <label className={labelCls}>Nuevo aprobador</label>
      <BuscadorUsuario valor={u} onElegir={setU} buscar={buscarUsuariosFlujos} />
      <label className={`${labelCls} mt-3`}>Motivo</label>
      <input className={`${inputCls} w-full`} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej. vacaciones" />
      {error && <p className="mt-3 text-[13px] text-red-600">{error}</p>}
      <div className="mt-5 flex justify-end gap-2"><button type="button" className={btnSecundario} onClick={onClose}>Cancelar</button><button type="button" className={btnPrimario} onClick={ok} disabled={!u || !motivo.trim()}>Reasignar</button></div>
    </Modal>
  )
}
