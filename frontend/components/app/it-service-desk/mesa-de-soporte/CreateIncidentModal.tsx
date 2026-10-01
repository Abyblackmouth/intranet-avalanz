'use client'

import { useState, useEffect, useMemo } from 'react'
import { getSystems, getModulesCatalog, getSeverities, createIncident } from '@/services/itServiceDeskService'
import { Paperclip, X } from 'lucide-react'

interface CatalogItem { id: string; name: string; system_id?: string }
interface SeverityItem { id: string; code: string; name: string }

export default function CreateIncidentModal({ onClose, onCreated, onBack }: { onClose: () => void; onCreated: () => void; onBack?: () => void }) {
  const [systems, setSystems] = useState<CatalogItem[]>([])
  const [modules, setModules] = useState<CatalogItem[]>([])
  const [severities, setSeverities] = useState<SeverityItem[]>([])

  const [title, setTitle] = useState('')
  const [systemId, setSystemId] = useState('')
  const [moduleId, setModuleId] = useState('')
  const [reportedType, setReportedType] = useState('funcional')
  const [severityId, setSeverityId] = useState('')
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState<File[]>([])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getSystems(), getSeverities()]).then(([sysRes, sevRes]) => {
      setSystems(sysRes.data?.data ?? [])
      setSeverities(sevRes.data?.data ?? [])
    })
  }, [])

  useEffect(() => {
    if (!systemId) { setModules([]); return }
    getModulesCatalog(systemId).then(res => setModules(res.data?.data ?? []))
  }, [systemId])

  const handleSave = async () => {
    if (!title.trim() || !systemId || !severityId || !description.trim()) {
      return setError('La descripción corta, el sistema, la severidad y la descripción son obligatorios')
    }
    setSaving(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('title', title.trim())
      formData.append('system_id', systemId)
      if (moduleId) formData.append('module_id', moduleId)
      formData.append('reported_type', reportedType)
      formData.append('severity_reported_id', severityId)
      formData.append('description', description.trim())
      files.forEach(f => formData.append('files', f))

      await createIncident(formData)
      onCreated()
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo crear el ticket')
      setSaving(false)
    }
  }

  // ── Evidencia: varias imágenes, sumadas al elegir, arrastrar o pegar (Ctrl + V) ──
  const MAX_IMAGENES = 5, MAX_MB = 10
  const [arrastrando, setArrastrando] = useState(false)
  const agregarArchivos = (nuevos: File[], desdePegado = false) => {
    const imagenes = nuevos.filter(f => f.type.startsWith('image/'))
    const avisos: string[] = []
    if (imagenes.length < nuevos.length) avisos.push('solo se aceptan imágenes')
    setFiles(prev => {
      const lista = [...prev]
      let pegadas = prev.filter(f => /^captura-\d+\.png$/.test(f.name)).length
      for (let f of imagenes) {
        if (f.size > MAX_MB * 1024 * 1024) { avisos.push(`${f.name || 'una imagen'} pesa más de ${MAX_MB} MB`); continue }
        if (desdePegado) { pegadas += 1; f = new File([f], `captura-${pegadas}.png`, { type: f.type || 'image/png' }) }
        if (lista.some(x => x.name === f.name && x.size === f.size)) continue
        if (lista.length >= MAX_IMAGENES) { avisos.push(`máximo ${MAX_IMAGENES} imágenes`); break }
        lista.push(f)
      }
      return lista
    })
    setError(avisos.length ? `No se agregaron todas: ${Array.from(new Set(avisos)).join(', ')}.` : null)
  }
  const quitarArchivo = (i: number) => setFiles(prev => prev.filter((_, k) => k !== i))
  const pegar = (e: React.ClipboardEvent) => {
    const imgs = Array.from(e.clipboardData?.files ?? []).filter(f => f.type.startsWith('image/'))
    if (imgs.length) { e.preventDefault(); agregarArchivos(imgs, true) }   // el texto se pega normal
  }
  const vistas = useMemo(() => files.map(f => URL.createObjectURL(f)), [files])
  useEffect(() => () => vistas.forEach(u => URL.revokeObjectURL(u)), [vistas])

  return (
    <div onPaste={pegar} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 my-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-800">Nuevo ticket de soporte</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Descripción corta del ticket</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ej. No puedo timbrar facturas en TOTVS"
          className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#1a4fa0]/50 mb-3"
        />

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Sistema</label>
            <select
              value={systemId}
              onChange={(e) => { setSystemId(e.target.value); setModuleId('') }}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#1a4fa0]/50"
            >
              <option value="">Selecciona</option>
              {systems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Módulo (opcional)</label>
            <select
              value={moduleId}
              onChange={(e) => setModuleId(e.target.value)}
              disabled={!systemId || modules.length === 0}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#1a4fa0]/50 disabled:opacity-50"
            >
              <option value="">General</option>
              {modules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Tipo</label>
            <select
              value={reportedType}
              onChange={(e) => setReportedType(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#1a4fa0]/50"
            >
              <option value="funcional">Funcional</option>
              <option value="tecnico">Técnico</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Severidad</label>
            <select
              value={severityId}
              onChange={(e) => setSeverityId(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#1a4fa0]/50"
            >
              <option value="">Selecciona</option>
              {severities.map(s => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
            </select>
          </div>
        </div>

        <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Descripción</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Describe qué pasa, cuándo empezó, y cualquier mensaje de error"
          className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#1a4fa0]/50 mb-3 resize-none"
        />

        <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Evidencia (opcional)</label>
        <label
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true) }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastrando(false); agregarArchivos(Array.from(e.dataTransfer.files ?? [])) }}
          className={`flex items-center gap-2 px-3 py-2.5 border border-dashed rounded-lg text-sm cursor-pointer transition mb-2 ${arrastrando ? 'border-[#1a4fa0] bg-blue-50/60 text-[#1a4fa0]' : 'border-slate-300 text-slate-500 hover:border-[#1a4fa0]/40'}`}>
          <Paperclip size={15} />
          <span className="flex-1">
            {files.length >= MAX_IMAGENES ? `Ya tienes ${MAX_IMAGENES} imágenes (el máximo)` : 'Elige, arrastra o pega (Ctrl + V) tus capturas'}
          </span>
          <span className="text-[11px] text-slate-400 shrink-0">{files.length}/{MAX_IMAGENES} · hasta {MAX_MB} MB</span>
          <input
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            disabled={files.length >= MAX_IMAGENES}
            onChange={(e) => { agregarArchivos(Array.from(e.target.files ?? [])); e.target.value = '' }}
          />
        </label>
        {files.length > 0 && (
          <div className="grid grid-cols-5 gap-2 mb-2">
            {files.map((f, i) => (
              <div key={`${f.name}-${f.size}-${i}`} className="relative group aspect-square rounded-lg overflow-hidden border border-slate-300 bg-slate-50">
                <img src={vistas[i]} alt={f.name} className="w-full h-full object-cover" />
                <button type="button" onClick={() => quitarArchivo(i)} aria-label={`Quitar ${f.name}`}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center opacity-80 hover:opacity-100">✕</button>
                <span className="absolute bottom-0 inset-x-0 px-1 py-0.5 bg-black/50 text-white text-[10px] truncate">{f.name}</span>
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

        <div className="flex justify-end gap-3 mt-4">
          {onBack && (
            <button type="button" onClick={onBack} className="mr-auto inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 transition">
              <span aria-hidden="true">←</span> Regresar
            </button>
          )}
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-[#1a4fa0] rounded-lg hover:bg-[#153f82] disabled:opacity-50 transition">
            {saving ? 'Creando...' : 'Crear ticket'}
          </button>
        </div>
      </div>
    </div>
  )
}
