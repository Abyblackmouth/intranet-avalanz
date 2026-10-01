'use client'

// Alta masiva de empleados: layout -> revisión -> confirmación con avance en vivo.
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Download, FileSpreadsheet, Upload, CheckCircle2, AlertTriangle, XCircle, Loader2 } from 'lucide-react'
import PageWrapper from '@/components/layout/PageWrapper'
import { bulkLayout, bulkRevision, bulkConfirmar, bulkEstado, bulkReporte } from '@/services/adminService'

interface Fila { fila: number; nombre: string; correo: string; empresa: string; matricula: string; puesto: string; departamento: string
  accesos: { modulo: string; rol: string }[]; estado: 'listo' | 'aviso' | 'error'; mensajes: string[] }
interface Revision { lote_id: string; archivo: string; resumen: { total: number; listos: number; avisos: number; errores: number }
  departamentos_nuevos: string[]; filas: Fila[] }
interface Trabajo { estado: 'creando' | 'enviando_correos' | 'terminado'; total: number; creados: number; errores: number; correos_enviados: number; segundos_por_correo: number }

const errMsg = (e: any, fb: string) => { const d = e?.response?.data?.detail; return typeof d === 'string' ? d : fb }
const guardar = (blob: Blob, nombre: string) => {
  const url = URL.createObjectURL(blob); const a = document.createElement('a')
  a.href = url; a.download = nombre; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000)
}
const ESTADO = {
  listo: { txt: 'Listo', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  aviso: { txt: 'Aviso', cls: 'bg-amber-50 text-amber-800 border-amber-200', icon: AlertTriangle },
  error: { txt: 'Error', cls: 'bg-red-50 text-red-700 border-red-200', icon: XCircle },
}

function Barra({ valor, total, color }: { valor: number; total: number; color: string }) {
  const pct = total ? Math.round((valor / total) * 100) : 0
  return <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} /></div>
}

export default function AltaMasivaPage() {
  const [rev, setRev] = useState<Revision | null>(null)
  const [filtro, setFiltro] = useState<'todos' | 'listo' | 'aviso' | 'error'>('todos')
  const [incluirAvisos, setIncluirAvisos] = useState(true)
  const [trabajoId, setTrabajoId] = useState<string | null>(null)
  const [trabajo, setTrabajo] = useState<Trabajo | null>(null)
  const [ocupado, setOcupado] = useState<'' | 'layout' | 'revision' | 'confirmar' | 'reporte'>('')
  const [error, setError] = useState<string | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!trabajoId) return
    let vivo = true
    const leer = () => bulkEstado(trabajoId).then(r => { if (!vivo) return; setTrabajo(r.data); if (r.data.estado !== 'terminado') setTimeout(leer, 2000) })
      .catch(e => vivo && setError(errMsg(e, 'No se pudo leer el avance')))
    leer()
    return () => { vivo = false }
  }, [trabajoId])

  const descargarLayout = async () => {
    setOcupado('layout'); setError(null)
    try { const r = await bulkLayout(); guardar(r.data, `Layout_alta_masiva_${new Date().toISOString().slice(0, 10)}.xlsx`) }
    catch (e) { setError(errMsg(e, 'No se pudo descargar el layout')) } finally { setOcupado('') }
  }
  const subir = async (f?: File | null) => {
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.xlsx')) { setError('El archivo debe ser el layout en Excel (.xlsx)'); return }
    setOcupado('revision'); setError(null); setRev(null); setFiltro('todos')
    try { const r = await bulkRevision(f); setRev(r.data) }
    catch (e) { setError(errMsg(e, 'No se pudo revisar el archivo')) } finally { setOcupado(''); if (input.current) input.current.value = '' }
  }
  const confirmar = async () => {
    if (!rev) return
    setOcupado('confirmar'); setError(null)
    try { const r = await bulkConfirmar(rev.lote_id, incluirAvisos); setTrabajoId(r.data.trabajo_id) }
    catch (e) { setError(errMsg(e, 'No se pudo iniciar el alta')) } finally { setOcupado('') }
  }
  const descargarReporte = async () => {
    if (!trabajoId) return
    setOcupado('reporte')
    try { const r = await bulkReporte(trabajoId); guardar(r.data, `Resultado_alta_masiva_${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}.xlsx`) }
    catch (e) { setError(errMsg(e, 'No se pudo descargar el reporte')) } finally { setOcupado('') }
  }

  const aCrear = rev ? rev.resumen.listos + (incluirAvisos ? rev.resumen.avisos : 0) : 0
  const visibles = rev?.filas.filter(f => filtro === 'todos' || f.estado === filtro) ?? []
  const restantes = trabajo ? Math.max(0, trabajo.creados - trabajo.correos_enviados) : 0
  const minutos = trabajo ? Math.ceil((restantes * trabajo.segundos_por_correo) / 60) : 0

  return (
    <PageWrapper title="Alta masiva de empleados" description="Crea varios usuarios a la vez con su empresa, departamento y accesos"
      actions={<Link href="/admin/users" className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft size={15} /> Usuarios</Link>}>
      {error && <p role="alert" className="mb-4 px-4 py-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</p>}

      {trabajoId ? (
        <section className="max-w-3xl bg-white border border-slate-200 rounded-2xl shadow-sm p-6 grid gap-5">
          <div className="flex items-center gap-3">
            {trabajo?.estado === 'terminado' ? <CheckCircle2 className="text-emerald-600" size={26} /> : <Loader2 className="animate-spin text-[#1a4fa0]" size={26} />}
            <div>
              <h2 className="font-[family-name:var(--font-jakarta)] text-[17px] font-bold text-slate-900">
                {trabajo?.estado === 'terminado' ? 'Alta masiva terminada' : trabajo?.estado === 'enviando_correos' ? 'Enviando los correos de bienvenida…' : 'Creando usuarios…'}
              </h2>
              <p className="text-[13px] text-slate-500">Puedes salir de esta página: el proceso sigue en el servidor.</p>
            </div>
          </div>
          {trabajo && (
            <>
              <div className="grid gap-1.5">
                <div className="flex justify-between text-[13px]"><span className="font-medium text-slate-700">Usuarios</span>
                  <span className="text-slate-500">{trabajo.creados + trabajo.errores} de {trabajo.total}{trabajo.errores ? ` · ${trabajo.errores} con error` : ''}</span></div>
                <Barra valor={trabajo.creados + trabajo.errores} total={trabajo.total} color="bg-[#1a4fa0]" />
              </div>
              <div className="grid gap-1.5">
                <div className="flex justify-between text-[13px]"><span className="font-medium text-slate-700">Correos de bienvenida</span>
                  <span className="text-slate-500">{trabajo.correos_enviados} de {trabajo.creados}{restantes && trabajo.estado !== 'creando' ? ` · faltan ~${minutos} min` : ''}</span></div>
                <Barra valor={trabajo.correos_enviados} total={trabajo.creados} color="bg-emerald-500" />
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={descargarReporte} disabled={ocupado === 'reporte'}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#1a4fa0] hover:bg-[#153f82] disabled:opacity-60">
                  <Download size={15} /> {trabajo.estado === 'terminado' ? 'Descargar reporte' : 'Descargar reporte parcial'}
                </button>
                {trabajo.estado === 'terminado' && (
                  <button type="button" onClick={() => { setTrabajoId(null); setTrabajo(null); setRev(null) }}
                    className="px-4 py-2 rounded-lg text-sm text-slate-700 border border-slate-300 hover:bg-slate-50">Hacer otra alta masiva</button>
                )}
              </div>
            </>
          )}
        </section>
      ) : (
        <div className="grid gap-5">
          <div className="grid md:grid-cols-2 gap-4">
            <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 flex gap-4">
              <span className="w-10 h-10 shrink-0 rounded-xl bg-blue-50 text-[#1a4fa0] flex items-center justify-center font-bold">1</span>
              <div className="flex-1">
                <h2 className="text-[15px] font-bold text-slate-900">Descarga el layout</h2>
                <p className="text-[13px] text-slate-500 mt-0.5 mb-3">Viene con las empresas, departamentos y roles de cada módulo al día. Descárgalo cada vez, para no usar uno viejo.</p>
                <button type="button" onClick={descargarLayout} disabled={ocupado === 'layout'}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-[#1a4fa0] border border-[#1a4fa0]/40 hover:bg-blue-50 disabled:opacity-60">
                  {ocupado === 'layout' ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />} Descargar layout
                </button>
              </div>
            </section>
            <section
              onDragOver={e => { e.preventDefault(); setArrastrando(true) }} onDragLeave={() => setArrastrando(false)}
              onDrop={e => { e.preventDefault(); setArrastrando(false); subir(e.dataTransfer.files?.[0]) }}
              className={`bg-white border-2 border-dashed rounded-2xl p-5 flex gap-4 transition ${arrastrando ? 'border-[#1a4fa0] bg-blue-50/40' : 'border-slate-300'}`}>
              <span className="w-10 h-10 shrink-0 rounded-xl bg-blue-50 text-[#1a4fa0] flex items-center justify-center font-bold">2</span>
              <div className="flex-1">
                <h2 className="text-[15px] font-bold text-slate-900">Sube el archivo lleno</h2>
                <p className="text-[13px] text-slate-500 mt-0.5 mb-3">Arrástralo aquí o elígelo. Primero verás una revisión: todavía no se crea a nadie.</p>
                <input ref={input} type="file" accept=".xlsx" className="hidden" onChange={e => subir(e.target.files?.[0])} />
                <button type="button" onClick={() => input.current?.click()} disabled={ocupado === 'revision'}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#1a4fa0] hover:bg-[#153f82] disabled:opacity-60">
                  {ocupado === 'revision' ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} {ocupado === 'revision' ? 'Revisando…' : 'Elegir archivo'}
                </button>
              </div>
            </section>
          </div>

          {rev && (
            <section className="bg-white border border-slate-200 rounded-2xl shadow-sm">
              <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
                <span className="w-8 h-8 rounded-xl bg-blue-50 text-[#1a4fa0] flex items-center justify-center font-bold text-sm">3</span>
                <div className="flex-1 min-w-[200px]">
                  <h2 className="text-[15px] font-bold text-slate-900">Revisión de {rev.archivo}</h2>
                  <p className="text-[13px] text-slate-500">{rev.resumen.total} renglones. Haz clic en un contador para filtrar.</p>
                </div>
                {(['todos', 'listo', 'aviso', 'error'] as const).map(k => {
                  const n = k === 'todos' ? rev.resumen.total : rev.resumen[k === 'listo' ? 'listos' : k === 'aviso' ? 'avisos' : 'errores']
                  return (
                    <button key={k} type="button" onClick={() => setFiltro(k)} aria-pressed={filtro === k}
                      className={`px-3 py-1.5 rounded-lg border text-[13px] font-medium transition ${filtro === k ? 'ring-2 ring-[#1a4fa0]/30 border-[#1a4fa0]' : 'border-slate-200 hover:border-slate-300'} text-slate-700`}>
                      {k === 'todos' ? 'Todos' : ESTADO[k].txt + 's'} <b>{n}</b>
                    </button>
                  )
                })}
              </div>
              {rev.departamentos_nuevos.length > 0 && (
                <div className="mx-5 mt-4 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-[13px] text-amber-900">
                  <b>Departamentos nuevos:</b> {rev.departamentos_nuevos.join(', ')}. Revisa que estén bien escritos antes de confirmar: se guardarán tal cual.
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] min-w-[900px]">
                  <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <tr><th className="px-4 py-2 w-16">Renglón</th><th className="px-4 py-2 w-24">Estado</th><th className="px-4 py-2">Empleado</th>
                      <th className="px-4 py-2">Empresa · Departamento</th><th className="px-4 py-2">Accesos</th><th className="px-4 py-2">Observaciones</th></tr>
                  </thead>
                  <tbody>
                    {visibles.map(f => {
                      const E = ESTADO[f.estado]
                      return (
                        <tr key={f.fila} className="border-t border-slate-100 align-top">
                          <td className="px-4 py-2.5 font-mono text-slate-500">{f.fila}</td>
                          <td className="px-4 py-2.5"><span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11.5px] font-semibold ${E.cls}`}><E.icon size={12} />{E.txt}</span></td>
                          <td className="px-4 py-2.5"><p className="font-semibold text-slate-900">{f.nombre || '—'}</p><p className="text-[12px] text-slate-500">{f.correo || '—'} · {f.matricula || '—'}</p></td>
                          <td className="px-4 py-2.5"><p className="text-slate-800">{f.empresa || '—'}</p><p className="text-[12px] text-slate-500">{f.departamento || '—'}{f.puesto ? ` · ${f.puesto}` : ''}</p></td>
                          <td className="px-4 py-2.5 text-[12px] text-slate-700">{f.accesos.length ? f.accesos.map(a => <span key={a.modulo} className="block">{a.modulo}: <b>{a.rol}</b></span>) : <span className="text-slate-400">Sin accesos</span>}</td>
                          <td className={`px-4 py-2.5 text-[12px] ${f.estado === 'error' ? 'text-red-700' : 'text-amber-800'}`}>{f.mensajes.join(' · ')}</td>
                        </tr>
                      )
                    })}
                    {visibles.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">No hay renglones con este estado.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-4 border-t border-slate-100 flex flex-wrap items-center gap-4">
                {rev.resumen.avisos > 0 && (
                  <label className="flex items-center gap-2 text-[13px] text-slate-700 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-[#1a4fa0]" checked={incluirAvisos} onChange={e => setIncluirAvisos(e.target.checked)} />
                    Crear también los {rev.resumen.avisos} renglones con aviso
                  </label>
                )}
                <p className="flex-1 text-[13px] text-slate-500">{rev.resumen.errores ? `Los ${rev.resumen.errores} renglones con error no se crearán: corrígelos y súbelos en otro archivo.` : 'No hay errores.'}</p>
                <button type="button" onClick={confirmar} disabled={!aCrear || ocupado === 'confirmar'}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40">
                  {ocupado === 'confirmar' && <Loader2 size={15} className="animate-spin" />} Crear {aCrear} usuario{aCrear === 1 ? '' : 's'}
                </button>
              </div>
            </section>
          )}
        </div>
      )}
    </PageWrapper>
  )
}
