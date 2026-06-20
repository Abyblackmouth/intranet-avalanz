'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, FileText, ClipboardList, Eye, Send } from 'lucide-react'
import PageWrapper from '@/components/layout/PageWrapper'
import { getContractTypes } from '@/services/legalService'
import { ContractType } from '@/types/contract.types'
import api from '@/services/api'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface TemplateField {
  key: string
  label: string
  type: 'text' | 'textarea' | 'date' | 'number' | 'select'
  required: boolean
  placeholder?: string
  help?: string
  min?: number
  max?: number
  default?: string | number
  options?: { value: string; label: string }[]
  auto_fill?: string
}

interface FieldGroup {
  id: string
  label: string
  order: number
  fields: TemplateField[]
}

interface TemplateFields {
  id: string
  name: string
  description: string
  field_groups: FieldGroup[]
}

// ── Stepper ───────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Tipo',    icon: FileText },
  { id: 2, label: 'Datos',   icon: ClipboardList },
  { id: 3, label: 'Vista previa', icon: Eye },
  { id: 4, label: 'Enviar',  icon: Send },
]

const StepIndicator = ({ current }: { current: number }) => (
  <div className="flex items-center justify-center gap-0 mb-8">
    {STEPS.map((step, idx) => {
      const done    = current > step.id
      const active  = current === step.id
      const Icon    = step.icon
      return (
        <div key={step.id} className="flex items-center">
          <div className="flex flex-col items-center">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all ${
              done   ? 'bg-[#1a4fa0] border-[#1a4fa0]' :
              active ? 'bg-white border-[#1a4fa0]' :
                       'bg-white border-slate-200'
            }`}>
              {done
                ? <Check size={16} className="text-white" />
                : <Icon size={15} className={active ? 'text-[#1a4fa0]' : 'text-slate-300'} />
              }
            </div>
            <span className={`mt-1.5 text-xs font-medium ${
              active ? 'text-[#1a4fa0]' : done ? 'text-slate-500' : 'text-slate-300'
            }`}>{step.label}</span>
          </div>
          {idx < STEPS.length - 1 && (
            <div className={`h-0.5 w-16 mx-1 mb-5 transition-all ${current > step.id ? 'bg-[#1a4fa0]' : 'bg-slate-200'}`} />
          )}
        </div>
      )
    })}
  </div>
)

// ── Campo de formulario ───────────────────────────────────────────────────────

const Field = ({
  field, value, onChange, error,
}: {
  field: TemplateField
  value: string
  onChange: (val: string) => void
  error?: string
}) => {
  const base = `w-full px-3 py-2 border rounded-lg text-sm text-slate-900 placeholder:text-slate-400 bg-white outline-none transition-all ${
    error
      ? 'border-red-400 focus:ring-2 focus:ring-red-100'
      : 'border-slate-200 hover:border-slate-300 focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#1a4fa0]/10'
  }`

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {field.label}
        {field.required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {field.help && <p className="text-xs text-slate-400 mb-1.5">{field.help}</p>}

      {field.type === 'textarea' ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className={`${base} resize-none`}
        />
      ) : field.type === 'select' ? (
        <select value={value} onChange={e => onChange(e.target.value)} className={base}>
          <option value="">Selecciona una opción...</option>
          {field.options?.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ) : (
        <input
          type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
          min={field.min}
          max={field.max}
          className={base}
        />
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

// ── Paso 1: Tipo de contrato ──────────────────────────────────────────────────

const Step1 = ({
  templates, selected, onSelect,
}: {
  templates: { id: string; name: string; description: string; sla_business_days: number }[]
  selected: string
  onSelect: (id: string) => void
}) => (
  <div>
    <h2 className="text-base font-semibold text-slate-900 mb-1">¿Qué tipo de contrato necesitas?</h2>
    <p className="text-sm text-slate-500 mb-6">Selecciona el tipo de contrato. El sistema cargará el formulario correspondiente.</p>
    <div className="grid grid-cols-1 gap-3">
      {templates.map(t => (
        <button
          key={t.id}
          onClick={() => onSelect(t.id)}
          className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
            selected === t.id
              ? 'border-[#1a4fa0] bg-blue-50'
              : 'border-slate-200 hover:border-slate-300 bg-white'
          }`}
        >
          <div className="flex items-start gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
              selected === t.id ? 'bg-[#1a4fa0]' : 'bg-slate-100'
            }`}>
              <FileText size={15} className={selected === t.id ? 'text-white' : 'text-slate-400'} />
            </div>
            <div className="min-w-0">
              <p className={`font-semibold text-sm ${selected === t.id ? 'text-[#1a4fa0]' : 'text-slate-900'}`}>
                {t.name}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>
              <p className="text-xs text-slate-400 mt-1">SLA: {t.sla_business_days} días hábiles</p>
            </div>
            {selected === t.id && (
              <div className="ml-auto shrink-0">
                <div className="w-5 h-5 rounded-full bg-[#1a4fa0] flex items-center justify-center">
                  <Check size={12} className="text-white" />
                </div>
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  </div>
)

// ── Paso 2: Formulario de datos ───────────────────────────────────────────────

const Step2 = ({
  templateFields, formData, onChange, errors,
}: {
  templateFields: TemplateFields | null
  formData: Record<string, string>
  onChange: (key: string, value: string) => void
  errors: Record<string, string>
}) => {
  if (!templateFields) return (
    <div className="text-center py-12">
      <div className="w-6 h-6 border-2 border-[#1a4fa0] border-t-transparent rounded-full animate-spin mx-auto" />
      <p className="text-sm text-slate-400 mt-3">Cargando formulario...</p>
    </div>
  )

  return (
    <div>
      <h2 className="text-base font-semibold text-slate-900 mb-1">Datos del contrato</h2>
      <p className="text-sm text-slate-500 mb-6">Completa todos los campos requeridos. El sistema generará el contrato con esta información.</p>

      <div className="space-y-8">
        {[...templateFields.field_groups].sort((a, b) => a.order - b.order).map(group => (
          <div key={group.id}>
            <div className="flex items-center gap-2 mb-4">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2">{group.label}</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>
            <div className="grid grid-cols-1 gap-4">
              {group.fields.map(field => (
                <Field
                  key={field.key}
                  field={field}
                  value={formData[field.key] ?? (field.default?.toString() ?? '')}
                  onChange={val => onChange(field.key, val)}
                  error={errors[field.key]}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Paso 3: Vista previa ──────────────────────────────────────────────────────

const Step3 = ({
  templateFields, formData, templateName,
}: {
  templateFields: TemplateFields | null
  formData: Record<string, string>
  templateName: string
}) => (
  <div>
    <h2 className="text-base font-semibold text-slate-900 mb-1">Revisa los datos antes de enviar</h2>
    <p className="text-sm text-slate-500 mb-6">Verifica que toda la información sea correcta. Una vez enviado, el área legal revisará el contrato.</p>

    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
        <p className="text-sm font-semibold text-slate-700">{templateName}</p>
      </div>

      {templateFields && [...templateFields.field_groups].sort((a, b) => a.order - b.order).map(group => (
        <div key={group.id} className="px-4 py-4 border-b border-slate-100 last:border-0">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{group.label}</p>
          <div className="grid grid-cols-2 gap-3">
            {group.fields.map(field => {
              const val = formData[field.key] ?? field.default?.toString() ?? ''
              return (
                <div key={field.key} className={field.type === 'textarea' ? 'col-span-2' : ''}>
                  <p className="text-xs text-slate-400">{field.label}</p>
                  <p className={`text-sm mt-0.5 ${val ? 'text-slate-900 font-medium' : 'text-slate-300 italic'}`}>
                    {val || 'Sin datos'}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  </div>
)

// ── Paso 4: Confirmar envío ───────────────────────────────────────────────────

const Step4 = ({ templateName, isSubmitting, onConfirm }: {
  templateName: string
  isSubmitting: boolean
  onConfirm: () => void
}) => (
  <div className="text-center">
    <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
      <Send size={28} className="text-[#1a4fa0]" />
    </div>
    <h2 className="text-base font-semibold text-slate-900 mb-2">¿Listo para enviar?</h2>
    <p className="text-sm text-slate-500 mb-2 max-w-sm mx-auto">
      Al confirmar, el contrato <strong>{templateName}</strong> será enviado al área legal para su revisión.
    </p>
    <p className="text-xs text-slate-400 mb-8 max-w-sm mx-auto">
      El SLA comenzará a contar desde este momento. Recibirás notificaciones sobre el avance.
    </p>
    <button
      onClick={onConfirm}
      disabled={isSubmitting}
      className="flex items-center gap-2 bg-[#1a4fa0] text-white text-sm font-medium px-8 py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition mx-auto"
    >
      {isSubmitting
        ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Enviando...</>
        : <><Send size={16} />Enviar al área legal</>
      }
    </button>
  </div>
)

// ── Página principal ──────────────────────────────────────────────────────────

export default function NuevoContratoPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)

  const [templates, setTemplates] = useState<any[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [templateFields, setTemplateFields] = useState<TemplateFields | null>(null)
  const [loadingFields, setLoadingFields] = useState(false)

  const [formData, setFormData] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Cargar templates disponibles
  useEffect(() => {
    api.get('/api/v1/legal/envelopes/contract-templates')
      .then(res => setTemplates(res.data.templates || []))
      .catch(() => setTemplates([]))
  }, [])

  // Cargar campos del template seleccionado
  useEffect(() => {
    if (!selectedTemplate) return
    setLoadingFields(true)
    api.get(`/api/v1/legal/envelopes/contract-templates/${selectedTemplate}/fields`)
      .then(res => {
        setTemplateFields(res.data)
        // Precargar defaults
        const defaults: Record<string, string> = {}
        res.data.field_groups?.forEach((g: FieldGroup) => {
          g.fields.forEach(f => {
            if (f.default !== undefined) defaults[f.key] = f.default.toString()
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
    templateFields.field_groups.forEach(group => {
      group.fields.forEach(field => {
        const val = formData[field.key] ?? ''
        if (field.required && !val.trim()) {
          newErrors[field.key] = 'Este campo es requerido'
        }
      })
    })
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNext = () => {
    if (step === 1 && !selectedTemplate) return
    if (step === 2 && !validateStep2()) return
    setStep(s => s + 1)
  }

  const handleBack = () => {
    if (step === 1) {
      router.push('/app/legal/solicitud-de-contratos')
    } else {
      setStep(s => s - 1)
    }
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      // Crear el sobre
      const payload = {
        contract_type_id: selectedTemplate,
        form_data: formData,
        is_open_request: false,
      }
      const res = await api.post('/api/v1/legal/envelopes', payload)
      const envelopeId = res.data.id

      // Enviar inmediatamente
      await api.post(`/api/v1/legal/envelopes/${envelopeId}/submit`)

      router.push('/app/legal/solicitud-de-contratos')
    } catch (e) {
      console.error(e)
      setIsSubmitting(false)
    }
  }

  const selectedTpl = templates.find(t => t.id === selectedTemplate)

  const canNext =
    (step === 1 && !!selectedTemplate) ||
    (step === 2) ||
    (step === 3)

  return (
    <PageWrapper
      title="Crear contrato"
      description="Completa el formulario para enviar tu solicitud al área legal"
      actions={
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-sm text-slate-600 border border-slate-300 px-3 py-2 rounded-lg hover:bg-slate-50 transition"
        >
          <ArrowLeft size={15} />
          {step === 1 ? 'Cancelar' : 'Atrás'}
        </button>
      }
    >
      <div className="max-w-2xl mx-auto">
        <StepIndicator current={step} />

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          {step === 1 && (
            <Step1
              templates={templates}
              selected={selectedTemplate}
              onSelect={setSelectedTemplate}
            />
          )}
          {step === 2 && (
            <Step2
              templateFields={loadingFields ? null : templateFields}
              formData={formData}
              onChange={handleFieldChange}
              errors={errors}
            />
          )}
          {step === 3 && (
            <Step3
              templateFields={templateFields}
              formData={formData}
              templateName={selectedTpl?.name ?? ''}
            />
          )}
          {step === 4 && (
            <Step4
              templateName={selectedTpl?.name ?? ''}
              isSubmitting={isSubmitting}
              onConfirm={handleSubmit}
            />
          )}
        </div>

        {step < 4 && (
          <div className="flex justify-end mt-4">
            <button
              onClick={handleNext}
              disabled={!canNext}
              className="flex items-center gap-2 bg-[#1a4fa0] text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {step === 3 ? 'Confirmar datos' : 'Continuar'}
              <ArrowRight size={15} />
            </button>
          </div>
        )}
      </div>
    </PageWrapper>
  )
}
