'use client'

import { useState, useEffect } from 'react'
import { getSystems, getModulesCatalog, getSeverities, createIncident } from '@/services/itServiceDeskService'
import { Paperclip, X } from 'lucide-react'

interface CatalogItem { id: string; name: string; system_id?: string }
interface SeverityItem { id: string; code: string; name: string }

export default function CreateIncidentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
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
      return setError('Título, sistema, severidad y descripción son obligatorios')
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 my-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-800">Nuevo ticket de soporte</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Título</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ej. No puedo timbrar facturas"
          className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#7c2d12]/50 mb-3"
        />

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Sistema</label>
            <select
              value={systemId}
              onChange={(e) => { setSystemId(e.target.value); setModuleId('') }}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#7c2d12]/50"
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
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#7c2d12]/50 disabled:opacity-50"
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
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#7c2d12]/50"
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
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#7c2d12]/50"
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
          className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#7c2d12]/50 mb-3 resize-none"
        />

        <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Evidencia (opcional)</label>
        <label className="flex items-center gap-2 px-3 py-2.5 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 cursor-pointer hover:border-[#7c2d12]/40 transition mb-2">
          <Paperclip size={15} />
          {files.length > 0 ? `${files.length} archivo(s) seleccionado(s)` : 'Adjuntar capturas o archivos'}
          <input
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
        </label>

        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

        <div className="flex justify-end gap-3 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-[#7c2d12] rounded-lg hover:bg-[#6b2610] disabled:opacity-50 transition">
            {saving ? 'Creando...' : 'Crear ticket'}
          </button>
        </div>
      </div>
    </div>
  )
}
