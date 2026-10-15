'use client'

import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'

// Avisa cuando se desplego una version nueva de la intranet. Nunca recarga sola (se perderia
// lo que el usuario este escribiendo): muestra una barrita con Actualizar y Mas tarde (30 min).
const CADA = 5 * 60 * 1000
const POSPONER = 30 * 60 * 1000
const valida = (v: string) => /^[\w-]{6,64}$/.test(v)

export default function AvisoVersion() {
  const base = useRef<string | null>(null)
  const pospuesto = useRef(0)
  const [nueva, setNueva] = useState(false)

  useEffect(() => {
    const revisar = async () => {
      try {
        const r = await fetch('/version', { cache: 'no-store' })
        if (!r.ok) return
        const v = (await r.text()).trim()
        if (!valida(v)) return
        if (base.current === null) { base.current = v; return }
        if (v !== base.current && Date.now() >= pospuesto.current) setNueva(true)
      } catch { /* sin red: se revisa en la siguiente vuelta */ }
    }
    revisar()
    const t = setInterval(revisar, CADA)
    const alVolver = () => { if (document.visibilityState === 'visible') revisar() }
    document.addEventListener('visibilitychange', alVolver)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', alVolver) }
  }, [])

  if (!nueva) return null
  return (
    <div role="status" className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-[#0f2440] py-2.5 pl-4 pr-2.5 text-sm text-white shadow-lg">
      <span>Hay una versión nueva de la intranet</span>
      <button type="button" onClick={() => window.location.reload()}
        className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-[#0f2440] hover:bg-slate-100">
        <RefreshCw size={13} /> Actualizar
      </button>
      <button type="button" onClick={() => { pospuesto.current = Date.now() + POSPONER; setNueva(false) }}
        className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white">
        Más tarde
      </button>
    </div>
  )
}
