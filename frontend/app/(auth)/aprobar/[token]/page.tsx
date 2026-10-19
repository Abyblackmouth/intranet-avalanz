'use client'

// Página pública de la liga del correo: /aprobar/{token}. Sin sesión; el token es la autorización.
// Muestra la hoja del trámite (plantilla del flujo) con la barra Aprobar / Rechazar.
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { TramiteDetalle, getLigaPublica } from '@/services/workflowsService'
import { errMsg } from '@/components/app/workflows/compartidos'
import VistaTramite from '@/components/app/workflows/VistaTramite'

export default function AprobarPorLigaPage() {
  const params = useParams<{ token: string }>()
  const token = params?.token ?? ''
  const [t, setT] = useState<TramiteDetalle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cerrado, setCerrado] = useState<string | null>(null)
  useEffect(() => { if (token) getLigaPublica(token).then(r => setT(r.data)).catch(e => setError(errMsg(e, 'Esta liga no existe o ya no es válida'))) }, [token])
  return (
    <div className="mx-auto my-2.5 w-[90vw] max-md:my-0 max-md:w-screen">
      {error && <div className="mx-auto max-w-xl rounded-2xl border-l-4 border-red-500 bg-white px-5 py-4 text-[14px] text-red-900 shadow">{error}</div>}
      {cerrado && <div className="mx-auto max-w-xl rounded-2xl border-l-4 border-emerald-500 bg-white px-5 py-4 text-[15px] text-emerald-900 shadow">{cerrado} Puedes cerrar esta ventana.</div>}
      {!t && !error && !cerrado && <div className="py-24 flex justify-center"><div className="w-6 h-6 border-2 border-slate-300 border-t-[#1a4fa0] rounded-full animate-spin" /></div>}
      {t && !cerrado && <VistaTramite t={t} modo="liga" token={token} onChange={setT} onCerrado={msg => setCerrado(msg)} />}
    </div>
  )
}
