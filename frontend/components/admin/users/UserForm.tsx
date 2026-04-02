'use client'

import { useState, useEffect } from 'react'
import { X, User, Mail, Hash, Briefcase, Building2, Shield, Layers, ChevronDown, ChevronUp } from 'lucide-react'
import { createUser } from '@/services/adminService'
import { getCompanies } from '@/services/adminService'
import { getGlobalRoles } from '@/services/adminService'
import { getModules, getModuleRoles } from '@/services/adminService'
import { useAuthStore } from '@/store/authStore'
import { CreateUserPayload } from '@/types/user.types'

interface UserFormProps {
  onClose: () => void
  onSuccess: () => void
}

interface Company {
  company_id: string
  nombre_comercial: string
}

interface GlobalRole {
  id: string
  name: string
  slug: string
}

interface Module {
  id: string
  name: string
  slug: string
}

interface ModuleRole {
  id: string
  name: string
  slug: string
}

interface ModuleAccess {
  module_id: string
  module_name: string
  role_id: string
}

export default function UserForm({ onClose, onSuccess }: UserFormProps) {
  const { isSuperAdmin } = useAuthStore()

  // Datos del formulario
  const [form, setForm] = useState({
    company_id: '',
    email: '',
    full_name: '',
    matricula: '',
    puesto: '',
    departamento: '',
    is_super_admin: false,
    global_role_id: '',
  })

  // Modulos seleccionados
  const [moduleAccesses, setModuleAccesses] = useState<ModuleAccess[]>([])
  const [selectedModuleId, setSelectedModuleId] = useState('')
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [moduleRoles, setModuleRoles] = useState<ModuleRole[]>([])

  // Datos del API
  const [companies, setCompanies] = useState<Company[]>([])
  const [globalRoles, setGlobalRoles] = useState<GlobalRole[]>([])
  const [modules, setModules] = useState<Module[]>([])

  // UI
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [showModules, setShowModules] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      try {
        const [companiesRes, rolesRes, modulesRes] = await Promise.all([
          getCompanies({ per_page: 100 }),
          getGlobalRoles(),
          getModules(),
        ])
        setCompanies(companiesRes.data.data.data || [])
        setGlobalRoles(rolesRes.data.data.data || rolesRes.data.data || [])
        setModules(modulesRes.data.data.data || modulesRes.data.data || [])
      } catch {
        setError('Error al cargar datos del formulario')
      }
    }
    loadData()
  }, [])

  useEffect(() => {
    if (!selectedModuleId) {
      setModuleRoles([])
      setSelectedRoleId('')
      return
    }
    const loadRoles = async () => {
      try {
        const res = await getModuleRoles(selectedModuleId)
        setModuleRoles(res.data.data.data || res.data.data || [])
        setSelectedRoleId('')
      } catch {
        setModuleRoles([])
      }
    }
    loadRoles()
  }, [selectedModuleId])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }))
  }

  const addModuleAccess = () => {
    if (!selectedModuleId || !selectedRoleId) return
    if (moduleAccesses.find(a => a.module_id === selectedModuleId)) return

    const module = modules.find(m => m.id === selectedModuleId)
    setModuleAccesses(prev => [
      ...prev,
      {
        module_id: selectedModuleId,
        module_name: module?.name || '',
        role_id: selectedRoleId,
      },
    ])
    setSelectedModuleId('')
    setSelectedRoleId('')
  }

  const removeModuleAccess = (moduleId: string) => {
    setModuleAccesses(prev => prev.filter(a => a.module_id !== moduleId))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!form.company_id) return setError('Selecciona una empresa')
    if (!form.email) return setError('El email es requerido')
    if (!form.full_name) return setError('El nombre completo es requerido')

    setIsLoading(true)
    try {
      const payload: CreateUserPayload = {
        company_id: form.company_id,
        email: form.email,
        full_name: form.full_name,
        matricula: form.matricula || undefined,
        puesto: form.puesto || undefined,
        departamento: form.departamento || undefined,
        is_super_admin: form.is_super_admin,
        global_role_id: form.global_role_id || undefined,
        module_accesses: moduleAccesses.map(a => ({
          module_id: a.module_id,
          role_id: a.role_id,
        })),
      }

      await createUser(payload)
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Error al crear el usuario')
    } finally {
      setIsLoading(false)
    }
  }

  const availableModules = modules.filter(
    m => !moduleAccesses.find(a => a.module_id === m.id)
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Drawer */}
      <div className="relative w-full max-w-lg h-full bg-white shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Nuevo usuario</h2>
            <p className="text-xs text-slate-500 mt-0.5">La contraseña temporal se enviará por correo</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Empresa */}
          {isSuperAdmin() && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                Empresa <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select
                  name="company_id"
                  value={form.company_id}
                  onChange={handleChange}
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Seleccionar empresa</option>
                  {companies.map(c => (
                    <option key={c.company_id} value={c.company_id}>{c.nombre_comercial}</option>
                  ))}
                </select>
              </div>
            </div>
          )}


          {/* Matricula */}
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
                placeholder="Ej. Juan Pérez García"
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



          {/* Puesto y Departamento en fila */}
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

          {/* Rol global */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
              Rol global
            </label>
            <div className="relative">
              <Shield size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select
                name="global_role_id"
                value={form.global_role_id}
                onChange={handleChange}
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Sin rol global</option>
                {globalRoles.map(r => (
                  <option key={r.role_id} value={r.role_id}>{r.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Modulos */}
          <div>
            <button
              type="button"
              onClick={() => setShowModules(!showModules)}
              className="w-full flex items-center justify-between px-4 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition"
            >
              <div className="flex items-center gap-2">
                <Layers size={15} className="text-slate-400" />
                <span>Acceso a módulos</span>
                {moduleAccesses.length > 0 && (
                  <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                    {moduleAccesses.length}
                  </span>
                )}
              </div>
              {showModules ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>

            {showModules && (
              <div className="mt-3 space-y-3">

                {/* Modulos asignados */}
                {moduleAccesses.length > 0 && (
                  <div className="space-y-2">
                    {moduleAccesses.map(access => (
                      <div
                        key={access.module_id}
                        className="flex items-center justify-between px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg"
                      >
                        <div>
                          <p className="text-sm font-medium text-blue-900">{access.module_name}</p>
                          <p className="text-xs text-blue-600">
                            {moduleRoles.find(r => r.id === access.role_id)?.name || 'Rol asignado'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeModuleAccess(access.module_id)}
                          className="text-blue-400 hover:text-red-500 transition"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Agregar modulo */}
                {availableModules.length > 0 && (
                  <div className="flex gap-2">
                    <select
                      value={selectedModuleId}
                      onChange={e => setSelectedModuleId(e.target.value)}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Seleccionar módulo</option>
                      {availableModules.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                    <select
                      value={selectedRoleId}
                      onChange={e => setSelectedRoleId(e.target.value)}
                      disabled={!selectedModuleId || moduleRoles.length === 0}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                      <option value="">Seleccionar rol</option>
                      {moduleRoles.map(r => (
                        <option key={r.role_id} value={r.role_id}>{r.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={addModuleAccess}
                      disabled={!selectedModuleId || !selectedRoleId}
                      className="px-3 py-2 bg-[#1a4fa0] text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      +
                    </button>
                  </div>
                )}

                {availableModules.length === 0 && moduleAccesses.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-2">No hay módulos disponibles</p>
                )}
              </div>
            )}
          </div>

          {/* Super admin toggle — solo super admin puede ver esto */}
          {isSuperAdmin() && (
            <div className="flex items-center justify-between px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div>
                <p className="text-sm font-medium text-amber-900">Super Administrador</p>
                <p className="text-xs text-amber-600">Acceso total a toda la plataforma</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  name="is_super_admin"
                  checked={form.is_super_admin}
                  onChange={handleChange}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-slate-200 rounded-full peer peer-checked:bg-amber-500 peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
              </label>
            </div>
          )}

        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="px-5 py-2 text-sm font-medium bg-[#1a4fa0] text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Creando...
              </>
            ) : (
              'Crear usuario'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}