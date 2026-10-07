'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getUat, saveUatBorrador, subirEvidenciaUat, quitarEvidenciaUat, emitirUat } from '@/services/itServiceDeskService'
import { getSignedUrl } from '@/services/uploadService'
import { Check, X, Paperclip, Lock, FileText } from 'lucide-react'
import { inputCls, btnSec, btnPri } from './CdcArranque'

interface Evid { nombre: string; object_key: string; bucket: string }
interface Crit { id: string; descripcion: string; criterio: string }
interface Res { cumple: boolean | null; comentario: string; evidencias: Evid[] }
interface Ciclo { ciclo: number; resultado: string; fecha: string; registro: string; documento_object_key: string | null }
interface Data {
  status: string; puede_validar: boolean; en_nombre: boolean; ciclo: number; criterios: Crit[]
  borrador: { resultados: Record<string, Res>; comentario_general: string }
  ciclos_anteriores: Ciclo[]; solicitante: { id: string; name: string }; project_manager: { id: string; name: string } | null
}

const TZ = 'America/Monterrey'
const fmt = (iso: string) => new Date(iso).toLocaleString('es-MX', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const errMsg = (err: any, fb: string) => { const d = err?.response?.data?.detail; return typeof d === 'string' ? d : fb }

async function abrir(key: string | null, bucket = 'dirdoc') {
  if (!key) return
  const r = await getSignedUrl(key, bucket)
  const url = r.data?.data?.url || r.data?.url
  if (url) window.open(url, '_blank', 'noopener,noreferrer')
}

export default function CdcUat({ incidentId, onChanged }: { incidentId: string; onChanged: () => void }) {
  const [data, setData] = useState<Data | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [res, setRes] = useState<Record<string, Res>>({})
  const [comentario, setComentario] = useState('')
  const [guardado, setGuardado] = useState<'idle' | 'guardando' | 'guardado' | 'error'>('idle')
  const [subiendo, setSubiendo] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState<'aceptar' | 'regresar' | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const listo = useRef(false)

  const load = useCallback(async () => {
    try {
      const r = await getUat(incidentId)
      const d: Data = r.data
      const inicial: Record<string, Res> = {}
      d.criterios.forEach(c => {
        const b = d.borrador?.resultados?.[c.id]
        inicial[c.id] = { cumple: b?.cumple ?? null, comentario: b?.comentario ?? '', evidencias: b?.evidencias ?? [] }
      })
      listo.current = false
      setRes(inicial); setComentario(d.borrador?.comentario_general ?? ''); setData(d); setLoadError(null)
      setTimeout(() => { listo.current = true }, 0)
    } catch (e) { setLoadError(errMsg(e, 'No se pudo cargar la etapa de pruebas')) }
  }, [incidentId])
  useEffect(() => { load() }, [load])

  const payload = useCallback(() => ({
    resultados: Object.fromEntries(Object.entries(res).map(([id, r]) => [id, { cumple: r.cumple, comentario: r.comentario }])),
    comentario_general: comentario,
  }), [res, comentario])

  // Guardado automático: cada cambio se guarda en el servidor a los 0.8 s
  const clave = JSON.stringify(payload())
  useEffect(() => {
    if (!listo.current || !data?.puede_validar) return
    setGuardado('guardando')
    const t = setTimeout(async () => {
      try { await saveUatBorrador(incidentId, payload()); setGuardado('guardado') } catch { setGuardado('error') }
    }, 800)
    return () => clearTimeout(t)
  }, [clave]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loadError) return <div className="px-5 py-6 text-[13.5px] text-red-600">{loadError}</div>
  if (!data) return <div className="px-5 py-8 flex justify-center"><div className="w-5 h-5 border-2 border-slate-300 border-t-[#1a4fa0] rounded-full animate-spin" /></div>

  const set = (id: string, cambio: Partial<Res>) => setRes(r => ({ ...r, [id]: { ...r[id], ...cambio } }))
  const subir = async (id: string, file: File) => {
    setSubiendo(id); setMsg(null)
    try {
      const fd = new FormData(); fd.append('criterio_id', id); fd.append('file', file)
      const r = await subirEvidenciaUat(incidentId, fd)
      set(id, { evidencias: r.data.evidencias })
    } catch (e) { setMsg({ ok: false, text: errMsg(e, `No se pudo subir ${file.name}`) }) }
    finally { setSubiendo(null) }
  }
  const quitar = async (id: string, key: string) => {
    try { const r = await quitarEvidenciaUat(incidentId, id, key); set(id, { evidencias: r.data.evidencias }) }
    catch (e) { setMsg({ ok: false, text: errMsg(e, 'No se pudo quitar la evidencia') }) }
  }

  const faltan: string[] = []
  data.criterios.forEach(c => {
    const r = res[c.id]
    if (!r || r.cumple === null) faltan.push(`${c.id}: marca si cumple`)
    else if (!r.evidencias.length) faltan.push(`${c.id}: falta evidencia`)
    else if (r.cumple === false && !r.comentario.trim()) faltan.push(`${c.id}: explica por qué no cumple`)
  })
  const todos = data.criterios.every(c => res[c.id]?.cumple === true)
  const accion: 'aceptar' | 'regresar' = todos ? 'aceptar' : 'regresar'

  const emitir = async () => {
    setBusy(true); setMsg(null)
    try {
      await saveUatBorrador(incidentId, payload())
      await emitirUat(incidentId, accion)
      setConfirmando(null); await load(); onChanged()
    } catch (e) { setMsg({ ok: false, text: errMsg(e, 'No se pudo registrar el resultado') }); setConfirmando(null) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <div className="px-5 py-5">
        {data.puede_validar && data.en_nombre && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-4 text-[13.5px] text-amber-900">
            Estás registrando la UAT <b>en nombre de {data.solicitante.name}</b>. Así quedará en la bitácora y en el acta de pruebas.
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <p className="text-[13.5px] text-slate-600">Ciclo de pruebas <b className="text-slate-900">{data.ciclo}</b> · valida <b className="text-slate-900">{data.solicitante.name}</b></p>
          {data.puede_validar && (
            <span className={`text-[12px] ${guardado === 'error' ? 'text-red-600' : 'text-slate-500'}`}>
              {guardado === 'guardando' ? 'Guardando…' : guardado === 'guardado' ? 'Guardado' : guardado === 'error' ? 'No se pudo guardar, revisa tu conexión' : ''}
            </span>
          )}
        </div>

        {!data.puede_validar && (
          <p className="text-[13px] text-slate-500 flex items-center gap-1.5 mb-4"><Lock className="w-3.5 h-3.5" />Esta etapa la realiza {data.solicitante.name}. Te avisaremos con el resultado.</p>
        )}

        {/* Criterios */}
        <div className="grid gap-3">
          {data.criterios.map(c => {
            const r = res[c.id] ?? { cumple: null, comentario: '', evidencias: [] }
            const borde = r.cumple === true ? 'border-emerald-300 bg-emerald-50/30' : r.cumple === false ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 bg-white'
            return (
              <div key={c.id} className={`border-[1.5px] rounded-xl px-4 py-3.5 transition ${borde}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 max-w-[62ch]">
                    <p className="text-[13px]"><span className="font-mono text-slate-500">{c.id}</span> · <span className="font-semibold text-slate-900">{c.descripcion}</span></p>
                    <p className="text-[13px] text-slate-600 mt-1"><span className="text-slate-400">Criterio:</span> {c.criterio || '—'}</p>
                  </div>
                  {data.puede_validar ? (
                    <div className="flex gap-2" role="radiogroup" aria-label={`Resultado de ${c.id}`}>
                      <button type="button" role="radio" aria-checked={r.cumple === true} onClick={() => set(c.id, { cumple: true })}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium border-[1.5px] ${r.cumple === true ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-emerald-600 text-emerald-700 hover:bg-emerald-50'}`}>
                        <Check className="w-3.5 h-3.5" />Cumple
                      </button>
                      <button type="button" role="radio" aria-checked={r.cumple === false} onClick={() => set(c.id, { cumple: false })}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium border-[1.5px] ${r.cumple === false ? 'bg-amber-600 border-amber-600 text-white' : 'bg-white border-amber-600 text-amber-700 hover:bg-amber-50'}`}>
                        <X className="w-3.5 h-3.5" />No cumple
                      </button>
                    </div>
                  ) : r.cumple !== null && (
                    <span className={`text-[12px] font-semibold px-2.5 py-0.5 rounded-full ${r.cumple ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{r.cumple ? 'Cumple' : 'No cumple'}</span>
                  )}
                </div>

                {data.puede_validar && (
                  <textarea className={`${inputCls} min-h-15 mt-3 ${r.cumple === false && !r.comentario.trim() ? 'border-amber-400' : ''}`}
                    placeholder={r.cumple === false ? 'Obligatorio: qué falla, qué esperabas y qué pasó' : 'Comentario (opcional)'}
                    value={r.comentario} onChange={e => set(c.id, { comentario: e.target.value })} />
                )}

                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {r.evidencias.map(e => (
                    <span key={e.object_key} className="inline-flex items-center gap-1.5 text-[12.5px] border border-slate-200 rounded-lg px-2 py-1 bg-white">
                      <button type="button" className="text-[#1a4fa0] hover:underline inline-flex items-center gap-1" onClick={() => abrir(e.object_key, e.bucket)}><Paperclip className="w-3 h-3" />{e.nombre}</button>
                      {data.puede_validar && <button type="button" aria-label={`Quitar ${e.nombre}`} onClick={() => quitar(c.id, e.object_key)}><X className="w-3 h-3 text-slate-400 hover:text-red-600" /></button>}
                    </span>
                  ))}
                  {data.puede_validar && (
                    <label className={`${btnSec} cursor-pointer inline-flex items-center gap-1.5 ${subiendo === c.id ? 'opacity-50 pointer-events-none' : ''}`}>
                      <Paperclip className="w-3.5 h-3.5" />{subiendo === c.id ? 'Subiendo…' : r.evidencias.length ? 'Agregar evidencia' : 'Subir evidencia (obligatoria)'}
                      <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) subir(c.id, f); e.target.value = '' }} />
                    </label>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {data.puede_validar && (
          <div className="mt-4">
            <label className="block text-[13px] font-medium text-slate-700 mb-1.5">Comentarios generales <span className="font-normal text-slate-400">(opcional)</span></label>
            <textarea className={`${inputCls} min-h-15`} value={comentario} onChange={e => setComentario(e.target.value)} />
          </div>
        )}

        {/* Ciclos anteriores */}
        {data.ciclos_anteriores.length > 0 && (
          <div className="mt-6">
            <p className="text-[13px] font-medium text-slate-500 mb-2">Ciclos anteriores</p>
            <ul className="grid gap-1.5">
              {data.ciclos_anteriores.map(x => (
                <li key={x.ciclo} className="flex flex-wrap items-center gap-2 text-[13px] border border-slate-200 rounded-lg px-3 py-2 bg-white">
                  <span className="font-medium text-slate-800">Ciclo {x.ciclo}</span>
                  <span className={`text-[11.5px] font-semibold px-2 py-0.5 rounded-full ${x.resultado === 'aceptado' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{x.resultado === 'aceptado' ? 'Aceptado' : 'Regresado a desarrollo'}</span>
                  <span className="text-slate-500">{x.registro} · {fmt(x.fecha)}</span>
                  {x.documento_object_key && <button type="button" className="ml-auto text-[#1a4fa0] hover:underline inline-flex items-center gap-1" onClick={() => abrir(x.documento_object_key)}><FileText className="w-3.5 h-3.5" />Acta</button>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {msg && <p role="status" className={`mt-4 text-[13px] font-medium ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.text}</p>}
      </div>

      {data.puede_validar && (
        <footer className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          {confirmando ? (
            <>
              <p className="text-[13.5px] text-slate-700">{confirmando === 'aceptar'
                ? <>¿Aceptar las pruebas? El proyecto pasa a <b>Paso a producción</b> y se genera el acta de pruebas.</>
                : <>¿Regresar a desarrollo? Se genera el acta de pruebas del ciclo {data.ciclo} y el proyecto regresa con tus observaciones.</>}</p>
              <div className="flex gap-2">
                <button type="button" disabled={busy} className="px-4 py-2 text-sm text-slate-600" onClick={() => setConfirmando(null)}>Volver</button>
                <button type="button" disabled={busy} onClick={emitir}
                  className={confirmando === 'aceptar' ? btnPri : 'bg-amber-600 text-white rounded-lg px-3.5 py-1.5 text-[13px] font-medium hover:bg-amber-700 disabled:opacity-40'}>
                  {busy ? 'Registrando…' : confirmando === 'aceptar' ? 'Sí, aceptar' : 'Sí, regresar a desarrollo'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className={`text-[12.5px] max-w-[56ch] ${faltan.length ? 'text-amber-700' : 'text-slate-500'}`}>
                {faltan.length ? `Falta: ${faltan.slice(0, 3).join(' · ')}${faltan.length > 3 ? ` y ${faltan.length - 3} más` : ''}` : todos ? 'Todos los criterios cumplen.' : 'Hay criterios que no cumplen: el proyecto regresará a desarrollo.'}
              </p>
              <button type="button" disabled={!!faltan.length} onClick={() => setConfirmando(accion)}
                className={accion === 'aceptar' ? btnPri : 'bg-amber-600 text-white rounded-lg px-3.5 py-1.5 text-[13px] font-medium hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed'}>
                {accion === 'aceptar' ? 'Aceptar pruebas' : 'Regresar a desarrollo'}
              </button>
            </>
          )}
        </footer>
      )}
    </div>
  )
}
