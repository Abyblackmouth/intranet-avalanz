'use client'

// Ajustes → Conexiones: una tarjeta por plataforma (TOTVS, Odoo…). Todo lo que
// antes viviría en un .env se captura aquí; los secretos se cifran en el backend.
import { useCallback, useEffect, useState } from 'react'
import { Plus, RefreshCw, Plug, Trash2, Copy, Check, Eye, EyeOff, Eraser } from 'lucide-react'
import {
  Conexion, ConexionDatos, EmpresaConexion, FamiliaIntranet, getFamiliasIntranet,
  getConexiones, createConexion, updateConexion, deleteConexion, regenerarTokenConexion, probarConexion,
  addEmpresaConexion, updateEmpresaConexion, removeEmpresaConexion, limpiarPruebasConexion,
} from '@/services/workflowsService'
import { Seccion, Interruptor, Modal, inputCls, labelCls, btnPrimario, btnSecundario, btnPeligro, errMsg } from '@/components/app/workflows/compartidos'

const AUTH: [Conexion['auth_tipo'], string][] = [['ninguna', 'Ninguna'], ['basica', 'Usuario y contraseña'], ['token', 'Token']]

function FormConexion({ inicial, onClose, onSaved }: { inicial: Conexion | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    slug: inicial?.slug ?? '', titulo: inicial?.titulo ?? '', url_base: inicial?.url_base ?? '',
    auth_tipo: inicial?.auth_tipo ?? 'ninguna', auth_usuario: inicial?.auth_usuario ?? '', auth_secreto: '',
    timeout_seg: inicial?.timeout_seg ?? 20, reintentos_max: inicial?.reintentos_max ?? 5,
    espaciado: (inicial?.espaciado_min ?? [1, 5, 15, 60, 240]).join(', '),
    folio_ambiente: inicial?.folio_ambiente ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const set = (k: keyof typeof f, v: string | number) => setF(s => ({ ...s, [k]: v }))

  const guardar = async () => {
    setError(null)
    const espaciado = f.espaciado.split(',').map(x => Number(x.trim())).filter(x => !Number.isNaN(x) && x > 0)
    if (!espaciado.length) { setError('El espaciado va en minutos separados por coma, por ejemplo 1, 5, 15, 60'); return }
    const datos: ConexionDatos = {
      titulo: f.titulo.trim(), url_base: f.url_base.trim(), auth_tipo: f.auth_tipo, auth_usuario: f.auth_usuario.trim() || null,
      timeout_seg: Number(f.timeout_seg), reintentos_max: Number(f.reintentos_max), espaciado_min: espaciado,
      folio_ambiente: f.folio_ambiente.trim().toUpperCase() || null,
    }
    if (f.auth_secreto) datos.auth_secreto = f.auth_secreto
    setGuardando(true)
    try {
      if (inicial) await updateConexion(inicial.id, datos)
      else await createConexion({ ...datos, slug: f.slug.trim().toLowerCase() })
      onSaved(); onClose()
    } catch (e) { setError(errMsg(e, 'No se pudo guardar la conexión')) } finally { setGuardando(false) }
  }

  return (
    <Modal titulo={inicial ? `Editar ${inicial.titulo}` : 'Nueva conexión'} onClose={onClose} ancho="max-w-xl">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelCls}>Título</label>
          <input className={`${inputCls} w-full`} value={f.titulo} onChange={e => set('titulo', e.target.value)} placeholder="TOTVS Protheus 25 · Producción" />
        </div>
        <div>
          <label className={labelCls}>Slug (lo que viaja en el sobre como plataforma)</label>
          <input className={`${inputCls} w-full font-mono`} value={f.slug} onChange={e => set('slug', e.target.value)} placeholder="totvs" disabled={!!inicial} />
          {inicial && <p className="text-[11px] text-slate-400 mt-1">No se cambia: los envíos ya lo usan.</p>}
        </div>
        <div>
          <label className={labelCls}>Autenticación hacia la plataforma</label>
          <select className={`${inputCls} w-full`} value={f.auth_tipo} onChange={e => set('auth_tipo', e.target.value)}>
            {AUTH.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>URL base del servicio REST</label>
          <input className={`${inputCls} w-full font-mono`} value={f.url_base} onChange={e => set('url_base', e.target.value)} placeholder="http://10.12.0.80:8080/rest" />
          <p className="text-[11px] text-slate-400 mt-1">El resultado se manda a URL base + / + resultService del flujo.</p>
        </div>
        {f.auth_tipo !== 'ninguna' && (
          <>
            {f.auth_tipo === 'basica' && (
              <div>
                <label className={labelCls}>Usuario</label>
                <input className={`${inputCls} w-full`} value={f.auth_usuario} onChange={e => set('auth_usuario', e.target.value)} autoComplete="off" />
              </div>
            )}
            <div className={f.auth_tipo === 'token' ? 'sm:col-span-2' : ''}>
              <label className={labelCls}>{f.auth_tipo === 'token' ? 'Token' : 'Contraseña'}{inicial?.tiene_secreto ? ' (guardada; captura una nueva para cambiarla)' : ''}</label>
              <input type="password" className={`${inputCls} w-full`} value={f.auth_secreto} onChange={e => set('auth_secreto', e.target.value)} autoComplete="new-password" placeholder={inicial?.tiene_secreto ? '••••••••' : ''} />
            </div>
          </>
        )}
        <div>
          <label className={labelCls}>Tiempo de espera (segundos)</label>
          <input type="number" min={1} max={300} className={`${inputCls} w-full`} value={f.timeout_seg} onChange={e => set('timeout_seg', e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Reintentos máximos</label>
          <input type="number" min={0} max={50} className={`${inputCls} w-full`} value={f.reintentos_max} onChange={e => set('reintentos_max', e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Espaciado entre reintentos (minutos, separados por coma)</label>
          <input className={`${inputCls} w-full font-mono`} value={f.espaciado} onChange={e => set('espaciado', e.target.value)} />
          <p className="text-[11px] text-slate-400 mt-1">Después del último valor se repite ese mismo espaciado hasta agotar los reintentos.</p>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Identificador de ambiente en el folio</label>
          <input className={`${inputCls} w-32 font-mono uppercase`} maxLength={6} value={f.folio_ambiente} onChange={e => set('folio_ambiente', e.target.value.toUpperCase())} placeholder="PRB" />
          <p className="text-[11px] text-slate-400 mt-1">Para conexiones de prueba: los folios salen como WF-AVAL-PRB-SC-000001, llevan su propio consecutivo y se pueden borrar de una vez. Déjalo vacío en producción.</p>
        </div>
      </div>
      {error && <p className="mt-3 text-[13px] text-red-600">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className={btnSecundario} onClick={onClose}>Cancelar</button>
        <button type="button" className={btnPrimario} onClick={guardar} disabled={guardando || !f.titulo.trim() || (!inicial && !f.slug.trim())}>{guardando ? 'Guardando…' : inicial ? 'Guardar cambios' : 'Crear conexión'}</button>
      </div>
    </Modal>
  )
}

function Token({ valor }: { valor: string | null }) {
  const [ver, setVer] = useState(false)
  const [copiado, setCopiado] = useState(false)
  if (!valor) return <span className="text-[12px] text-slate-400">—</span>
  const copiar = async () => { try { await navigator.clipboard.writeText(valor); setCopiado(true); setTimeout(() => setCopiado(false), 1500) } catch { /* sin portapapeles */ } }
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <code className="text-[12px] bg-slate-100 rounded px-2 py-1 truncate">{ver ? valor : valor.slice(0, 8) + '•'.repeat(12)}</code>
      <button type="button" onClick={() => setVer(v => !v)} aria-label={ver ? 'Ocultar' : 'Mostrar'} className="grid size-7 place-items-center rounded text-slate-500 hover:bg-slate-100">{ver ? <EyeOff size={14} /> : <Eye size={14} />}</button>
      <button type="button" onClick={copiar} aria-label="Copiar" className="grid size-7 place-items-center rounded text-slate-500 hover:bg-slate-100">{copiado ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}</button>
    </div>
  )
}

function Empresas({ c, onChange }: { c: Conexion; onChange: () => void }) {
  const [clave, setClave] = useState('')
  const [nombre, setNombre] = useState('')
  const [familia, setFamilia] = useState('')
  const [familias, setFamilias] = useState<FamiliaIntranet[]>([])
  useEffect(() => { getFamiliasIntranet().then(r => setFamilias(r.data)).catch(() => setFamilias([])) }, [])
  // Opciones de familia: las de la Intranet y, si la empresa ya tiene una que no esté en el catálogo, esa también
  const opciones = (actual?: string | null) => {
    const lista = familias.map(f => ({ clave: f.clave, texto: `${f.clave} · ${f.nombre}` }))
    if (actual && !familias.some(f => f.clave === actual)) lista.unshift({ clave: actual, texto: `${actual} (no está en la Intranet)` })
    return lista
  }
  const [error, setError] = useState<string | null>(null)
  const agregar = async () => {
    setError(null)
    try { await addEmpresaConexion(c.id, { clave: clave.trim(), nombre: nombre.trim(), familia: familia.trim().toUpperCase() || null }); setClave(''); setNombre(''); setFamilia(''); onChange() }
    catch (e) { setError(errMsg(e, 'No se pudo agregar')) }
  }
  const alternar = async (e: EmpresaConexion) => { await updateEmpresaConexion(c.id, e.id, { activa: !e.activa }); onChange() }
  const guardarFamilia = async (e: EmpresaConexion, v: string) => {
    const nueva = v.trim().toUpperCase()
    if (nueva === (e.familia ?? '')) return
    setError(null)
    try { await updateEmpresaConexion(c.id, e.id, { familia: nueva || null }); onChange() } catch (err) { setError(errMsg(err, 'No se pudo guardar la familia')) }
  }
  const quitar = async (e: EmpresaConexion) => { if (!confirm(`¿Quitar ${e.clave} ${e.nombre}?`)) return; await removeEmpresaConexion(c.id, e.id); onChange() }
  return (
    <div>
      <p className="text-[12.5px] text-slate-500 mb-2">Clave <code className="bg-slate-100 rounded px-1">grupo|empresa</code> tal como la manda la plataforma (por ejemplo <code className="bg-slate-100 rounded px-1">02|01</code>). El motor usa la clave. La <b>familia</b> es la que lleva el folio de los trámites de esa empresa; vacía, se usa la de Ajustes.</p>
      {c.empresas.length > 0 && (
        <table className="w-full text-[13px] mb-3">
          <thead><tr className="text-left text-slate-500"><th className="py-1 font-medium">Clave</th><th className="py-1 font-medium">Nombre</th><th className="py-1 font-medium">Familia del folio</th><th className="py-1 font-medium">Activa</th><th /></tr></thead>
          <tbody>
            {c.empresas.map(e => (
              <tr key={e.id} className="border-t border-slate-200">
                <td className="py-1.5 font-mono">{e.clave}</td>
                <td className="py-1.5">{e.nombre || <span className="text-slate-400">—</span>}</td>
                <td className="py-1.5">
                  <select className={`${inputCls} !py-1 max-w-56`} value={e.familia ?? ''} onChange={ev => guardarFamilia(e, ev.target.value)} aria-label={`Familia del folio de ${e.clave}`}>
                    <option value="">(la de Ajustes)</option>
                    {opciones(e.familia).map(o => <option key={o.clave} value={o.clave}>{o.texto}</option>)}
                  </select>
                </td>
                <td className="py-1.5"><Interruptor on={e.activa} onChange={() => alternar(e)} label={`Activar ${e.clave}`} /></td>
                <td className="py-1.5 text-right"><button type="button" onClick={() => quitar(e)} aria-label="Quitar" className="text-slate-400 hover:text-red-600"><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        <input className={`${inputCls} w-24 font-mono`} placeholder="02|04" value={clave} onChange={e => setClave(e.target.value)} />
        <input className={`${inputCls} flex-1 min-w-48`} placeholder="Nombre de la empresa" value={nombre} onChange={e => setNombre(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') agregar() }} />
        <select className={`${inputCls} max-w-56`} value={familia} onChange={e => setFamilia(e.target.value)} aria-label="Familia del folio">
          <option value="">Familia: la de Ajustes</option>
          {opciones().map(o => <option key={o.clave} value={o.clave}>{o.texto}</option>)}
        </select>
        <button type="button" className={btnSecundario} onClick={agregar} disabled={!clave.trim()}><Plus size={14} /> Agregar</button>
      </div>
      {error && <p className="mt-2 text-[13px] text-red-600">{error}</p>}
    </div>
  )
}

function TarjetaConexion({ c, onChange }: { c: Conexion; onChange: () => void }) {
  const [editar, setEditar] = useState(false)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [probando, setProbando] = useState(false)
  const [prueba, setPrueba] = useState<{ ok: boolean; mensaje: string } | null>(null)
  const probar = async () => {
    setProbando(true); setPrueba(null)
    try { const r = await probarConexion(c.id); setPrueba({ ok: r.data.ok, mensaje: r.data.mensaje }) }
    catch (e) { setPrueba({ ok: false, mensaje: errMsg(e, 'No se pudo probar') }) } finally { setProbando(false) }
  }
  const regenerar = async () => {
    if (!confirm('Se genera un token nuevo y el anterior deja de servir. Tendrás que actualizarlo en la plataforma (MV_XWFTOKEN). ¿Continuar?')) return
    await regenerarTokenConexion(c.id); onChange()
    setAviso({ ok: true, texto: 'Token regenerado. Actualízalo en la plataforma antes de mandar trámites.' })
  }
  const alternar = async () => { await updateConexion(c.id, { activa: !c.activa }); onChange() }
  const [limpiando, setLimpiando] = useState(false)
  const limpiar = async () => {
    const marca = `-${c.folio_ambiente}-`
    const escrito = prompt(`Se borrarán TODOS los trámites de esta conexión cuyo folio contenga «${marca}», con sus archivos, transacciones, correos y bitácora, y sus consecutivos volverán a empezar en 000001. No se puede deshacer.\n\nEscribe ${c.folio_ambiente} para confirmar:`)
    if ((escrito ?? '').trim().toUpperCase() !== c.folio_ambiente) return
    setLimpiando(true); setAviso(null)
    try { const r = await limpiarPruebasConexion(c.id); setAviso({ ok: true, texto: `Se borraron ${r.data.tramites} trámites de prueba y ${r.data.archivos} archivos.` }) }
    catch (e) { setAviso({ ok: false, texto: errMsg(e, 'No se pudo limpiar') }) } finally { setLimpiando(false) }
  }
  const eliminar = async () => {
    if (!confirm(`¿Eliminar la conexión ${c.titulo}? Solo se puede si no tiene flujos.`)) return
    try { await deleteConexion(c.id); onChange() } catch (e) { setAviso({ ok: false, texto: errMsg(e, 'No se pudo eliminar') }) }
  }
  const auth = AUTH.find(a => a[0] === c.auth_tipo)?.[1] ?? c.auth_tipo
  return (
    <Seccion titulo={c.titulo} sub={`${c.slug} · ${c.flujos} flujo${c.flujos === 1 ? '' : 's'}`} plegable
      resumen={`${c.activa ? 'Activa' : 'Inactiva'}${c.folio_ambiente ? ` · ambiente ${c.folio_ambiente}` : ' · producción'} · ${c.empresas.length} empresa${c.empresas.length === 1 ? '' : 's'}`}
      accion={<div className="flex items-center gap-3 shrink-0"><span className={`text-[12px] font-medium ${c.activa ? 'text-emerald-700' : 'text-slate-400'}`}>{c.activa ? 'Activa' : 'Inactiva'}</span><Interruptor on={c.activa} onChange={alternar} label="Conexión activa" /></div>}>
      <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-[auto_1fr] items-center">
        <dt className="text-slate-500">URL base</dt><dd className="font-mono break-all">{c.url_base || <span className="text-slate-400">sin capturar</span>}</dd>
        <dt className="text-slate-500">Autenticación</dt><dd>{auth}{c.auth_tipo === 'basica' && c.auth_usuario ? ` · ${c.auth_usuario}` : ''}{c.auth_tipo !== 'ninguna' ? (c.tiene_secreto ? ' · secreto guardado' : ' · sin secreto') : ''}</dd>
        <dt className="text-slate-500">Token de entrada</dt><dd className="flex items-center gap-2 flex-wrap"><Token valor={c.token_entrada} /><button type="button" onClick={regenerar} className="text-[12.5px] text-[#1a4fa0] hover:underline inline-flex items-center gap-1"><RefreshCw size={12} /> Regenerar</button></dd>
        <dt className="text-slate-500">Reintentos</dt><dd>{c.timeout_seg} s de espera · hasta {c.reintentos_max} intentos · cada {c.espaciado_min.join(', ')} min</dd>
        <dt className="text-slate-500">Ambiente en el folio</dt><dd>{c.folio_ambiente ? <><code className="text-[12px] bg-slate-100 rounded px-1.5 py-0.5">{c.folio_ambiente}</code> <span className="text-slate-500">· los trámites de esta conexión son de prueba</span></> : <span className="text-slate-400">ninguno (producción)</span>}</dd>
      </dl>
      <div className="mt-4 pt-4 border-t border-slate-200">
        <p className="text-[13px] font-semibold text-slate-800 mb-2">Empresas de esta plataforma</p>
        <Empresas c={c} onChange={onChange} />
      </div>
      <div className="mt-4 pt-4 border-t border-slate-200 flex flex-wrap items-center gap-2">
        <button type="button" className={btnSecundario} onClick={() => setEditar(true)}>Editar</button>
        <button type="button" className={btnSecundario} onClick={probar} disabled={probando || !c.url_base}><Plug size={14} /> {probando ? 'Probando…' : 'Probar conexión'}</button>
        {prueba && <span className={`text-[13px] ${prueba.ok ? 'text-emerald-700' : 'text-red-600'}`}>{prueba.mensaje}</span>}
        {aviso && <span className={`text-[13px] ${aviso.ok ? 'text-emerald-700' : 'text-red-600'}`}>{aviso.texto}</span>}
        {c.folio_ambiente && <button type="button" className={btnSecundario} onClick={limpiar} disabled={limpiando}><Eraser size={14} /> {limpiando ? 'Borrando…' : `Borrar trámites de prueba (${c.folio_ambiente})`}</button>}
        <button type="button" className={`${btnPeligro} ml-auto`} onClick={eliminar} disabled={c.flujos > 0}><Trash2 size={14} /> Eliminar</button>
      </div>
      {editar && <FormConexion inicial={c} onClose={() => setEditar(false)} onSaved={onChange} />}
    </Seccion>
  )
}

export default function ConexionesConfig() {
  const [lista, setLista] = useState<Conexion[]>([])
  const [loading, setLoading] = useState(true)
  const [nueva, setNueva] = useState(false)
  const cargar = useCallback(async () => { try { const r = await getConexiones(); setLista(r.data ?? []) } finally { setLoading(false) } }, [])
  useEffect(() => { cargar() }, [cargar])
  if (loading) return <div className="py-16 flex justify-center"><div className="w-5 h-5 border-2 border-slate-300 border-t-[#1a4fa0] rounded-full animate-spin" /></div>
  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-3">
        <p className="text-[13px] text-slate-500">{lista.length} conexión{lista.length === 1 ? '' : 'es'}. Cada plataforma (TOTVS, Odoo…) entra con su propia tarjeta; sus flujos la eligen por slug.</p>
        <button type="button" className={`${btnPrimario} ml-auto`} onClick={() => setNueva(true)}><Plus size={14} /> Nueva conexión</button>
      </div>
      {lista.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-400 p-10 text-center text-[13px] text-slate-500">Todavía no hay plataformas conectadas. Crea la de TOTVS para empezar: título, URL del REST de Protheus y cómo autenticarse.</div>
      )}
      <div className="grid gap-5 2xl:grid-cols-2">
        {lista.map(c => <TarjetaConexion key={c.id} c={c} onChange={cargar} />)}
      </div>
      {nueva && <FormConexion inicial={null} onClose={() => setNueva(false)} onSaved={cargar} />}
    </div>
  )
}
