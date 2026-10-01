'use client'

// Resumen por secciones de una solicitud de acceso, para el panel del ticket.
import { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import { accResumenSolicitud } from '@/services/itServiceDeskService'

interface Resumen {
  movimiento: 'alta' | 'modificacion'
  tipo: { motivo: string; auditoria: boolean; usuario_modelo: string; reemplaza_a: string }
  familias: { id: string; nombre: string; empresas: string[] }[]
  modulos: { nombre: string; exclusivo_admin: boolean; perfil: string; rutinas: string[] }[]
  vigencia: string; observaciones: string; jefe: { nombre?: string; correo?: string }
}

const Etiqueta = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 mb-1">{children}</p>
)

export default function AccResumenSolicitud({ incidentId, fallback }: { incidentId: string; fallback: string }) {
  const [r, setR] = useState<Resumen | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => { accResumenSolicitud(incidentId).then(x => setR(x.data)).catch(() => setError(true)) }, [incidentId])

  if (error) return <p className="text-sm text-slate-700 leading-relaxed border border-slate-200 rounded-lg p-3 whitespace-pre-line">{fallback}</p>
  if (!r) return <div className="border border-slate-200 rounded-lg p-6 flex justify-center"><div className="w-5 h-5 border-2 border-slate-300 border-t-[#1a4fa0] rounded-full animate-spin" /></div>

  return (
    <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 text-[13px]">
      <div className="p-3 flex flex-wrap items-center gap-1.5">
        <span className={`px-2 py-0.5 rounded-full text-[11.5px] font-semibold ${r.movimiento === 'modificacion' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
          {r.movimiento === 'modificacion' ? 'Modificación' : 'Alta'}
        </span>
        <span className="px-2 py-0.5 rounded-full text-[11.5px] font-medium bg-slate-100 text-slate-700">{r.tipo.motivo}</span>
        {r.tipo.auditoria && <span className="px-2 py-0.5 rounded-full text-[11.5px] font-medium bg-blue-50 text-[#1a4fa0]">Auditoría (visor)</span>}
        {r.tipo.reemplaza_a && <span className="text-[12px] text-slate-600">· Reemplaza a <b className="text-slate-800">{r.tipo.reemplaza_a}</b></span>}
        {r.tipo.usuario_modelo && <span className="text-[12px] text-slate-600">· Usuario modelo <b className="text-slate-800">{r.tipo.usuario_modelo}</b></span>}
      </div>

      <div className="p-3">
        <Etiqueta>Empresas · {r.familias.reduce((n, f) => n + f.empresas.length, 0)}</Etiqueta>
        <div className="grid gap-1.5">
          {r.familias.map(f => (
            <div key={f.id} className="flex gap-2">
              <span className="w-24 shrink-0 text-[11.5px] font-bold text-slate-500 pt-0.5">{f.nombre}</span>
              <div className="flex flex-wrap gap-1">
                {f.empresas.map(e => <span key={e} className="px-1.5 py-0.5 rounded bg-slate-100 text-[12px] text-slate-700">{e}</span>)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="p-3">
        <Etiqueta>Módulos · {r.modulos.length}</Etiqueta>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead><tr className="text-left text-[10.5px] uppercase tracking-wide text-slate-400"><th className="pb-1 pr-3 font-semibold">Módulo</th><th className="pb-1 pr-3 font-semibold">Perfil</th><th className="pb-1 font-semibold">Rutinas o menús</th></tr></thead>
            <tbody>
              {r.modulos.map(m => (
                <tr key={m.nombre} className="border-t border-slate-100 align-top">
                  <td className="py-1.5 pr-3 font-semibold text-slate-800 whitespace-nowrap">{m.exclusivo_admin && <Lock size={11} className="inline -mt-0.5 mr-1 text-amber-600" />}{m.nombre}</td>
                  <td className="py-1.5 pr-3 text-slate-700 whitespace-nowrap">{m.perfil}</td>
                  <td className="py-1.5"><div className="flex flex-wrap gap-1">{m.rutinas.map(x => <span key={x} className="px-1.5 py-0.5 rounded bg-blue-50 text-[#1a4fa0] text-[12px]">{x}</span>)}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="p-3 grid sm:grid-cols-2 gap-3">
        <div><Etiqueta>Vigencia</Etiqueta><p className="text-slate-800 font-medium">{r.vigencia}</p></div>
        <div><Etiqueta>Jefe directo</Etiqueta><p className="text-slate-800 font-medium break-words">{r.jefe.nombre || '—'}</p><p className="text-[12px] text-slate-500 break-words">{r.jefe.correo}</p></div>
        {r.observaciones && <div className="sm:col-span-2"><Etiqueta>Observaciones</Etiqueta><p className="text-slate-700">{r.observaciones}</p></div>}
      </div>
    </div>
  )
}
