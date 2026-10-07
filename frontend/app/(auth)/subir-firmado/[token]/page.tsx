'use client'

// Liga pública para subir el formato firmado (firma manual), sin iniciar sesión.
import { usePegarImagenes } from '@/hooks/usePegarImagenes'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle2, FileUp, AlertTriangle, Loader2 } from 'lucide-react'

interface Info { folio: string; formato: string; solicitante: string; movimiento: string; firman: string[]
  puede_subir: boolean; vence: string; estado: string; ya_subido: { en: string; kb: number } | null }
const BASE = '/api/v1/it-service-desk/control-accesos/subida'

export default function SubirFirmado() {
  const { token } = useParams<{ token: string }>()
  const [info, setInfo] = useState<Info | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [archivos, setArchivos] = useState<File[]>([])
  const [subiendo, setSubiendo] = useState(false)
  const [listo, setListo] = useState(false)
  const [arrastrando, setArrastrando] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    fetch(`${BASE}/${token}`).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.detail); setInfo(d) })
      .catch(e => setError(e.message || 'Liga no válida'))
  }, [token])
  const agregar = (fs: File[]) => setArchivos(prev => [...prev, ...fs.filter(f => /pdf|jpeg|png|webp/.test(f.type))].slice(0, 10))
  usePegarImagenes(agregar)   // Ctrl + V pega capturas como evidencia
  const subir = async () => {
    setSubiendo(true); setError(null)
    const fd = new FormData(); archivos.forEach(f => fd.append('archivos', f))
    try {
      const r = await fetch(`${BASE}/${token}`, { method: 'POST', body: fd }); const d = await r.json()
      if (!r.ok) throw new Error(typeof d.detail === 'string' ? d.detail : 'No se pudo subir')
      setListo(true)
    } catch (e: any) { setError(e.message) } finally { setSubiendo(false) }
  }
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-gradient-to-br from-slate-50 to-blue-50/40">
      <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-300 shadow-sm p-6">
        {!info && !error && <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#1a4fa0]" /></div>}
        {error && !info && <div className="text-center py-8"><AlertTriangle className="mx-auto text-amber-500 mb-2" /><p className="font-semibold text-slate-900">{error}</p></div>}
        {info && listo && (
          <div className="text-center py-6">
            <CheckCircle2 className="mx-auto text-emerald-600 mb-3" size={40} />
            <h1 className="text-lg font-bold text-slate-900">Documento recibido</h1>
            <p className="text-sm text-slate-600 mt-1">TI revisará las firmas y liberará tu acceso. Te avisaremos por correo con tu usuario.</p>
          </div>
        )}
        {info && !listo && (
          <>
            <p className="font-mono text-xs text-slate-400">{info.folio}</p>
            <h1 className="text-lg font-bold text-slate-900">Sube tu formato firmado</h1>
            <p className="text-sm text-slate-600 mt-1">{info.movimiento === 'modificacion' ? 'Modificación' : 'Alta'} de usuario en {info.formato} · {info.solicitante}</p>
            <div className="mt-4 p-3 rounded-lg bg-blue-50/60 border border-blue-200 text-[13px] text-slate-700">
              Antes de subirlo, revisa que tenga las firmas de: <b>{info.firman.join(', ')}</b>. La firma de TI se agrega al liberar.
            </div>
            {info.ya_subido && <p className="mt-3 text-[13px] text-emerald-700">Ya subiste un documento ({info.ya_subido.kb} KB). Si subes otro, reemplaza al anterior.</p>}
            {!info.puede_subir ? (
              <p className="mt-4 text-sm text-amber-700">Esta liga ya no recibe documentos (venció o la solicitud cambió de estado). Pide a TI que te la vuelva a enviar.</p>
            ) : (
              <>
                <div onDragOver={e => { e.preventDefault(); setArrastrando(true) }} onDragLeave={() => setArrastrando(false)}
                  onDrop={e => { e.preventDefault(); setArrastrando(false); agregar(Array.from(e.dataTransfer.files)) }}
                  onClick={() => input.current?.click()}
                  className={`mt-4 cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition ${arrastrando ? 'border-[#1a4fa0] bg-blue-50/60' : 'border-slate-300 hover:border-[#1a4fa0]/50'}`}>
                  <FileUp className="mx-auto text-[#1a4fa0] mb-2" />
                  <p className="text-sm font-medium text-slate-800">Arrastra aquí tu escaneo o fotos, o haz clic para elegirlos</p>
                  <p className="text-xs text-slate-500 mt-1">PDF, JPG o PNG · hasta 10 archivos · 25 MB en total · se unen en un solo PDF</p>
                  <input ref={input} type="file" multiple accept="application/pdf,image/jpeg,image/png" className="hidden"
                    onChange={e => { agregar(Array.from(e.target.files ?? [])); e.target.value = '' }} />
                </div>
                {archivos.length > 0 && (
                  <ul className="mt-3 grid gap-1.5">
                    {archivos.map((f, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 text-[13px] px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
                        <span className="truncate">{f.name}</span>
                        <button type="button" onClick={() => setArchivos(a => a.filter((_, k) => k !== i))} className="text-slate-400 hover:text-red-600" aria-label={`Quitar ${f.name}`}>✕</button>
                      </li>
                    ))}
                  </ul>
                )}
                {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
                <button type="button" disabled={!archivos.length || subiendo} onClick={subir}
                  className="mt-4 w-full h-11 rounded-lg text-sm font-semibold text-white bg-[#1a4fa0] hover:bg-[#153f82] disabled:opacity-50">
                  {subiendo ? 'Subiendo…' : 'Enviar documento firmado'}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
