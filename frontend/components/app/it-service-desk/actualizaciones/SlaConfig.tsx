'use client'

// Tablero de SLA: tiempos de respuesta y resolución por severidad.
import { useEffect, useState } from 'react'
import { Check, Info } from 'lucide-react'
import { slaSeveridades, ajustarSla } from '@/services/itServiceDeskService'

interface Sev { id: string; code: string; name: string; response_sla_minutes: number; resolution_sla_hours: number
  is_24_7: boolean; rca_mandatory: boolean; ejemplo: { respuesta: string; resolucion: string } }

const COLOR: Record<string, string> = {
  S1: 'bg-red-50 text-red-700 border-red-200', S2: 'bg-orange-50 text-orange-700 border-orange-200',
  S3: 'bg-amber-50 text-amber-800 border-amber-200', S4: 'bg-slate-100 text-slate-600 border-slate-300',
}
const inputCls = 'w-24 h-9 px-3 border border-slate-300 rounded-lg text-sm text-right text-slate-900 bg-white outline-none hover:border-slate-400 focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#1a4fa0]/15'
const durMin = (m: number) => m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`
const durHoras = (h: number, naturales: boolean) => naturales
  ? (h >= 24 ? `${+(h / 24).toFixed(1)} días naturales` : `${h} h naturales`)
  : `${+(h / 10).toFixed(1)} días hábiles`
const fecha = (iso: string) => new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Monterrey', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
const errMsg = (e: any) => { const d = e?.response?.data?.detail; return typeof d === 'string' ? d : 'No se pudo guardar' }

function Fila({ sev, onGuardado }: { sev: Sev; onGuardado: (s: Sev) => void }) {
  const [resp, setResp] = useState(sev.response_sla_minutes)
  const [resol, setResol] = useState(sev.resolution_sla_hours)
  const [nat, setNat] = useState(sev.is_24_7)
  const [rca, setRca] = useState(sev.rca_mandatory)
  const [estado, setEstado] = useState<'' | 'guardando' | 'ok' | string>('')
  const sucio = resp !== sev.response_sla_minutes || resol !== sev.resolution_sla_hours || nat !== sev.is_24_7 || rca !== sev.rca_mandatory
  const guardar = async () => {
    setEstado('guardando')
    try {
      const r = await ajustarSla(sev.code, { response_sla_minutes: resp, resolution_sla_hours: resol, is_24_7: nat, rca_mandatory: rca })
      onGuardado(r.data); setEstado('ok'); setTimeout(() => setEstado(''), 2500)
    } catch (e) { setEstado(errMsg(e)) }
  }
  return (
    <tr className="border-b border-slate-200 last:border-0 align-top">
      <td className="px-4 py-3">
        <span className={`inline-flex px-2 py-0.5 rounded-[5px] border text-[11px] font-bold ${COLOR[sev.code] ?? COLOR.S4}`}>{sev.code}</span>
        <p className="mt-1 text-sm font-semibold text-slate-900">{sev.name}</p>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2"><input type="number" min={1} max={10080} className={inputCls} value={resp} aria-label={`Respuesta ${sev.code} en minutos`}
          onChange={e => setResp(Math.max(0, +e.target.value))} /><span className="text-xs text-slate-500">min</span></div>
        <p className="mt-1 text-[12px] text-slate-500">= {durMin(resp)}</p>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2"><input type="number" min={1} max={2000} className={inputCls} value={resol} aria-label={`Resolución ${sev.code} en horas`}
          onChange={e => setResol(Math.max(0, +e.target.value))} /><span className="text-xs text-slate-500">horas</span></div>
        <p className="mt-1 text-[12px] text-slate-500">= {durHoras(resol, nat)}</p>
      </td>
      <td className="px-4 py-3">
        <div role="group" aria-label={`Corre en ${sev.code}`} className="inline-flex items-center gap-0.5 rounded-lg border border-slate-300 bg-white p-0.5">
          {([[true, 'Naturales'], [false, 'Hábiles']] as [boolean, string][]).map(([v, l]) => (
            <button key={l} type="button" aria-pressed={nat === v} onClick={() => setNat(v)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${nat === v ? 'bg-[#1a4fa0] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>{l}</button>
          ))}
        </div>
      </td>
      <td className="px-4 py-3">
        <label className="inline-flex items-center gap-2 text-[13px] text-slate-700 cursor-pointer mt-1.5">
          <input type="checkbox" className="w-4 h-4 accent-[#1a4fa0]" checked={rca} onChange={e => setRca(e.target.checked)} /> Obligatoria
        </label>
      </td>
      <td className="px-4 py-3 text-[12px] text-slate-600">
        {sucio ? <span className="text-amber-700">Guarda para ver el ejemplo con los tiempos nuevos</span> : (
          <>
            <p>Respuesta: <b className="text-slate-800">{fecha(sev.ejemplo.respuesta)}</b></p>
            <p>Resolución: <b className="text-slate-800">{fecha(sev.ejemplo.resolucion)}</b></p>
          </>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <button type="button" disabled={!sucio || estado === 'guardando' || resp < 1 || resol < 1} onClick={guardar}
          className="h-9 px-4 rounded-lg text-sm font-semibold text-white bg-[#1a4fa0] hover:bg-[#153f82] disabled:opacity-40 transition">
          {estado === 'guardando' ? 'Guardando…' : 'Guardar'}
        </button>
        {estado === 'ok' && <p className="mt-1 text-[12px] text-emerald-700 inline-flex items-center gap-1"><Check size={12} /> Guardado</p>}
        {estado && estado !== 'ok' && estado !== 'guardando' && <p className="mt-1 text-[12px] text-red-600 max-w-50 ml-auto">{estado}</p>}
      </td>
    </tr>
  )
}

export default function SlaConfig() {
  const [sevs, setSevs] = useState<Sev[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { slaSeveridades().then(r => setSevs(r.data)).catch(e => setError(errMsg(e))) }, [])
  if (error) return <p className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</p>
  if (!sevs) return <div className="py-16 flex justify-center"><div className="w-6 h-6 border-2 border-slate-300 border-t-[#1a4fa0] rounded-full animate-spin" /></div>
  return (
    <div className="grid gap-4">
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-blue-50/60 border border-blue-200 text-[13px] text-slate-700">
        <Info size={16} className="text-[#1a4fa0] shrink-0 mt-0.5" />
        <p><b>Horas hábiles:</b> lunes a viernes de 9:00 a 19:00 (10 h, con la comida incluida), sin el 1 de enero, el 16 de septiembre ni el 25 de diciembre.
          <b> Naturales:</b> corren las 24 horas, todos los días. Los cambios aplican a los <b>tickets nuevos</b>; los existentes conservan sus fechas límite.</p>
      </div>
      <div className="bg-white border border-slate-300 rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full min-w-245">
          <thead>
            <tr className="text-left text-xs font-semibold text-slate-500 bg-slate-50 border-b border-slate-300">
              <th className="px-4 py-2.5">Severidad</th><th className="px-4 py-2.5">Respuesta</th><th className="px-4 py-2.5">Resolución</th>
              <th className="px-4 py-2.5">Corre en</th><th className="px-4 py-2.5">Causa raíz</th>
              <th className="px-4 py-2.5">Si se creara un ticket ahora</th><th className="px-4 py-2.5"><span className="sr-only">Guardar</span></th>
            </tr>
          </thead>
          <tbody>
            {sevs.map(s => <Fila key={s.code} sev={s} onGuardado={n => setSevs(prev => prev!.map(x => x.code === n.code ? n : x))} />)}
          </tbody>
        </table>
      </div>
    </div>
  )
}
