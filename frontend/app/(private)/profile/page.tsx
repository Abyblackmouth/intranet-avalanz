"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { Mail, Building2, Briefcase, Hash, ShieldCheck, Info, Camera, Loader2, ZoomIn, X } from "lucide-react"
import { useAuthStore } from "@/store/authStore"
import api from "@/services/api"
import { uploadToStorage, getSignedUrl } from "@/services/uploadService"
import { refreshAvatarPhoto } from "@/hooks/useAvatarPhoto"

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
const MAX_PHOTO_MB = 15
const OUTPUT_SIZE = 1024   // resolucion final del recorte
const VIEWPORT = 288       // tamano del marco de recorte en pantalla

// ── Recortador interactivo ──────────────────────────────────────────────────

function PhotoCropper({ imageSrc, saving, onCancel, onSave }: {
  imageSrc: string
  saving: boolean
  onCancel: () => void
  onSave: (blob: Blob) => void
}) {
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)

  const baseScale = nat ? VIEWPORT / Math.min(nat.w, nat.h) : 1
  const eff = baseScale * zoom
  const dispW = nat ? nat.w * eff : VIEWPORT
  const dispH = nat ? nat.h * eff : VIEWPORT

  const clamp = (x: number, y: number, z: number) => {
    const e = baseScale * z
    const w = (nat?.w ?? 0) * e
    const h = (nat?.h ?? 0) * e
    return {
      x: Math.min(0, Math.max(VIEWPORT - w, x)),
      y: Math.min(0, Math.max(VIEWPORT - h, y)),
    }
  }

  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const im = e.currentTarget
    const w = im.naturalWidth, h = im.naturalHeight
    setNat({ w, h })
    const bs = VIEWPORT / Math.min(w, h)
    setZoom(1)
    setOffset({ x: (VIEWPORT - w * bs) / 2, y: (VIEWPORT - h * bs) / 2 })
  }

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { sx: e.clientX, sy: e.clientY, ox: offset.x, oy: offset.y }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const dx = e.clientX - drag.current.sx
    const dy = e.clientY - drag.current.sy
    setOffset(clamp(drag.current.ox + dx, drag.current.oy + dy, zoom))
  }
  const onPointerUp = () => { drag.current = null }

  const applyZoom = (newZ: number) => {
    const oldEff = baseScale * zoom
    const newEff = baseScale * newZ
    const cx = VIEWPORT / 2, cy = VIEWPORT / 2
    const ix = (cx - offset.x) / oldEff
    const iy = (cy - offset.y) / oldEff
    const nx = cx - ix * newEff
    const ny = cy - iy * newEff
    setOffset(clamp(nx, ny, newZ))
    setZoom(newZ)
  }

  const onWheel = (e: React.WheelEvent) => {
    const next = Math.min(4, Math.max(1, zoom + (e.deltaY < 0 ? 0.12 : -0.12)))
    applyZoom(next)
  }

  const handleSave = () => {
    if (!nat || !imgRef.current) return
    const effNow = baseScale * zoom
    const sx = -offset.x / effNow
    const sy = -offset.y / effNow
    const sSize = VIEWPORT / effNow
    const canvas = document.createElement("canvas")
    canvas.width = OUTPUT_SIZE
    canvas.height = OUTPUT_SIZE
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(imgRef.current, sx, sy, sSize, sSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
    canvas.toBlob((blob) => { if (blob) onSave(blob) }, "image/png")
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">Ajusta tu foto</h3>
          <button onClick={onCancel} disabled={saving} className="text-slate-400 hover:text-slate-600 disabled:opacity-50">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 flex flex-col items-center">
          <div
            className="relative rounded-2xl overflow-hidden bg-slate-100 touch-none select-none"
            style={{ width: VIEWPORT, height: VIEWPORT, cursor: drag.current ? "grabbing" : "grab" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onWheel={onWheel}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Recorte"
              onLoad={onImgLoad}
              draggable={false}
              style={{ position: "absolute", width: dispW, height: dispH, left: offset.x, top: offset.y, maxWidth: "none" }}
            />
            {/* Guias del marco */}
            <div className="absolute inset-0 pointer-events-none ring-1 ring-black/10 rounded-2xl" />
          </div>

          <div className="flex items-center gap-3 w-full mt-4">
            <ZoomIn size={16} className="text-slate-400 shrink-0" />
            <input
              type="range" min={1} max={4} step={0.01} value={zoom}
              onChange={(e) => applyZoom(parseFloat(e.target.value))}
              className="w-full accent-[#1a4fa0]"
            />
          </div>
          <p className="text-[11px] text-slate-400 mt-2 text-center">Arrastra para mover · usa el control o la rueda para acercar</p>
        </div>

        <div className="flex gap-2 px-5 py-3 border-t border-slate-100">
          <button onClick={onCancel} disabled={saving} className="flex-1 text-sm text-slate-600 border border-slate-200 rounded-lg py-2 hover:bg-slate-50 disabled:opacity-50 transition">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving || !nat} className="flex-1 flex items-center justify-center gap-2 text-sm font-medium text-white bg-[#1a4fa0] rounded-lg py-2 hover:bg-blue-700 disabled:opacity-50 transition">
            {saving ? <><Loader2 size={15} className="animate-spin" />Guardando...</> : "Guardar foto"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Página de perfil ──────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { user } = useAuthStore()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [photoError, setPhotoError] = useState("")
  const [cropperSrc, setCropperSrc] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const fetchProfile = useCallback(async () => {
    if (!user?.user_id) return
    try {
      const res = await api.get(`/api/v1/users/${user.user_id}`)
      const data: UserProfile = res.data.data
      setProfile(data)
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    if (!ALLOWED_IMAGE.includes(file.type)) {
      setPhotoError("Formato no permitido. Usa JPG, PNG o WEBP.")
      return
    }
    if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
      setPhotoError(`La imagen no debe superar ${MAX_PHOTO_MB} MB.`)
      return
    }
    setPhotoError("")
    setCropperSrc(URL.createObjectURL(file))
  }

  const closeCropper = () => {
    if (cropperSrc) URL.revokeObjectURL(cropperSrc)
    setCropperSrc(null)
  }

  const handleCropSave = async (blob: Blob) => {
    if (!profile) return
    setUploading(true)
    setPhotoError("")
    try {
      // Ruta fija: al reusar la misma key, MinIO sobrescribe la foto anterior (una sola por empleado)
      const fixedKey = `admin/employees/profile/profile_${profile.matricula}`
      const fd = new FormData()
      fd.append("file", new File([blob], "profile.png", { type: "image/png" }))
      fd.append("company_slug", "admin")
      fd.append("module_slug", "admin")
      fd.append("submodule_slug", "employees/profile")
      fd.append("fixed_key", fixedKey)

      const up = await uploadToStorage(fd)
      const objectKey = up.data?.data?.object_key
      if (!objectKey) throw new Error("sin object_key")

      await api.post(`/api/v1/users/${user?.user_id}/photo`, { object_key: objectKey })
      closeCropper()
      await fetchProfile()
      refreshAvatarPhoto()
    } catch {
      setPhotoError("No se pudo subir la foto. Intenta de nuevo.")
    } finally {
      setUploading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-[#1a4fa0] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Mi perfil</h1>
        <p className="text-sm text-slate-500 mt-0.5">Información de tu cuenta</p>
      </div>

      {/* Card principal */}
      <div className="relative bg-white rounded-2xl ring-1 ring-slate-200/70 shadow-[0_1px_3px_rgba(16,45,90,0.07)] mt-16">

        {/* Foto montada sobre el borde superior */}
        <div className="absolute left-1/2 -translate-x-1/2 -top-16">
          <button
            type="button"
            onClick={handlePickFile}
            disabled={!canUploadPhoto || uploading}
            title={canUploadPhoto ? "Cambiar foto" : "Requiere matrícula para subir foto"}
            className="group relative block w-32 h-32 rounded-2xl overflow-hidden bg-[#1a4fa0] ring-4 ring-white shadow-lg cursor-pointer disabled:cursor-not-allowed"
          >
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt={profile?.full_name ?? "Perfil"} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-4xl font-bold text-white">{initials}</span>
              </div>
            )}

            {canUploadPhoto && !uploading && (
              <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 text-white">
                <Camera size={22} />
                <span className="text-[11px] font-medium">Cambiar foto</span>
              </div>
            )}

            {uploading && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <Loader2 size={24} className="text-white animate-spin" />
              </div>
            )}
          </button>

          {canUploadPhoto && (
            <span className="absolute bottom-1.5 right-1.5 w-8 h-8 rounded-full bg-[#1a4fa0] text-white flex items-center justify-center shadow-md ring-2 ring-white pointer-events-none">
              <Camera size={14} />
            </span>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_IMAGE.join(",")}
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>

        {/* Datos */}
        <div className="pt-20 pb-6 px-6 flex flex-col items-center border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900 leading-tight text-center">
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
            <p className="mt-3 text-[11px] text-slate-400 text-center">Haz clic en tu foto para cambiarla · JPG, PNG o WEBP</p>
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

          <div className="mt-5 flex items-start gap-2.5 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
            <Info size={14} className="text-slate-400 mt-0.5 shrink-0" />
            <p className="text-xs text-slate-500">
              Puedes cambiar tu foto de perfil. Para actualizar el resto de tu información personal contacta al administrador del sistema.
            </p>
          </div>
        </div>
      </div>

      {cropperSrc && (
        <PhotoCropper
          imageSrc={cropperSrc}
          saving={uploading}
          onCancel={closeCropper}
          onSave={handleCropSave}
        />
      )}
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