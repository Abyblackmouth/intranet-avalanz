'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Server, Plus, Pencil, Power, Search, KeyRound, Globe, Link2, Timer } from 'lucide-react'
import PageWrapper from '@/components/layout/PageWrapper'
import SlaConfig from '@/components/app/it-service-desk/actualizaciones/SlaConfig'
import ControlAccesosConfig from '@/components/app/it-service-desk/actualizaciones/ControlAccesosConfig'
import {
  getSystems, createSystem, updateSystem,
  getModulesCatalog, createModuleCatalog, updateModuleCatalog,
  getSpecialists, createSpecialist, updateSpecialist,
  getUsersByRole,
} from '@/services/itServiceDeskService'

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
// Grupos del detalle, en este orden
const EQUIPOS: { key: string; label: string }[] = [
  { key: 'especialista-funcional', label: 'Funcional' },
  { key: 'especialista-tecnico', label: 'Técnico' },
  { key: 'project-manager', label: 'Project Manager' },
  { key: 'incident-manager', label: 'Incident Manager' },
]
const GENERAL = '__general__'

function Switch({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onClick}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}>
      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
    </button>
  )
}

export default function ActualizacionesPage() {
  const [tab, setTab] = useState<'catalogo' | 'accesos' | 'sla'>('catalogo')
  const [systems, setSystems] = useState<SystemRow[]>([])
  const [modules, setModules] = useState<ModuleRow[]>([])
  const [specialists, setSpecialists] = useState<SpecialistRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [nuevoModulo, setNuevoModulo] = useState('')
  const [errorModulo, setErrorModulo] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    try {
      const [sysRes, modRes, specRes] = await Promise.all([getSystems(), getModulesCatalog(), getSpecialists()])
      setSystems(sysRes.data?.data ?? [])
      setModules(modRes.data?.data ?? [])
      setSpecialists(specRes.data?.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => { if (!sel && systems.length) setSel(systems.find(s => s.is_active)?.id ?? systems[0].id) }, [systems, sel])

  const [showSystemForm, setShowSystemForm] = useState(false)
  const [editingSystem, setEditingSystem] = useState<SystemRow | null>(null)
  const [showModuleForm, setShowModuleForm] = useState(false)
  const [editingModule, setEditingModule] = useState<ModuleRow | null>(null)
  const [showSpecForm, setShowSpecForm] = useState(false)
  const [editingSpec, setEditingSpec] = useState<SpecialistRow | null>(null)

  const conteo = useMemo(() => {
    const m: Record<string, { mods: number; specs: number }> = {}
    for (const s of systems) m[s.id] = { mods: 0, specs: 0 }
    for (const x of modules) if (x.is_active && m[x.system_id]) m[x.system_id].mods++
    for (const x of specialists) if (x.is_active) { const k = x.system_id ?? GENERAL; m[k] = m[k] ?? { mods: 0, specs: 0 }; m[k].specs++ }
    return m
  }, [systems, modules, specialists])

  const toggleSystem = async (s: SystemRow) => { await updateSystem(s.id, { name: s.name, is_active: !s.is_active }); fetchAll() }
  const toggleModule = async (m: ModuleRow) => { await updateModuleCatalog(m.id, { system_id: m.system_id, name: m.name, is_active: !m.is_active }); fetchAll() }
  const toggleSpec = async (s: SpecialistRow) => {
    await updateSpecialist(s.id, { system_id: s.system_id, module_id: s.module_id, team_type: s.team_type, specialist_user_id: s.specialist_user_id, is_active: !s.is_active })
    fetchAll()
  }
  const agregarModulo = async () => {
    if (!sel || sel === GENERAL || !nuevoModulo.trim()) return
    setErrorModulo(null)
    try { await createModuleCatalog({ system_id: sel, name: nuevoModulo.trim() }); setNuevoModulo(''); fetchAll() }
    catch (e: any) { setErrorModulo(e?.response?.data?.detail ?? 'No se pudo agregar el módulo') }
  }

  const filtrados = systems
    .filter(s => !q.trim() || s.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name))
  const sistema = systems.find(s => s.id === sel) ?? null
  const esGeneral = sel === GENERAL
  const modsSel = modules.filter(m => m.system_id === sel).sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name))
  const specsSel = specialists.filter(s => (esGeneral ? !s.system_id : s.system_id === sel))
  const specsPorModulo = (id: string) => specialists.filter(s => s.module_id === id && s.is_active).length
  const equiposSel = [
    ...EQUIPOS.map(e => ({ ...e, lista: specsSel.filter(s => s.team_type === e.key) })),
    { key: 'otros', label: 'Otros', lista: specsSel.filter(s => !EQUIPOS.some(e => e.key === s.team_type)) },
  ].filter(g => g.lista.length)
  const moduloNombre = (id: string | null) => (id ? modules.find(m => m.id === id)?.name : null)

  return (
    <PageWrapper title="Actualizaciones" description="Catálogo de sistemas, módulos y especialistas · formatos de Control de accesos" actions={null}>
      <div className="flex items-center gap-1 border-b border-slate-200 mb-4">
        {[{ key: 'catalogo', label: 'Catálogo', icon: Server }, { key: 'accesos', label: 'Control de accesos', icon: KeyRound }, { key: 'sla', label: 'SLA', icon: Timer }].map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key as any)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t.key ? 'border-[#1a4fa0] text-[#1a4fa0]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'accesos' && <ControlAccesosConfig />}
      {tab === 'sla' && <SlaConfig />}

      {tab === 'catalogo' && (loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Cargando…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[290px_minmax(0,1fr)] gap-4 lg:h-[calc(100vh-215px)] lg:min-h-[480px]">
          {/* ── Lista de sistemas ── */}
          <aside className="hidden lg:flex flex-col bg-white border border-slate-300 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-3 border-b border-slate-200 grid gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar sistema" aria-label="Buscar sistema"
                  className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#1a4fa0]/15" />
              </div>
              <button type="button" onClick={() => { setEditingSystem(null); setShowSystemForm(true) }}
                className="inline-flex items-center justify-center gap-1.5 py-1.5 text-sm font-medium text-[#1a4fa0] border border-dashed border-[#1a4fa0]/40 rounded-lg hover:bg-blue-50">
                <Plus size={14} /> Nuevo sistema
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-2" aria-label="Sistemas">
              <button type="button" onClick={() => setSel(GENERAL)} aria-current={esGeneral}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left mb-1 ${esGeneral ? 'bg-[#1a4fa0] text-white' : 'hover:bg-slate-100 text-slate-700'}`}>
                <Globe size={15} className={esGeneral ? 'text-white' : 'text-slate-400'} />
                <span className="flex-1 text-sm font-semibold italic">General (catch-all)</span>
                <span className={`text-[11px] font-mono ${esGeneral ? 'text-white/80' : 'text-slate-400'}`}>{conteo[GENERAL]?.specs ?? 0}</span>
              </button>
              <div className="h-px bg-slate-100 my-1.5" />
              {filtrados.map(s => {
                const activo = s.id === sel
                const c = conteo[s.id] ?? { mods: 0, specs: 0 }
                return (
                  <button key={s.id} type="button" onClick={() => setSel(s.id)} aria-current={activo}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left ${activo ? 'bg-[#1a4fa0] text-white' : 'hover:bg-slate-100'} ${s.is_active ? '' : 'opacity-50'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.is_active ? (activo ? 'bg-white' : 'bg-emerald-500') : 'bg-slate-400'}`} />
                    <span className={`flex-1 min-w-0 truncate text-sm font-medium ${activo ? 'text-white' : 'text-slate-800'}`}>{s.name}</span>
                    <span className={`text-[11px] font-mono shrink-0 ${activo ? 'text-white/80' : 'text-slate-400'}`} title={`${c.mods} módulos · ${c.specs} especialistas`}>{c.mods}·{c.specs}</span>
                  </button>
                )
              })}
              {filtrados.length === 0 && <p className="text-center text-[13px] text-slate-400 py-6">Sin coincidencias</p>}
            </nav>
            <p className="px-3 py-2 border-t border-slate-100 text-[11px] text-slate-400">Números: módulos · especialistas activos</p>
          </aside>

          {/* Selector en pantallas angostas */}
          <div className="lg:hidden flex gap-2">
            <select value={sel ?? ''} onChange={e => setSel(e.target.value)} aria-label="Sistema"
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
              <option value={GENERAL}>General (catch-all)</option>
              {filtrados.map(s => <option key={s.id} value={s.id}>{s.name}{s.is_active ? '' : ' (inactivo)'}</option>)}
            </select>
            <button type="button" onClick={() => { setEditingSystem(null); setShowSystemForm(true) }} aria-label="Nuevo sistema"
              className="px-3 rounded-lg text-white bg-[#1a4fa0]"><Plus size={16} /></button>
          </div>

          {/* ── Detalle ── */}
          <section className="min-w-0 flex flex-col gap-4 lg:overflow-y-auto lg:pr-1">
            <header className="bg-white border border-slate-300 rounded-2xl shadow-sm px-5 py-3.5 flex flex-wrap items-center gap-3">
              {esGeneral ? (
                <>
                  <Globe size={18} className="text-slate-400" />
                  <div className="flex-1 min-w-0">
                    <h2 className="font-[family-name:var(--font-jakarta)] text-[17px] font-bold text-slate-900">General (catch-all)</h2>
                    <p className="text-[12.5px] text-slate-500">Especialistas que atienden cualquier sistema cuando nadie está ligado a él.</p>
                  </div>
                </>
              ) : sistema && (
                <>
                  <h2 className="flex-1 min-w-0 truncate font-[family-name:var(--font-jakarta)] text-[17px] font-bold text-slate-900">{sistema.name}</h2>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sistema.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{sistema.is_active ? 'Activo' : 'Inactivo'}</span>
                  <button type="button" onClick={() => { setEditingSystem(sistema); setShowSystemForm(true) }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"><Pencil size={13} /> Editar</button>
                  <button type="button" onClick={() => toggleSystem(sistema)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"><Power size={13} /> {sistema.is_active ? 'Desactivar' : 'Activar'}</button>
                </>
              )}
            </header>

            <div className={`grid gap-4 ${esGeneral ? '' : '2xl:grid-cols-2'} items-start`}>
              {/* Módulos */}
              {!esGeneral && sistema && (
                <div className="bg-white border border-slate-300 rounded-2xl shadow-sm">
                  <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-[14px] font-bold text-slate-900">Módulos <span className="font-normal text-slate-400">· {modsSel.filter(m => m.is_active).length} activos</span></h3>
                  </div>
                  <ul className="p-2 grid sm:grid-cols-2 gap-1">
                    {modsSel.map(m => {
                      const n = specsPorModulo(m.id)
                      return (
                        <li key={m.id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 ${m.is_active ? '' : 'opacity-50'}`}>
                          <span className="flex-1 min-w-0 truncate text-[13.5px] text-slate-800" title={m.name}>{m.name}</span>
                          {n > 0 && <span className="text-[11px] text-slate-400 inline-flex items-center gap-0.5 shrink-0" title={`${n} especialista(s) ligados a este módulo`}><Link2 size={11} />{n}</span>}
                          <button type="button" onClick={() => { setEditingModule(m); setShowModuleForm(true) }} aria-label={`Editar ${m.name}`}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded"><Pencil size={13} /></button>
                          <Switch on={m.is_active} onClick={() => toggleModule(m)} label={`${m.is_active ? 'Desactivar' : 'Activar'} ${m.name}`} />
                        </li>
                      )
                    })}
                    {modsSel.length === 0 && <li className="sm:col-span-2 text-center text-[13px] text-slate-400 py-4">Este sistema aún no tiene módulos.</li>}
                  </ul>
                  <div className="px-3 pb-3">
                    <div className="flex gap-1.5">
                      <input value={nuevoModulo} onChange={e => setNuevoModulo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') agregarModulo() }}
                        placeholder="Agregar módulo y presionar Enter" aria-label="Nuevo módulo"
                        className="flex-1 min-w-0 border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#1a4fa0]/15" />
                      <button type="button" onClick={agregarModulo} disabled={!nuevoModulo.trim()}
                        className="px-3 rounded-lg text-white bg-[#1a4fa0] hover:bg-blue-700 disabled:opacity-40" aria-label="Agregar módulo"><Plus size={15} /></button>
                    </div>
                    {errorModulo && <p className="text-[12px] text-red-600 mt-1">{errorModulo}</p>}
                  </div>
                </div>
              )}

              {/* Especialistas */}
              <div className="bg-white border border-slate-300 rounded-2xl shadow-sm">
                <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
                  <h3 className="text-[14px] font-bold text-slate-900">Especialistas <span className="font-normal text-slate-400">· {specsSel.filter(s => s.is_active).length} activos</span></h3>
                  <button type="button" onClick={() => { setEditingSpec(null); setShowSpecForm(true) }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-white bg-[#1a4fa0] rounded-lg hover:bg-blue-700"><Plus size={14} /> Enlazar especialista</button>
                </div>
                {equiposSel.length === 0 ? (
                  <p className="text-center text-[13px] text-slate-400 py-6">{esGeneral ? 'No hay especialistas generales.' : 'Nadie está ligado a este sistema: sus tickets los atienden los especialistas generales.'}</p>
                ) : (
                  <div className="p-2 grid gap-3">
                    {equiposSel.map(g => (
                      <div key={g.key}>
                        <p className="px-2.5 pt-1 pb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">{g.label}</p>
                        <ul className="grid gap-0.5">
                          {g.lista.sort((a, b) => Number(b.is_active) - Number(a.is_active)).map(s => {
                            const mod = moduloNombre(s.module_id)
                            return (
                              <li key={s.id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 ${s.is_active ? '' : 'opacity-50'}`}>
                                <span className="flex-1 min-w-0">
                                  <span className="block truncate text-[13.5px] font-medium text-slate-800">{s.specialist_user_name ?? s.specialist_user_id}</span>
                                  {!esGeneral && <span className="block text-[12px] text-slate-500">{mod ? `Solo ${mod}` : 'Todo el sistema'}</span>}
                                </span>
                                <button type="button" onClick={() => { setEditingSpec(s); setShowSpecForm(true) }} aria-label="Editar especialista"
                                  className="p-1 text-slate-400 hover:text-slate-700 rounded"><Pencil size={13} /></button>
                                <Switch on={s.is_active} onClick={() => toggleSpec(s)} label={`${s.is_active ? 'Desactivar' : 'Activar'} especialista`} />
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      ))}

      {showSystemForm && (
        <SystemFormModal system={editingSystem ?? undefined} onClose={() => setShowSystemForm(false)}
          onSaved={() => { setShowSystemForm(false); fetchAll() }} />
      )}
      {showModuleForm && (
        <ModuleFormModal moduleRow={editingModule ?? undefined} systems={systems} defaultSystemId={sel && sel !== GENERAL ? sel : undefined}
          onClose={() => setShowModuleForm(false)} onSaved={() => { setShowModuleForm(false); fetchAll() }} />
      )}
      {showSpecForm && (
        <SpecialistFormModal spec={editingSpec ?? undefined} systems={systems} modules={modules} defaultSystemId={sel && sel !== GENERAL ? sel : null}
          onClose={() => setShowSpecForm(false)} onSaved={() => { setShowSpecForm(false); fetchAll() }} />
      )}
    </PageWrapper>
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
function ModuleFormModal({ moduleRow, systems, defaultSystemId, onClose, onSaved }: {
  moduleRow?: ModuleRow; systems: SystemRow[]; defaultSystemId?: string; onClose: () => void; onSaved: () => void
}) {
  const [name, setName] = useState(moduleRow?.name ?? '')
  const [systemId, setSystemId] = useState(moduleRow?.system_id ?? defaultSystemId ?? '')
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
function SpecialistFormModal({ spec, systems, modules, defaultSystemId, onClose, onSaved }: {
  spec?: SpecialistRow; systems: SystemRow[]; modules: ModuleRow[]; defaultSystemId?: string | null; onClose: () => void; onSaved: () => void
}) {
  const [teamType, setTeamType] = useState(spec?.team_type ?? 'especialista-funcional')
  const [scopeType, setScopeType] = useState<'catchall' | 'especifico'>(spec ? (spec.system_id ? 'especifico' : 'catchall') : (defaultSystemId ? 'especifico' : 'catchall'))
  const [systemId, setSystemId] = useState(spec?.system_id ?? defaultSystemId ?? '')
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
