'use client'

// Workflows → Bandeja: lo que me toca aprobar. Sin título: la ruta vive en el navbar.
// Abre un trámite si la URL trae ?tramite=<id> (así llegan los clics de la campana).
import { useCallback, useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { Tramite, getBandeja } from '@/services/workflowsService'
import { inputCls, errMsg } from '@/components/app/workflows/compartidos'
import TablaTramites from '@/components/app/workflows/TablaTramites'
import ModalTramite from '@/components/app/workflows/ModalTramite'

type Filtro = 'mias' | 'decididas' | 'participo'

export default function BandejaPage() {
  const [filtro, setFiltro] = useState<Filtro>('mias')
  const [q, setQ] = useState('')
  const [lista, setLista] = useState<Tramite[]>([])
  const [cargando, setCargando] = useState(true)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    try { const r = await getBandeja(filtro, q); setLista(r.data ?? []) } catch (e) { setError(errMsg(e, 'No se pudo cargar la bandeja')) } finally { setCargando(false) }
  }, [filtro, q])
  useEffect(() => { const t = setTimeout(cargar, 150); return () => clearTimeout(t) }, [cargar])
  useEffect(() => { const id = new URLSearchParams(window.location.search).get('tramite'); if (id) setAbierto(id) }, [])

  const chips: [Filtro, string][] = [['mias', 'Pendientes de mí'], ['decididas', 'Decididas por mí'], ['participo', 'Todas donde participo']]
  return (
    <div className="flex h-full flex-col px-6 pt-3 pb-4 max-[1440px]:px-4 max-md:px-3">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative w-full max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={`${inputCls} w-full pl-8`} placeholder="Buscar folio, solicitante, empresa…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {chips.map(([k, l]) => <button key={k} type="button" onClick={() => setFiltro(k)} className={`rounded-full border px-3 py-1 text-[13px] ${filtro === k ? 'border-[#1a4fa0] bg-[#1a4fa0] text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'}`}>{l}</button>)}
        </div>
        <span className="text-[13px] text-slate-500">{lista.length} trámite{lista.length === 1 ? '' : 's'}</span>
      </div>
      {error && <p className="mb-3 text-[13px] text-red-600">{error}</p>}
      <TablaTramites filas={lista} cargando={cargando} onAbrir={setAbierto} reinicio={filtro + q}
        vacio={<div className="py-10 text-center text-[13px] text-slate-500">{filtro === 'mias' ? 'Nada pendiente de tu parte. Cuando te toque aprobar algo, aparecerá aquí (y te llegará un correo con la liga).' : 'No hay trámites con ese filtro.'}</div>} />
      {abierto && <ModalTramite id={abierto} onClose={() => { setAbierto(null); window.history.replaceState(null, '', window.location.pathname) }} onChange={cargar} />}
    </div>
  )
}
