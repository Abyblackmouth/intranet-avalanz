'use client'

// Solicitud de acceso: elige el formato del sistema y lo llena por etapas.
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, KeyRound, Lock, Plus, X } from 'lucide-react'
import { accFormatosDisponibles, accFormulario, accVistaPreviaSolicitud } from '@/services/itServiceDeskService'

interface FormatoCard { id: string; nombre: string; sistema: string; movimiento: 'alta' | 'modificacion' }
interface Familia { id: string; nombre: string; empresas: { id: string; nombre: string; razon_social: string }[] }
interface Modulo { id: string; nombre: string; exclusivo_admin: boolean; perfiles: string[]; rutinas: string[] }
interface Formulario {
  formato: { id: string; nombre: string; sistema: string }
  usuario: Record<string, string>
  movimiento: 'alta' | 'modificacion'
  familias: Familia[]; modulos: Modulo[]; previos: Datos | null
}
interface Datos {
  jefe: { nombre: string; correo: string }
  tipo: { motivo: '' | 'alta_nueva' | 'reemplazo' | 'migracion'; auditoria: boolean; usuario_modelo: string; reemplaza_a: string }
  empresas: string[]
  modulos: { modulo_id: string; perfil: string; rutinas: string[] }[]
  vigencia: { tipo: '' | 'permanente' | 'temporal'; hasta: string; observaciones: string }
  acepta: boolean
}
const VACIO: Datos = {
  jefe: { nombre: '', correo: '' },
  tipo: { motivo: '', auditoria: false, usuario_modelo: '', reemplaza_a: '' },
  empresas: [], modulos: [],
  vigencia: { tipo: '', hasta: '', observaciones: '' },
  acepta: false,
}
const ETAPAS = ['Tus datos', 'Tipo de solicitud', 'Empresas', 'Módulos', 'Perfil y rutinas', 'Vigencia', 'Vista previa']
const A4_W = 794, A4_H = 1123
const inputCls = 'w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none hover:border-slate-400 focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#1a4fa0]/15 transition'
const correoValido = (c: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.trim())
const hoy = () => new Date().toISOString().slice(0, 10)

function Opcion({ activo, onClick, children, sub }: { activo: boolean; onClick: () => void; children: React.ReactNode; sub?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={activo}
      className={`text-left rounded-xl border-2 px-4 py-3 transition ${activo ? 'border-[#1a4fa0] bg-blue-50/60' : 'border-slate-200 hover:border-slate-300 bg-white'}`}>
      <span className={`block text-sm font-semibold ${activo ? 'text-[#1a4fa0]' : 'text-slate-800'}`}>{children}</span>
      {sub && <span className="block text-[12.5px] text-slate-500 mt-0.5">{sub}</span>}
    </button>
  )
}

function Casilla({ on, onChange, children, title }: { on: boolean; onChange: () => void; children: React.ReactNode; title?: string }) {
  return (
    <label className="flex items-center gap-2 text-[13.5px] cursor-pointer select-none" title={title}>
      <input type="checkbox" className="w-4 h-4 accent-[#1a4fa0]" checked={on} onChange={onChange} />
      <span className={on ? 'text-slate-900 font-medium' : 'text-slate-700'}>{children}</span>
    </label>
  )
}

function VistaPreviaLlena({ formatoId, datos }: { formatoId: string; datos: Datos }) {
  const [html, setHtml] = useState('')
  const [error, setError] = useState(false)
  const [ancho, setAncho] = useState(600)
  const caja = useRef<HTMLDivElement>(null)
  const marco = useRef<HTMLIFrameElement>(null)
  useEffect(() => {
    accVistaPreviaSolicitud(formatoId, datos).then(r => { setHtml(r.data); setError(false) }).catch(() => setError(true))
  }, [formatoId, datos])
  useEffect(() => {
    const el = caja.current
    if (!el) return
    const ro = new ResizeObserver(() => setAncho(el.clientWidth))
    ro.observe(el); setAncho(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  const escala = Math.min(1, ancho / A4_W)
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-slate-600">Así se verá tu solicitud. Revísala antes de enviarla.</p>
        <button type="button" onClick={() => marco.current?.contentWindow?.print()} disabled={!html}
          className="text-[13px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40">Imprimir</button>
      </div>
      <div ref={caja} className="w-full max-w-[794px] mx-auto overflow-hidden rounded-lg border border-slate-200 shadow-sm bg-white" style={{ height: A4_H * escala }}>
        {error ? <p className="p-8 text-center text-sm text-red-600">No se pudo generar la vista previa.</p> : html ? (
          <iframe ref={marco} title="Vista previa de tu solicitud" srcDoc={html} sandbox="allow-same-origin allow-modals"
            style={{ width: A4_W, height: A4_H, border: 0, transform: `scale(${escala})`, transformOrigin: 'top left' }} />
        ) : <div className="h-full flex items-center justify-center"><div className="w-6 h-6 border-2 border-slate-300 border-t-[#1a4fa0] rounded-full animate-spin" /></div>}
      </div>
    </div>
  )
}

export default function CreateSolicitudAccesoModal({ onClose, onBack, onCreated }: { onClose: () => void; onBack?: () => void; onCreated?: () => void }) {
  const [formatos, setFormatos] = useState<FormatoCard[] | null>(null)
  const [form, setForm] = useState<Formulario | null>(null)
  const [datos, setDatos] = useState<Datos>(VACIO)
  const [etapa, setEtapa] = useState(0)
  const [intento, setIntento] = useState(false)
  const [otro, setOtro] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    accFormatosDisponibles().then(r => setFormatos(r.data ?? [])).catch(() => setError('No se pudieron cargar los formatos'))
  }, [])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const elegirFormato = async (id: string) => {
    setError(null)
    try {
      const r = await accFormulario(id)
      setForm(r.data)
      setDatos(r.data.previos ? { ...VACIO, ...r.data.previos, acepta: false } : VACIO)
      setEtapa(0); setIntento(false)
    } catch { setError('No se pudo abrir el formato') }
  }

  const set = <K extends keyof Datos>(k: K, v: Partial<Datos[K]> | Datos[K]) =>
    setDatos(d => ({ ...d, [k]: Array.isArray(v) || typeof v !== 'object' ? v : { ...(d[k] as object), ...v } }))

  const modSel = (id: string) => datos.modulos.find(m => m.modulo_id === id)
  const toggleModulo = (id: string) => setDatos(d => ({
    ...d, modulos: d.modulos.some(m => m.modulo_id === id) ? d.modulos.filter(m => m.modulo_id !== id) : [...d.modulos, { modulo_id: id, perfil: '', rutinas: [] }],
  }))
  const setModulo = (id: string, cambio: Partial<{ perfil: string; rutinas: string[] }>) =>
    setDatos(d => ({ ...d, modulos: d.modulos.map(m => m.modulo_id === id ? { ...m, ...cambio } : m) }))
  const toggleEmpresa = (id: string) => setDatos(d => ({ ...d, empresas: d.empresas.includes(id) ? d.empresas.filter(x => x !== id) : [...d.empresas, id] }))

  // Qué falta en cada etapa (vacío = puede avanzar)
  const faltantes = useMemo(() => {
    if (!form) return []
    const f: string[] = []
    if (etapa === 0) {
      if (!datos.jefe.nombre.trim()) f.push('el nombre de tu jefe directo')
      if (!correoValido(datos.jefe.correo)) f.push('un correo válido de tu jefe directo')
    }
    if (etapa === 1) {
      if (!datos.tipo.motivo) f.push('el tipo de solicitud')
      if (datos.tipo.motivo === 'reemplazo' && !datos.tipo.reemplaza_a.trim()) f.push('a quién reemplazas')
    }
    if (etapa === 2 && datos.empresas.length === 0) f.push('al menos una empresa')
    if (etapa === 3 && datos.modulos.length === 0) f.push('al menos un módulo')
    if (etapa === 4) {
      for (const m of datos.modulos) {
        const mod = form.modulos.find(x => x.id === m.modulo_id)
        if (!mod) continue
        if (!m.perfil) f.push(`el perfil de ${mod.nombre}`)
        if (m.rutinas.length === 0) f.push(`al menos una rutina de ${mod.nombre}`)
      }
    }
    if (etapa === 5) {
      if (!datos.vigencia.tipo) f.push('la vigencia')
      if (datos.vigencia.tipo === 'temporal' && (!datos.vigencia.hasta || datos.vigencia.hasta <= hoy())) f.push('una fecha de vigencia posterior a hoy')
      if (!datos.acepta) f.push('aceptar la declaración de responsabilidad')
    }
    return f
  }, [form, datos, etapa])

  const siguiente = () => {
    setIntento(true)
    if (faltantes.length) return
    setIntento(false)
    setEtapa(e => Math.min(ETAPAS.length - 1, e + 1))
  }
  const agregarOtra = (id: string) => {
    const v = (otro[id] ?? '').trim().replace(/\|/g, '/')
    const m = modSel(id)
    if (!v || !m || m.rutinas.includes(v)) return
    setModulo(id, { rutinas: [...m.rutinas, v] })
    setOtro(o => ({ ...o, [id]: '' }))
  }

  const titulo = form ? `${form.movimiento === 'modificacion' ? 'Modificación' : 'Alta'} de usuario · ${form.formato.nombre}` : 'Solicitud de acceso'
  const modulosNormales = form?.modulos.filter(m => !m.exclusivo_admin) ?? []
  const modulosAdmin = form?.modulos.filter(m => m.exclusivo_admin) ?? []
  const nombreModulo = (id: string) => form?.modulos.find(m => m.id === id)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-3 sm:p-6">
      <div role="dialog" aria-modal="true" aria-labelledby="acc-titulo" className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-full max-h-[92vh] flex flex-col overflow-hidden">
        <header className="px-5 py-3.5 border-b border-slate-200 flex items-center gap-3">
          {(form || onBack) && (
            <button type="button" onClick={() => (form ? setForm(null) : onBack?.())} className="inline-flex items-center gap-1 text-[13px] text-slate-500 hover:text-slate-800">
              <ArrowLeft size={15} /> Regresar
            </button>
          )}
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <KeyRound size={17} className="text-emerald-600 shrink-0" />
            <h2 id="acc-titulo" className="font-[family-name:var(--font-jakarta)] text-[16px] font-bold text-slate-900 truncate">{titulo}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </header>

        {error && <p role="alert" className="mx-5 mt-3 px-4 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</p>}

        {/* ── Elegir formato ── */}
        {!form && (
          <div className="flex-1 overflow-y-auto p-6">
            <p className="text-sm text-slate-600 mb-4">Elige el sistema al que necesitas acceso. Cada sistema tiene su propio formato.</p>
            {formatos === null ? <div className="py-16 flex justify-center"><div className="w-6 h-6 border-2 border-slate-300 border-t-[#1a4fa0] rounded-full animate-spin" /></div>
              : formatos.length === 0 ? <p className="text-center text-sm text-slate-400 py-16">Todavía no hay formatos de acceso disponibles.</p> : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {formatos.map(f => (
                    <button key={f.id} type="button" onClick={() => elegirFormato(f.id)}
                      className="text-left rounded-2xl border-2 border-slate-200 hover:border-[#1a4fa0] hover:shadow-md transition p-5 bg-white">
                      <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 mb-3"><KeyRound size={20} /></span>
                      <span className="block font-semibold text-slate-900">{f.nombre}</span>
                      <span className="block text-[12.5px] text-slate-500">{f.sistema}</span>
                      <span className={`inline-block mt-3 text-[11.5px] font-semibold px-2 py-0.5 rounded-full ${f.movimiento === 'modificacion' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
                        {f.movimiento === 'modificacion' ? 'Modificación · ya tienes cuenta' : 'Alta de usuario'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
          </div>
        )}

        {/* ── Etapas ── */}
        {form && (
          <div className="flex-1 min-h-0 flex flex-col md:flex-row">
            <nav aria-label="Etapas" className="md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50/70 p-3 flex md:flex-col gap-1 overflow-x-auto">
              {ETAPAS.map((e, i) => (
                <button key={e} type="button" disabled={i > etapa} onClick={() => i < etapa && setEtapa(i)} aria-current={i === etapa ? 'step' : undefined}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-[13px] whitespace-nowrap ${i === etapa ? 'bg-white shadow-sm text-[#1a4fa0] font-semibold' : i < etapa ? 'text-slate-700 hover:bg-white' : 'text-slate-400'}`}>
                  <span className={`w-5 h-5 rounded-full text-[11px] flex items-center justify-center shrink-0 ${i < etapa ? 'bg-emerald-500 text-white' : i === etapa ? 'bg-[#1a4fa0] text-white' : 'bg-slate-200 text-slate-500'}`}>
                    {i < etapa ? <Check size={12} /> : i + 1}
                  </span>
                  {e}
                </button>
              ))}
            </nav>

            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 overflow-y-auto p-5 sm:p-6">
                {form.movimiento === 'modificacion' && etapa < 6 && (
                  <p className="mb-4 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[13px] text-amber-900">Ya tienes cuenta en {form.formato.sistema}: esta solicitud es una <b>modificación</b> y viene llena con tus accesos actuales. Cambia solo lo que necesites.</p>
                )}

                {etapa === 0 && (
                  <div className="grid gap-5">
                    <div>
                      <h3 className="text-[15px] font-bold text-slate-900 mb-1">Tus datos</h3>
                      <p className="text-[13px] text-slate-500 mb-3">Vienen de tu perfil de la intranet. Si alguno está mal, pídele a Recursos Humanos que lo corrija.</p>
                      <dl className="grid sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-x-6 gap-y-2 border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                        {[['Nombre', 'nombre'], ['Matrícula', 'matricula'], ['Puesto', 'puesto'], ['Departamento', 'departamento'], ['Empresa', 'empresa'], ['Grupo', 'grupo'], ['Correo', 'correo']].map(([l, k]) => (
                          <div key={k} className="flex gap-2 text-[12.5px]"><dt className="w-24 shrink-0 text-slate-500">{l}</dt><dd className="font-medium text-slate-900 min-w-0 break-words">{form.usuario[k] || '—'}</dd></div>
                        ))}
                      </dl>
                    </div>
                    <div>
                      <h3 className="text-[15px] font-bold text-slate-900 mb-3">Tu jefe directo</h3>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <label className="grid gap-1.5"><span className="text-[12.5px] font-medium text-slate-600">Nombre completo</span>
                          <input className={inputCls} value={datos.jefe.nombre} onChange={e => set('jefe', { nombre: e.target.value })} autoComplete="off" /></label>
                        <label className="grid gap-1.5"><span className="text-[12.5px] font-medium text-slate-600">Correo</span>
                          <input className={inputCls} type="email" inputMode="email" value={datos.jefe.correo} onChange={e => set('jefe', { correo: e.target.value })} autoComplete="off" /></label>
                      </div>
                      <p className="text-[12px] text-slate-500 mt-2">Tu jefe directo firmará la solicitud para autorizarla.</p>
                    </div>
                  </div>
                )}

                {etapa === 1 && (
                  <div className="grid gap-5">
                    <h3 className="text-[15px] font-bold text-slate-900">¿Qué tipo de solicitud es?</h3>
                    <div className="grid sm:grid-cols-3 gap-3">
                      <Opcion activo={datos.tipo.motivo === 'alta_nueva'} onClick={() => set('tipo', { motivo: 'alta_nueva' })} sub="Nunca has tenido usuario">Alta nueva</Opcion>
                      <Opcion activo={datos.tipo.motivo === 'reemplazo'} onClick={() => set('tipo', { motivo: 'reemplazo' })} sub="Ocupas el lugar de alguien">Reemplazo</Opcion>
                      <Opcion activo={datos.tipo.motivo === 'migracion'} onClick={() => set('tipo', { motivo: 'migracion' })} sub="Vienes de otro sistema o empresa">Migración</Opcion>
                    </div>
                    <Casilla on={datos.tipo.auditoria} onChange={() => set('tipo', { auditoria: !datos.tipo.auditoria })}>Es para auditoría (visor)</Casilla>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <label className="grid gap-1.5"><span className="text-[12.5px] font-medium text-slate-600">Usuario modelo <span className="font-normal text-slate-400">(opcional: alguien con los mismos accesos)</span></span>
                        <input className={inputCls} value={datos.tipo.usuario_modelo} onChange={e => set('tipo', { usuario_modelo: e.target.value })} /></label>
                      {datos.tipo.motivo === 'reemplazo' && (
                        <label className="grid gap-1.5"><span className="text-[12.5px] font-medium text-slate-600">¿A quién reemplazas?</span>
                          <input className={inputCls} value={datos.tipo.reemplaza_a} onChange={e => set('tipo', { reemplaza_a: e.target.value })} /></label>
                      )}
                    </div>
                  </div>
                )}

                {etapa === 2 && (
                  <div className="grid gap-4">
                    <h3 className="text-[15px] font-bold text-slate-900">¿En qué empresas trabajarás en {form.formato.sistema}? <span className="font-normal text-slate-400 text-[13px]">· {datos.empresas.length} elegidas</span></h3>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {form.familias.map(fam => {
                        const todas = fam.empresas.every(e => datos.empresas.includes(e.id))
                        return (
                          <div key={fam.id} className="border border-slate-200 rounded-xl overflow-hidden">
                            <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                              <p className="text-[12px] font-bold uppercase tracking-wide text-slate-600">{fam.nombre}</p>
                              <button type="button" className="text-[12px] text-[#1a4fa0] hover:underline"
                                onClick={() => setDatos(d => ({ ...d, empresas: todas ? d.empresas.filter(x => !fam.empresas.some(e => e.id === x)) : [...new Set([...d.empresas, ...fam.empresas.map(e => e.id)])] }))}>
                                {todas ? 'Quitar todas' : 'Marcar todas'}
                              </button>
                            </div>
                            <div className="p-3 grid gap-1.5">
                              {fam.empresas.map(e => <Casilla key={e.id} on={datos.empresas.includes(e.id)} onChange={() => toggleEmpresa(e.id)} title={e.razon_social}>{e.nombre}</Casilla>)}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {etapa === 3 && (
                  <div className="grid gap-4">
                    <h3 className="text-[15px] font-bold text-slate-900">¿A qué módulos necesitas acceso?</h3>
                    <p className="text-[13px] text-slate-500 -mt-2">Cada módulo se habilita en todas las empresas que elegiste. El nivel de acceso lo define el perfil de tu puesto.</p>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {modulosNormales.map(m => (
                        <Opcion key={m.id} activo={!!modSel(m.id)} onClick={() => toggleModulo(m.id)}>{m.nombre}</Opcion>
                      ))}
                    </div>
                    {modulosAdmin.length > 0 && (
                      <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-3">
                        <p className="text-[12px] font-bold uppercase tracking-wide text-amber-800 flex items-center gap-1.5 mb-2"><Lock size={13} /> Exclusivo del administrador del sistema · requiere autorización de TI</p>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                          {modulosAdmin.map(m => <Opcion key={m.id} activo={!!modSel(m.id)} onClick={() => toggleModulo(m.id)}>{m.nombre}</Opcion>)}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {etapa === 4 && (
                  <div className="grid gap-4">
                    <h3 className="text-[15px] font-bold text-slate-900">Perfil y rutinas de cada módulo</h3>
                    {datos.modulos.map(sel => {
                      const mod = nombreModulo(sel.modulo_id)
                      if (!mod) return null
                      const extra = sel.rutinas.filter(r => !mod.rutinas.includes(r))
                      return (
                        <div key={sel.modulo_id} className={`rounded-xl border p-4 grid gap-3 ${mod.exclusivo_admin ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200'}`}>
                          <div className="flex flex-wrap items-center gap-3">
                            <p className="flex-1 min-w-[160px] text-sm font-bold tracking-wide text-slate-900">{mod.nombre}</p>
                            <label className="flex items-center gap-2 text-[13px] text-slate-600">Perfil / rol
                              <select className={`${inputCls} !w-44 !py-1.5`} value={sel.perfil} onChange={e => setModulo(sel.modulo_id, { perfil: e.target.value })}>
                                <option value="">Elige…</option>
                                {mod.perfiles.map(p => <option key={p} value={p}>{p}</option>)}
                              </select>
                            </label>
                          </div>
                          <div>
                            <p className="text-[12.5px] font-medium text-slate-600 mb-1.5">Rutinas o menús</p>
                            <div className="flex flex-wrap gap-1.5">
                              {mod.rutinas.map(r => {
                                const on = sel.rutinas.includes(r)
                                return (
                                  <button key={r} type="button" aria-pressed={on} onClick={() => setModulo(sel.modulo_id, { rutinas: on ? sel.rutinas.filter(x => x !== r) : [...sel.rutinas, r] })}
                                    className={`px-2.5 py-1 rounded-full border text-[12.5px] transition ${on ? 'bg-[#1a4fa0] border-[#1a4fa0] text-white' : 'bg-white border-slate-300 text-slate-700 hover:border-slate-400'}`}>
                                    {on && <Check size={11} className="inline -mt-0.5 mr-1" />}{r}
                                  </button>
                                )
                              })}
                              {extra.map(r => (
                                <span key={r} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#1a4fa0] text-white text-[12.5px]">
                                  {r}<button type="button" aria-label={`Quitar ${r}`} onClick={() => setModulo(sel.modulo_id, { rutinas: sel.rutinas.filter(x => x !== r) })}><X size={12} /></button>
                                </span>
                              ))}
                            </div>
                            <div className="flex gap-1.5 mt-2 max-w-md">
                              <input className={`${inputCls} !py-1.5`} placeholder={mod.rutinas.length ? 'Otra rutina que no esté en la lista' : 'Escribe la rutina o menú que necesitas'}
                                value={otro[sel.modulo_id] ?? ''} onChange={e => setOtro(o => ({ ...o, [sel.modulo_id]: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarOtra(sel.modulo_id) } }} />
                              <button type="button" onClick={() => agregarOtra(sel.modulo_id)} className="px-3 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50" aria-label="Agregar rutina"><Plus size={15} /></button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {etapa === 5 && (
                  <div className="grid gap-5">
                    <h3 className="text-[15px] font-bold text-slate-900">Vigencia del acceso</h3>
                    <div className="grid sm:grid-cols-2 gap-3 max-w-xl">
                      <Opcion activo={datos.vigencia.tipo === 'permanente'} onClick={() => set('vigencia', { tipo: 'permanente', hasta: '' })} sub="Mientras ocupes tu puesto">Permanente</Opcion>
                      <Opcion activo={datos.vigencia.tipo === 'temporal'} onClick={() => set('vigencia', { tipo: 'temporal' })} sub="Se da de baja en una fecha">Temporal</Opcion>
                    </div>
                    {datos.vigencia.tipo === 'temporal' && (
                      <label className="grid gap-1.5 max-w-xs"><span className="text-[12.5px] font-medium text-slate-600">Vigente hasta</span>
                        <input type="date" className={inputCls} min={hoy()} value={datos.vigencia.hasta} onChange={e => set('vigencia', { hasta: e.target.value })} /></label>
                    )}
                    <label className="grid gap-1.5"><span className="text-[12.5px] font-medium text-slate-600">Observaciones <span className="font-normal text-slate-400">(opcional)</span></span>
                      <textarea rows={2} maxLength={160} className={inputCls} value={datos.vigencia.observaciones} onChange={e => set('vigencia', { observaciones: e.target.value })} /></label>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                      <p className="text-[12.5px] leading-relaxed text-slate-600"><b className="text-slate-800">Declaración de responsabilidad.</b> Las credenciales que se te asignen son personales, confidenciales e intransferibles. Te obligas a no compartirlas, a usar el sistema solo para las funciones de tu puesto, a resguardar la información conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares y a las políticas internas, y a reportar de inmediato cualquier uso indebido. Las operaciones con tu usuario te son atribuibles y pueden ser auditadas.</p>
                      <div className="mt-3"><Casilla on={datos.acepta} onChange={() => set('acepta', !datos.acepta)}>He leído y acepto la declaración de responsabilidad</Casilla></div>
                    </div>
                  </div>
                )}

                {etapa === 6 && <VistaPreviaLlena formatoId={form.formato.id} datos={datos} />}
              </div>

              <footer className="px-5 py-3 border-t border-slate-200 bg-white flex flex-wrap items-center gap-3">
                {intento && faltantes.length > 0 && (
                  <p role="alert" className="w-full sm:w-auto sm:flex-1 text-[13px] text-red-600">Falta: {faltantes.join(', ')}.</p>
                )}
                {!(intento && faltantes.length) && <span className="flex-1 text-[12px] text-slate-400">Etapa {etapa + 1} de {ETAPAS.length}</span>}
                {etapa > 0 && (
                  <button type="button" onClick={() => { setIntento(false); setEtapa(e => e - 1) }}
                    className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">Atrás</button>
                )}
                {etapa < ETAPAS.length - 1 ? (
                  <button type="button" onClick={siguiente} className="px-5 py-2 text-sm font-medium text-white bg-[#1a4fa0] rounded-lg hover:bg-blue-700">
                    {etapa === ETAPAS.length - 2 ? 'Ver vista previa' : 'Siguiente'}
                  </button>
                ) : (
                  <button type="button" disabled title="El envío se conecta en el siguiente paso (ticket y firma)"
                    className="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed">Enviar solicitud</button>
                )}
              </footer>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
