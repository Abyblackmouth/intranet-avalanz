'use client'

import { useState, useEffect, useCallback } from 'react'
import PageWrapper from '@/components/layout/PageWrapper'
import {
  getSystems, createSystem, updateSystem,
  getModulesCatalog, createModuleCatalog, updateModuleCatalog,
  getSpecialists, createSpecialist, updateSpecialist,
  getUsersByRole,
} from '@/services/itServiceDeskService'
import { Server, Boxes, Users, Plus, Pencil, Power } from 'lucide-react'

interface SystemRow { id: string; name: string; is_active: boolean }
interface ModuleRow { id: string; system_id: string; name: string; is_active: boolean }
interface SpecialistRow {
  id: string; system_id: string | null; module_id: string | null
  team_type: string; specialist_user_id: string; specialist_user_name: string | null
  is_active: boolean
}
interface UserOption { id: string; name: string; email: string }

const TEAM_TYPE_LABEL: Record<string, string> = {
  'especialista-funcional': 'Especialista Funcional',
  'especialista-tecnico': 'Especialista Tecnico',
  'incident-manager': 'Incident Manager (ligado a sistema/modulo)',
}

export default function ActualizacionesPage() {
  const [tab, setTab] = useState<'sistemas' | 'modulos' | 'especialistas'>('sistemas')
  const [systems, setSystems] = useState<SystemRow[]>([])
  const [modules, setModules] = useState<ModuleRow[]>([])
  const [specialists, setSpecialists] = useState<SpecialistRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [sysRes, modRes, specRes] = await Promise.all([
        getSystems(), getModulesCatalog(), getSpecialists(),
      ])
      setSystems(sysRes.data?.data ?? [])
      setModules(modRes.data?.data ?? [])
      setSpecialists(specRes.data?.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const [showSystemForm, setShowSystemForm] = useState(false)
  const [editingSystem, setEditingSystem] = useState<SystemRow | null>(null)
  const [showModuleForm, setShowModuleForm] = useState(false)
  const [editingModule, setEditingModule] = useState<ModuleRow | null>(null)
  const [showSpecForm, setShowSpecForm] = useState(false)
  const [editingSpec, setEditingSpec] = useState<SpecialistRow | null>(null)

  const systemName = (id: string) => systems.find(s => s.id === id)?.name ?? '—'
  const moduleName = (id: string | null) => id ? (modules.find(m => m.id === id)?.name ?? '—') : null

  return (
    <PageWrapper title="Actualizaciones" description="Catálogo de sistemas, módulos y especialistas técnicos" actions={null}>
      <div className="flex items-center gap-1 border-b border-slate-200 mb-5">
        {[
          { key: 'sistemas', label: 'Sistemas', icon: Server },
          { key: 'modulos', label: 'Módulos', icon: Boxes },
          { key: 'especialistas', label: 'Especialistas', icon: Users },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-[#1a4fa0] text-[#1a4fa0]' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Cargando...</div>
      ) : (
        <>
          {tab === 'sistemas' && (
            <SystemsPanel
              systems={systems}
              onCreate={() => { setEditingSystem(null); setShowSystemForm(true) }}
              onEdit={(s) => { setEditingSystem(s); setShowSystemForm(true) }}
              onToggle={async (s) => { await updateSystem(s.id, { name: s.name, is_active: !s.is_active }); fetchAll() }}
            />
          )}
          {tab === 'modulos' && (
            <ModulesPanel
              modules={modules}
              systemName={systemName}
              onCreate={() => { setEditingModule(null); setShowModuleForm(true) }}
              onEdit={(m) => { setEditingModule(m); setShowModuleForm(true) }}
              onToggle={async (m) => { await updateModuleCatalog(m.id, { system_id: m.system_id, name: m.name, is_active: !m.is_active }); fetchAll() }}
            />
          )}
          {tab === 'especialistas' && (
            <SpecialistsPanel
              specialists={specialists}
              systemName={systemName}
              moduleName={moduleName}
              onCreate={() => { setEditingSpec(null); setShowSpecForm(true) }}
              onEdit={(s) => { setEditingSpec(s); setShowSpecForm(true) }}
              onToggle={async (s) => {
                await updateSpecialist(s.id, {
                  system_id: s.system_id, module_id: s.module_id,
                  team_type: s.team_type, specialist_user_id: s.specialist_user_id,
                  is_active: !s.is_active,
                })
                fetchAll()
              }}
            />
          )}
        </>
      )}

      {showSystemForm && (
        <SystemFormModal
          system={editingSystem ?? undefined}
          onClose={() => setShowSystemForm(false)}
          onSaved={() => { setShowSystemForm(false); fetchAll() }}
        />
      )}
      {showModuleForm && (
        <ModuleFormModal
          moduleRow={editingModule ?? undefined}
          systems={systems}
          onClose={() => setShowModuleForm(false)}
          onSaved={() => { setShowModuleForm(false); fetchAll() }}
        />
      )}
      {showSpecForm && (
        <SpecialistFormModal
          spec={editingSpec ?? undefined}
          systems={systems}
          modules={modules}
          onClose={() => setShowSpecForm(false)}
          onSaved={() => { setShowSpecForm(false); fetchAll() }}
        />
      )}
    </PageWrapper>
  )
}

// ── Panel: Sistemas ─────────────────────────────────────────────────────────
function SystemsPanel({ systems, onCreate, onEdit, onToggle }: {
  systems: SystemRow[]
  onCreate: () => void
  onEdit: (s: SystemRow) => void
  onToggle: (s: SystemRow) => void
}) {
  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={onCreate} className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-[#1a4fa0] rounded-lg hover:bg-blue-700 transition">
          <Plus size={15} /> Nuevo sistema
        </button>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Estatus</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {systems.map(s => (
              <tr key={s.id} className="hover:bg-slate-50/50">
                <td className="px-4 py-3 font-medium text-slate-800">{s.name}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {s.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => onEdit(s)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition"><Pencil size={14} /></button>
                  <button onClick={() => onToggle(s)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition ml-1"><Power size={14} /></button>
                </td>
              </tr>
            ))}
            {systems.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400 text-sm">Sin sistemas registrados</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Panel: Módulos ────────────────────────────────────────────────────────
function ModulesPanel({ modules, systemName, onCreate, onEdit, onToggle }: {
  modules: ModuleRow[]
  systemName: (id: string) => string
  onCreate: () => void
  onEdit: (m: ModuleRow) => void
  onToggle: (m: ModuleRow) => void
}) {
  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={onCreate} className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-[#1a4fa0] rounded-lg hover:bg-blue-700 transition">
          <Plus size={15} /> Nuevo módulo
        </button>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <th className="px-4 py-3">Sistema</th>
              <th className="px-4 py-3">Módulo</th>
              <th className="px-4 py-3">Estatus</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {modules.map(m => (
              <tr key={m.id} className="hover:bg-slate-50/50">
                <td className="px-4 py-3 text-slate-500">{systemName(m.system_id)}</td>
                <td className="px-4 py-3 font-medium text-slate-800">{m.name}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${m.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {m.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => onEdit(m)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition"><Pencil size={14} /></button>
                  <button onClick={() => onToggle(m)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition ml-1"><Power size={14} /></button>
                </td>
              </tr>
            ))}
            {modules.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400 text-sm">Sin módulos registrados</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Panel: Especialistas ──────────────────────────────────────────────────
function SpecialistsPanel({ specialists, systemName, moduleName, onCreate, onEdit, onToggle }: {
  specialists: SpecialistRow[]
  systemName: (id: string) => string
  moduleName: (id: string | null) => string | null
  onCreate: () => void
  onEdit: (s: SpecialistRow) => void
  onToggle: (s: SpecialistRow) => void
}) {
  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={onCreate} className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-[#1a4fa0] rounded-lg hover:bg-blue-700 transition">
          <Plus size={15} /> Enlazar especialista
        </button>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <th className="px-4 py-3">Persona</th>
              <th className="px-4 py-3">Equipo</th>
              <th className="px-4 py-3">Alcance</th>
              <th className="px-4 py-3">Estatus</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {specialists.map(s => (
              <tr key={s.id} className="hover:bg-slate-50/50">
                <td className="px-4 py-3 font-medium text-slate-800">{s.specialist_user_name ?? s.specialist_user_id}</td>
                <td className="px-4 py-3 text-slate-500">{TEAM_TYPE_LABEL[s.team_type] ?? s.team_type}</td>
                <td className="px-4 py-3 text-slate-500">
                  {s.system_id
                    ? `${systemName(s.system_id)}${moduleName(s.module_id) ? ' · ' + moduleName(s.module_id) : ''}`
                    : <span className="italic text-slate-400">General (catch-all)</span>
                  }
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {s.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => onEdit(s)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition"><Pencil size={14} /></button>
                  <button onClick={() => onToggle(s)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition ml-1"><Power size={14} /></button>
                </td>
              </tr>
            ))}
            {specialists.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm">Sin especialistas enlazados</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Modal: Sistema ────────────────────────────────────────────────────────
function SystemFormModal({ system, onClose, onSaved }: { system?: SystemRow; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(system?.name ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!name.trim()) return setError('El nombre es obligatorio')
    setSaving(true)
    try {
      if (system) await updateSystem(system.id, { name: name.trim(), is_active: system.is_active })
      else await createSystem({ name: name.trim() })
      onSaved()
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo guardar')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h2 className="text-base font-semibold text-slate-800 mb-4">{system ? 'Editar sistema' : 'Nuevo sistema'}</h2>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Nombre</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. TOTVS, Odoo, Edicom"
          className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 outline-none focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#1a4fa0]/10 mb-2"
        />
        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
        <div className="flex justify-end gap-3 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-[#1a4fa0] rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal: Módulo ─────────────────────────────────────────────────────────
function ModuleFormModal({ moduleRow, systems, onClose, onSaved }: {
  moduleRow?: ModuleRow; systems: SystemRow[]; onClose: () => void; onSaved: () => void
}) {
  const [name, setName] = useState(moduleRow?.name ?? '')
  const [systemId, setSystemId] = useState(moduleRow?.system_id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!name.trim() || !systemId) return setError('Sistema y nombre son obligatorios')
    setSaving(true)
    try {
      if (moduleRow) await updateModuleCatalog(moduleRow.id, { system_id: systemId, name: name.trim(), is_active: moduleRow.is_active })
      else await createModuleCatalog({ system_id: systemId, name: name.trim() })
      onSaved()
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo guardar')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h2 className="text-base font-semibold text-slate-800 mb-4">{moduleRow ? 'Editar módulo' : 'Nuevo módulo'}</h2>

        <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Sistema</label>
        <select
          value={systemId}
          onChange={(e) => setSystemId(e.target.value)}
          className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 outline-none focus:border-[#1a4fa0] mb-3"
        >
          <option value="">Selecciona un sistema</option>
          {systems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Nombre del módulo</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. Facturación, Compras, Nómina"
          className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 outline-none focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#1a4fa0]/10 mb-2"
        />
        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
        <div className="flex justify-end gap-3 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-[#1a4fa0] rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal: Especialista (con el filtro por rol en vivo) ──────────────────
function SpecialistFormModal({ spec, systems, modules, onClose, onSaved }: {
  spec?: SpecialistRow; systems: SystemRow[]; modules: ModuleRow[]; onClose: () => void; onSaved: () => void
}) {
  const [teamType, setTeamType] = useState(spec?.team_type ?? 'especialista-funcional')
  const [scopeType, setScopeType] = useState<'catchall' | 'especifico'>(spec?.system_id ? 'especifico' : 'catchall')
  const [systemId, setSystemId] = useState(spec?.system_id ?? '')
  const [moduleId, setModuleId] = useState(spec?.module_id ?? '')
  const [userId, setUserId] = useState(spec?.specialist_user_id ?? '')
  const [users, setUsers] = useState<UserOption[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // El desplegable de personas se refiltra en vivo segun el rol requerido:
  // catch-all exige el rol Especialista X; un anclaje especifico acepta
  // tambien el rol generico "Tecnico" (ademas de Incident Manager, que el
  // backend ya acepta sin necesidad de que aparezca en esta lista).
  useEffect(() => {
    const roleToQuery = scopeType === 'catchall' ? teamType : 'tecnico'
    setLoadingUsers(true)
    getUsersByRole(roleToQuery)
      .then(res => setUsers(res.data?.data ?? []))
      .catch(() => setUsers([]))
      .finally(() => setLoadingUsers(false))
  }, [teamType, scopeType])

  const modulesForSystem = modules.filter(m => m.system_id === systemId)

  const handleSave = async () => {
    if (!userId) return setError('Selecciona una persona')
    if (scopeType === 'especifico' && !systemId) return setError('Selecciona un sistema para el anclaje específico')
    setSaving(true)
    try {
      const payload = {
        system_id: scopeType === 'especifico' ? systemId : null,
        module_id: scopeType === 'especifico' && moduleId ? moduleId : null,
        team_type: teamType,
        specialist_user_id: userId,
        is_active: spec?.is_active ?? true,
      }
      if (spec) await updateSpecialist(spec.id, payload)
      else await createSpecialist(payload)
      onSaved()
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo guardar')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-base font-semibold text-slate-800 mb-4">{spec ? 'Editar especialista' : 'Enlazar especialista'}</h2>

        <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Equipo</label>
        <select
          value={teamType}
          onChange={(e) => setTeamType(e.target.value)}
          className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 outline-none focus:border-[#1a4fa0] mb-3"
        >
          <option value="especialista-funcional">Funcional</option>
          <option value="especialista-tecnico">Técnico</option>
          <option value="incident-manager">Incident Manager (para Control de Cambios)</option>
        </select>

        <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Alcance</label>
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={() => setScopeType('catchall')}
            className={`flex-1 px-3 py-2 rounded-lg border-2 text-xs font-medium transition ${scopeType === 'catchall' ? 'border-[#1a4fa0] bg-blue-50 text-[#1a4fa0]' : 'border-slate-200 text-slate-500'}`}
          >
            General (catch-all)
          </button>
          <button
            type="button"
            onClick={() => setScopeType('especifico')}
            className={`flex-1 px-3 py-2 rounded-lg border-2 text-xs font-medium transition ${scopeType === 'especifico' ? 'border-[#1a4fa0] bg-blue-50 text-[#1a4fa0]' : 'border-slate-200 text-slate-500'}`}
          >
            Sistema específico
          </button>
        </div>

        {scopeType === 'especifico' && (
          <>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Sistema</label>
            <select
              value={systemId}
              onChange={(e) => { setSystemId(e.target.value); setModuleId('') }}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 outline-none focus:border-[#1a4fa0] mb-3"
            >
              <option value="">Selecciona un sistema</option>
              {systems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>

            {systemId && modulesForSystem.length > 0 && (
              <>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Módulo (opcional)</label>
                <select
                  value={moduleId}
                  onChange={(e) => setModuleId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 outline-none focus:border-[#1a4fa0] mb-3"
                >
                  <option value="">Todo el sistema</option>
                  {modulesForSystem.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </>
            )}
          </>
        )}

        <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
          Persona {scopeType === 'catchall' ? '(con rol de Especialista)' : '(con rol Técnico o Especialista)'}
        </label>
        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          disabled={loadingUsers}
          className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 outline-none focus:border-[#1a4fa0] mb-2 disabled:opacity-50"
        >
          <option value="">{loadingUsers ? 'Cargando...' : users.length === 0 ? 'Nadie tiene este rol asignado todavía' : 'Selecciona una persona'}</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        {!loadingUsers && users.length === 0 && (
          <p className="text-xs text-amber-600 mb-2">
            Nadie tiene el rol requerido en /admin/roles todavía. Asígnalo primero y vuelve aquí.
          </p>
        )}

        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
        <div className="flex justify-end gap-3 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-[#1a4fa0] rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
