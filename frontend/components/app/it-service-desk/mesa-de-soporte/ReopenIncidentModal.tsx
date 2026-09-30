'use client'

import { useState } from 'react'
import { X, RotateCcw } from 'lucide-react'
import { reopenIncident } from '@/services/itServiceDeskService'

export default function ReopenIncidentModal({ incidentId, folio, onClose, onReopened }: {
  incidentId: string
  folio: string
  onClose: () => void
  onReopened: () => void
}) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!reason.trim()) { setError('Indica un motivo para reabrir'); return }
    setSubmitting(true)
    setError(null)
    try {
      await reopenIncident(incidentId, reason.trim())
      onReopened()
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo reabrir el ticket')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#1a4fa0]/10 flex items-center justify-center">
                <RotateCcw size={15} className="text-[#1a4fa0]" />
              </div>
              <div>
                <p className="font-bold text-slate-900 text-sm">Reabrir ticket</p>
                <p className="text-xs text-slate-400 font-mono">{folio}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
              <X size={16} />
            </button>
          </div>

          <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Motivo</label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            placeholder="¿Por qué se reabre este ticket?"
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-[#1a4fa0] resize-none mb-3"
          />
          {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition">
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 py-2.5 text-sm font-medium text-white bg-[#1a4fa0] rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {submitting ? 'Reabriendo...' : 'Confirmar reapertura'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
