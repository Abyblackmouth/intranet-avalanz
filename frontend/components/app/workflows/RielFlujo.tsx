'use client'

// RielFlujo: el diagrama horizontal de etapas que se ve en todo el módulo
// (definición, simulador, detalle del trámite, página pública). Cajas y flechas
// en CSS, sin librerías. En pantallas angostas se vuelve vertical.
import { ChevronRight, Plus } from 'lucide-react'

export type EstadoEtapa = 'pendiente' | 'en_turno' | 'aprobada' | 'rechazada' | 'omitida' | 'no_alcanzada' | 'reasignada' | 'definicion'

export interface EtapaRiel {
  id?: string
  orden: number
  nombre: string
  puesto_esperado?: string | null
  aprobador_nombre?: string | null
  suplente_nombre?: string | null
  condicion?: string | null
  status?: EstadoEtapa
  nota?: string | null
  decidio_nombre?: string | null
  decidio_en?: string | null
  tipo?: string
}

export interface NodoPlataforma { titulo: string; estado?: 'pendiente' | 'aplicada' | 'fallida' | null; detalle?: string }

const ESTILO: Record<EstadoEtapa, string> = {
  definicion: 'border-slate-400 bg-white',
  pendiente: 'border-slate-400 bg-white',
  en_turno: 'border-[#1a4fa0] bg-blue-50 ring-2 ring-[#1a4fa0]/25',
  aprobada: 'border-emerald-600 bg-emerald-50',
  rechazada: 'border-red-600 bg-red-50',
  omitida: 'border-dashed border-slate-400 bg-white opacity-70',
  no_alcanzada: 'border-dashed border-slate-400 bg-white opacity-60',
  reasignada: 'border-amber-500 bg-amber-50',
}
const PUNTO: Record<EstadoEtapa, string> = {
  definicion: 'bg-slate-300', pendiente: 'bg-slate-400', en_turno: 'bg-[#1a4fa0]', aprobada: 'bg-emerald-600',
  rechazada: 'bg-red-600', omitida: 'bg-slate-300', no_alcanzada: 'bg-slate-300', reasignada: 'bg-amber-500',
}
const LEYENDA_ESTADO: Record<EstadoEtapa, string> = {
  definicion: '', pendiente: 'pendiente', en_turno: 'en turno', aprobada: 'aprobada', rechazada: 'rechazada',
  omitida: 'omitida', no_alcanzada: 'no alcanzada', reasignada: 'reasignada',
}

const fecha = (iso?: string | null) => iso ? new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Monterrey', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''

export default function RielFlujo({ etapas, plataforma, editable, onEtapa, onAgregar, compacto }: {
  etapas: EtapaRiel[]; plataforma?: NodoPlataforma | null; editable?: boolean
  onEtapa?: (e: EtapaRiel) => void; onAgregar?: () => void; compacto?: boolean
}) {
  const Flecha = () => <div className="grid shrink-0 place-items-center px-0.5 text-slate-400 max-md:rotate-90 max-md:py-0.5"><ChevronRight size={18} /></div>
  const ancho = compacto ? 'min-w-36 max-w-44' : 'min-w-42 max-w-52'
  const estadoPlat: EstadoEtapa = plataforma?.estado === 'aplicada' ? 'aprobada' : plataforma?.estado === 'fallida' ? 'rechazada' : plataforma?.estado === 'pendiente' ? 'en_turno' : 'pendiente'

  return (
    <div className="flex items-stretch gap-0 overflow-x-auto py-1.5 max-md:flex-col max-md:overflow-visible">
      {etapas.length === 0 && !editable && <p className="text-[13px] text-slate-400 py-3">Sin etapas.</p>}
      {etapas.map((e, i) => {
        const st = e.status ?? 'definicion'
        const Tag = editable ? 'button' : 'div'
        return (
          <div key={e.id ?? e.orden} className="flex items-stretch max-md:flex-col">
            {i > 0 && <Flecha />}
            <Tag type={editable ? 'button' : undefined} onClick={editable && onEtapa ? () => onEtapa(e) : undefined}
              className={`relative shrink-0 rounded-xl border-2 px-3 py-2.5 text-left ${ancho} max-md:max-w-none ${ESTILO[st]} ${editable ? 'cursor-pointer hover:border-[#1a4fa0] hover:shadow-sm transition' : ''}`}>
              <span className={`absolute right-2.5 top-2.5 size-2.5 rounded-full ${PUNTO[st]}`} />
              <p className="text-[11px] text-slate-500">Etapa {e.orden}{e.puesto_esperado ? ` · ${e.puesto_esperado}` : ''}{e.tipo && e.tipo !== 'aprobacion' ? ` · ${e.tipo}` : ''}</p>
              <p className="mt-0.5 text-[13px] font-bold leading-tight text-slate-900 pr-3">{e.nombre}</p>
              <p className="mt-1 text-[12px] text-slate-700">
                {e.decidio_nombre ?? e.aprobador_nombre ?? <span className="text-amber-700">sin aprobador</span>}
                {!e.decidio_nombre && e.suplente_nombre && <span className="text-slate-400"> o {e.suplente_nombre}</span>}
              </p>
              {(e.decidio_en || LEYENDA_ESTADO[st]) && <p className="text-[11px] text-slate-500">{e.decidio_en ? fecha(e.decidio_en) : LEYENDA_ESTADO[st]}</p>}
              {e.condicion && <p className="mt-1 text-[11px] text-amber-700">solo si {e.condicion}</p>}
              {e.nota && (st === 'omitida' || st === 'no_alcanzada' || st === 'reasignada') && <p className="mt-0.5 text-[11px] text-slate-500">{e.nota}</p>}
            </Tag>
          </div>
        )
      })}
      {editable && (
        <div className="flex items-stretch max-md:flex-col">
          {etapas.length > 0 && <Flecha />}
          <button type="button" onClick={onAgregar} title="Agregar etapa"
            className="grid min-w-16 shrink-0 place-items-center rounded-xl border-2 border-dashed border-slate-400 text-slate-500 hover:border-[#1a4fa0] hover:text-[#1a4fa0] max-md:min-h-11">
            <Plus size={18} />
          </button>
        </div>
      )}
      {plataforma && (
        <div className="flex items-stretch max-md:flex-col">
          <Flecha />
          <div className={`relative shrink-0 rounded-xl border-2 border-double px-3 py-2.5 ${ancho} max-md:max-w-none ${ESTILO[estadoPlat]}`}>
            <span className={`absolute right-2.5 top-2.5 size-2.5 rounded-full ${PUNTO[estadoPlat]}`} />
            <p className="text-[11px] text-slate-500">Plataforma</p>
            <p className="mt-0.5 text-[13px] font-bold leading-tight text-slate-900 pr-3">{plataforma.titulo}</p>
            <p className="mt-1 text-[12px] text-slate-700">{plataforma.detalle ?? 'Aplica el resultado'}</p>
          </div>
        </div>
      )}
    </div>
  )
}

export function LeyendaRiel() {
  const items: [string, string][] = [['bg-emerald-600', 'Aprobada'], ['bg-[#1a4fa0]', 'En turno'], ['bg-slate-400', 'Pendiente'], ['bg-red-600', 'Rechazada']]
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate-500">
      {items.map(([c, l]) => <span key={l} className="inline-flex items-center gap-1.5"><i className={`inline-block size-2.5 rounded-full ${c}`} />{l}</span>)}
      <span className="opacity-70">╌ Omitida por condición / no alcanzada</span>
    </div>
  )
}
