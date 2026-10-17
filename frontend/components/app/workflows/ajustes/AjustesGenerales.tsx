'use client'

// Ajustes del módulo (clave/valor). Se dibuja a partir del catálogo que manda el backend,
// igual que en IT Service Desk: un ajuste nuevo es una entrada más allá, no código aquí.
import { useCallback, useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { Ajuste, CambioAjuste, getAjustes, getAjustesHistorial, updateAjuste } from '@/services/workflowsService'
import { errMsg, fmtFecha, Interruptor, inputCls } from '@/components/app/workflows/compartidos'

function Control({ a, onSave }: { a: Ajuste; onSave: (valor: string | number | boolean) => Promise<boolean> }) {
  const [v, setV] = useState(a.valor)
  useEffect(() => { setV(a.valor) }, [a.valor])
  if (a.tipo === 'bool') {
    const on = a.valor === 'true'
    return <Interruptor on={on} onChange={() => onSave(!on)} label={a.label} />
  }
  if (a.tipo === 'int' || a.tipo === 'texto') {
    const guardar = () => { if (v !== a.valor) onSave(a.tipo === 'int' ? Number(v) : v).then(ok => { if (!ok) setV(a.valor) }) }
    return (
      <div className="flex items-center gap-2">
        <input type={a.tipo === 'int' ? 'number' : 'text'} inputMode={a.tipo === 'int' ? 'numeric' : undefined} min={a.min} max={a.max} maxLength={a.max_len}
          value={v} aria-label={a.label} onChange={e => setV(e.target.value)} onBlur={guardar}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className={`${inputCls} w-28 ${a.tipo === 'int' ? 'text-right' : 'uppercase'}`} />
        {a.min !== undefined && <span className="text-[12px] text-slate-400">de {a.min} a {a.max}</span>}
      </div>
    )
  }
  return (
    <div role="radiogroup" aria-label={a.label} className="inline-flex rounded-lg border border-slate-300 bg-white overflow-hidden text-sm max-md:flex-wrap">
      {(a.opciones ?? []).map(([val, l], i) => (
        <button key={val} type="button" role="radio" aria-checked={a.valor === val} onClick={() => a.valor !== val && onSave(val)}
          className={`px-3.5 py-1.5 ${i ? 'border-l border-slate-200' : ''} ${a.valor === val ? 'bg-[#1a4fa0] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{l}</button>
      ))}
    </div>
  )
}

export default function AjustesGenerales() {
  const [ajustes, setAjustes] = useState<Ajuste[]>([])
  const [historial, setHistorial] = useState<CambioAjuste[]>([])
  const [loading, setLoading] = useState(true)
  const [estado, setEstado] = useState<Record<string, { ok: boolean; text: string }>>({})

  const cargar = useCallback(async () => {
    try {
      const [a, h] = await Promise.all([getAjustes(), getAjustesHistorial()])
      setAjustes(a.data ?? []); setHistorial(h.data ?? [])
    } catch { /* la página ya validó el permiso */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const guardar = async (a: Ajuste, valor: string | number | boolean) => {
    setEstado(s => ({ ...s, [a.key]: { ok: true, text: 'Guardando…' } }))
    try {
      const r = await updateAjuste(a.key, valor)
      setAjustes(prev => prev.map(x => x.key === a.key ? { ...x, valor: r.data.valor } : x))
      setEstado(s => ({ ...s, [a.key]: { ok: true, text: r.data.cambio ? 'Guardado' : 'Sin cambios' } }))
      getAjustesHistorial().then(h => setHistorial(h.data ?? [])).catch(() => {})
      setTimeout(() => setEstado(s => { const n = { ...s }; delete n[a.key]; return n }), 2500)
      return true
    } catch (e) {
      setEstado(s => ({ ...s, [a.key]: { ok: false, text: errMsg(e, 'No se pudo guardar') } }))
      return false
    }
  }

  const etiquetaValor = (key: string, v: string | null) => {
    const a = ajustes.find(x => x.key === key)
    if (v === null) return '—'
    if (a?.tipo === 'bool') return v === 'true' ? 'Activo' : 'Inactivo'
    if (a?.tipo === 'opcion') return a.opciones?.find(o => o[0] === v)?.[1] ?? v
    return v
  }

  if (loading) return <div className="py-16 flex justify-center"><div className="w-5 h-5 border-2 border-slate-300 border-t-[#1a4fa0] rounded-full animate-spin" /></div>
  const grupos = Array.from(new Set(ajustes.map(a => a.grupo)))

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <div className="grid min-w-0 gap-5">
        {grupos.map(g => (
          <section key={g} className="bg-white border border-slate-300 rounded-2xl shadow-sm">
            <h2 className="px-5 py-3.5 border-b border-slate-200 font-[family-name:var(--font-jakarta)] text-[15px] font-bold text-slate-900">{g}</h2>
            <ul>
              {ajustes.filter(a => a.grupo === g).map(a => (
                <li key={a.key} className="px-5 py-4 border-b border-slate-200 last:border-0 flex flex-wrap items-center gap-x-6 gap-y-3">
                  <div className="flex-1 min-w-65">
                    <p className="text-[14px] font-semibold text-slate-800">{a.label}</p>
                    <p className="text-[13px] text-slate-500 mt-0.5 max-w-[62ch]">{a.descripcion}</p>
                    <p className="text-[11px] font-mono text-slate-400 mt-1">{a.key}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Control a={a} onSave={v => guardar(a, v)} />
                    {estado[a.key] && (
                      <span role="status" className={`text-[12px] inline-flex items-center gap-1 ${estado[a.key].ok ? 'text-emerald-700' : 'text-red-600'}`}>
                        {estado[a.key].ok && estado[a.key].text === 'Guardado' && <Check size={12} />}{estado[a.key].text}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <section className="bg-white border border-slate-300 rounded-2xl shadow-sm xl:sticky xl:top-0 xl:flex xl:max-h-[calc(100dvh-9rem)] xl:flex-col">
        <h2 className="px-5 py-3.5 border-b border-slate-200 font-[family-name:var(--font-jakarta)] text-[15px] font-bold text-slate-900">Historial de cambios</h2>
        <p className="px-5 pt-2 text-[12px] text-slate-400">Incluye ajustes, conexiones y usuarios de plataformas. Los secretos nunca aparecen aquí.</p>
        {historial.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-slate-400">Todavía no hay cambios registrados.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-200 xl:min-h-0 xl:overflow-y-auto">
            {historial.map((c, i) => (
              <li key={i} className="px-5 py-2.5 text-[13px] flex flex-wrap items-baseline gap-x-2">
                <span className="font-semibold text-slate-800">{c.label}</span>
                <span className="text-slate-500 break-words">{c.anterior !== null ? <>{etiquetaValor(c.key, c.anterior)} → </> : null}<b className="text-slate-800">{etiquetaValor(c.key, c.nuevo)}</b></span>
                <span className="ml-auto text-[12px] text-slate-400">{c.usuario} · {fmtFecha(c.fecha)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
