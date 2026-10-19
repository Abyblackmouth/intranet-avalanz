'use client'

// Flujos → Grupos de aprobación. Un grupo = una cascada. Por empresa de la plataforma,
// con sus miembros (solicitantes) y su riel editable de etapas.
import { useState } from 'react'
import { Plus, Trash2, Pencil, X } from 'lucide-react'
import {
  FlujoDetalle, GrupoDef, EtapaDef, UsuarioIntranet, EtapaDatos,
  createGrupo, updateGrupo, deleteGrupo, addMiembro, removeMiembro, createEtapa, updateEtapa, deleteEtapa, buscarUsuariosFlujos,
} from '@/services/workflowsService'
import RielFlujo from '@/components/app/workflows/RielFlujo'
import { Seccion, Interruptor, Modal, BuscadorUsuario, inputCls, labelCls, btnPrimario, btnSecundario, btnPeligro, errMsg } from '@/components/app/workflows/compartidos'

type Props = { flujo: FlujoDetalle; onChange: (f: FlujoDetalle) => void; puedeEditar: boolean }

function FormGrupo({ flujo, inicial, onClose, onSaved }: { flujo: FlujoDetalle; inicial: GrupoDef | null; onClose: () => void; onSaved: (f: FlujoDetalle) => void }) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [clave, setClave] = useState(inicial?.origen_clave ?? flujo.empresas_conexion[0]?.clave ?? '')
  const [esDefault, setEsDefault] = useState(inicial?.es_default ?? flujo.grupos_detalle.filter(g => g.origen_clave === (inicial?.origen_clave ?? flujo.empresas_conexion[0]?.clave)).length === 0)
  const [auto, setAuto] = useState<'omitir' | 'subir'>(inicial?.auto_aprobacion ?? 'omitir')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const guardar = async () => {
    setError(null); setGuardando(true)
    try {
      const r = inicial
        ? await updateGrupo(flujo.id, inicial.id, { nombre: nombre.trim(), origen_clave: clave, es_default: esDefault, auto_aprobacion: auto })
        : await createGrupo(flujo.id, { nombre: nombre.trim(), origen_clave: clave, es_default: esDefault, auto_aprobacion: auto })
      onSaved(r.data); onClose()
    } catch (e) { setError(errMsg(e, 'No se pudo guardar el grupo')) } finally { setGuardando(false) }
  }
  return (
    <Modal titulo={inicial ? 'Editar grupo' : 'Nuevo grupo de aprobación'} onClose={onClose}>
      <div className="grid gap-4">
        <div>
          <label className={labelCls}>Nombre del grupo</label>
          <input className={`${inputCls} w-full`} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Supervisores de planta" />
        </div>
        <div>
          <label className={labelCls}>Empresa (clave de la plataforma)</label>
          {flujo.empresas_conexion.length ? (
            <select className={`${inputCls} w-full`} value={clave} onChange={e => setClave(e.target.value)}>
              {flujo.empresas_conexion.map(e => <option key={e.clave} value={e.clave}>{e.clave} · {e.nombre}</option>)}
            </select>
          ) : (
            <input className={`${inputCls} w-full font-mono`} value={clave} onChange={e => setClave(e.target.value)} placeholder="02|01" />
          )}
          {!flujo.empresas_conexion.length && <p className="text-[11px] text-slate-400 mt-1">La conexión no tiene empresas capturadas (Ajustes → Conexiones); escribe la clave a mano.</p>}
        </div>
        <div>
          <label className={labelCls}>Si el solicitante es aprobador de una etapa de su propia cascada</label>
          <select className={`${inputCls} w-full`} value={auto} onChange={e => setAuto(e.target.value as 'omitir' | 'subir')}>
            <option value="omitir">Omitir su etapa</option>
            <option value="subir">Subir al siguiente nivel</option>
          </select>
        </div>
        <label className="flex items-center gap-3 text-[13px] text-slate-700">
          <Interruptor on={esDefault} onChange={() => setEsDefault(v => !v)} label="Grupo default" />
          <span>Grupo <b>default</b> de la empresa: aplica a quien no sea miembro de otro grupo</span>
        </label>
      </div>
      {error && <p className="mt-3 text-[13px] text-red-600">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className={btnSecundario} onClick={onClose}>Cancelar</button>
        <button type="button" className={btnPrimario} onClick={guardar} disabled={guardando || !nombre.trim() || !clave.trim()}>{guardando ? 'Guardando…' : inicial ? 'Guardar' : 'Crear grupo'}</button>
      </div>
    </Modal>
  )
}

function FormEtapa({ flujo, grupo, inicial, onClose, onSaved }: { flujo: FlujoDetalle; grupo: GrupoDef; inicial: EtapaDef | null; onClose: () => void; onSaved: (f: FlujoDetalle) => void }) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [puesto, setPuesto] = useState(inicial?.puesto_esperado ?? '')
  const [tipo, setTipo] = useState<EtapaDef['tipo']>(inicial?.tipo ?? 'aprobacion')
  const [aprobador, setAprobador] = useState<UsuarioIntranet | null>(inicial?.aprobador_user_id ? { id: inicial.aprobador_user_id, name: inicial.aprobador_nombre, email: inicial.aprobador_email ?? '' } : null)
  const [suplente, setSuplente] = useState<UsuarioIntranet | null>(inicial?.suplente_user_id ? { id: inicial.suplente_user_id, name: inicial.suplente_nombre ?? '', email: inicial.suplente_email ?? '' } : null)
  const [condicion, setCondicion] = useState(inicial?.condicion ?? '')
  const [comentarioOblig, setComentarioOblig] = useState(inicial?.comentario_rechazo_obligatorio ?? true)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const idx = inicial ? grupo.etapas.findIndex(e => e.id === inicial.id) : -1

  const datos = (): EtapaDatos => ({
    nombre: nombre.trim(), tipo, puesto_esperado: puesto.trim() || null,
    aprobador_user_id: aprobador?.id ?? null, aprobador_nombre: aprobador?.name ?? '', aprobador_email: aprobador?.email ?? null,
    suplente_user_id: suplente?.id ?? null, suplente_nombre: suplente?.name ?? null, suplente_email: suplente?.email ?? null,
    quitar_suplente: !suplente && !!inicial?.suplente_user_id,
    condicion: condicion.trim() || null, comentario_rechazo_obligatorio: comentarioOblig,
  })
  const guardar = async () => {
    setError(null); setGuardando(true)
    try {
      const r = inicial ? await updateEtapa(flujo.id, grupo.id, inicial.id, datos()) : await createEtapa(flujo.id, grupo.id, datos())
      onSaved(r.data); onClose()
    } catch (e) { setError(errMsg(e, 'No se pudo guardar la etapa')) } finally { setGuardando(false) }
  }
  const mover = async (dir: 'subir' | 'bajar') => {
    if (!inicial) return
    try { const r = await updateEtapa(flujo.id, grupo.id, inicial.id, { mover: dir }); onSaved(r.data); onClose() } catch (e) { setError(errMsg(e, 'No se pudo mover')) }
  }
  const eliminar = async () => {
    if (!inicial || !confirm(`¿Eliminar la etapa «${inicial.nombre}»?`)) return
    try { const r = await deleteEtapa(flujo.id, grupo.id, inicial.id); onSaved(r.data); onClose() } catch (e) { setError(errMsg(e, 'No se pudo eliminar')) }
  }
  return (
    <Modal titulo={inicial ? `Etapa ${inicial.orden} · ${inicial.nombre}` : `Nueva etapa · ${grupo.nombre}`} onClose={onClose} ancho="max-w-xl">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Nombre de la etapa</label>
          <input className={`${inputCls} w-full`} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Gerente de compras" />
        </div>
        <div>
          <label className={labelCls}>Puesto esperado (informativo, por ahora)</label>
          <input className={`${inputCls} w-full`} value={puesto} onChange={e => setPuesto(e.target.value)} placeholder="Ej. Gerente" />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Aprobador (usuario de la Intranet)</label>
          <BuscadorUsuario valor={aprobador} onElegir={setAprobador} buscar={buscarUsuariosFlujos} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Suplente (opcional: recibe el aviso también; aprueba el primero que responda)</label>
          <BuscadorUsuario valor={suplente} onElegir={setSuplente} buscar={buscarUsuariosFlujos} placeholder="Buscar suplente" />
        </div>
        <div>
          <label className={labelCls}>Tipo</label>
          <select className={`${inputCls} w-full`} value={tipo} onChange={e => setTipo(e.target.value as EtapaDef['tipo'])}>
            <option value="aprobacion">Aprobación</option>
            <option value="revision">Revisión (puede devolver sin rechazar)</option>
            <option value="notificacion">Notificación (solo avisa y sigue)</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Condición para que aplique (vacío = siempre)</label>
          <input className={`${inputCls} w-full font-mono`} value={condicion} onChange={e => setCondicion(e.target.value)} placeholder="total > 100000" />
          <p className="text-[11px] text-slate-400 mt-1">Campo de cardData, operador y valor: <code>total &gt;= 50000</code>, <code>moneda == MXN</code>.</p>
        </div>
        <label className="sm:col-span-2 flex items-center gap-3 text-[13px] text-slate-700">
          <Interruptor on={comentarioOblig} onChange={() => setComentarioOblig(v => !v)} label="Comentario obligatorio al rechazar" />
          <span>Comentario obligatorio al rechazar</span>
        </label>
      </div>
      {error && <p className="mt-3 text-[13px] text-red-600">{error}</p>}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button type="button" className={btnPrimario} onClick={guardar} disabled={guardando || !nombre.trim() || (tipo !== 'notificacion' && !aprobador)}>{guardando ? 'Guardando…' : inicial ? 'Guardar etapa' : 'Agregar etapa'}</button>
        {inicial && (
          <>
            <button type="button" className={btnSecundario} onClick={() => mover('subir')} disabled={idx <= 0}>↑ Subir</button>
            <button type="button" className={btnSecundario} onClick={() => mover('bajar')} disabled={idx < 0 || idx >= grupo.etapas.length - 1}>↓ Bajar</button>
            <button type="button" className={`${btnPeligro} ml-auto`} onClick={eliminar}><Trash2 size={14} /> Eliminar etapa</button>
          </>
        )}
        {!inicial && <button type="button" className={`${btnSecundario} ml-auto`} onClick={onClose}>Cancelar</button>}
      </div>
    </Modal>
  )
}

function FormMiembro({ flujo, grupo, onClose, onSaved }: { flujo: FlujoDetalle; grupo: GrupoDef; onClose: () => void; onSaved: (f: FlujoDetalle) => void }) {
  const [u, setU] = useState<UsuarioIntranet | null>(null)
  const [error, setError] = useState<string | null>(null)
  const agregar = async () => {
    if (!u) return
    setError(null)
    try { const r = await addMiembro(flujo.id, grupo.id, { user_id: u.id, nombre: u.name }); onSaved(r.data); onClose() } catch (e) { setError(errMsg(e, 'No se pudo agregar')) }
  }
  return (
    <Modal titulo={`Agregar miembro · ${grupo.nombre}`} onClose={onClose}>
      <label className={labelCls}>Solicitante que caerá en este grupo</label>
      <BuscadorUsuario valor={u} onElegir={setU} buscar={buscarUsuariosFlujos} />
      <p className="text-[11px] text-slate-400 mt-2">Un solicitante solo puede estar en un grupo por empresa. Quien no sea miembro de ninguno cae en el grupo default.</p>
      {error && <p className="mt-3 text-[13px] text-red-600">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className={btnSecundario} onClick={onClose}>Cancelar</button>
        <button type="button" className={btnPrimario} onClick={agregar} disabled={!u}>Agregar</button>
      </div>
    </Modal>
  )
}

function TarjetaGrupo({ flujo, g, onChange, puedeEditar }: { flujo: FlujoDetalle; g: GrupoDef; onChange: (f: FlujoDetalle) => void; puedeEditar: boolean }) {
  const [modal, setModal] = useState<{ tipo: 'grupo' | 'etapa' | 'miembro'; etapa?: EtapaDef | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const quitarMiembro = async (id: string, nombre: string) => {
    if (!confirm(`¿Quitar a ${nombre} del grupo?`)) return
    try { const r = await removeMiembro(flujo.id, g.id, id); onChange(r.data) } catch (e) { setError(errMsg(e, 'No se pudo quitar')) }
  }
  const eliminar = async () => {
    if (!confirm(`¿Eliminar el grupo «${g.nombre}» con sus ${g.etapas.length} etapas? Los trámites en curso no se tocan.`)) return
    try { const r = await deleteGrupo(flujo.id, g.id); onChange(r.data) } catch (e) { setError(errMsg(e, 'No se pudo eliminar')) }
  }
  const alternar = async () => { try { const r = await updateGrupo(flujo.id, g.id, { activo: !g.activo }); onChange(r.data) } catch (e) { setError(errMsg(e, 'No se pudo cambiar')) } }
  return (
    <Seccion titulo={g.nombre} className={g.activo ? '' : 'opacity-60'}
      sub={`${g.es_default ? 'Default de la empresa' : 'Solo para sus miembros'} · si el solicitante es aprobador: ${g.auto_aprobacion === 'omitir' ? 'se omite su etapa' : 'sube al siguiente nivel'}`}
      accion={puedeEditar ? (
        <div className="flex items-center gap-2 shrink-0">
          <Interruptor on={g.activo} onChange={alternar} label="Grupo activo" />
          <button type="button" className={btnSecundario} onClick={() => setModal({ tipo: 'grupo' })}><Pencil size={13} /> Editar</button>
          <button type="button" className={btnPeligro} onClick={eliminar}><Trash2 size={13} /></button>
        </div>
      ) : undefined}>
      {g.es_default && <span className="mb-2 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-[#1a4fa0]">default</span>}
      <RielFlujo etapas={g.etapas.map(e => ({ ...e, status: 'definicion' as const }))} editable={puedeEditar}
        onEtapa={e => setModal({ tipo: 'etapa', etapa: g.etapas.find(x => x.id === e.id) ?? null })} onAgregar={() => setModal({ tipo: 'etapa', etapa: null })} />
      {g.etapas.length === 0 && <p className="text-[13px] text-amber-700">Este grupo no tiene etapas: un trámite que caiga aquí se aprobaría en automático. Agrega la primera con el ＋.</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] text-slate-500">Miembros:</span>
        {g.miembros.map(m => (
          <span key={m.id} className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white pl-2.5 pr-1 py-0.5 text-[12px]">
            {m.nombre}{puedeEditar && <button type="button" onClick={() => quitarMiembro(m.id, m.nombre)} aria-label="Quitar" className="grid size-5 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-red-600"><X size={11} /></button>}
          </span>
        ))}
        {g.miembros.length === 0 && <span className="text-[12px] text-slate-400">{g.es_default ? 'nadie en particular (es el default)' : 'ninguno todavía: nadie caerá aquí hasta que agregues miembros'}</span>}
        {puedeEditar && <button type="button" className="text-[12.5px] text-[#1a4fa0] hover:underline inline-flex items-center gap-1" onClick={() => setModal({ tipo: 'miembro' })}><Plus size={12} /> Agregar miembro</button>}
      </div>
      {error && <p className="mt-2 text-[13px] text-red-600">{error}</p>}
      {modal?.tipo === 'grupo' && <FormGrupo flujo={flujo} inicial={g} onClose={() => setModal(null)} onSaved={onChange} />}
      {modal?.tipo === 'etapa' && <FormEtapa flujo={flujo} grupo={g} inicial={modal.etapa ?? null} onClose={() => setModal(null)} onSaved={onChange} />}
      {modal?.tipo === 'miembro' && <FormMiembro flujo={flujo} grupo={g} onClose={() => setModal(null)} onSaved={onChange} />}
    </Seccion>
  )
}

export default function GruposConfig({ flujo, onChange, puedeEditar }: Props) {
  const [nuevo, setNuevo] = useState(false)
  const porEmpresa = new Map<string, GrupoDef[]>()
  flujo.grupos_detalle.forEach(g => porEmpresa.set(g.origen_clave, [...(porEmpresa.get(g.origen_clave) ?? []), g]))
  const nombreEmpresa = (clave: string) => flujo.empresas_conexion.find(e => e.clave === clave)?.nombre ?? ''
  const sinDefault = Array.from(porEmpresa.entries()).filter(([, gs]) => !gs.some(g => g.es_default && g.activo)).map(([k]) => k)
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[13px] text-slate-500">{flujo.grupos_detalle.length} grupo{flujo.grupos_detalle.length === 1 ? '' : 's'} en {porEmpresa.size} empresa{porEmpresa.size === 1 ? '' : 's'}. Cada grupo tiene su propia cascada; un solicitante cae en el grupo del que es miembro o, si no, en el default de su empresa.</p>
        {puedeEditar && <button type="button" className={`${btnPrimario} ml-auto`} onClick={() => setNuevo(true)}><Plus size={14} /> Nuevo grupo</button>}
      </div>
      {sinDefault.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900">
          Sin grupo default activo en {sinDefault.join(', ')}: quien no sea miembro de un grupo caerá en «error de configuración».
        </div>
      )}
      {flujo.grupos_detalle.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-400 p-10 text-center text-[13px] text-slate-500">
          Este flujo todavía no tiene grupos de aprobación. Crea el primero: necesitas al menos un grupo <b>default</b> por empresa.
        </div>
      )}
      {Array.from(porEmpresa.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([clave, grupos]) => (
        <div key={clave} className="grid gap-3">
          <h3 className="flex items-center gap-2 text-[14px] font-bold text-slate-900"><span className="rounded bg-slate-100 px-1.5 font-mono text-[12px] font-medium">{clave}</span>{nombreEmpresa(clave) || 'Empresa sin nombre en la conexión'}</h3>
          {grupos.sort((a, b) => Number(b.es_default) - Number(a.es_default) || a.nombre.localeCompare(b.nombre)).map(g => <TarjetaGrupo key={g.id} flujo={flujo} g={g} onChange={onChange} puedeEditar={puedeEditar} />)}
        </div>
      ))}
      {nuevo && <FormGrupo flujo={flujo} inicial={null} onClose={() => setNuevo(false)} onSaved={onChange} />}
    </div>
  )
}
