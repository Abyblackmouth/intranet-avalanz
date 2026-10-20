'use client'

// Ajustes → Usuarios de plataformas: id de usuario de la plataforma ↔ usuario de la Intranet.
// Los solicitantes que llegan con correo se ligan solos; aquí se ven los pendientes,
// se ligan a mano y se capturan los ids de los aprobadores.
import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, Link2, Search } from 'lucide-react'
import {
  Conexion, UsuarioPlataforma, UsuarioIntranet,
  getConexiones, getUsuariosPlataforma, guardarUsuarioPlataforma, quitarUsuarioPlataforma,
} from '@/services/workflowsService'
import { Seccion, Modal, BuscadorUsuario, inputCls, labelCls, btnPrimario, btnSecundario, errMsg, fmtFecha } from '@/components/app/workflows/compartidos'

function FormUsuario({ conexiones, inicial, onClose, onSaved }: { conexiones: Conexion[]; inicial: UsuarioPlataforma | null; onClose: () => void; onSaved: () => void }) {
  const [conexionId, setConexionId] = useState(inicial?.conexion_id ?? conexiones[0]?.id ?? '')
  const [idExterno, setIdExterno] = useState(inicial?.id_externo ?? '')
  const [login, setLogin] = useState(inicial?.login_externo ?? '')
  const [intranet, setIntranet] = useState<UsuarioIntranet | null>(
    inicial?.user_id ? { id: inicial.user_id, name: inicial.nombre, email: inicial.email ?? '' } : null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const guardar = async () => {
    setError(null); setGuardando(true)
    try {
      await guardarUsuarioPlataforma({
        conexion_id: conexionId, id_externo: idExterno.trim(), login_externo: login.trim() || null,
        user_id: intranet?.id ?? null, nombre: intranet?.name ?? inicial?.nombre ?? null, email: intranet?.email ?? inicial?.email ?? null,
      })
      onSaved(); onClose()
    } catch (e) { setError(errMsg(e, 'No se pudo guardar')) } finally { setGuardando(false) }
  }
  return (
    <Modal titulo={inicial ? 'Ligar usuario' : 'Nuevo usuario de plataforma'} onClose={onClose}>
      <div className="grid gap-4">
        <div>
          <label className={labelCls}>Plataforma</label>
          <select className={`${inputCls} w-full`} value={conexionId} onChange={e => setConexionId(e.target.value)} disabled={!!inicial}>
            {conexiones.map(c => <option key={c.id} value={c.id}>{c.titulo}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Id en la plataforma</label>
            <input className={`${inputCls} w-full font-mono`} value={idExterno} onChange={e => setIdExterno(e.target.value)} placeholder="000012" disabled={!!inicial} />
          </div>
          <div>
            <label className={labelCls}>Login (informativo)</label>
            <input className={`${inputCls} w-full`} value={login} onChange={e => setLogin(e.target.value)} placeholder="maquezada" />
          </div>
        </div>
        <div>
          <label className={labelCls}>Usuario de la Intranet</label>
          <BuscadorUsuario valor={intranet} onElegir={setIntranet} />
          {!intranet && <p className="text-[11px] text-slate-400 mt-1">Si lo dejas vacío queda «por ligar»: el trámite igual entra, pero esa persona no puede aprobar hasta que se ligue.</p>}
        </div>
      </div>
      {error && <p className="mt-3 text-[13px] text-red-600">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className={btnSecundario} onClick={onClose}>Cancelar</button>
        <button type="button" className={btnPrimario} onClick={guardar} disabled={guardando || !conexionId || !idExterno.trim()}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </Modal>
  )
}

export default function UsuariosPlataformas() {
  const [conexiones, setConexiones] = useState<Conexion[]>([])
  const [lista, setLista] = useState<UsuarioPlataforma[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [soloPendientes, setSoloPendientes] = useState(false)
  const [conexionId, setConexionId] = useState('')
  const [form, setForm] = useState<{ abierto: boolean; inicial: UsuarioPlataforma | null }>({ abierto: false, inicial: null })

  const cargar = useCallback(async () => {
    try {
      const [c, u] = await Promise.all([getConexiones(), getUsuariosPlataforma({ conexion_id: conexionId || undefined, pendientes: soloPendientes, q })])
      setConexiones(c.data ?? []); setLista(u.data ?? [])
    } finally { setLoading(false) }
  }, [conexionId, soloPendientes, q])
  useEffect(() => { const t = setTimeout(cargar, 200); return () => clearTimeout(t) }, [cargar])

  const quitar = async (u: UsuarioPlataforma) => { if (!confirm(`¿Quitar la liga de ${u.id_externo} (${u.nombre || u.email})?`)) return; await quitarUsuarioPlataforma(u.id); cargar() }
  const pendientes = lista.filter(u => !u.ligado).length
  const nombreConexion = (id: string) => conexiones.find(c => c.id === id)?.titulo ?? '—'

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs w-full">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={`${inputCls} w-full pl-8`} placeholder="Buscar por nombre, correo, id o login" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <select className={`${inputCls} w-auto`} value={conexionId} onChange={e => setConexionId(e.target.value)}>
          <option value="">Todas las plataformas</option>
          {conexiones.map(c => <option key={c.id} value={c.id}>{c.titulo}</option>)}
        </select>
        <button type="button" onClick={() => setSoloPendientes(v => !v)}
          className={`rounded-full border px-3 py-1 text-[13px] ${soloPendientes ? 'border-[#1a4fa0] bg-[#1a4fa0] text-white' : 'border-slate-300 bg-white text-slate-600'}`}>
          Por ligar{pendientes ? ` (${pendientes})` : ''}
        </button>
        <span className="text-[13px] text-slate-500">{lista.length} usuario{lista.length === 1 ? '' : 's'}</span>
        <button type="button" className={`${btnPrimario} ml-auto`} onClick={() => setForm({ abierto: true, inicial: null })} disabled={!conexiones.length}><Plus size={14} /> Nuevo</button>
      </div>
      <Seccion titulo="Usuarios ligados" sub="El id es la llave: es lo que regresa a la plataforma en el historial para que sepa quién aprobó.">
        {loading ? (
          <div className="py-10 flex justify-center"><div className="w-5 h-5 border-2 border-slate-300 border-t-[#1a4fa0] rounded-full animate-spin" /></div>
        ) : lista.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-slate-500">{conexiones.length ? 'Todavía no hay usuarios ligados. Llegan solos con el primer envío que traiga correo, o agrégalos aquí.' : 'Primero crea una conexión en la pestaña Conexiones.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr className="text-left text-slate-500"><th className="py-1.5 font-medium">Id</th><th className="py-1.5 font-medium">Login</th><th className="py-1.5 font-medium">Nombre</th><th className="py-1.5 font-medium">Correo</th><th className="py-1.5 font-medium">Plataforma</th><th className="py-1.5 font-medium">Estado</th><th className="py-1.5 font-medium">Última vez</th><th /></tr></thead>
              <tbody>
                {lista.map(u => (
                  <tr key={u.id} className="border-t border-slate-200">
                    <td className="py-2 font-mono">{u.id_externo}</td>
                    <td className="py-2 text-slate-500">{u.login_externo || '—'}</td>
                    <td className="py-2">{u.nombre || '—'}</td>
                    <td className="py-2 text-slate-500">{u.email || '—'}</td>
                    <td className="py-2">{nombreConexion(u.conexion_id)}</td>
                    <td className="py-2">{u.ligado ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[12px] font-medium text-emerald-700">ligado</span> : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[12px] font-medium text-amber-700">por ligar</span>}</td>
                    <td className="py-2 text-slate-500">{fmtFecha(u.ultima_vez)}</td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <button type="button" onClick={() => setForm({ abierto: true, inicial: u })} className="text-[#1a4fa0] hover:underline inline-flex items-center gap-1 mr-3"><Link2 size={13} /> {u.ligado ? 'Cambiar' : 'Ligar'}</button>
                      <button type="button" onClick={() => quitar(u)} aria-label="Quitar" className="text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>
      {form.abierto && <FormUsuario conexiones={conexiones} inicial={form.inicial} onClose={() => setForm({ abierto: false, inicial: null })} onSaved={cargar} />}
    </div>
  )
}
