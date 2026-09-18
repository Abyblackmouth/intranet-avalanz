'use client'

import { useState, useEffect } from 'react'
import { assignIncident, getUsersByRole } from '@/services/itServiceDeskService'
import { useAuthStore } from '@/store/authStore'
import { X } from 'lucide-react'

interface UserOption { id: string; name: string }

const TEAM_OPTIONS = [
  { value: 'especialista-funcional', label: 'Funcional' },
  { value: 'especialista-tecnico', label: 'Técnico' },
]

export default function AssignIncidentModal({
  incidentId, folio, onClose, onAssigned,
}: {
  incidentId: string
  folio: string
  onClose: () => void
  onAssigned: () => void
}) {
  const { user } = useAuthStore()
  const myRoles: string[] = user?.roles ?? []
  const isIncidentManagerUser = myRoles.includes('it-service-desk:incident-manager') || myRoles.includes('super_admin')
  const isMyFuncional = myRoles.includes('it-service-desk:especialista-funcional')
  const isMyTecnico = myRoles.includes('it-service-desk:especialista-tecnico')
  // Un especialista (no Incident Manager) solo puede asignar dentro de su
  // propia especialidad -- el equipo queda fijo, sin poder cambiarlo.
  // Incident Manager si puede elegir cualquiera de los dos, ya que
  // recibe lo que un especialista no pueda pasar directo al otro lado.
  const lockedTeam = !isIncidentManagerUser
    ? (isMyFuncional ? 'especialista-funcional' : isMyTecnico ? 'especialista-tecnico' : null)
    : null

  const [team, setTeam] = useState(lockedTeam ?? 'especialista-funcional')
  const [userId, setUserId] = useState('')
  const [users, setUsers] = useState<UserOption[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoadingUsers(true)
    setUserId('')
    // Se combinan las personas con el rol de especialista correspondiente
    // + el rol generico "Tecnico" (anclado a segmentos especificos) --
    // asignar manualmente no distingue catch-all de especifico, solo
    // necesita a alguien de confianza disponible.
    const roleSlug = team === 'especialista-funcional' ? 'especialista-funcional' : 'especialista-tecnico'
    // Incident Manager siempre se incluye -- tiene autoridad total sobre el
    // modulo y puede atender/recibir cualquier ticket sin el rol literal
    // (roles-mesa-ayuda.md), igual que ya se le exceptua en el backend
    // al sembrarse como especialista.
    Promise.all([getUsersByRole(roleSlug), getUsersByRole('tecnico'), getUsersByRole('incident-manager')])
      .then(([specRes, tecRes, imRes]) => {
        const specialists = specRes.data?.data ?? []
        const tecnicos = tecRes.data?.data ?? []
        const incidentManagers = imRes.data?.data ?? []
        const merged = [...specialists]
        for (const t of [...tecnicos, ...incidentManagers]) {
          if (!merged.find((m: UserOption) => m.id === t.id)) merged.push(t)
        }
        setUsers(merged)
      })
      .catch(() => setUsers([]))
      .finally(() => setLoadingUsers(false))
  }, [team])

  const handleSave = async () => {
    if (!userId) return setError('Selecciona una persona')
    setSaving(true)
    setError(null)
    try {
      await assignIncident(incidentId, { assigned_team: team, assigned_to_user_id: userId })
      onAssigned()
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo asignar el ticket')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-800">Asignar {folio}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Equipo</label>
        <select
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          disabled={!!lockedTeam}
          className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-[#7c2d12] mb-1 disabled:opacity-60 disabled:bg-slate-50"
        >
          {TEAM_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        {lockedTeam && (
          <p className="text-[11px] text-slate-400 mb-3">Solo puedes asignar dentro de tu propia especialidad. Para pasarlo al otro equipo, pide que Incident Manager lo reasigne.</p>
        )}
        {!lockedTeam && <div className="mb-3" />}

        <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Persona</label>
        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          disabled={loadingUsers}
          className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-[#7c2d12] mb-2 disabled:opacity-50"
        >
          <option value="">{loadingUsers ? 'Cargando...' : users.length === 0 ? 'Nadie disponible para este equipo' : 'Selecciona una persona'}</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>

        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

        <div className="flex justify-end gap-3 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-[#7c2d12] rounded-lg hover:bg-[#6b2610] disabled:opacity-50 transition">
            {saving ? 'Asignando...' : 'Asignar'}
          </button>
        </div>
      </div>
    </div>
  )
}
