"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { Mail, Building2, Briefcase, Hash, ShieldCheck, Info, Camera, Loader2, User } from "lucide-react"
import { useAuthStore } from "@/store/authStore"
import api from "@/services/api"
import { uploadToStorage, getSignedUrl } from "@/services/uploadService"

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
  photo_object_key: string | null
  photo_updated_at: string | null
}

const ALLOWED_IMAGE = ["image/jpeg", "image/png", "image/webp"]
const MAX_PHOTO_MB = 5

export default function ProfilePage() {
  const { user } = useAuthStore()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [photoError, setPhotoError] = useState("")
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const fetchProfile = useCallback(async () => {
    if (!user?.user_id) return
    try {
      const res = await api.get(`/api/v1/users/${user.user_id}`)
      const data: UserProfile = res.data.data
      setProfile(data)
      // Si el usuario tiene foto, se pide su URL firmada (cambia en cada carga -> evita cache viejo)
      if (data.photo_object_key) {
        try {
          const signed = await getSignedUrl(data.photo_object_key, "dirdoc")
          setPhotoUrl(signed.data?.data?.url || signed.data?.url || null)
        } catch {
          setPhotoUrl(null)
        }
      } else {
        setPhotoUrl(null)
      }
    } catch {
      setProfile(null)
    } finally {
      setIsLoading(false)
    }
  }, [user?.user_id])

  useEffect(() => { fetchProfile() }, [fetchProfile])

  const initials = profile?.full_name
    ? profile.full_name.split(" ").slice(0, 2).map((n) => n?.[0] ?? "").join("").toUpperCase() || "?"
    : "?"

  const canUploadPhoto = !!profile?.matricula

  const handlePickFile = () => {
    if (!canUploadPhoto || uploading) return
    setPhotoError("")
    fileInputRef.current?.click()
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file || !profile) return

    if (!ALLOWED_IMAGE.includes(file.type)) {
      setPhotoError("Formato no permitido. Usa JPG, PNG o WEBP.")
      return
    }
    if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
      setPhotoError(`La imagen no debe superar ${MAX_PHOTO_MB} MB.`)
      return
    }

    // Vista previa inmediata mientras sube
    setLocalPreview(URL.createObjectURL(file))
    setUploading(true)
    setPhotoError("")

    try {
      // Ruta fija: al reusar la misma key, MinIO sobrescribe la foto anterior (una sola por empleado)
      const fixedKey = `admin/employees/profile/profile_${profile.matricula}`
      const fd = new FormData()
      fd.append("file", file)
      fd.append("company_slug", "admin")
      fd.append("module_slug", "admin")
      fd.append("submodule_slug", "employees/profile")
      fd.append("fixed_key", fixedKey)

      const up = await uploadToStorage(fd)
      const objectKey = up.data?.data?.object_key
      if (!objectKey) throw new Error("sin object_key")

      await api.post(`/api/v1/users/${user?.user_id}/photo`, { object_key: objectKey })
      await fetchProfile()
    } catch {
      setPhotoError("No se pudo subir la foto. Intenta de nuevo.")
    } finally {
      setUploading(false)
      setLocalPreview(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-[#1a4fa0] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const shownPhoto = localPreview || photoUrl

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Mi perfil</h1>
        <p className="text-sm text-slate-500 mt-0.5">Información de tu cuenta</p>
      </div>

      {/* Card principal */}
      <div className="bg-white rounded-2xl ring-1 ring-slate-200/70 shadow-[0_1px_3px_rgba(16,45,90,0.07)] overflow-hidden">

        {/* Encabezado con avatar centrado */}
        <div className="flex flex-col items-center pt-8 pb-6 px-6 border-b border-slate-100 bg-linear-to-b from-slate-50/60 to-white">
          <div className="relative">
            <div className="w-24 h-24 rounded-2xl overflow-hidden bg-[#1a4fa0] border-4 border-white shadow-md flex items-center justify-center">
              {shownPhoto ? (
                <img src={shownPhoto} alt={profile?.full_name ?? "Perfil"} className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl font-bold text-white">{initials}</span>
              )}
              {uploading && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <Loader2 size={22} className="text-white animate-spin" />
                </div>
              )}
            </div>

            {/* Boton de camara */}
            <button
              onClick={handlePickFile}
              disabled={!canUploadPhoto || uploading}
              title={canUploadPhoto ? "Cambiar foto" : "Requiere matrícula para subir foto"}
              className="absolute -bottom-1.5 -right-1.5 w-8 h-8 rounded-full bg-[#1a4fa0] text-white flex items-center justify-center shadow-md ring-2 ring-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <Camera size={14} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_IMAGE.join(",")}
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          <h2 className="mt-4 text-lg font-semibold text-slate-900 leading-tight text-center">
            {profile?.full_name ?? "—"}
          </h2>
          <p className="text-sm text-slate-500 text-center">
            {profile?.puesto ?? "Sin puesto asignado"}
          </p>
          <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium bg-blue-50 text-[#1a4fa0] px-2.5 py-1 rounded-full">
            <ShieldCheck size={12} />
            {profile?.is_super_admin
              ? "Super Administrador"
              : profile?.global_roles?.map((r) => r.name).join(", ") || "Sin rol asignado"}
          </span>

          {photoError && (
            <p className="mt-3 text-xs text-red-500 text-center">{photoError}</p>
          )}
          {canUploadPhoto && !photoError && (
            <p className="mt-3 text-[11px] text-slate-400 text-center">JPG, PNG o WEBP · máx. {MAX_PHOTO_MB} MB</p>
          )}
        </div>

        {/* Campos */}
        <div className="px-6 py-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field icon={<Mail size={15} className="text-slate-400" />} label="Correo electrónico" value={profile?.email ?? "—"} />
            <Field icon={<Building2 size={15} className="text-slate-400" />} label="Empresa" value={profile?.is_super_admin ? "Grupo Avalanz" : profile?.company?.razon_social ?? "Sin empresa asignada"} />
            <Field icon={<Briefcase size={15} className="text-slate-400" />} label="Departamento" value={profile?.departamento ?? "—"} />
            <Field icon={<Hash size={15} className="text-slate-400" />} label="Matrícula" value={profile?.matricula ?? "—"} />
          </div>

          {/* Nota admin */}
          <div className="mt-5 flex items-start gap-2.5 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
            <Info size={14} className="text-slate-400 mt-0.5 shrink-0" />
            <p className="text-xs text-slate-500">
              Puedes cambiar tu foto de perfil. Para actualizar el resto de tu información personal contacta al administrador del sistema.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 bg-white border border-slate-100 rounded-lg px-3.5 py-3">
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-slate-400 mb-0.5">{label}</p>
        <p className="text-sm text-slate-900 wrap-break-word">{value}</p>
      </div>
    </div>
  )
}