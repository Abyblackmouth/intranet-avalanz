'use client'

import { useState, useEffect } from 'react'
import { X, User, Mail, Hash, Briefcase, Building2, Shield, Layers, Plus, Trash2 } from 'lucide-react'
import { getUser, updateUser, getGlobalRoles, assignGlobalRole, removeGlobalRole, getModules, assignModuleAccess, revokeModuleAccess } from '@/services/adminService'
import api from '@/services/api'
import { getOperationalRoles } from '@/services/roleService'
import { useAuthStore } from '@/store/authStore'
import { UpdateUserPayload } from '@/types/user.types'

interface UserEditFormProps {
  userId: string
  onClose: () => void
  onSuccess: () => void
}

interface GlobalRole {
  role_id: string
  name: string
  slug: string
}

interface OperationalRole {
  role_id: string
  name: string
  slug: string
  scope: 'empresa' | 'corporativo'
}

interface Module {
  module_id: string
  name: string
  slug: string
}

interface ModuleAccessRow {
  module_id: string
  module_name: string
  role_id: string | null
  role_name: string
}

export default function UserEditForm({ userId, onClose, onSuccess }: UserEditFormProps) {
  const { isSuperAdmin, user } = useAuthStore()

  const [form, setForm] = useState({
    company_id: '',
    full_name: '',
    email: '',
    matricula: '',
    puesto: '',
    departamento: '',
  })
  const [companies, setCompanies] = useState<{ company_id: string; nombre_comercial: string }[]>([])

  const [globalRoles, setGlobalRoles] = useState<GlobalRole[]>([])
  const [operationalRoles, setOperationalRoles] = useState<OperationalRole[]>([])
  const [modules, setModules] = useState<Module[]>([])
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [currentRoles, setCurrentRoles] = useState<string[]>([])
  const [moduleAccesses, setModuleAccesses] = useState<ModuleAccessRow[]>([])
  const [isProtected, setIsProtected] = useState(false)

  // Para agregar nuevo acceso
  const [addingModuleId, setAddingModuleId] = useState('')
  const [addingRoleId, setAddingRoleId] = useState('')
  const [showAddModule, setShowAddModule] = useState(false)

  const [isLoading, setIsLoading] = useState(false)
  const [isFetching, setIsFetching] = useState(true)
  const [error, setError] = useState('')
  const [userName, setUserName] = useState('')

  const canEditGlobalRoles = isSuperAdmin()
  const canEditModuleRoles = isSuperAdmin() || (user?.roles?.includes('admin_empresa') ?? false)

  useEffect(() => {
    const load = async () => {
      try {
        const [userRes, rolesRes, opRolesRes, modulesRes, companiesRes] = await Promise.all([
          getUser(userId),
          getGlobalRoles(),
          getOperationalRoles({ per_page: 100 }),
          getModules(),
          api.get('/api/v1/companies/', { params: { per_page: 100, is_active: true } }),
        ])

        const user = userRes.data.data
        setUserName(user.full_name)
        setIsProtected(user.is_protected ?? false)
        setGlobalRoles(rolesRes.data.data.data || rolesRes.data.data || [])
        setOperationalRoles(opRolesRes.data.data.data || [])
        setModules(modulesRes.data.data.data || modulesRes.data.data || [])
        setCurrentRoles(user.roles || [])

        setCompanies(companiesRes.data.data.data || [])
        setForm({
          company_id: user.company_id || '',
          full_name: user.full_name || '',
          email: user.email || '',
          matricula: user.matricula || '',
          puesto: user.puesto || '',
          departamento: user.departamento || '',
        })

        // Cargar accesos a módulos del usuario
        const permRes = await import('@/services/adminService').then(m => m.getUserPermissions(userId))
        const perms = permRes.data?.data
        const accesses: ModuleAccessRow[] = (perms?.modules || []).map((mod: any) => {
          const role = (user.roles || []).find((r: string) => r.includes(mod.slug))
          return {
            module_id: mod.module_id || mod.slug,
            module_name: mod.name || mod.slug,
            role_id: null,
            role_name: role || '',
          }
        })
        setModuleAccesses(accesses)

      } catch {
        setError('Error al cargar datos del usuario')
      } finally {
        setIsFetching(false)
      }
    }
    load()
  }, [userId])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  const handleAddModule = async () => {
    if (!addingModuleId || !addingRoleId) return
    try {
      await assignModuleAccess(userId, { module_id: addingModuleId, role_id: addingRoleId })
      const mod = modules.find(m => m.module_id === addingModuleId)
      const role = operationalRoles.find(r => r.role_id === addingRoleId)
      setModuleAccesses(prev => [...prev, {
        module_id: addingModuleId,
        module_name: mod?.name || '',
        role_id: addingRoleId,
        role_name: role?.name || '',
      }])
      setAddingModuleId('')
      setAddingRoleId('')
      setShowAddModule(false)
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Error al asignar módulo')
    }
  }

  const handleRevokeModule = async (moduleId: string) => {
    try {
      await revokeModuleAccess(userId, moduleId)
      setModuleAccesses(prev => prev.filter(a => a.module_id !== moduleId))
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Error al revocar módulo')
    }
  }

  const handleSubmit = async () => {
    setError('')
    if (!form.full_name.trim()) return setError('El nombre completo es requerido')
    if (!form.email.trim()) return setError('El correo es requerido')

    setIsLoading(true)
    try {
      const payload: UpdateUserPayload = {
        company_id: form.company_id || undefined,
        full_name: form.full_name || undefined,
        email: form.email || undefined,
        puesto: form.puesto || undefined,
        departamento: form.departamento || undefined,
      }

      // matricula solo super_admin puede editarla
      if (isSuperAdmin() && form.matricula !== undefined) {
        payload.matricula = form.matricula || undefined
      }

      await updateUser(userId, payload)

      // Cambio de rol global — solo super_admin
      if (canEditGlobalRoles && selectedRoleId && selectedRoleId.length > 10) {
        for (const role of globalRoles) {
          if (currentRoles.includes(role.slug)) {
            try { await removeGlobalRole(userId, role.role_id) } catch {}
          }
        }
        await assignGlobalRole(userId, selectedRoleId)
      }

      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Error al actualizar el usuario')
    } finally {
      setIsLoading(false)
    }
  }

  const availableModules = modules.filter(
    m => !moduleAccesses.find(a => a.module_id === m.module_id)
  )

  // Filtrar roles globales que admin_empresa NO puede asignar
  const assignableGlobalRoles = globalRoles.filter(r =>
    r.slug !== 'super_admin' && r.slug !== 'admin_empresa'
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative w-full max-w-lg h-full bg-white shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          {isFetching ? (
            <div className="h-5 w-48 bg-slate-100 rounded animate-pulse" />
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#1a4fa0] flex items-center justify-center shrink-0">
                <span className="text-white text-sm font-bold">
                  {userName.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()}
                </span>
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Editar usuario</h2>
                <p className="text-xs text-slate-500">{form.email}</p>
              </div>
            </div>
          )}
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition">
            <X size={18} />
          </button>
        </div>

        {/* Formulario */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {isFetching ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              {/* Empresa — solo super_admin */}
              {isSuperAdmin() && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                    Empresa
                  </label>
                  <div className="relative">
                    <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <select
                      value={form.company_id}
                      onChange={e => setForm(prev => ({ ...prev, company_id: e.target.value }))}
                      className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1a4fa0] focus:border-transparent"
                    >
                      <option value="">Sin cambios</option>
                      {companies.map(c => (
                        <option key={c.company_id} value={c.company_id}>{c.nombre_comercial}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Nombre completo */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                  Nombre completo <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    name="full_name"
                    value={form.full_name}
                    onChange={handleChange}
                    placeholder="Nombre completo"
                    className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                  Correo electrónico <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="usuario@empresa.com"
                    className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Matricula — solo super_admin */}
              {isSuperAdmin() && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                    Matrícula / No. empleado
                  </label>
                  <div className="relative">
                    <Hash size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      name="matricula"
                      value={form.matricula}
                      onChange={handleChange}
                      placeholder="Ej. EMP-001"
                      className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              )}

              {/* Puesto y Departamento */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                    Puesto
                  </label>
                  <div className="relative">
                    <Briefcase size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      name="puesto"
                      value={form.puesto}
                      onChange={handleChange}
                      placeholder="Ej. Analista"
                      className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                    Departamento
                  </label>
                  <div className="relative">
                    <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      name="departamento"
                      value={form.departamento}
                      onChange={handleChange}
                      placeholder="Ej. TI"
                      className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Rol global — solo super_admin */}
              {canEditGlobalRoles && !isProtected && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                    Rol global
                  </label>
                  <div className="relative">
                    <Shield size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <select
                      value={selectedRoleId}
                      onChange={e => setSelectedRoleId(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Sin cambios</option>
                      {globalRoles.map(r => (
                        <option key={r.role_id} value={r.role_id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                  {currentRoles.filter(r => ['super_admin', 'admin_empresa'].includes(r)).length > 0 && (
                    <p className="text-xs text-slate-400 mt-1">
                      Rol actual: {currentRoles.filter(r => ['super_admin', 'admin_empresa'].includes(r)).join(', ')}
                    </p>
                  )}
                </div>
              )}

              {/* Accesos a módulos */}
              {canEditModuleRoles && !isProtected && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
                      <Layers size={13} className="inline mr-1.5 text-slate-400" />
                      Acceso a módulos
                    </label>
                    {availableModules.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowAddModule(!showAddModule)}
                        className="flex items-center gap-1 text-xs text-[#1a4fa0] font-medium hover:underline"
                      >
                        <Plus size={12} />
                        Agregar
                      </button>
                    )}
                  </div>

                  {/* Módulos asignados */}
                  {moduleAccesses.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {moduleAccesses.map(access => (
                        <div key={access.module_id} className="flex items-center justify-between px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                          <div>
                            <p className="text-sm font-medium text-blue-900">{access.module_name}</p>
                            <p className="text-xs text-blue-600">{access.role_name || 'Sin rol de módulo'}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRevokeModule(access.module_id)}
                            className="text-blue-400 hover:text-red-500 transition p-1"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Agregar módulo */}
                  {showAddModule && availableModules.length > 0 && (
                    <div className="flex gap-2">
                      <select
                        value={addingModuleId}
                        onChange={e => setAddingModuleId(e.target.value)}
                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Módulo</option>
                        {availableModules.map(m => (
                          <option key={m.module_id} value={m.module_id}>{m.name}</option>
                        ))}
                      </select>
                      <select
                        value={addingRoleId}
                        onChange={e => setAddingRoleId(e.target.value)}
                        disabled={operationalRoles.length === 0}
                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                      >
                        <option value="">Rol</option>
                        {operationalRoles.map(r => (
                          <option key={r.role_id} value={r.role_id}>{r.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleAddModule}
                        disabled={!addingModuleId || !addingRoleId}
                        className="px-3 py-2 bg-[#1a4fa0] text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                      >
                        +
                      </button>
                    </div>
                  )}

                  {moduleAccesses.length === 0 && !showAddModule && (
                    <p className="text-xs text-slate-400 text-center py-2">Sin acceso a módulos asignado</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading || isFetching}
            className="px-5 py-2 text-sm font-medium bg-[#1a4fa0] text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Guardando...
              </>
            ) : (
              'Guardar cambios'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
