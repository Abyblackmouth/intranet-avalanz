'use client'

// Tabla de trámites (TablaPantalla) compartida por Bandeja y Seguimiento.
import TablaPantalla, { Columna } from '@/components/ui/TablaPantalla'
import { Tramite } from '@/services/workflowsService'
import { Chip, ESTADO_AFECTACION, ESTADO_TRAMITE } from '@/components/app/workflows/VistaTramite'
import { fmtFecha } from '@/components/app/workflows/compartidos'

const fmt = (n: unknown) => typeof n === 'number' ? `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '—'

export default function TablaTramites({ filas, cargando, onAbrir, reinicio, vacio }: { filas: Tramite[]; cargando: boolean; onAbrir: (id: string) => void; reinicio?: unknown; vacio: React.ReactNode }) {
  const columnas: Columna<Tramite>[] = [
    { id: 'folio', titulo: 'Folio', orden: t => t.folio, celda: t => <button type="button" onClick={() => onAbrir(t.id)} className="font-mono font-semibold text-[#1a4fa0] hover:underline">{t.folio}</button> },
    { id: 'flujo', titulo: 'Flujo', orden: t => t.flujo_nombre ?? '', celda: t => t.flujo_nombre ?? t.process_id },
    { id: 'empresa', titulo: 'Empresa', orden: t => t.company_name, celda: t => t.company_name || t.origen_clave },
    { id: 'sol', titulo: 'Solicitante', orden: t => t.requester.name, celda: t => t.requester.name },
    { id: 'total', titulo: 'Total', orden: t => Number(t.total ?? 0), clase: 'text-right', celda: t => fmt(t.total) },
    { id: 'etapa', titulo: 'Etapa', orden: t => t.etapa_en_turno?.orden ?? 99, celda: t => t.etapa_en_turno ? <span>{t.etapa_en_turno.orden} · {t.etapa_en_turno.aprobador_nombre}{t.me_toca && <span className="ml-1.5 rounded bg-blue-50 px-1.5 text-[11px] font-semibold text-[#1a4fa0]">me toca</span>}</span> : <span className="text-slate-400">—</span> },
    { id: 'estado', titulo: 'Estatus', orden: t => t.status, celda: t => <span className="inline-flex flex-wrap gap-1"><Chip par={ESTADO_TRAMITE[t.status]} />{t.afectacion && <Chip par={ESTADO_AFECTACION[t.afectacion]} />}</span> },
    { id: 'desde', titulo: 'Desde', orden: t => t.created_at ?? '', celda: t => <span className="text-slate-500">{fmtFecha(t.created_at)}</span> },
  ]
  return <TablaPantalla<Tramite> filas={filas} columnas={columnas} clave={t => t.id} cargando={cargando} unidad="trámites" reinicio={reinicio} vacio={vacio} />
}
