'use client'

// Workflows → Seguimiento: todos los trámites (según scope) y las transacciones con las plataformas.
import { useCallback, useEffect, useState } from 'react'
import { Search, RefreshCw, Code } from 'lucide-react'
import { Tramite, Transaccion, Flujo, getTramites, getTransacciones, getTransaccion, reenviarTransaccion, getFlujos } from '@/services/workflowsService'
import { useAuthStore } from '@/store/authStore'
import { Modal, inputCls, errMsg, fmtFecha, btnSecundario } from '@/components/app/workflows/compartidos'
import TablaTramites from '@/components/app/workflows/TablaTramites'
import ModalTramite from '@/components/app/workflows/ModalTramite'

type Tab = 'tramites' | 'transacciones'
const ESTADOS: [string, string][] = [['', 'Todos'], ['en_aprobacion', 'En aprobación'], ['aprobada', 'Aprobadas'], ['rechazada', 'Rechazadas'], ['error_configuracion', 'Error de configuración'], ['sustituida', 'Sustituidas']]
const ESTADO_TX: Record<string, string> = { recibido: 'bg-emerald-50 text-emerald-700', pendiente_envio: 'bg-amber-50 text-amber-700', enviado: 'bg-emerald-50 text-emerald-700', error: 'bg-amber-50 text-amber-700', abandonado: 'bg-red-50 text-red-700' }

export default function SeguimientoPage() {
  const { user, isSuperAdmin } = useAuthStore()
  const roles = user?.roles ?? []
  const veTransacciones = isSuperAdmin() || roles.some(r => ['workflows:administrador', 'workflows:auditoria', 'workflows:disenador'].includes(r))
  const esAdmin = isSuperAdmin() || roles.includes('workflows:administrador')
  const [tab, setTab] = useState<Tab>('tramites')
  const [status, setStatus] = useState('')
  const [flujoId, setFlujoId] = useState('')
  const [q, setQ] = useState('')
  const [flujos, setFlujos] = useState<Flujo[]>([])
  const [lista, setLista] = useState<Tramite[]>([])
  const [txs, setTxs] = useState<Transaccion[]>([])
  const [estadoTx, setEstadoTx] = useState('')
  const [cargando, setCargando] = useState(true)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [verTx, setVerTx] = useState<Transaccion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true); setError(null)
    try {
      if (tab === 'tramites') { const r = await getTramites({ status: status || undefined, flujo_id: flujoId || undefined, q }); setLista(r.data ?? []) }
      else { const r = await getTransacciones({ estado: estadoTx || undefined }); setTxs(r.data ?? []) }
    } catch (e) { setError(errMsg(e, 'No se pudo cargar')) } finally { setCargando(false) }
  }, [tab, status, flujoId, q, estadoTx])
  useEffect(() => { const t = setTimeout(cargar, 150); return () => clearTimeout(t) }, [cargar])
  useEffect(() => { if (veTransacciones) getFlujos().then(r => setFlujos(r.data ?? [])).catch(() => {}) }, [veTransacciones])
  useEffect(() => { const id = new URLSearchParams(window.location.search).get('tramite'); if (id) setAbierto(id) }, [])

  const reenviar = async (x: Transaccion) => {
    setAviso(null); setError(null)
    try { const r = await reenviarTransaccion(x.id); setAviso(r.data.estado === 'enviado' ? `Enviado: ${r.data.mensaje ?? 'la plataforma aplicó el resultado'}` : `Sigue fallando: ${r.data.error ?? r.data.estado}`); cargar() }
    catch (e) { setError(errMsg(e, 'No se pudo reenviar')) }
  }
  const abrirTx = async (x: Transaccion) => { try { const r = await getTransaccion(x.id); setVerTx(r.data) } catch (e) { setError(errMsg(e, 'No se pudo abrir')) } }

  return (
    <div className="flex h-full flex-col px-6 pt-3 pb-4 max-[1440px]:px-4 max-md:px-3">
      {veTransacciones && (
        <div className="flex items-center gap-1 border-b-2 border-slate-300 mb-3 overflow-x-auto">
          {([['tramites', 'Trámites'], ['transacciones', 'Transacciones con las plataformas']] as [Tab, string][]).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`shrink-0 whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 -mb-0.5 ${tab === k ? 'border-[#1a4fa0] text-[#1a4fa0]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{l}</button>
          ))}
        </div>
      )}
      {tab === 'tramites' ? (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="relative w-full max-w-xs"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className={`${inputCls} w-full pl-8`} placeholder="Folio, solicitante, empresa, clave externa…" value={q} onChange={e => setQ(e.target.value)} /></div>
            <div className="flex gap-1.5 flex-wrap">{ESTADOS.map(([k, l]) => <button key={k} type="button" onClick={() => setStatus(k)} className={`rounded-full border px-3 py-1 text-[13px] ${status === k ? 'border-[#1a4fa0] bg-[#1a4fa0] text-white' : 'border-slate-300 bg-white text-slate-600'}`}>{l}</button>)}</div>
            {flujos.length > 1 && <select className={`${inputCls} w-auto`} value={flujoId} onChange={e => setFlujoId(e.target.value)}><option value="">Todos los flujos</option>{flujos.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select>}
            <span className="text-[13px] text-slate-500">{lista.length} trámite{lista.length === 1 ? '' : 's'}</span>
          </div>
          {error && <p className="mb-3 text-[13px] text-red-600">{error}</p>}
          <TablaTramites filas={lista} cargando={cargando} onAbrir={setAbierto} reinicio={status + flujoId + q} vacio={<div className="py-10 text-center text-[13px] text-slate-500">No hay trámites con ese filtro.</div>} />
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="flex gap-1.5 flex-wrap">{([['', 'Todas'], ['error', 'En error'], ['abandonado', 'Abandonadas'], ['pendiente_envio', 'Pendientes'], ['enviado', 'Enviadas'], ['recibido', 'Recibidas']] as [string, string][]).map(([k, l]) => <button key={k} type="button" onClick={() => setEstadoTx(k)} className={`rounded-full border px-3 py-1 text-[13px] ${estadoTx === k ? 'border-[#1a4fa0] bg-[#1a4fa0] text-white' : 'border-slate-300 bg-white text-slate-600'}`}>{l}</button>)}</div>
            <span className="text-[13px] text-slate-500">{txs.length} transacci{txs.length === 1 ? 'ón' : 'ones'}</span>
            <button type="button" className={`${btnSecundario} ml-auto`} onClick={cargar}><RefreshCw size={13} /> Actualizar</button>
          </div>
          {aviso && <p className="mb-2 text-[13px] text-emerald-700">{aviso}</p>}
          {error && <p className="mb-2 text-[13px] text-red-600">{error}</p>}
          <div className="flex-1 min-h-0 overflow-auto rounded-xl border border-slate-300 bg-white">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-white"><tr className="text-left text-slate-500 border-b-2 border-slate-200"><th className="px-3 py-2 font-medium">Cuándo</th><th className="px-3 py-2 font-medium">Folio</th><th className="px-3 py-2 font-medium">Dirección</th><th className="px-3 py-2 font-medium">Estado</th><th className="px-3 py-2 font-medium">Intentos</th><th className="px-3 py-2 font-medium">Respuesta / error</th><th /></tr></thead>
              <tbody>
                {txs.map(x => (
                  <tr key={x.id} className="border-b border-slate-200">
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{fmtFecha(x.created_at)}</td>
                    <td className="px-3 py-2"><button type="button" onClick={() => x.instancia_id && setAbierto(x.instancia_id)} className="font-mono font-semibold text-[#1a4fa0] hover:underline">{x.folio ?? '—'}</button></td>
                    <td className="px-3 py-2">{x.direccion === 'entrada' ? 'Plataforma → Intranet' : 'Intranet → Plataforma'}<span className="block text-[11px] text-slate-400">{x.tipo}</span></td>
                    <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${ESTADO_TX[x.estado] ?? ''}`}>{x.estado.replace('_', ' ')}</span></td>
                    <td className="px-3 py-2">{x.intento}{x.estado === 'error' && x.proximo_intento && <span className="block text-[11px] text-slate-400">siguiente {fmtFecha(x.proximo_intento)}</span>}</td>
                    <td className="px-3 py-2 max-w-md text-slate-600 break-words">{x.error ?? (x.respuesta_status ? `HTTP ${x.respuesta_status} ${(x.respuesta_body ?? '').slice(0, 120)}` : '')}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">
                      <button type="button" onClick={() => abrirTx(x)} className="text-slate-500 hover:text-[#1a4fa0] mr-3 inline-flex items-center gap-1"><Code size={13} /> JSON</button>
                      {esAdmin && (x.estado === 'error' || x.estado === 'abandonado') && <button type="button" onClick={() => reenviar(x)} className="text-[#1a4fa0] hover:underline inline-flex items-center gap-1"><RefreshCw size={13} /> Reenviar ahora</button>}
                    </td>
                  </tr>
                ))}
                {txs.length === 0 && !cargando && <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-500">Sin transacciones con ese filtro.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
      {abierto && <ModalTramite id={abierto} onClose={() => { setAbierto(null); window.history.replaceState(null, '', window.location.pathname) }} onChange={cargar} />}
      {verTx && <Modal titulo={`Transacción · ${verTx.folio ?? ''} · ${verTx.direccion}`} onClose={() => setVerTx(null)} ancho="max-w-3xl"><pre className="max-h-[70vh] overflow-auto rounded-lg bg-slate-50 p-3 text-[12px] whitespace-pre-wrap break-words">{JSON.stringify(verTx.payload, null, 2)}{verTx.respuesta_body ? `\n\n--- respuesta ---\n${verTx.respuesta_body}` : ''}</pre></Modal>}
    </div>
  )
}
