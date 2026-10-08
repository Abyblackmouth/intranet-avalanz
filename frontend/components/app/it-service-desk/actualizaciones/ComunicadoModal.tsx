'use client'

import { useCallback, useEffect, useState } from 'react'
import { Megaphone } from 'lucide-react'
import { getComunicadosActivos } from '@/services/itServiceDeskService'

// Modal de comunicados del IT Service Desk. Revisa al entrar al modulo, cada
// minuto y al volver a la pestana. Cada comunicado sale una vez por persona;
// si se edita (sube su version), vuelve a salir.

const TZ = 'America/Monterrey'
interface Comunicado { id: string; titulo: string; mensaje: string; inicio: string; fin: string; version: number }
const clave = (c: Comunicado) => `itsd-comunicado:${c.id}:${c.version}`
const visto = (c: Comunicado) => { try { return localStorage.getItem(clave(c)) === '1' } catch { return false } }
const marcar = (c: Comunicado) => { try { localStorage.setItem(clave(c), '1') } catch {} }
const hora = (iso: string) => new Date(iso).toLocaleString('es-MX', { timeZone: TZ, day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' })

export default function ComunicadoModal() {
  const [actual, setActual] = useState<Comunicado | null>(null)

  const revisar = useCallback(() => {
    getComunicadosActivos().then(r => {
      const lista: Comunicado[] = r.data?.data ?? r.data ?? []
      setActual(prev => prev ?? lista.find(c => !visto(c)) ?? null)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    revisar()
    const cada = setInterval(revisar, 60000)
    window.addEventListener('focus', revisar)
    return () => { clearInterval(cada); window.removeEventListener('focus', revisar) }
  }, [revisar])

  if (!actual) return null
  const cerrar = () => { marcar(actual); setActual(null); setTimeout(revisar, 300) }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="comunicado-titulo"
      className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/40">
      <div className="w-full max-w-lg bg-white rounded-2xl border-2 border-slate-300 shadow-[0_24px_48px_-12px_rgba(15,23,42,0.35)] overflow-hidden">
        <div className="flex items-start gap-3 px-6 pt-6">
          <span className="w-10 h-10 shrink-0 grid place-items-center rounded-xl bg-[#eef4fc] text-[#1a4fa0]"><Megaphone size={20} /></span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1a4fa0]">Comunicado</p>
            <h2 id="comunicado-titulo" className="text-lg font-bold text-slate-900 leading-snug">{actual.titulo}</h2>
          </div>
        </div>
        <p className="px-6 pt-3 text-[14.5px] leading-relaxed text-slate-700 whitespace-pre-wrap">{actual.mensaje}</p>
        <p className="px-6 pt-3 text-[12.5px] text-slate-500">Vigente del {hora(actual.inicio)} al {hora(actual.fin)}</p>
        <div className="flex justify-end px-6 py-5">
          <button type="button" autoFocus onClick={cerrar}
            className="px-5 py-2 text-sm font-semibold rounded-lg text-white bg-[#1a4fa0] hover:bg-[#173f82]">Entendido</button>
        </div>
      </div>
    </div>
  )
}
