"use client"

import { useState, useRef } from "react"
import { Camera, Loader2, ZoomIn, X } from "lucide-react"
import api from "@/services/api"
import { uploadToStorage, getSignedUrl } from "@/services/uploadService"
import { refreshAvatarPhoto } from "@/hooks/useAvatarPhoto"

export const ALLOWED_IMAGE = ["image/jpeg", "image/png", "image/webp"]
export const MAX_PHOTO_MB = 15
const OUTPUT_SIZE = 1024   // resolucion final del recorte
const VIEWPORT = 288       // tamano del marco de recorte en pantalla

// ── Recortador interactivo (pan + zoom, exporta PNG de alta calidad) ─────────

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
    <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">Ajusta la foto</h3>
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

// ── Avatar de usuario con opcion de editar (para admins viendo a otros) ─────

interface UserAvatarEditorProps {
  userId: string
  fullName: string
  matricula: string | null
  photoUrl: string | null
  editable: boolean
  size?: number
  onPhotoChanged?: (newPhotoUrl: string | null) => void
}

export function UserAvatarEditor({
  userId, fullName, matricula, photoUrl, editable, size = 56, onPhotoChanged,
}: UserAvatarEditorProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const [cropperSrc, setCropperSrc] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const initials = fullName.split(" ").slice(0, 2).map((n) => n?.[0] ?? "").join("").toUpperCase() || "?"
  const canEdit = editable && !!matricula

  const handlePick = () => {
    if (!canEdit || uploading) return
    setError("")
    fileInputRef.current?.click()
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    if (!ALLOWED_IMAGE.includes(file.type)) {
      setError("Formato no permitido. Usa JPG, PNG o WEBP.")
      return
    }
    if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
      setError(`La imagen no debe superar ${MAX_PHOTO_MB} MB.`)
      return
    }
    setError("")
    setCropperSrc(URL.createObjectURL(file))
  }

  const closeCropper = () => {
    if (cropperSrc) URL.revokeObjectURL(cropperSrc)
    setCropperSrc(null)
  }

  const handleCropSave = async (blob: Blob) => {
    if (!matricula) return
    setUploading(true)
    setError("")
    try {
      const fixedKey = `admin/employees/profile/profile_${matricula}`
      const fd = new FormData()
      fd.append("file", new File([blob], "profile.png", { type: "image/png" }))
      fd.append("company_slug", "admin")
      fd.append("module_slug", "admin")
      fd.append("submodule_slug", "employees/profile")
      fd.append("fixed_key", fixedKey)

      const up = await uploadToStorage(fd)
      const objectKey = up.data?.data?.object_key
      if (!objectKey) throw new Error("sin object_key")

      await api.post(`/api/v1/users/${userId}/photo`, { object_key: objectKey })

      const signed = await getSignedUrl(objectKey, "dirdoc")
      const newUrl = signed.data?.data?.url || signed.data?.url || null
      closeCropper()
      onPhotoChanged?.(newUrl)
      refreshAvatarPhoto()
    } catch {
      setError("No se pudo subir la foto. Intenta de nuevo.")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col items-start">
      <div className="relative" style={{ width: size, height: size }}>
        <button
          type="button"
          onClick={handlePick}
          disabled={!canEdit || uploading}
          title={canEdit ? "Cambiar foto" : undefined}
          className={`group relative rounded-xl overflow-hidden bg-[#1a4fa0] flex items-center justify-center ${canEdit ? "cursor-pointer" : "cursor-default"}`}
          style={{ width: size, height: size }}
        >
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt={fullName} className="w-full h-full object-cover" style={{ clipPath: "inset(0 round 0.75rem)" }} />
          ) : (
            <span className="text-white font-bold" style={{ fontSize: size * 0.36 }}>{initials}</span>
          )}

          {canEdit && !uploading && (
            <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera size={Math.max(14, size * 0.28)} className="text-white" />
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <Loader2 size={Math.max(14, size * 0.28)} className="text-white animate-spin" />
            </div>
          )}
        </button>

        {canEdit && (
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_IMAGE.join(",")}
            className="hidden"
            onChange={handleFileSelect}
          />
        )}
      </div>

      {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
      {canEdit && !error && <p className="text-[10px] text-slate-400 mt-1">Clic para cambiar foto</p>}
      {editable && !matricula && <p className="text-[10px] text-slate-400 mt-1">Requiere matrícula para tener foto</p>}

      {cropperSrc && (
        <PhotoCropper imageSrc={cropperSrc} saving={uploading} onCancel={closeCropper} onSave={handleCropSave} />
      )}
    </div>
  )
}