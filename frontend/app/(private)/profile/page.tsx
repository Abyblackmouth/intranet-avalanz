"use client"

import { useEffect, useState } from "react"
import { User, Mail, Building2, Briefcase, Hash, ShieldCheck, Info } from "lucide-react"
import { useAuthStore } from "@/store/authStore"
import api from "@/services/api"

interface UserProfile {
  id: string
  full_name: string
  email: string
  matricula: string | null
  puesto: string | null
  departamento: string | null
  is_super_admin: boolean
  global_roles: { name: string }[]
  company: { razon_social: string } | null
}

export default function ProfilePage() {
  const { user } = useAuthStore()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!user?.user_id) return
    api
      .get(`/api/v1/users/${user.user_id}`)
      .then((res) => setProfile(res.data.data))
      .catch(() => setProfile(null))
      .finally(() => setIsLoading(false))
  }, [user?.user_id])

  const initials = profile?.full_name
    ? profile.full_name
        .split(" ")
        .slice(0, 2)
        .map((n) => n?.[0] ?? "")
        .join("")
        .toUpperCase() || "?"
    : "?"

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-[#1a4fa0] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Mi perfil</h1>
        <p className="text-sm text-slate-500 mt-0.5">Información de tu cuenta</p>
      </div>

      {/* Card principal */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

        {/* Banner + avatar */}

        <div className="px-6 pb-6">
          <div className="flex items-center gap-4 pt-6 mb-6">
            <div className="w-20 h-20 rounded-full bg-slate-100 border-4 border-white shadow-md flex items-center justify-center flex-shrink-0">
              <span className="text-2xl font-bold text-[#1a4fa0]">{initials}</span>
            </div>
            <div className="mb-1">
              <h2 className="text-lg font-semibold text-slate-900 leading-tight">
                {profile?.full_name ?? "—"}
              </h2>
              <p className="text-sm text-slate-500">
                {profile?.puesto ?? "Sin puesto asignado"}
              </p>
            </div>
          </div>

          {/* Campos */}
          <div className="grid grid-cols-1 gap-4">

            <Field
              icon={<Mail size={15} className="text-slate-400" />}
              label="Correo electrónico"
              value={profile?.email ?? "—"}
            />

            <Field
              icon={<Building2 size={15} className="text-slate-400" />}
              label="Empresa"
              value={profile?.is_super_admin ? "Grupo Avalanz" : profile?.company?.razon_social ?? "Sin empresa asignada"}
            />

            <Field
              icon={<Briefcase size={15} className="text-slate-400" />}
              label="Departamento"
              value={profile?.departamento ?? "—"}
            />

            <Field
              icon={<Hash size={15} className="text-slate-400" />}
              label="Matrícula"
              value={profile?.matricula ?? "—"}
            />

            <Field
              icon={<ShieldCheck size={15} className="text-slate-400" />}
              label="Rol"
              value={
                profile?.is_super_admin
                  ? "Super Administrador"
                  : profile?.global_roles?.map((r) => r.name).join(", ") || "Sin rol asignado"
              }
            />

          </div>

          {/* Nota admin */}
          <div className="mt-6 flex items-start gap-2.5 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
            <Info size={14} className="text-slate-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-slate-500">
              Para actualizar tu información personal contacta al administrador del sistema.
            </p>
          </div>

        </div>
      </div>
    </div>
  )
}

function Field({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-100 last:border-0">
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-slate-400 mb-0.5">{label}</p>
        <p className="text-sm text-slate-900 truncate">{value}</p>
      </div>
    </div>
  )
}
