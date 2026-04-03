'use client'

import { useState, useEffect } from 'react'
import { X, User, Mail, Hash, Briefcase, Building2, Shield } from 'lucide-react'
import { getUser, updateUser, getGlobalRoles, assignGlobalRole, removeGlobalRole } from '@/services/adminService'
import { useAuthStore } from '@/store/authStore'
import { UpdateUserPayload } from '@/types/user.types'

interface UserEditFormProps {
  userId: string
  onClose: () => void
  onSuccess: () => void
}

export default function UserEditForm({ userId, onClose, onSuccess }: UserEditFormProps) {
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    matricula: '',
    puesto: '',
    departamento: '',
  })

  const [globalRoles, setGlobalRoles] = useState<{role_id: string; name: string; slug: string}[]>([])
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [currentRoles, setCurrentRoles] = useState<string[]>([])
  const { isSuperAdmin } = useAuthStore()
  const [isLoading, setIsLoading] = useState(false)
  const [isFetching, setIsFetching] = useState(true)
  const [error, setError] = useState('')
  const [userName, setUserName] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const [res, rolesRes] = await Promise.all([getUser(userId), getGlobalRoles()])
        const user = res.data.data
        setUserName(user.full_name)
        setGlobalRoles(rolesRes.data.data.data || rolesRes.data.data || [])
        setCurrentRoles(user.roles || [])
        setForm({
          full_name: user.full_name || '',
          email: user.email || '',
          matricula: user.matricula || '',
          puesto: user.puesto || '',
          departamento: user.departamento || '',
        })
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

  const handleSubmit = async () => {
    setError('')
    if (!form.full_name.trim()) return setError('El nombre completo es requerido')
    if (!form.email.trim()) return setError('El correo es requerido')

    setIsLoading(true)
    try {
      const payload: UpdateUserPayload = {
        full_name: form.full_name || undefined,
        email: form.email || undefined,
        matricula: form.matricula || undefined,
        puesto: form.puesto || undefined,
        departamento: form.departamento || undefined,
      }
      await updateUser(userId, payload)
      if (selectedRoleId && selectedRoleId.length > 10) {
        // Remover roles anteriores antes de asignar el nuevo
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
                  Correo electronico <span className="text-red-500">*</span>
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

              {/* Matricula */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                  Matricula / No. empleado
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

              {/* Rol global */}
              {isSuperAdmin() && (
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
                  {currentRoles.length > 0 && (
                    <p className="text-xs text-slate-400 mt-1">Rol actual: {currentRoles.join(', ')}</p>
                  )}
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
