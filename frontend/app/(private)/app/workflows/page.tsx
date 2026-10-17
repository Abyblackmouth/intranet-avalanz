'use client'

// Workflows → Inicio: contadores y últimos movimientos. Sin título: la ruta vive en el navbar.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Resumen, getResumen } from '@/services/workflowsService'
import { Chip, ESTADO_AFECTACION, ESTADO_TRAMITE } from '@/components/app/workflows/VistaTramite'
import { fmtFecha } from '@/components/app/workflows/compartidos'
import ModalTramite from '@/components/app/workflows/ModalTramite'

export default function WorkflowsInicioPage() {
  const [r, setR] = useState<Resumen | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)
  const cargar = useCallback(() => { getResumen().then(x => setR(x.data)).catch(() => setR({ me_toca: 0, en_aprobacion: 0, sin_aplicar: 0, error_configuracion: 0, mis_tramites: 0, ultimos: [], ve_todo: false })) }, [])
  useEffect(() => { cargar() }, [cargar])
  if (!r) return <div className="py-16 flex justify-center"><div className="w-5 h-5 border-2 border-slate-300 border-t-[#1a4fa0] rounded-full animate-spin" /></div>
  const kpis: { n: number; t: string; href: string; alerta?: boolean }[] = [
    { n: r.me_toca, t: 'Pendientes de aprobar por mí', href: '/app/workflows/bandeja' },
    { n: r.en_aprobacion, t: r.ve_todo ? 'Trámites en aprobación' : 'Mis trámites en aprobación', href: '/app/workflows/seguimiento' },
    { n: r.sin_aplicar, t: 'Decididos que la plataforma no ha aplicado', href: '/app/workflows/seguimiento', alerta: r.sin_aplicar > 0 },
    { n: r.error_configuracion, t: 'Con error de configuración', href: '/app/workflows/seguimiento', alerta: r.error_configuracion > 0 },
  ]
  return (
    <div className="px-6 pt-3 pb-6 max-[1440px]:px-4 max-md:px-3">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 mb-5">
        {kpis.map(k => (
          <Link key={k.t} href={k.href} className="block rounded-2xl border border-slate-300 bg-white p-5 shadow-sm hover:border-[#1a4fa0]">
            <p className={`text-[30px] font-bold leading-none ${k.alerta ? 'text-red-600' : 'text-slate-900'}`}>{k.n}</p>
            <p className="mt-2 text-[13px] text-slate-500">{k.t}</p>
          </Link>
        ))}
      </div>
      <section className="rounded-2xl border border-slate-300 bg-white shadow-sm">
        <h3 className="px-5 py-3.5 border-b border-slate-200 font-[family-name:var(--font-jakarta)] text-[15px] font-bold text-slate-900">Últimos trámites</h3>
        {r.ultimos.length === 0 ? <p className="px-5 py-8 text-[13px] text-slate-500">Todavía no hay trámites. Cuando la plataforma mande el primero, aparecerá aquí.</p> : (
          <ul className="divide-y divide-slate-200">
            {r.ultimos.map(t => (
              <li key={t.id} className="px-5 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                <button type="button" onClick={() => setAbierto(t.id)} className="font-mono font-semibold text-[#1a4fa0] hover:underline">{t.folio}</button>
                <span>{t.flujo_nombre ?? t.process_id}</span><span className="text-slate-500">{t.requester.name}</span>
                {t.etapa_en_turno && <span className="text-slate-500">etapa {t.etapa_en_turno.orden} · {t.etapa_en_turno.aprobador_nombre}{t.me_toca ? ' (me toca)' : ''}</span>}
                <span className="ml-auto inline-flex gap-1"><Chip par={ESTADO_TRAMITE[t.status]} />{t.afectacion && <Chip par={ESTADO_AFECTACION[t.afectacion]} />}</span>
                <span className="text-[12px] text-slate-400">{fmtFecha(t.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {abierto && <ModalTramite id={abierto} onClose={() => setAbierto(null)} onChange={cargar} />}
    </div>
  )
}
