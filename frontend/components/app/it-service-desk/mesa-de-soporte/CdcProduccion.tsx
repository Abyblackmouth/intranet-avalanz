'use client'

import { useEffect, useState } from 'react'
import { getProduccion, confirmarProduccion } from '@/services/itServiceDeskService'
import { Lock, Paperclip, X } from 'lucide-react'
import { Campo, inputCls, btnSec, btnPri } from './CdcArranque'

type Resultado = 'exitoso' | 'observaciones' | 'revertido'
const OPCIONES: { v: Resultado; t: string; d: string; on: string }[] = [
  { v: 'exitoso', t: 'Exitoso', d: 'Quedó instalado y funcionando.', on: 'border-emerald-600 bg-emerald-50 text-emerald-700' },
  { v: 'observaciones', t: 'Exitoso con observaciones', d: 'Funciona, pero hubo algo que anotar.', on: 'border-amber-600 bg-amber-50 text-amber-700' },
  { v: 'revertido', t: 'Revertido', d: 'Se regresó a la versión anterior; vuelve a desarrollo.', on: 'border-red-600 bg-red-50 text-red-700' },
]
const errMsg = (err: any, fb: string) => { const d = err?.response?.data?.detail; return typeof d === 'string' ? d : fb }
const ahoraLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)

export default function CdcProduccion({ incidentId, onChanged }: { incidentId: string; onChanged: () => void }) {
  const [data, setData] = useState<{ puede_editar: boolean; dias_garantia: number; revertidos: { fecha: string; comentarios: string }[]; tecnico: { name: string } | null } | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [fecha, setFecha] = useState(ahoraLocal())
  const [instalo, setInstalo] = useState('')
  const [comentarios, setComentarios] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [confirmando, setConfirmando] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getProduccion(incidentId).then(r => { setData(r.data); setInstalo(r.data?.tecnico?.name ?? '') }).catch(e => setError(errMsg(e, 'No se pudo cargar la etapa')))
  }, [incidentId])

  if (error && !data) return <div className="px-5 py-6 text-[13.5px] text-red-600">{error}</div>
  if (!data) return <div className="px-5 py-8 flex justify-center"><div className="w-5 h-5 border-2 border-slate-300 border-t-[#1a4fa0] rounded-full animate-spin" /></div>
  if (!data.puede_editar) return <p className="px-5 py-7 text-[13.5px] text-slate-600 flex items-center gap-2"><Lock className="w-4 h-4 text-slate-400" />El PM o el especialista técnico confirmarán la instalación en producción.</p>

  const falta = !resultado ? 'Elige el resultado de la instalación.' : !instalo.trim() ? 'Indica quién instaló.'
    : resultado !== 'exitoso' && !comentarios.trim() ? 'Describe las observaciones o por qué se revirtió.'
    : !files.length ? 'Sube al menos una evidencia de la instalación.' : null

  const enviar = async () => {
    setBusy(true); setError(null)
    try {
      const fd = new FormData()
      fd.append('payload', JSON.stringify({ resultado, fecha_instalacion: fecha, instalo, comentarios: comentarios || null }))
      files.forEach(f => fd.append('files', f))
      await confirmarProduccion(incidentId, fd)
      onChanged()
    } catch (e) { setError(errMsg(e, 'No se pudo confirmar la instalación')); setConfirmando(false) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <div className="px-5 py-5 grid gap-4">
        {data.revertidos.length > 0 && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-900">
            Esta es una nueva instalación: el intento anterior se revirtió ({data.revertidos[data.revertidos.length - 1].comentarios}).
          </div>
        )}
        <div>
          <p className="text-[13px] font-medium text-slate-700 mb-2">Resultado de la instalación<span className="text-red-600">*</span></p>
          <div role="radiogroup" aria-label="Resultado" className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {OPCIONES.map(o => (
              <button key={o.v} type="button" role="radio" aria-checked={resultado === o.v} onClick={() => setResultado(o.v)}
                className={`text-left border-[1.5px] rounded-xl px-3.5 py-3 transition ${resultado === o.v ? o.on : 'border-slate-300 bg-white hover:border-slate-400'}`}>
                <span className="block font-semibold text-[14px]">{o.t}</span><span className="block text-[12.5px] text-slate-500 mt-0.5">{o.d}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo label="Fecha y hora de la instalación" req><input type="datetime-local" className={inputCls} value={fecha} onChange={e => setFecha(e.target.value)} /></Campo>
          <Campo label="Quién instaló" req><input className={inputCls} placeholder="Persona o proveedor" value={instalo} onChange={e => setInstalo(e.target.value)} /></Campo>
        </div>
        <Campo label={`Comentarios${resultado && resultado !== 'exitoso' ? '' : ' (opcional)'}`} req={!!resultado && resultado !== 'exitoso'}>
          <textarea className={`${inputCls} min-h-[80px]`} placeholder={resultado === 'revertido' ? 'Qué falló y cómo se revirtió' : 'Cómo fue la instalación'} value={comentarios} onChange={e => setComentarios(e.target.value)} />
        </Campo>
        <div>
          <p className="text-[13px] font-medium text-slate-700 mb-1.5">Evidencia<span className="text-red-600">*</span></p>
          <div className="flex flex-wrap items-center gap-2">
            {files.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-[12.5px] border border-slate-200 rounded-lg px-2 py-1">{f.name}
                <button type="button" aria-label="Quitar" onClick={() => setFiles(x => x.filter((_, j) => j !== i))}><X className="w-3 h-3 text-slate-400 hover:text-red-600" /></button>
              </span>
            ))}
            <label className={`${btnSec} cursor-pointer inline-flex items-center gap-1.5`}><Paperclip className="w-3.5 h-3.5" />Subir evidencia
              <input type="file" multiple className="hidden" onChange={e => { const l = Array.from(e.target.files ?? []); setFiles(f => [...f, ...l]); e.target.value = '' }} />
            </label>
          </div>
        </div>
        {error && <p role="status" className="text-[13px] font-medium text-red-600">{error}</p>}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
        {confirmando ? (
          <>
            <p className="text-[13.5px] text-slate-700">{resultado === 'revertido'
              ? <>¿Confirmar que se <b>revirtió</b>? El proyecto regresa a <b>En desarrollo</b>.</>
              : <>¿Confirmar la instalación? El proyecto pasa a <b>Terminado</b> e inicia su garantía de {data.dias_garantia} días.</>}</p>
            <div className="flex gap-2">
              <button type="button" disabled={busy} className="px-4 py-2 text-sm text-slate-600" onClick={() => setConfirmando(false)}>Volver</button>
              <button type="button" disabled={busy} className={btnPri} onClick={enviar}>{busy ? 'Confirmando…' : 'Sí, confirmar'}</button>
            </div>
          </>
        ) : (
          <>
            <p className={`text-[12.5px] ${falta ? 'text-amber-700' : 'text-slate-500'}`}>{falta ?? 'Se generará el acta de paso a producción y se avisará al solicitante, al PM y al técnico.'}</p>
            <button type="button" disabled={!!falta} className={btnPri} onClick={() => setConfirmando(true)}>Confirmar instalación</button>
          </>
        )}
      </footer>
    </div>
  )
}
