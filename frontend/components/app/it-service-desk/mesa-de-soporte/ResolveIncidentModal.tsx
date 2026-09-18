'use client'

import { useState } from 'react'
import { X, CheckCircle2, Paperclip } from 'lucide-react'
import { resolveIncident } from '@/services/itServiceDeskService'

export default function ResolveIncidentModal({ incidentId, folio, onClose, onResolved }: {
  incidentId: string
  folio: string
  onClose: () => void
  onResolved: () => void
}) {
  const [resolutionType, setResolutionType] = useState('causa_raiz')
  const [rcaText, setRcaText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('resolution_type', resolutionType)
      if (rcaText) formData.append('rca_text', rcaText)
      files.forEach(f => formData.append('files', f))
      await resolveIncident(incidentId, formData)
      onResolved()
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo marcar como resuelto')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 size={15} className="text-emerald-600" />
              </div>
              <div>
                <p className="font-bold text-slate-900 text-sm">Marcar como resuelto</p>
                <p className="text-xs text-slate-400 font-mono">{folio}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
              <X size={16} />
            </button>
          </div>

          <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Tipo de resolución</label>
          <select
            value={resolutionType}
            onChange={e => setResolutionType(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-emerald-500 mb-3"
          >
            <option value="causa_raiz">Causa raíz</option>
            <option value="workaround">Workaround</option>
          </select>

          <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Notas (opcional)</label>
          <textarea
            value={rcaText}
            onChange={e => setRcaText(e.target.value)}
            rows={3}
            placeholder="Describe brevemente la solución aplicada"
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-emerald-500 resize-none mb-3"
          />

          <label className="flex items-center gap-2 px-3 py-2.5 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 cursor-pointer hover:border-emerald-400 transition mb-3">
            <Paperclip size={14} />
            {files.length > 0 ? `${files.length} archivo(s) seleccionado(s)` : 'Adjuntar evidencia (opcional)'}
            <input type="file" multiple accept="image/*" className="hidden" onChange={e => setFiles(Array.from(e.target.files ?? []))} />
          </label>

          {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition">
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              {submitting ? 'Guardando...' : 'Confirmar resolución'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
