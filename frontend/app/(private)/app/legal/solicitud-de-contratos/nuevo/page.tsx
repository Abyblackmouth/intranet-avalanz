'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, FileText, ClipboardList, Eye, Send, AlertCircle } from 'lucide-react'
import PageWrapper from '@/components/layout/PageWrapper'
import api from '@/services/api'

interface TemplateField {
  key: string; label: string; type: 'text' | 'textarea' | 'date' | 'number' | 'select'
  required: boolean; placeholder?: string; help?: string
  min?: number; max?: number; default?: string | number
  options?: { value: string; label: string }[]
}
interface FieldGroup { id: string; label: string; order: number; fields: TemplateField[] }
interface TemplateFields { id: string; name: string; description: string; field_groups: FieldGroup[] }

const DEMO_DATA: Record<string, string> = {
  FECHA_CONTRATO: '2026-06-20',
  CIUDAD_FIRMA: 'Ciudad de México',
  CIUDAD_JURISDICCION: 'Ciudad de México',
  OBJETO_CONTRATO: 'Explorar una posible relación comercial para el desarrollo de software empresarial y servicios de consultoría tecnológica.',
  EMPRESA_SOLICITANTE: 'Grupo Avalanz S.A. de C.V.',
  RFC_EMPRESA_1: 'GAV200101ABC',
  DOMICILIO_EMPRESA_1: 'Av. Insurgentes Sur 1234, Col. Del Valle, Ciudad de México, C.P. 03100',
  NOMBRE_REPRESENTANTE_1: 'Andrés Hinojosa García',
  CARGO_REPRESENTANTE_1: 'Director General',
  NOMBRE_FIRMANTE_1: 'Andrés Hinojosa García',
  CARGO_FIRMANTE_1: 'Director General',
  EMPRESA_CONTRAPARTE: 'TechCorp México S.A. de C.V.',
  RFC_EMPRESA_2: 'TCM190515XYZ',
  DOMICILIO_EMPRESA_2: 'Blvd. Manuel Ávila Camacho 32, Col. Lomas de Chapultepec, Ciudad de México, C.P. 11000',
  NOMBRE_REPRESENTANTE_2: 'Laura Martínez Ruiz',
  CARGO_REPRESENTANTE_2: 'Directora de Operaciones',
  NOMBRE_FIRMANTE_2: 'Laura Martínez Ruiz',
  CARGO_FIRMANTE_2: 'Directora de Operaciones',
  VIGENCIA_MESES: '12',
  DIAS_AVISO_PREVIO: '30',
  VIGENCIA_OBLIGACION_POST: '2',
}

const STEPS = [
  { id: 1, label: 'Tipo',    icon: FileText },
  { id: 2, label: 'Datos',   icon: ClipboardList },
  { id: 3, label: 'Preview', icon: Eye },
  { id: 4, label: 'Enviar',  icon: Send },
]

const StepIndicator = ({ current }: { current: number }) => (
  <div className="flex items-center justify-center gap-0 mb-6">
    {STEPS.map((step, idx) => {
      const done = current > step.id; const active = current === step.id; const Icon = step.icon
      return (
        <div key={step.id} className="flex items-center">
          <div className="flex flex-col items-center">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all ${done ? 'bg-[#1a4fa0] border-[#1a4fa0]' : active ? 'bg-white border-[#1a4fa0]' : 'bg-white border-slate-200'}`}>
              {done ? <Check size={16} className="text-white" /> : <Icon size={15} className={active ? 'text-[#1a4fa0]' : 'text-slate-300'} />}
            </div>
            <span className={`mt-1.5 text-xs font-medium ${active ? 'text-[#1a4fa0]' : done ? 'text-slate-500' : 'text-slate-300'}`}>{step.label}</span>
          </div>
          {idx < STEPS.length - 1 && <div className={`h-0.5 w-16 mx-1 mb-5 transition-all ${current > step.id ? 'bg-[#1a4fa0]' : 'bg-slate-200'}`} />}
        </div>
      )
    })}
  </div>
)

const Field = ({ field, value, onChange, error }: { field: TemplateField; value: string; onChange: (v: string) => void; error?: string }) => {
  const base = `w-full px-3 py-2 border rounded-lg text-sm text-slate-900 placeholder:text-slate-400 bg-white outline-none transition-all ${error ? 'border-red-400 focus:ring-2 focus:ring-red-100' : 'border-slate-200 hover:border-slate-300 focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#1a4fa0]/10'}`
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {field.label}{field.required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {field.help && <p className="text-xs text-slate-400 mb-1.5">{field.help}</p>}
      {field.type === 'textarea'
        ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} rows={3} className={`${base} resize-none`} />
        : <input type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'} value={value} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} min={field.min} max={field.max} className={base} />
      }
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

const Step1 = ({ templates, selected, onSelect }: { templates: any[]; selected: string; onSelect: (id: string) => void }) => (
  <div>
    <h2 className="text-base font-semibold text-slate-900 mb-1">¿Qué tipo de contrato necesitas?</h2>
    <p className="text-sm text-slate-500 mb-5">Selecciona el tipo. El sistema cargará el formulario correspondiente.</p>
    <div className="grid grid-cols-1 gap-3">
      {templates.map(t => (
        <button key={t.id} onClick={() => onSelect(t.id)} className={`w-full text-left p-4 rounded-xl border-2 transition-all ${selected === t.id ? 'border-[#1a4fa0] bg-blue-50' : 'border-slate-200 hover:border-slate-300 bg-white'}`}>
          <div className="flex items-start gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${selected === t.id ? 'bg-[#1a4fa0]' : 'bg-slate-100'}`}>
              <FileText size={15} className={selected === t.id ? 'text-white' : 'text-slate-400'} />
            </div>
            <div className="min-w-0 flex-1">
              <p className={`font-semibold text-sm ${selected === t.id ? 'text-[#1a4fa0]' : 'text-slate-900'}`}>{t.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>
              <p className="text-xs text-slate-400 mt-1">SLA: {t.sla_business_days} días hábiles</p>
            </div>
            {selected === t.id && <div className="w-5 h-5 rounded-full bg-[#1a4fa0] flex items-center justify-center shrink-0"><Check size={12} className="text-white" /></div>}
          </div>
        </button>
      ))}
    </div>
  </div>
)

const Step2 = ({ templateFields, formData, onChange, errors }: { templateFields: TemplateFields | null; formData: Record<string, string>; onChange: (k: string, v: string) => void; errors: Record<string, string> }) => {
  if (!templateFields) return <div className="text-center py-12"><div className="w-6 h-6 border-2 border-[#1a4fa0] border-t-transparent rounded-full animate-spin mx-auto" /><p className="text-sm text-slate-400 mt-3">Cargando formulario...</p></div>
  return (
    <div>
      <h2 className="text-base font-semibold text-slate-900 mb-1">Datos del contrato</h2>
      <p className="text-sm text-slate-500 mb-5">Completa los campos requeridos.</p>
      <div className="space-y-7">
        {[...templateFields.field_groups].sort((a, b) => a.order - b.order).map(group => (
          <div key={group.id}>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2">{group.label}</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>
            <div className="grid grid-cols-1 gap-3">
              {group.fields.map(field => (
                <Field key={field.key} field={field} value={formData[field.key] ?? ''} onChange={v => onChange(field.key, v)} error={errors[field.key]} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const Step3 = ({ formData, templateName }: { formData: Record<string, string>; templateName: string }) => {
  const get = (key: string) => formData[key] || '___________'
  return (
    <div>
      <h2 className="text-base font-semibold text-slate-900 mb-1">Vista previa del contrato</h2>
      <p className="text-sm text-slate-500 mb-4">Revisa que toda la información sea correcta antes de enviar.</p>
      <div className="bg-white border-2 border-slate-200 rounded-xl overflow-hidden">
        <div className="bg-[#1a4fa0] px-6 py-4 text-center">
          <p className="text-xs font-semibold text-blue-200 uppercase tracking-widest mb-1">{templateName}</p>
          <p className="text-sm font-bold text-white">ACUERDO DE CONFIDENCIALIDAD Y NO DIVULGACIÓN</p>
          <p className="text-xs text-blue-200 mt-0.5">NDA Mutuo — Acuerdo Bilateral</p>
        </div>
        <div className="px-6 py-5 space-y-5" style={{ fontFamily: 'Georgia, serif', fontSize: 13 }}>
          <div className="flex items-center gap-4 text-xs text-slate-400 pb-3 border-b border-slate-100">
            <span>Fecha: <strong className="text-slate-700">{get('FECHA_CONTRATO')}</strong></span>
            <span>·</span>
            <span>Ciudad: <strong className="text-slate-700">{get('CIUDAD_FIRMA')}</strong></span>
            <span>·</span>
            <span>Jurisdicción: <strong className="text-slate-700">{get('CIUDAD_JURISDICCION')}</strong></span>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2" style={{ fontFamily: 'system-ui' }}>Comparecientes</p>
            <p className="text-slate-700 leading-relaxed"><strong>I.</strong> <span className="font-semibold text-[#1a4fa0]">{get('EMPRESA_SOLICITANTE')}</span> (RFC: {get('RFC_EMPRESA_1')}), representada por <strong>{get('NOMBRE_REPRESENTANTE_1')}</strong>, {get('CARGO_REPRESENTANTE_1')}, con domicilio en {get('DOMICILIO_EMPRESA_1')}; (en adelante la <strong>"Parte A"</strong>).</p>
            <p className="text-slate-700 leading-relaxed mt-2"><strong>II.</strong> <span className="font-semibold text-[#1a4fa0]">{get('EMPRESA_CONTRAPARTE')}</span> (RFC: {get('RFC_EMPRESA_2')}), representada por <strong>{get('NOMBRE_REPRESENTANTE_2')}</strong>, {get('CARGO_REPRESENTANTE_2')}, con domicilio en {get('DOMICILIO_EMPRESA_2')}; (en adelante la <strong>"Parte B"</strong>).</p>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1" style={{ fontFamily: 'system-ui' }}>Propósito</p>
            <p className="text-slate-700 leading-relaxed">{get('OBJETO_CONTRATO')}</p>
          </div>
          <div className="grid grid-cols-4 gap-3 bg-slate-50 rounded-lg px-4 py-3" style={{ fontFamily: 'system-ui' }}>
            {[['Vigencia', `${get('VIGENCIA_MESES')} meses`], ['Aviso previo', `${get('DIAS_AVISO_PREVIO')} días`], ['Post-término', `${get('VIGENCIA_OBLIGACION_POST')} años`], ['Jurisdicción', get('CIUDAD_JURISDICCION')]].map(([label, val]) => (
              <div key={label}><p className="text-xs text-slate-400">{label}</p><p className="text-sm font-semibold text-slate-800 mt-0.5">{val}</p></div>
            ))}
          </div>
          <div style={{ fontFamily: 'system-ui' }}>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Firmantes</p>
            <div className="grid grid-cols-2 gap-3">
              {[['POR LA PARTE A', 'EMPRESA_SOLICITANTE', 'NOMBRE_FIRMANTE_1', 'CARGO_FIRMANTE_1'], ['POR LA PARTE B', 'EMPRESA_CONTRAPARTE', 'NOMBRE_FIRMANTE_2', 'CARGO_FIRMANTE_2']].map(([title, empKey, nameKey, cargoKey]) => (
                <div key={title} className="border border-slate-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-[#1a4fa0] mb-1">{title}</p>
                  <p className="text-xs font-semibold text-slate-700">{get(empKey)}</p>
                  <div className="border-t border-slate-100 mt-2 pt-2">
                    <p className="text-xs text-slate-600">{get(nameKey)}</p>
                    <p className="text-xs text-slate-400">{get(cargoKey)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5" style={{ fontFamily: 'system-ui' }}>
            <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">Vista previa de los datos. El documento legal completo con todas las cláusulas se generará al enviar.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

const Step4 = ({ templateName, isSubmitting, onConfirm, error }: { templateName: string; isSubmitting: boolean; onConfirm: () => void; error?: string }) => (
  <div className="text-center">
    <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4"><Send size={28} className="text-[#1a4fa0]" /></div>
    <h2 className="text-base font-semibold text-slate-900 mb-2">¿Listo para enviar?</h2>
    <p className="text-sm text-slate-500 mb-2 max-w-sm mx-auto">Al confirmar, el contrato <strong>{templateName}</strong> será enviado al área legal para su revisión.</p>
    <p className="text-xs text-slate-400 mb-6 max-w-sm mx-auto">El SLA comenzará a contar desde este momento.</p>
    {error && (
      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-5 max-w-sm mx-auto text-left">
        <AlertCircle size={15} className="text-red-500 shrink-0" />
        <p className="text-xs text-red-700">{error}</p>
      </div>
    )}
    <button onClick={onConfirm} disabled={isSubmitting} className="flex items-center gap-2 bg-[#1a4fa0] text-white text-sm font-medium px-8 py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition mx-auto">
      {isSubmitting ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Enviando...</> : <><Send size={16} />Enviar al área legal</>}
    </button>
  </div>
)

export default function NuevoContratoPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [templates, setTemplates] = useState<any[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [templateFields, setTemplateFields] = useState<TemplateFields | null>(null)
  const [loadingFields, setLoadingFields] = useState(false)
  const [formData, setFormData] = useState<Record<string, string>>(DEMO_DATA)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    api.get('/api/v1/legal/envelopes/contract-templates')
      .then(res => setTemplates(res.data.templates || []))
      .catch(() => setTemplates([]))
  }, [])

  useEffect(() => {
    if (!selectedTemplate) return
    setLoadingFields(true)
    api.get(`/api/v1/legal/envelopes/contract-templates/${selectedTemplate}/fields`)
      .then(res => {
        setTemplateFields(res.data)
        const defaults: Record<string, string> = { ...DEMO_DATA }
        res.data.field_groups?.forEach((g: FieldGroup) => {
          g.fields.forEach((f: TemplateField) => {
            if (!defaults[f.key] && f.default !== undefined) defaults[f.key] = f.default.toString()
          })
        })
        setFormData(defaults)
      })
      .catch(() => setTemplateFields(null))
      .finally(() => setLoadingFields(false))
  }, [selectedTemplate])

  const handleFieldChange = (key: string, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }))
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: '' }))
  }

  const validateStep2 = () => {
    if (!templateFields) return false
    const newErrors: Record<string, string> = {}
    templateFields.field_groups.forEach(g => g.fields.forEach(f => {
      if (f.required && !(formData[f.key] ?? '').trim()) newErrors[f.key] = 'Este campo es requerido'
    }))
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNext = () => {
    if (step === 1 && !selectedTemplate) return
    if (step === 2 && !validateStep2()) return
    setStep(s => s + 1)
  }

  const handleBack = () => {
    if (step === 1) router.push('/app/legal/solicitud-de-contratos')
    else setStep(s => s - 1)
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setSubmitError('')
    try {
      const res = await api.post('/api/v1/legal/envelopes', {
        contract_type_id: selectedTemplate,
        form_data: formData,
        is_open_request: false,
      })
      await api.post(`/api/v1/legal/envelopes/${res.data.id}/submit`)
      router.push('/app/legal/solicitud-de-contratos')
    } catch (e: any) {
      setSubmitError(e?.response?.data?.message || e?.response?.data?.detail || 'Error al enviar. Intenta de nuevo.')
      setIsSubmitting(false)
    }
  }

  const selectedTpl = templates.find(t => t.id === selectedTemplate)

  return (
    <PageWrapper
      title="Crear contrato"
      description="Completa el formulario y envía tu solicitud al área legal"
      actions={
        <button onClick={handleBack} className="flex items-center gap-2 text-sm text-slate-600 border border-slate-300 px-3 py-2 rounded-lg hover:bg-slate-50 transition">
          <ArrowLeft size={15} />{step === 1 ? 'Cancelar' : 'Atrás'}
        </button>
      }
    >
      <div className="max-w-2xl mx-auto">
        <StepIndicator current={step} />
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          {step === 1 && <Step1 templates={templates} selected={selectedTemplate} onSelect={setSelectedTemplate} />}
          {step === 2 && <Step2 templateFields={loadingFields ? null : templateFields} formData={formData} onChange={handleFieldChange} errors={errors} />}
          {step === 3 && <Step3 formData={formData} templateName={selectedTpl?.name ?? ''} />}
          {step === 4 && <Step4 templateName={selectedTpl?.name ?? ''} isSubmitting={isSubmitting} onConfirm={handleSubmit} error={submitError} />}
        </div>
        {step < 4 && (
          <div className="flex justify-end mt-4">
            <button onClick={handleNext} disabled={!((step === 1 && !!selectedTemplate) || step === 2 || step === 3)}
              className="flex items-center gap-2 bg-[#1a4fa0] text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition">
              {step === 3 ? 'Confirmar y continuar' : 'Continuar'}<ArrowRight size={15} />
            </button>
          </div>
        )}
      </div>
    </PageWrapper>
  )
}
