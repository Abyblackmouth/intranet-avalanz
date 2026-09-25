'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { createControlCambio, getDepartamentos, getMiPerfilCDC } from '@/services/itServiceDeskService'
import { useAuthStore } from '@/store/authStore'

const SISTEMAS_CDC = ['ERP TOTVS', 'Portal de Proveedores', 'CRM Odoo DYCE', 'CRM Odoo Vanta', 'TOTVS V25', 'Otro']

interface CreateControlCambioModalProps {
  onClose: () => void
  onCreated: (folio: string) => void
}

export default function CreateControlCambioModal({ onClose, onCreated }: CreateControlCambioModalProps) {
  const { user } = useAuthStore()
  const fechaSolicitud = new Date().toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  const [miPerfil, setMiPerfil] = useState<{ puesto?: string; departamento?: string; company_name?: string }>({})
  const [step, setStep] = useState(1)
  const total = 5

  const [sistemas, setSistemas] = useState<string[]>([])
  const [sistemaOtro, setSistemaOtro] = useState('')
  const [departamentos, setDepartamentos] = useState<string[]>([])
  const [area, setArea] = useState('')
  const [tipoSolicitud, setTipoSolicitud] = useState('nueva_funcionalidad')
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [justificacion, setJustificacion] = useState('')
  const [impacto, setImpacto] = useState('medio')
  const [urgencia, setUrgencia] = useState('media')
  const [fechaRequerida, setFechaRequerida] = useState('')
  const [comentarios, setComentarios] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getDepartamentos().then(res => setDepartamentos(res.data.data ?? [])).catch(() => {})
    getMiPerfilCDC().then(res => setMiPerfil(res.data.data ?? {})).catch(() => {})
  }, [])

  const toggleSistema = (s: string) => {
    setSistemas(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  const puedeAvanzar = (): boolean => {
    if (step === 2) return sistemas.length > 0 && area.trim() !== ''
    if (step === 3) return titulo.trim() !== '' && descripcion.trim() !== '' && justificacion.trim() !== ''
    return true
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await createControlCambio({
        sistemas_afectados: sistemas,
        sistema_otro_detalle: sistemas.includes('Otro') ? sistemaOtro : undefined,
        area_departamento: area,
        tipo_solicitud: tipoSolicitud,
        titulo,
        descripcion_detallada: descripcion,
        justificacion,
        impacto_si_no_se_realiza: impacto,
        urgencia_solicitada: urgencia,
        fecha_requerida: fechaRequerida || undefined,
        comentarios_adicionales: comentarios || undefined,
      })
      onCreated(res.data.data.folio)
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo registrar el Control de Cambios')
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls = "w-full px-3 py-2 text-[13px] rounded-lg border border-slate-300 bg-white outline-none focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#1a4fa0]/15"
  const inputDisabledCls = "w-full px-3 py-2 text-[13px] rounded-lg border border-slate-200 bg-slate-50 text-slate-500"
  const labelCls = "block text-xs font-semibold text-slate-700 mb-1.5"

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[640px] max-h-[90vh] flex flex-col overflow-hidden" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>

          <div className="flex items-center justify-between px-8 py-[22px] border-b border-slate-200">
            <div>
              <p className="text-[17px] font-bold text-slate-900">Nuevo Control de Cambios</p>
              <p className="text-xs text-slate-400 mt-0.5">Etapa: Registrado</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs font-bold text-[#1a4fa0] bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-md">
                Folio: se asigna al enviar
              </span>
              <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition shrink-0">
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1 px-8 pt-4">
            {Array.from({ length: total }, (_, i) => i + 1).map(i => (
              <div key={i} className="contents">
                <div
                  className={`w-[26px] h-[26px] rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition ${
                    i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-[#1a4fa0] text-white' : 'bg-slate-200 text-slate-400'
                  }`}
                >
                  {i < step ? '✓' : i}
                </div>
                {i < total && <div className={`flex-1 h-0.5 mx-1 ${i < step ? 'bg-emerald-500' : 'bg-slate-200'}`} />}
              </div>
            ))}
          </div>
          <div className="flex justify-between px-8 pt-1.5 pb-[18px] text-[9px] font-semibold uppercase tracking-wide text-slate-400">
            <span>Datos</span><span>Alcance</span><span>Solicitud</span><span>Prioridad</span><span>Confirmar</span>
          </div>

          <div className="flex-1 overflow-y-auto px-8 pb-2 min-h-[320px]">

            {step === 1 && (
              <div>
                <p className="text-[15px] font-bold text-slate-900 mb-1">Datos generales</p>
                <p className="text-xs text-slate-400 mb-5">Esto ya viene de tu sesión, solo confirma que sea correcto.</p>
                <div className="mb-3.5">
                  <label className={labelCls}>Solicitante</label>
                  <input value={user?.full_name ?? ''} disabled className={inputDisabledCls} />
                </div>
                <div className="grid grid-cols-2 gap-3.5 mb-3.5">
                  <div>
                    <label className={labelCls}>Fecha de solicitud</label>
                    <input value={fechaSolicitud} disabled className={inputDisabledCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Empresa</label>
                    <input value={miPerfil.company_name ?? ''} disabled className={inputDisabledCls} />
                  </div>
                </div>
                <div className="mb-3.5">
                  <label className={labelCls}>Correo del solicitante</label>
                  <input value={user?.email ?? ''} disabled className={inputDisabledCls} />
                </div>
                <div className="mb-3.5">
                  <label className={labelCls}>Puesto</label>
                  <input value={miPerfil.puesto ?? ''} disabled className={inputDisabledCls} />
                </div>
                <div>
                  <label className={labelCls}>Departamento</label>
                  <input value={miPerfil.departamento ?? ''} disabled className={inputDisabledCls} />
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <p className="text-[15px] font-bold text-slate-900 mb-1">Alcance</p>
                <p className="text-xs text-slate-400 mb-5">¿Dónde aplica este cambio?</p>
                <label className={labelCls}>Sistema(s) / módulo afectado <span className="text-red-600">*</span></label>
                <div className="flex flex-wrap gap-2 mb-1">
                  {SISTEMAS_CDC.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleSistema(s)}
                      className={`px-3 py-[7px] rounded-full text-xs font-medium border transition ${
                        sistemas.includes(s) ? 'bg-[#1a4fa0] border-[#1a4fa0] text-white' : 'border-slate-300 text-slate-600 hover:border-slate-400'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Selección múltiple. "Otro" habilita un campo de texto libre.</p>
                {sistemas.includes('Otro') && (
                  <input
                    value={sistemaOtro}
                    onChange={e => setSistemaOtro(e.target.value)}
                    placeholder="Especifica cuál sistema"
                    className={`${inputCls} mt-2`}
                  />
                )}
                <div className="grid grid-cols-2 gap-3.5 mt-4">
                  <div>
                    <label className={labelCls}>Área / Departamento <span className="text-red-600">*</span></label>
                    <select value={area} onChange={e => setArea(e.target.value)} className={inputCls}>
                      <option value="">Selecciona un área...</option>
                      {departamentos.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Tipo de solicitud <span className="text-red-600">*</span></label>
                    <select value={tipoSolicitud} onChange={e => setTipoSolicitud(e.target.value)} className={inputCls}>
                      <option value="nueva_funcionalidad">Nueva funcionalidad</option>
                      <option value="mejora_existente">Mejora a algo existente</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <p className="text-[15px] font-bold text-slate-900 mb-1">La solicitud</p>
                <p className="text-xs text-slate-400 mb-5">Cuéntanos qué necesitas y por qué.</p>
                <div className="mb-3.5">
                  <label className={labelCls}>Título del CDC <span className="text-red-600">*</span></label>
                  <input value={titulo} onChange={e => setTitulo(e.target.value)} maxLength={120} placeholder="Nombre breve y descriptivo (máx. 120 caracteres)" className={inputCls} />
                </div>
                <div className="mb-3.5">
                  <label className={labelCls}>Descripción detallada <span className="text-red-600">*</span></label>
                  <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={3} placeholder="Necesidad o problema a resolver, situación actual y comportamiento esperado..." className={`${inputCls} resize-y min-h-[70px]`} />
                </div>
                <div>
                  <label className={labelCls}>Justificación / beneficio esperado <span className="text-red-600">*</span></label>
                  <textarea value={justificacion} onChange={e => setJustificacion(e.target.value)} rows={3} placeholder="Beneficio de negocio, ahorro, riesgo mitigado o cumplimiento que sustenta la solicitud..." className={`${inputCls} resize-y min-h-[70px]`} />
                </div>
              </div>
            )}

            {step === 4 && (
              <div>
                <p className="text-[15px] font-bold text-slate-900 mb-1">Prioridad</p>
                <p className="text-xs text-slate-400 mb-5">Tu propuesta — la prioridad final la define Gerencia de Proyectos.</p>
                <div className="grid grid-cols-2 gap-3.5 mb-3.5">
                  <div>
                    <label className={labelCls}>Impacto si no se realiza <span className="text-red-600">*</span></label>
                    <div className="flex gap-1.5">
                      {['alto', 'medio', 'bajo'].map(v => (
                        <button key={v} type="button" onClick={() => setImpacto(v)}
                          className={`flex-1 py-2 rounded-lg text-xs font-medium border capitalize transition ${impacto === v ? 'border-[#1a4fa0] bg-blue-50 text-[#1a4fa0] font-semibold' : 'border-slate-300 text-slate-600'}`}>
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Urgencia solicitada <span className="text-red-600">*</span></label>
                    <div className="flex gap-1.5">
                      {['alta', 'media', 'baja'].map(v => (
                        <button key={v} type="button" onClick={() => setUrgencia(v)}
                          className={`flex-1 py-2 rounded-lg text-xs font-medium border capitalize transition ${urgencia === v ? 'border-[#1a4fa0] bg-blue-50 text-[#1a4fa0] font-semibold' : 'border-slate-300 text-slate-600'}`}>
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mb-3.5">
                  <label className={labelCls}>Fecha requerida (deseada) <span className="text-slate-400 font-normal">(opcional)</span></label>
                  <input type="date" value={fechaRequerida} onChange={e => setFechaRequerida(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Comentarios adicionales <span className="text-slate-400 font-normal">(opcional)</span></label>
                  <textarea value={comentarios} onChange={e => setComentarios(e.target.value)} rows={2} className={`${inputCls} resize-y`} />
                </div>
              </div>
            )}

            {step === 5 && (
              <div>
                <p className="text-[15px] font-bold text-slate-900 mb-1">Confirmar y enviar</p>
                <p className="text-xs text-slate-400 mb-5">Revisa antes de enviar tu solicitud.</p>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs text-slate-600 space-y-1.5 mb-4">
                  <p><b className="text-slate-800">Empresa:</b> {miPerfil.company_name ?? '—'}</p>
                  <p><b className="text-slate-800">Sistema(s):</b> {sistemas.join(', ') || '—'}</p>
                  <p><b className="text-slate-800">Área:</b> {area || '—'}</p>
                  <p><b className="text-slate-800">Tipo:</b> {tipoSolicitud === 'nueva_funcionalidad' ? 'Nueva funcionalidad' : 'Mejora existente'}</p>
                  <p><b className="text-slate-800">Impacto / Urgencia:</b> {impacto} / {urgencia}</p>
                </div>
                {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
              </div>
            )}

          </div>

          <div className="flex items-center justify-between px-8 py-[18px] border-t border-slate-200 bg-slate-50">
            <button onClick={onClose} className="text-sm font-medium text-slate-500 hover:text-slate-700 transition">
              Cancelar
            </button>
            <div className="flex gap-2.5">
              {step > 1 && (
                <button onClick={() => setStep(step - 1)} className="px-4 py-2 text-[13px] font-semibold text-slate-600 border border-slate-300 rounded-lg bg-white hover:bg-slate-100 transition">
                  Atrás
                </button>
              )}
              <button
                onClick={() => step === total ? handleSubmit() : setStep(step + 1)}
                disabled={!puedeAvanzar() || submitting}
                className={`px-5 py-2 text-[13px] font-semibold text-white rounded-lg disabled:opacity-50 transition ${step === total ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-[#1a4fa0] hover:bg-blue-700'}`}
              >
                {submitting ? 'Enviando...' : step === total ? 'Enviar solicitud' : 'Siguiente'}
              </button>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
