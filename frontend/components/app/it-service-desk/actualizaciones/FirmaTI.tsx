'use client'

// Firma del encargado de TI: se estampa en la hoja de "Liberación de TI" (firma manual).
import { useEffect, useRef, useState } from 'react'
import { PenLine, Upload } from 'lucide-react'
import { accFormatosDisponibles, accVerFirmaTI, accSubirFirmaTI } from '@/services/itServiceDeskService'

function Tarjeta({ id, nombre }: { id: string; nombre: string }) {
  const [firma, setFirma] = useState<{ tiene: boolean; imagen?: string; nombre?: string; actualizada?: string } | null>(null)
  const [estado, setEstado] = useState<'' | 'subiendo' | string>('')
  const input = useRef<HTMLInputElement>(null)
  const cargar = () => accVerFirmaTI(id).then(r => setFirma(r.data)).catch(e => setFirma({ tiene: false, nombre: e?.response?.status === 403 ? '__sin_permiso' : undefined }))
  useEffect(() => { cargar() }, [id])
  if (firma?.nombre === '__sin_permiso') return null
  const subir = async (f?: File) => {
    if (!f) return
    setEstado('subiendo')
    try { await accSubirFirmaTI(id, f); await cargar(); setEstado('') }
    catch (e: any) { const d = e?.response?.data?.detail; setEstado(typeof d === 'string' ? d : 'No se pudo subir la firma') }
    finally { if (input.current) input.current.value = '' }
  }
  return (
    <div className="flex flex-wrap items-center gap-4 p-4 border border-slate-300 rounded-xl bg-white">
      <div className="w-40 h-20 rounded-lg border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden">
        {firma?.imagen ? <img src={firma.imagen} alt="Tu firma" className="max-w-full max-h-full object-contain" /> : <PenLine className="text-slate-300" />}
      </div>
      <div className="flex-1 min-w-50">
        <p className="text-sm font-semibold text-slate-900">{nombre}</p>
        <p className="text-[12.5px] text-slate-500">{firma?.tiene ? `Firma guardada${firma.actualizada ? ' · ' + new Date(firma.actualizada).toLocaleDateString('es-MX') : ''}` : 'Aún no hay firma: no podrás liberar solicitudes con firma manual.'}</p>
        {estado && estado !== 'subiendo' && <p role="alert" className="text-[12.5px] text-red-600 mt-1">{estado}</p>}
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg" className="hidden" onChange={e => subir(e.target.files?.[0])} />
      <button type="button" disabled={estado === 'subiendo'} onClick={() => input.current?.click()}
        className="inline-flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-semibold text-[#1a4fa0] border border-[#1a4fa0]/40 hover:bg-blue-50 disabled:opacity-50">
        <Upload size={15} /> {estado === 'subiendo' ? 'Subiendo…' : firma?.tiene ? 'Cambiar firma' : 'Subir firma'}
      </button>
    </div>
  )
}

export default function FirmaTI() {
  const [formatos, setFormatos] = useState<{ id: string; nombre: string }[]>([])
  useEffect(() => {
    accFormatosDisponibles().then(r => {
      const d = Array.isArray(r.data) ? r.data : r.data?.data ?? r.data?.formatos ?? []
      setFormatos(d.map((x: any) => ({ id: x.id, nombre: x.nombre })))
    }).catch(() => {})
  }, [])
  if (!formatos.length) return null
  return (
    <section className="mb-5">
      <h3 className="text-[15px] font-bold text-slate-900">Firma del encargado de TI</h3>
      <p className="text-[13px] text-slate-500 mb-3">Se estampa en la hoja de "Liberación de TI" al liberar una solicitud con firma manual. Usa un PNG con fondo transparente.</p>
      <div className="grid gap-3">{formatos.map(f => <Tarjeta key={f.id} {...f} />)}</div>
    </section>
  )
}
