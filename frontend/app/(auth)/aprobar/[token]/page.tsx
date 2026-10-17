'use client'

// Página pública de la liga del correo: /aprobar/{token}. Sin iniciar sesión; el token es la autorización.
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
    <div className="w-full max-w-6xl">
      <div className="rounded-2xl border-2 border-slate-300 bg-white shadow-xl">
        <header className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-xl bg-[#1a4fa0] text-white font-bold">A</div><div><p className="font-semibold text-slate-900 leading-tight">Intranet Avalanz</p><p className="text-[12px] text-slate-500">Workflows · aprobación por liga</p></div></div>
          <a href="/app/workflows/bandeja" className="text-[13px] text-[#1a4fa0] hover:underline">Entrar a la Intranet</a>
        </header>
        <div className="px-6 py-5">
          {error && <div className="rounded-xl border-l-4 border-red-500 bg-red-50 px-4 py-3 text-[13px] text-red-900">{error}</div>}
          {cerrado && <div className="rounded-xl border-l-4 border-emerald-500 bg-emerald-50 px-4 py-3 text-[14px] text-emerald-900">{cerrado} Puedes cerrar esta ventana.</div>}
          {!t && !error && !cerrado && <div className="py-12 flex justify-center"><div className="w-5 h-5 border-2 border-slate-300 border-t-[#1a4fa0] rounded-full animate-spin" /></div>}
          {t && !cerrado && <VistaTramite t={t} modo="liga" token={token} onChange={setT} onCerrado={msg => setCerrado(msg)} />}
        </div>
        <footer className="px-6 py-3 border-t border-slate-200 text-[12px] text-slate-400">La liga es personal, de un solo uso y vence. Si ya no sirve, pide que te reenvíen el aviso o entra a tu Bandeja.</footer>
      </div>
    </div>
  )
}
