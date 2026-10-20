'use client'

// Modal que carga un trámite por id y muestra VistaTramite. Lo usan Bandeja, Seguimiento e Inicio.
import { useEffect, useState } from 'react'
import { TramiteDetalle, getTramite } from '@/services/workflowsService'
import { Modal, errMsg } from '@/components/app/workflows/compartidos'
import VistaTramite from '@/components/app/workflows/VistaTramite'

export default function ModalTramite({ id, onClose, onChange }: { id: string; onClose: () => void; onChange?: () => void }) {
  const [t, setT] = useState<TramiteDetalle | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setT(null); getTramite(id).then(r => setT(r.data)).catch(e => setError(errMsg(e, 'No se pudo abrir el trámite'))) }, [id])
  return (
    <Modal titulo={t ? `Trámite ${t.folio}` : 'Trámite'} onClose={onClose} ancho="max-w-[88rem]">
      {error && <p className="text-[13px] text-red-600">{error}</p>}
      {!t && !error && <div className="py-12 flex justify-center"><div className="w-5 h-5 border-2 border-slate-300 border-t-[#1a4fa0] rounded-full animate-spin" /></div>}
      {t && <VistaTramite t={t} modo="privado" onChange={d => { setT(d); onChange?.() }} />}
    </Modal>
  )
}
