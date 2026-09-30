'use client'

// Configuración de los formatos de solicitud de acceso (pestaña de Actualizaciones).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Plus, X, Search, Lock } from 'lucide-react'
import {
  accFormatos, accFormato, accActualizarFormato, accGuardarEmpresas, accCrearModulo, accActualizarModulo, accOrdenarModulos,
  accCrearPerfil, accRenombrarPerfil, accQuitarPerfil, accCrearRutina, accActualizarRutina, accQuitarRutina, accBuscarUsuarios,
} from '@/services/itServiceDeskService'

interface Empresa { id: string; nombre_comercial: string; razon_social: string; rfc: string | null; operando: boolean; grupo: string; familia: { id: string; nombre: string; clave: string } | null }
interface Modulo { id: string; nombre: string; exclusivo_admin: boolean; orden: number; activo: boolean; perfiles: { id: string; nombre: string }[]; rutinas: { id: string; nombre: string; activo: boolean }[] }
interface Detalle {
  formato: { id: string; clave: string; nombre: string; sistema: string; activo: boolean; severity_id: string | null; admin_user_id: string | null; admin_nombre: string | null }
  severidades: { id: string; code: string; name: string }[]
  empresas_elegidas: string[]; catalogo_empresas: Empresa[]; modulos: Modulo[]
}

const inputCls = 'bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-800 outline-none hover:border-slate-400 focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#1a4fa0]/15 transition'
const errMsg = (e: any, fb: string) => { const d = e?.response?.data?.detail; return typeof d === 'string' ? d : fb }

function Seccion({ titulo, sub, children, accion }: { titulo: string; sub?: string; children: React.ReactNode; accion?: React.ReactNode }) {
  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm">
      <header className="px-5 py-3.5 border-b border-slate-100 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-[family-name:var(--font-jakarta)] text-[15px] font-bold text-slate-900">{titulo}</h3>
          {sub && <p className="text-[12.5px] text-slate-500 mt-0.5">{sub}</p>}
        </div>
        {accion}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}

function Interruptor({ on, onChange, label, disabled }: { on: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onChange} disabled={disabled}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}>
      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
    </button>
  )
}

function BuscadorUsuario({ valor, onElegir }: { valor: string | null; onElegir: (u: { id: string; name: string } | null) => void }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<{ id: string; name: string; email?: string }[]>([])
  const [abierto, setAbierto] = useState(false)
  const t = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (t.current) clearTimeout(t.current)
    if (q.trim().length < 2) { setRes([]); return }
    t.current = setTimeout(async () => {
      try {
        const r = await accBuscarUsuarios(q.trim())
        const lista = Array.isArray(r.data) ? r.data : (r.data?.data ?? [])
        setRes(lista.map((u: any) => ({ id: u.id, name: u.name ?? u.full_name, email: u.email })))
        setAbierto(true)
      } catch { setRes([]) }
    }, 250)
  }, [q])
  if (valor) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-800">{valor}</span>
        <button type="button" onClick={() => onElegir(null)} className="text-[12.5px] text-[#1a4fa0] hover:underline">Cambiar</button>
      </div>
    )
  }
  return (
    <div className="relative w-full max-w-sm">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input className={`${inputCls} w-full pl-8`} placeholder="Buscar por nombre o correo" value={q} onChange={e => setQ(e.target.value)} onFocus={() => res.length && setAbierto(true)} />
      {abierto && res.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg py-1 max-h-60 overflow-y-auto">
          {res.map(u => (
            <li key={u.id}>
              <button type="button" onClick={() => { onElegir(u); setQ(''); setAbierto(false) }} className="w-full text-left px-3 py-2 hover:bg-slate-50">
                <span className="block text-sm text-slate-800">{u.name}</span>
                {u.email && <span className="block text-[12px] text-slate-500">{u.email}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function AgregarInline({ placeholder, onAgregar }: { placeholder: string; onAgregar: (v: string) => Promise<boolean> }) {
  const [v, setV] = useState('')
  const enviar = async () => { if (v.trim() && await onAgregar(v.trim())) setV('') }
  return (
    <div className="flex gap-1.5">
      <input className={`${inputCls} !py-1 !text-[13px] flex-1 min-w-0`} placeholder={placeholder} value={v} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') enviar() }} />
      <button type="button" onClick={enviar} disabled={!v.trim()} aria-label="Agregar" className="px-2 rounded-lg text-[#1a4fa0] hover:bg-blue-50 disabled:opacity-40"><Plus size={16} /></button>
    </div>
  )
}

function Chip({ texto, onQuitar, onRenombrar, apagado, onToggle }: { texto: string; onQuitar: () => void; onRenombrar?: (v: string) => void; apagado?: boolean; onToggle?: () => void }) {
  const [editando, setEditando] = useState(false)
  const [v, setV] = useState(texto)
  if (editando && onRenombrar) {
    return (
      <input autoFocus className={`${inputCls} !py-0.5 !px-2 !text-[12.5px] w-40`} value={v} onChange={e => setV(e.target.value)}
        onBlur={() => { setEditando(false); if (v.trim() && v.trim() !== texto) onRenombrar(v.trim()) }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setV(texto); setEditando(false) } }} />
    )
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[12.5px] ${apagado ? 'border-slate-200 text-slate-400 line-through' : 'border-slate-300 text-slate-700 bg-white'}`}>
      <button type="button" onClick={() => onRenombrar ? setEditando(true) : onToggle?.()} title={onRenombrar ? 'Renombrar' : apagado ? 'Activar' : 'Desactivar'}>{texto}</button>
      {onToggle && onRenombrar && <button type="button" onClick={onToggle} className="text-[10.5px] text-slate-400 hover:text-slate-700 ml-0.5" title={apagado ? 'Activar' : 'Desactivar'}>{apagado ? 'activar' : 'ocultar'}</button>}
      <button type="button" onClick={onQuitar} aria-label={`Quitar ${texto}`} className="text-slate-400 hover:text-red-600"><X size={12} /></button>
    </span>
  )
}

export default function ControlAccesosConfig() {
  const [formatos, setFormatos] = useState<{ id: string; nombre: string; sistema: string; activo: boolean }[]>([])
  const [formatoId, setFormatoId] = useState<string | null>(null)
  const [d, setD] = useState<Detalle | null>(null)
  const [elegidas, setElegidas] = useState<Set<string>>(new Set())
  const [empresasSucias, setEmpresasSucias] = useState(false)
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const aviso = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3000) }

  useEffect(() => {
    accFormatos().then(r => { setFormatos(r.data ?? []); if (r.data?.[0]) setFormatoId(r.data[0].id) }).catch(e => aviso(false, errMsg(e, 'No se pudieron cargar los formatos')))
  }, [])
  const cargar = useCallback(async () => {
    if (!formatoId) return
    const r = await accFormato(formatoId)
    setD(r.data); setElegidas(new Set(r.data.empresas_elegidas)); setEmpresasSucias(false)
  }, [formatoId])
  useEffect(() => { cargar().catch(e => aviso(false, errMsg(e, 'No se pudo cargar el formato'))) }, [cargar])

  const run = async (fn: () => Promise<any>, ok?: string) => {
    setBusy(true)
    try { await fn(); await cargar(); if (ok) aviso(true, ok); return true }
    catch (e) { aviso(false, errMsg(e, 'No se pudo guardar')); return false }
    finally { setBusy(false) }
  }

  // Empresas agrupadas por familia (sin familia al final)
  const porFamilia = useMemo(() => {
    const m = new Map<string, Empresa[]>()
    for (const c of d?.catalogo_empresas ?? []) {
      const k = c.familia?.nombre ?? 'Sin familia'
      m.set(k, [...(m.get(k) ?? []), c])
    }
    return [...m.entries()].sort(([a], [b]) => (a === 'Sin familia' ? 1 : b === 'Sin familia' ? -1 : a.localeCompare(b)))
  }, [d])

  if (!formatoId && formatos.length === 0) return <p className="text-sm text-slate-500 py-10 text-center">No hay formatos configurados.</p>
  if (!d) return <div className="py-16 flex justify-center"><div className="w-5 h-5 border-2 border-slate-300 border-t-[#1a4fa0] rounded-full animate-spin" /></div>

  const f = d.formato
  const toggleEmpresa = (id: string) => { setElegidas(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n }); setEmpresasSucias(true) }
  const guardarEmpresas = () => {
    // Orden: por familia y luego por nombre corto, igual que en el formato
    const orden = porFamilia.flatMap(([, lista]) => lista.map(c => c.id)).filter(id => elegidas.has(id))
    run(() => accGuardarEmpresas(f.id, orden), 'Empresas guardadas')
  }
  const mover = (i: number, dir: -1 | 1) => {
    const ids = d.modulos.map(m => m.id)
    const j = i + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    run(() => accOrdenarModulos(f.id, ids))
  }
  const toggleAbierto = (id: string) => setAbiertos(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const modulosActivos = d.modulos.filter(m => m.activo)
  const empresasPreview = porFamilia.map(([fam, lista]) => [fam, lista.filter(c => elegidas.has(c.id))] as const).filter(([, l]) => l.length)

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
      <div className="grid gap-5 min-w-0">
        {formatos.length > 1 && (
          <select className={inputCls} value={formatoId ?? ''} onChange={e => setFormatoId(e.target.value)} aria-label="Formato">
            {formatos.map(x => <option key={x.id} value={x.id}>{x.nombre} · {x.sistema}</option>)}
          </select>
        )}
        {msg && <p role="status" className={`px-4 py-2 rounded-lg text-sm border ${msg.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg.text}</p>}

        {/* 1. Datos del formato */}
        <Seccion titulo="Datos del formato" sub={`Sistema: ${f.sistema} · clave interna: ${f.clave}`}
          accion={<label className="flex items-center gap-2 text-[13px] text-slate-600">Activo<Interruptor on={f.activo} label="Formato activo" onChange={() => run(() => accActualizarFormato(f.id, { activo: !f.activo }))} /></label>}>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="grid gap-1.5">
              <span className="text-[12.5px] font-medium text-slate-600">Nombre del formato</span>
              <input className={inputCls} defaultValue={f.nombre} key={f.nombre}
                onBlur={e => e.target.value.trim() !== f.nombre && run(() => accActualizarFormato(f.id, { nombre: e.target.value }), 'Nombre guardado')} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[12.5px] font-medium text-slate-600">Severidad de los tickets</span>
              <select className={inputCls} value={f.severity_id ?? ''} onChange={e => run(() => accActualizarFormato(f.id, { severity_id: e.target.value }), 'Severidad guardada')}>
                {!f.severity_id && <option value="">Elige una severidad</option>}
                {d.severidades.map(s => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
              </select>
            </label>
            <div className="grid gap-1.5 sm:col-span-2">
              <span className="text-[12.5px] font-medium text-slate-600">Administrador del sistema <span className="font-normal text-slate-400">· recibe la solicitud y firma al final</span></span>
              <BuscadorUsuario valor={f.admin_nombre}
                onElegir={u => run(() => accActualizarFormato(f.id, { admin_user_id: u?.id ?? '', admin_nombre: u?.name ?? '' }), u ? 'Administrador guardado' : undefined)} />
            </div>
          </div>
        </Seccion>

        {/* 2. Empresas */}
        <Seccion titulo="Empresas" sub="Solo se muestran las que están operando, agrupadas por su familia. El nombre y la familia se editan en Administración → Empresas."
          accion={<button type="button" onClick={guardarEmpresas} disabled={!empresasSucias || busy}
            className="px-3.5 py-1.5 rounded-lg text-sm font-medium text-white bg-[#1a4fa0] hover:bg-blue-700 disabled:opacity-40">Guardar empresas ({elegidas.size})</button>}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {porFamilia.map(([fam, lista]) => (
              <div key={fam} className="border border-slate-200 rounded-xl overflow-hidden">
                <p className={`px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-wide border-b border-slate-200 ${fam === 'Sin familia' ? 'bg-amber-50 text-amber-800' : 'bg-slate-50 text-slate-600'}`}>{fam}</p>
                <ul className="px-3 py-2 grid gap-1">
                  {lista.map(c => (
                    <li key={c.id}>
                      <label className="flex items-center gap-2 text-[13px] cursor-pointer" title={c.razon_social}>
                        <input type="checkbox" className="accent-[#1a4fa0]" checked={elegidas.has(c.id)} onChange={() => toggleEmpresa(c.id)} />
                        <span className={c.operando ? 'text-slate-800' : 'text-slate-400 line-through'}>{c.nombre_comercial}</span>
                        {!c.operando && <span className="text-[10.5px] font-semibold text-red-600">No opera</span>}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {empresasSucias && <p className="mt-3 text-[12.5px] text-amber-700">Tienes cambios sin guardar en las empresas.</p>}
        </Seccion>

        {/* 3. Módulos */}
        <Seccion titulo="Módulos" sub="Orden, perfiles del select de Perfil / rol y rutinas de la lista. Clic en un perfil o una rutina para renombrarla.">
          <ul className="grid gap-2">
            {d.modulos.map((m, i) => {
              const abierto = abiertos.has(m.id)
              return (
                <li key={m.id} className={`border rounded-xl ${m.exclusivo_admin ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200'} ${m.activo ? '' : 'opacity-50'}`}>
                  <div className="flex items-center gap-2 px-3 py-2">
                    <div className="flex flex-col">
                      <button type="button" onClick={() => mover(i, -1)} disabled={i === 0 || busy} aria-label="Subir" className="text-slate-400 hover:text-slate-700 disabled:opacity-20"><ChevronUp size={14} /></button>
                      <button type="button" onClick={() => mover(i, 1)} disabled={i === d.modulos.length - 1 || busy} aria-label="Bajar" className="text-slate-400 hover:text-slate-700 disabled:opacity-20"><ChevronDown size={14} /></button>
                    </div>
                    <input className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-slate-900 tracking-wide outline-none border-b border-transparent hover:border-slate-300 focus:border-[#1a4fa0]"
                      defaultValue={m.nombre} key={m.nombre} aria-label="Nombre del módulo"
                      onBlur={e => e.target.value.trim() && e.target.value.trim().toUpperCase() !== m.nombre && run(() => accActualizarModulo(m.id, { nombre: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
                    <span className="text-[12px] text-slate-500 hidden sm:inline">{m.perfiles.length} perfiles · {m.rutinas.filter(r => r.activo).length} rutinas</span>
                    <label className="flex items-center gap-1.5 text-[12px] text-amber-800" title="Exclusivo del administrador del sistema">
                      <Lock size={12} /><Interruptor on={m.exclusivo_admin} label="Exclusivo del administrador" onChange={() => run(() => accActualizarModulo(m.id, { exclusivo_admin: !m.exclusivo_admin }))} />
                    </label>
                    <Interruptor on={m.activo} label="Módulo activo" onChange={() => run(() => accActualizarModulo(m.id, { activo: !m.activo }))} />
                    <button type="button" onClick={() => toggleAbierto(m.id)} className="text-[12.5px] text-[#1a4fa0] hover:underline w-16 text-right">{abierto ? 'Cerrar' : 'Editar'}</button>
                  </div>
                  {abierto && (
                    <div className="px-4 pb-3 pt-1 grid md:grid-cols-2 gap-4 border-t border-slate-100">
                      <div>
                        <p className="text-[12px] font-semibold text-slate-600 mb-1.5">Perfiles / rol</p>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {m.perfiles.map(p => <Chip key={p.id} texto={p.nombre} onRenombrar={v => run(() => accRenombrarPerfil(p.id, v))} onQuitar={() => run(() => accQuitarPerfil(p.id))} />)}
                        </div>
                        <AgregarInline placeholder="Nuevo perfil" onAgregar={v => run(() => accCrearPerfil(m.id, v))} />
                      </div>
                      <div>
                        <p className="text-[12px] font-semibold text-slate-600 mb-1.5">Rutinas o menús</p>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {m.rutinas.length === 0 && <span className="text-[12px] text-slate-400">Sin rutinas: el solicitante escribirá la suya en "Otro".</span>}
                          {m.rutinas.map(r => <Chip key={r.id} texto={r.nombre} apagado={!r.activo} onRenombrar={v => run(() => accActualizarRutina(r.id, { nombre: v }))}
                            onToggle={() => run(() => accActualizarRutina(r.id, { activo: !r.activo }))} onQuitar={() => run(() => accQuitarRutina(r.id))} />)}
                        </div>
                        <AgregarInline placeholder="Nueva rutina (p. ej. Pedido de compras)" onAgregar={v => run(() => accCrearRutina(m.id, v))} />
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          <div className="mt-3 max-w-sm"><AgregarInline placeholder="Nuevo módulo" onAgregar={v => run(() => accCrearModulo(f.id, { nombre: v }), 'Módulo agregado')} /></div>
        </Seccion>
      </div>

      {/* Vista previa */}
      <aside className="xl:sticky xl:top-2 bg-white border border-slate-300 rounded-2xl shadow-sm overflow-hidden">
        <p className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 text-[12px] font-semibold text-slate-600 uppercase tracking-wide">Vista previa · {f.nombre}</p>
        <div className="p-4 text-[11.5px] grid gap-3">
          <div>
            <p className="font-bold text-[#1a4fa0] uppercase tracking-wide text-[10.5px] mb-1">3. Grupos y empresas</p>
            {empresasPreview.length === 0 ? <p className="text-slate-400">Sin empresas elegidas.</p> : (
              <div className="grid grid-cols-2 gap-2">
                {empresasPreview.map(([fam, lista]) => (
                  <div key={fam} className="border border-slate-200 rounded-lg">
                    <p className="px-2 py-1 bg-slate-50 border-b border-slate-200 font-bold text-slate-700 text-center">{fam}</p>
                    <ul className="px-2 py-1 grid gap-0.5">{lista.map(c => <li key={c.id} className="flex items-center gap-1"><span className="w-2 h-2 border border-slate-400 rounded-sm" />{c.nombre_comercial}</li>)}</ul>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="font-bold text-[#1a4fa0] uppercase tracking-wide text-[10.5px] mb-1">4. Accesos a módulos</p>
            <table className="w-full border-collapse">
              <thead><tr className="bg-slate-50 text-slate-500"><th className="border border-slate-200 w-4"></th><th className="border border-slate-200 text-left px-1.5 py-0.5">Módulo</th><th className="border border-slate-200 text-left px-1.5 py-0.5">Perfil</th></tr></thead>
              <tbody>
                {modulosActivos.filter(m => !m.exclusivo_admin).map(m => (
                  <tr key={m.id}><td className="border border-slate-200 text-center"><span className="inline-block w-2 h-2 border border-slate-400 rounded-sm" /></td>
                    <td className="border border-slate-200 px-1.5 py-0.5 font-semibold">{m.nombre}</td>
                    <td className="border border-slate-200 px-1.5 py-0.5 text-slate-500">{m.perfiles.map(p => p.nombre).join(' / ')}</td></tr>
                ))}
                {modulosActivos.some(m => m.exclusivo_admin) && (
                  <tr><td colSpan={3} className="border border-amber-300 bg-amber-50 px-1.5 py-0.5 font-bold text-amber-800 text-[10px] uppercase">Exclusivo del administrador del sistema</td></tr>
                )}
                {modulosActivos.filter(m => m.exclusivo_admin).map(m => (
                  <tr key={m.id}><td className="border border-amber-300 text-center"><span className="inline-block w-2 h-2 border border-slate-400 rounded-sm" /></td>
                    <td className="border border-amber-300 px-1.5 py-0.5 font-semibold">{m.nombre}</td>
                    <td className="border border-amber-300 px-1.5 py-0.5 text-slate-500">{m.perfiles.map(p => p.nombre).join(' / ')}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-400">El formato completo, con el diseño de una hoja, se verá aquí en cuanto conectemos el motor de documentos.</p>
        </div>
      </aside>
    </div>
  )
}
