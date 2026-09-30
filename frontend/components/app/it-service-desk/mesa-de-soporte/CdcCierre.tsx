'use client'

import { useCallback, useEffect, useState } from 'react'
import { getCierre, responderEncuesta, saveActaCierreBorrador, generarActaCierre, subirActaCierreFirmada } from '@/services/itServiceDeskService'
import { getSignedUrl } from '@/services/uploadService'
import { Star } from 'lucide-react'
import { Campo, inputCls, btnSec, btnPri } from './CdcArranque'

interface Doc { id: string; version: number; estado: string; datos: any; nombre: string | null; object_key: string | null; bucket: string }
interface Data {
  status: string; puede_acta: boolean; puede_encuesta: boolean; garantia_hasta: string | null
  encuesta: { satisfaccion: number; cumplio: string; a_tiempo: string; comentarios: string } | null
  acta: Doc | null; acta_firmada: Doc | null; alcance_base: string[]; clasificacion: string | null
  indicadores: Record<string, string | number>
}
type Item = { punto: string; entregado: string; nota: string }

const ddmm = (iso: string | null) => { if (!iso) return '—'; const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}` }
const errMsg = (err: any, fb: string) => { const d = err?.response?.data?.detail; return typeof d === 'string' ? d : fb }
async function abrir(doc: Doc | null) {
  if (!doc?.object_key) return
  const r = await getSignedUrl(doc.object_key, doc.bucket || 'dirdoc')
  const url = r.data?.data?.url || r.data?.url
  if (url) window.open(url, '_blank', 'noopener,noreferrer')
}

function Opciones({ valor, onChange, opciones }: { valor: string; onChange: (v: string) => void; opciones: [string, string][] }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {opciones.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={valor === v} onClick={() => onChange(v)}
          className={`rounded-lg px-3.5 py-1.5 text-[13px] font-medium border-[1.5px] ${valor === v ? 'bg-[#1a4fa0] border-[#1a4fa0] text-white' : 'bg-white border-slate-300 text-slate-700 hover:border-[#1a4fa0]'}`}>{l}</button>
      ))}
    </div>
  )
}

function Encuesta({ incidentId, onDone }: { incidentId: string; onDone: () => void }) {
  const [estrellas, setEstrellas] = useState(0)
  const [cumplio, setCumplio] = useState('')
  const [aTiempo, setATiempo] = useState('')
  const [coment, setComent] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listo = estrellas > 0 && cumplio && aTiempo
  return (
    <div className="border border-blue-200 bg-blue-50/40 rounded-xl px-4 py-4">
      <p className="text-[14.5px] font-semibold text-slate-900">¿Cómo te fue con este proyecto?</p>
      <p className="text-[12.5px] text-slate-500 mb-4">Son 4 preguntas y nos ayudan a mejorar. Solo se contesta una vez.</p>
      <div className="grid gap-4">
        <Campo label="Satisfacción general" req>
          <div className="flex gap-1" role="radiogroup" aria-label="Satisfacción de 1 a 5">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} type="button" role="radio" aria-checked={estrellas === n} aria-label={`${n} de 5`} onClick={() => setEstrellas(n)}>
                <Star className={`w-7 h-7 ${n <= estrellas ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
              </button>
            ))}
          </div>
        </Campo>
        <Campo label="¿Se cumplió lo que pediste?" req><Opciones valor={cumplio} onChange={setCumplio} opciones={[['si', 'Sí'], ['parcial', 'Parcialmente'], ['no', 'No']]} /></Campo>
        <Campo label="¿Se entregó a tiempo?" req><Opciones valor={aTiempo} onChange={setATiempo} opciones={[['si', 'Sí'], ['no', 'No']]} /></Campo>
        <Campo label="Comentarios (opcional)"><textarea className={`${inputCls} min-h-[60px]`} value={coment} onChange={e => setComent(e.target.value)} /></Campo>
      </div>
      <div className="flex items-center justify-end gap-3 mt-4">
        {error && <p className="text-[13px] text-red-600 mr-auto">{error}</p>}
        <button type="button" disabled={!listo || busy} className={btnPri} onClick={async () => {
          setBusy(true); setError(null)
          try { await responderEncuesta(incidentId, { satisfaccion: estrellas, cumplio, a_tiempo: aTiempo, comentarios: coment || null }); onDone() }
          catch (e) { setError(errMsg(e, 'No se pudo enviar la encuesta')) } finally { setBusy(false) }
        }}>{busy ? 'Enviando…' : 'Enviar encuesta'}</button>
      </div>
    </div>
  )
}

function ActaForm({ inicial, base, busy, onSave, onGenerate }: { inicial: any; base: string[]; busy: boolean; onSave: (d: any) => void; onGenerate: (d: any) => void }) {
  const [d, setD] = useState({
    resultado: inicial?.resultado ?? '',
    alcance: (inicial?.alcance ?? base.map(p => ({ punto: p, entregado: '', nota: '' }))) as Item[],
    pendientes: inicial?.pendientes ?? '', lecciones_bien: inicial?.lecciones_bien ?? '', lecciones_mejorar: inicial?.lecciones_mejorar ?? '',
  })
  const setItem = (i: number, k: keyof Item, v: string) => setD(x => ({ ...x, alcance: x.alcance.map((a, j) => j === i ? { ...a, [k]: v } : a) }))
  const hint = "Las líneas que empiezan con '-' se vuelven viñetas en el PDF."
  return (
    <div className="mt-4 pt-4 border-t border-slate-100 grid gap-4">
      <Campo label="Resultado del proyecto" req hint={hint}>
        <textarea className={`${inputCls} min-h-[80px]`} placeholder="Qué se logró respecto al objetivo" value={d.resultado} onChange={e => setD({ ...d, resultado: e.target.value })} />
      </Campo>
      <div>
        <p className="text-[13px] font-medium text-slate-700 mb-1.5">Alcance comprometido contra entregado</p>
        <div className="grid gap-2">
          {d.alcance.map((a, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_130px_1fr_auto] gap-2 items-start">
              <input className={inputCls} placeholder="Punto del alcance" value={a.punto} onChange={e => setItem(i, 'punto', e.target.value)} />
              <select className={inputCls} value={a.entregado} onChange={e => setItem(i, 'entregado', e.target.value)} aria-label="¿Se entregó?">
                <option value="">¿Se entregó?</option><option value="si">Sí</option><option value="parcial">Parcial</option><option value="no">No</option>
              </select>
              <input className={inputCls} placeholder="Nota (opcional)" value={a.nota} onChange={e => setItem(i, 'nota', e.target.value)} />
              <button type="button" aria-label="Quitar" className="px-2 h-9 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50" onClick={() => setD(x => ({ ...x, alcance: x.alcance.filter((_, j) => j !== i) }))}>✕</button>
            </div>
          ))}
        </div>
        <button type="button" className="mt-2 text-[13px] font-medium text-[#1a4fa0] hover:underline" onClick={() => setD(x => ({ ...x, alcance: [...x.alcance, { punto: '', entregado: '', nota: '' }] }))}>+ Agregar punto</button>
      </div>
      <Campo label="Pendientes y riesgos abiertos" hint={hint}><textarea className={`${inputCls} min-h-[70px]`} value={d.pendientes} onChange={e => setD({ ...d, pendientes: e.target.value })} /></Campo>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Campo label="Lecciones: qué salió bien" hint={hint}><textarea className={`${inputCls} min-h-[80px]`} value={d.lecciones_bien} onChange={e => setD({ ...d, lecciones_bien: e.target.value })} /></Campo>
        <Campo label="Lecciones: qué mejorar" hint={hint}><textarea className={`${inputCls} min-h-[80px]`} value={d.lecciones_mejorar} onChange={e => setD({ ...d, lecciones_mejorar: e.target.value })} /></Campo>
      </div>
      <p className="text-[12.5px] text-slate-500">Los indicadores, los criterios de la UAT, la encuesta, el índice del expediente y las firmas los agrega el sistema al generar.</p>
      <div className="flex flex-wrap gap-2 justify-end">
        <button type="button" disabled={busy} className={btnSec} onClick={() => onSave(d)}>Guardar borrador</button>
        <button type="button" disabled={busy} className={btnPri} onClick={() => onGenerate(d)}>{busy ? 'Procesando…' : 'Generar PDF'}</button>
      </div>
    </div>
  )
}

export default function CdcCierre({ incidentId, onChanged }: { incidentId: string; onChanged: () => void }) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    try { const r = await getCierre(incidentId); setData(r.data); setError(null) } catch (e) { setError(errMsg(e, 'No se pudo cargar el cierre')) }
  }, [incidentId])
  useEffect(() => { load() }, [load])
  const run = async (fn: () => Promise<any>, ok?: string) => {
    setBusy(true); setMsg(null)
    try { await fn(); await load(); onChanged(); if (ok) setMsg({ ok: true, text: ok }); return true }
    catch (e) { setMsg({ ok: false, text: errMsg(e, 'No se pudo completar la acción') }); return false } finally { setBusy(false) }
  }

  if (error) return <div className="px-5 py-6 text-[13.5px] text-red-600">{error}</div>
  if (!data) return <div className="px-5 py-8 flex justify-center"><div className="w-5 h-5 border-2 border-slate-300 border-t-[#1a4fa0] rounded-full animate-spin" /></div>

  const i = data.indicadores
  // Días de calendario entre hoy (Monterrey) y el fin de la garantía
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' })
  const dias = data.garantia_hasta ? Math.round((Date.parse(data.garantia_hasta) - Date.parse(hoy)) / 86400000) : null
  const generada = data.acta?.estado === 'generado'

  return (
    <div className="px-5 py-5 grid gap-5">
      <div className={`rounded-xl border px-4 py-3 text-[13.5px] ${data.status === 'cerrado' ? 'border-slate-200 bg-slate-50 text-slate-700' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
        {data.status === 'cerrado' ? 'Proyecto cerrado: terminó su periodo de garantía.'
          : <>En garantía hasta el <b>{ddmm(data.garantia_hasta)}</b>{dias !== null && dias >= 0 ? ` (faltan ${dias} días)` : ''}. Al terminar, el proyecto se cierra solo.</>}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[['Entrega', `${i.real}`, `Comprometida: ${i.compromiso}`], ['Desviación', `${i.desviacion_fecha}`, ''],
          ['Horas', `${i.horas_reales}`, `Estimadas: ${i.horas_estimadas} · ${i.desviacion_horas}`],
          ['Calidad', `${i.ciclos_uat} ciclo(s) de UAT`, `${i.reversiones} reversión(es) · ${i.duracion_total}`]].map(([t, v, s]) => (
          <div key={t} className="border border-slate-200 rounded-xl bg-white px-4 py-3">
            <p className="text-[12px] text-slate-500">{t}</p><p className="text-[16px] font-semibold text-slate-900 mt-0.5">{v}</p>
            {s && <p className="text-[12px] text-slate-500 mt-0.5">{s}</p>}
          </div>
        ))}
      </div>

      {data.puede_encuesta && <Encuesta incidentId={incidentId} onDone={() => { load(); onChanged() }} />}
      {data.encuesta && (
        <div className="border border-slate-200 rounded-xl bg-white px-4 py-3 text-[13.5px]">
          <p className="font-semibold text-slate-900 mb-1">Encuesta del solicitante</p>
          <p className="flex items-center gap-1">{[1, 2, 3, 4, 5].map(n => <Star key={n} className={`w-4 h-4 ${n <= data.encuesta!.satisfaccion ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />)}<span className="ml-1 text-slate-600">{data.encuesta.satisfaccion} de 5</span></p>
          <p className="text-slate-600 mt-1">Se cumplió lo pedido: <b>{data.encuesta.cumplio}</b> · A tiempo: <b>{data.encuesta.a_tiempo}</b></p>
          {data.encuesta.comentarios && <p className="text-slate-700 mt-1 whitespace-pre-line">{data.encuesta.comentarios}</p>}
        </div>
      )}
      {!data.encuesta && !data.puede_encuesta && <p className="text-[13px] text-slate-500">El solicitante todavía no contesta la encuesta de satisfacción.</p>}

      <div className="border border-slate-200 rounded-xl px-4 py-3.5 bg-white">
        <div className="flex items-start gap-3">
          <span className={`w-8 h-10 rounded-[5px] flex items-end justify-center pb-1 text-[9px] font-semibold text-white shrink-0 ${generada ? 'bg-red-600' : 'bg-slate-300'}`}>PDF</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[14.5px] font-semibold text-slate-900">Acta de cierre</p>
              <span className={`text-[11.5px] font-semibold px-2.5 py-0.5 rounded-full ${!data.acta ? 'bg-slate-100 text-slate-600' : generada ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {!data.acta ? 'Pendiente' : `${generada ? 'Generada' : 'Borrador'} v${data.acta.version}`}
              </span>
            </div>
            <p className="text-[12.5px] text-slate-500 mt-0.5">{data.clasificacion === 'proyecto' ? 'Alcance del acta de constitución contra lo entregado, indicadores, lecciones y firmas.' : 'Conformidad del cambio: entregables, indicadores y firmas.'}</p>
            {generada && <p className="text-xs text-slate-500 mt-1 font-mono break-all">{data.acta!.nombre}</p>}
          </div>
          <div className="flex gap-2 shrink-0">
            {generada && <button type="button" className={btnSec} onClick={() => abrir(data.acta)}>Ver PDF</button>}
            {data.puede_acta && <button type="button" className={btnSec} onClick={() => setAbierto(!abierto)}>{abierto ? 'Cerrar' : generada ? 'Nueva versión' : data.acta ? 'Continuar' : 'Capturar'}</button>}
          </div>
        </div>
        {abierto && data.puede_acta && (
          <ActaForm inicial={data.acta?.datos} base={data.alcance_base} busy={busy}
            onSave={d => run(() => saveActaCierreBorrador(incidentId, d), 'Borrador guardado.')}
            onGenerate={async d => { if (await run(() => saveActaCierreBorrador(incidentId, d)) && await run(() => generarActaCierre(incidentId), 'Acta de cierre generada.')) setAbierto(false) }} />
        )}
        {generada && data.puede_acta && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-slate-600">Acta firmada:</span>
            {data.acta_firmada ? <button type="button" className="text-[#1a4fa0] hover:underline" onClick={() => abrir(data.acta_firmada)}>{data.acta_firmada.nombre} (v{data.acta_firmada.version})</button> : <span className="text-slate-400">pendiente</span>}
            <label className={`${btnSec} cursor-pointer ml-auto`}>{data.acta_firmada ? 'Subir nueva versión' : 'Subir acta firmada'}
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { const fd = new FormData(); fd.append('file', f); run(() => subirActaCierreFirmada(incidentId, fd), 'Acta firmada en el expediente.') } e.target.value = '' }} />
            </label>
          </div>
        )}
        {msg && <p role="status" className={`mt-3 text-[13px] font-medium ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.text}</p>}
      </div>
    </div>
  )
}
