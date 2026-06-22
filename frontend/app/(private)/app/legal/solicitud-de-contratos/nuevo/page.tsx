'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, FileText, ClipboardList, Eye, Send, AlertCircle, Loader2, Download } from 'lucide-react'
import jsPDF from 'jspdf'
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
  NOMBRE_REPRESENTANTE_1: 'Juan Pérez López',
  CARGO_REPRESENTANTE_1: 'Apoderado Legal',
  NOMBRE_FIRMANTE_1: 'Juan Pérez López',
  CARGO_FIRMANTE_1: 'Apoderado Legal',
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

// ── Paso 3: Preview HTML en iframe ────────────────────────────────────────────

const downloadContractPDF = (iframeRef: React.RefObject<HTMLIFrameElement | null>, templateName: string) => {
  const doc = iframeRef.current?.contentDocument
  if (!doc) return
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = { top: 20, left: 25, right: 20, bottom: 20 }
  const contentW = pageW - margin.left - margin.right
  let y = margin.top

  const BLUE = [26, 79, 160] as [number, number, number]
  const BLACK = [0, 0, 0] as [number, number, number]
  const GRAY = [80, 80, 80] as [number, number, number]
  const LGRAY = [140, 140, 140] as [number, number, number]

  const addPage = () => {
    pdf.addPage()
    y = margin.top
  }

  const checkY = (needed: number) => {
    if (y + needed > pageH - margin.bottom) addPage()
  }

  const writeParagraph = (text: string, opts: { bold?: boolean; size?: number; color?: [number,number,number]; align?: 'left'|'center'; indent?: number } = {}) => {
    const { bold = false, size = 10, color = BLACK, align = 'left', indent = 0 } = opts
    pdf.setFont('times', bold ? 'bold' : 'normal')
    pdf.setFontSize(size)
    pdf.setTextColor(...color)
    const x = margin.left + indent
    const w = contentW - indent
    const lines = pdf.splitTextToSize(text, w)
    checkY(lines.length * (size * 0.4) + 3)
    pdf.text(lines, x, y, { align })
    y += lines.length * (size * 0.4) + 3
  }

  // Título
  writeParagraph('ACUERDO DE CONFIDENCIALIDAD Y NO DIVULGACIÓN', { bold: true, size: 13, align: 'center' })
  writeParagraph('(NDA Mutuo — Acuerdo Bilateral de Confidencialidad)', { size: 10, color: GRAY, align: 'center' })
  y += 2

  // Extraer datos del HTML
  const getText = (sel: string) => doc.querySelector(sel)?.textContent?.trim() || ''
  const getAllText = (sel: string) => Array.from(doc.querySelectorAll(sel)).map(el => el.textContent?.trim() || '')

  // Número y fecha
  const headerData = doc.querySelector('.datos-header')?.textContent?.trim() || ''
  writeParagraph(headerData, { size: 10, align: 'center' })
  y += 3

  // HR
  pdf.setDrawColor(0,0,0)
  pdf.setLineWidth(0.5)
  pdf.line(margin.left, y, pageW - margin.right, y)
  y += 5

  // Secciones del documento
  const secciones = doc.querySelectorAll('.seccion-titulo')
  const parrafos = doc.querySelectorAll('p')

  // Procesar todo el body en orden
  const body = doc.querySelector('body')
  if (body) {
    const nodes = Array.from(body.childNodes)
    nodes.forEach(node => {
      const el = node as Element
      if (!el.tagName) return
      const tag = el.tagName.toLowerCase()

      if (tag === 'div' && el.classList.contains('seccion-titulo')) {
        y += 4
        checkY(10)
        writeParagraph(el.textContent?.trim() || '', { bold: true, size: 11, color: BLUE })
        pdf.setDrawColor(...LGRAY)
        pdf.setLineWidth(0.2)
        pdf.line(margin.left, y, pageW - margin.right, y)
        y += 3
      } else if (tag === 'p') {
        writeParagraph(el.textContent?.trim() || '', { size: 10 })
      } else if (tag === 'div' && el.classList.contains('clausula')) {
        const p = el.querySelector('p')
        if (p) writeParagraph(p.textContent?.trim() || '', { size: 10 })
      } else if (tag === 'hr') {
        pdf.setDrawColor(0,0,0)
        pdf.setLineWidth(el.classList.contains('thin') ? 0.2 : 0.5)
        checkY(5)
        pdf.line(margin.left, y, pageW - margin.right, y)
        y += 4
      } else if (tag === 'table') {
        // Tabla de firmas
        y += 6
        checkY(50)
        const cells = el.querySelectorAll('td')
        if (cells.length >= 2) {
          const col1 = margin.left
          const col2 = margin.left + contentW / 2 + 5
          const colW2 = contentW / 2 - 5

          pdf.setDrawColor(0,0,0)
          pdf.setLineWidth(0.5)
          pdf.line(col1, y, col1 + colW2, y)
          pdf.line(col2, y, col2 + colW2, y)
          y += 3

          const parseCell = (cell: Element, x: number) => {
            const lines = cell.innerHTML.split('<br>').map(l => {
              const tmp = doc.createElement('div')
              tmp.innerHTML = l
              return tmp.textContent?.trim() || ''
            }).filter(Boolean)
            lines.forEach(line => {
              const isBold = line.includes('POR LA PARTE')
              pdf.setFont('times', isBold ? 'bold' : 'normal')
              pdf.setFontSize(9)
              pdf.setTextColor(...BLACK)
              if (line.startsWith('─') || line === '') return
              pdf.text(line, x, y)
              y += 4.5
            })
          }

          const yStart = y
          parseCell(cells[0], col1)
          const yAfterCol1 = y
          y = yStart
          parseCell(cells[cells.length - 1], col2)
          y = Math.max(yAfterCol1, y)
        }
      }
    })
  }

  const filename = `contrato-preview-${new Date().toISOString().split('T')[0]}.pdf`
  pdf.save(filename)
}

const Step3 = ({ formData, templateSlug, templateName }: {
  formData: Record<string, string>; templateSlug: string; templateName: string
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(false)
    api.post(
      `/api/v1/legal/envelopes/contract-templates/${templateSlug}/preview`,
      formData,
      { responseType: 'text', headers: { 'Content-Type': 'application/json' } }
    )
      .then(res => {
        const html = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
        if (iframeRef.current) {
          const doc = iframeRef.current.contentDocument
          if (doc) {
            doc.open()
            doc.write(html)
            doc.close()
          }
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [formData, templateSlug])

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Vista previa del contrato</h2>
          <p className="text-sm text-slate-500">Revisa el documento antes de enviarlo al área legal.</p>
        </div>
        <button
          onClick={async () => {
            try {
              const res = await api.post(
                `/api/v1/legal/envelopes/contract-templates/${templateSlug}/preview-pdf`,
                formData,
                { responseType: 'blob' }
              )
              const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
              const a = document.createElement('a')
              a.href = url
              a.download = 'contrato-preview.pdf'
              a.click()
              URL.revokeObjectURL(url)
            } catch (e) { console.error(e) }
          }}
          title="Imprimir / Guardar como PDF"
          className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
        >
          <Download size={17} />
        </button>
      </div>

      <div className="border-2 border-slate-200 rounded-xl overflow-hidden bg-slate-50" style={{ height: '70vh' }}>
        {loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 size={28} className="text-[#1a4fa0] animate-spin" />
            <p className="text-sm text-slate-400">Generando vista previa...</p>
          </div>
        )}
        {error && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <AlertCircle size={28} className="text-red-400" />
            <p className="text-sm text-slate-500">No se pudo generar la vista previa.</p>
          </div>
        )}
        <iframe
          ref={iframeRef}
          className="w-full h-full bg-white"
          style={{ display: loading || error ? 'none' : 'block', border: 'none' }}
          onLoad={() => setLoading(false)}
          title={`Preview ${templateName}`}
        />
      </div>

      <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5 mt-3">
        <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700">
          Vista previa del documento. El contrato final con numeración de folio se generará al enviar. Usa el botón de descarga para guardar o imprimir una copia.
        </p>
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

  // En paso 3 el contenedor es más ancho
  const isPreviewStep = step === 3

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
      <div className={isPreviewStep ? 'max-w-4xl mx-auto' : 'max-w-2xl mx-auto'}>
        <StepIndicator current={step} />
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          {step === 1 && <Step1 templates={templates} selected={selectedTemplate} onSelect={setSelectedTemplate} />}
          {step === 2 && <Step2 templateFields={loadingFields ? null : templateFields} formData={formData} onChange={handleFieldChange} errors={errors} />}
          {step === 3 && <Step3 formData={formData} templateSlug={selectedTemplate} templateName={selectedTpl?.name ?? ''} />}
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
