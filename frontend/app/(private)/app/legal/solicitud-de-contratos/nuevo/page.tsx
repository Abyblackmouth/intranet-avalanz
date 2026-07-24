'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft, ArrowRight, Check, FileText, ClipboardList, Eye, Send,
  AlertCircle, Loader2, Download, Paperclip, Upload, X, FileCheck, Search, Users, RotateCcw
} from 'lucide-react'
import PageWrapper from '@/components/layout/PageWrapper'
import api from '@/services/api'
import { uploadToStorage } from '@/services/uploadService'
import { useAuthStore } from '@/store/authStore'

interface TemplateField {
  key: string; label: string; type: 'text' | 'textarea' | 'date' | 'number' | 'select'
  required: boolean; placeholder?: string; help?: string
  min?: number; max?: number; default?: string | number
  options?: { value: string; label: string }[]
}
interface FieldGroup { id: string; label: string; order: number; fields: TemplateField[] }
interface TemplateFields { id: string; name: string; description: string; field_groups: FieldGroup[] }
interface AttachmentDef {
  id: string; name: string; description: string
  is_required: boolean; allowed_mime_types: string[]; display_order: number
}
interface UploadedFile { defId: string; file: File; name: string }
interface ExistingAttachment {
  id: string; original_name: string; attachment_def_id: string | null
  mime_type: string; is_current?: boolean; version_number?: number; document_type?: string | null
}

const DEMO_DATA: Record<string, string> = {
  FECHA_CONTRATO: '2026-06-22',
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
  { id: 3, label: 'Anexos',  icon: Paperclip },
  { id: 4, label: 'Preview', icon: Eye },
  { id: 5, label: 'Enviar',  icon: Send },
]

const StepIndicator = ({ current }: { current: number }) => (
  <div className="flex items-center justify-center gap-0 mb-5">
    {STEPS.map((step, idx) => {
      const done = current > step.id; const active = current === step.id; const Icon = step.icon
      return (
        <div key={step.id} className="flex items-center">
          <div className="flex flex-col items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${done ? 'bg-[#1a4fa0] border-[#1a4fa0]' : active ? 'bg-white border-[#1a4fa0]' : 'bg-white border-slate-200'}`}>
              {done ? <Check size={14} className="text-white" /> : <Icon size={13} className={active ? 'text-[#1a4fa0]' : 'text-slate-300'} />}
            </div>
            <span className={`mt-1 text-[11px] font-medium ${active ? 'text-[#1a4fa0]' : done ? 'text-slate-500' : 'text-slate-300'}`}>{step.label}</span>
          </div>
          {idx < STEPS.length - 1 && <div className={`h-0.5 w-10 mx-1 mb-4 transition-all ${current > step.id ? 'bg-[#1a4fa0]' : 'bg-slate-200'}`} />}
        </div>
      )
    })}
  </div>
)

const Field = ({ field, value, onChange, error }: {
  field: TemplateField; value: string; onChange: (v: string) => void; error?: string
}) => {
  const base = `w-full px-2.5 py-1.5 border rounded-lg text-sm text-slate-900 placeholder:text-slate-400 bg-white outline-none transition-all ${
    error ? 'border-red-400 focus:ring-1 focus:ring-red-100' : 'border-slate-200 hover:border-slate-300 focus:border-[#1a4fa0] focus:ring-1 focus:ring-[#1a4fa0]/10'
  }`
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <label className="text-xs font-semibold text-slate-700">
          {field.label}{field.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        {field.help && <span className="text-[10px] text-slate-400 truncate">{field.help}</span>}
      </div>
      {field.type === 'textarea'
        ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} rows={2} className={`${base} resize-none`} />
        : <input type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'} value={value} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} min={field.min} max={field.max} className={base} />
      }
      {error && <p className="text-[11px] text-red-500 mt-0.5">{error}</p>}
    </div>
  )
}

const Step1 = ({ templates, selected, onSelect }: { templates: any[]; selected: string; onSelect: (id: string) => void }) => (
  <div>
    <h2 className="text-sm font-semibold text-slate-900 mb-0.5">¿Qué tipo de contrato necesitas?</h2>
    <p className="text-xs text-slate-500 mb-4">Selecciona el tipo. El sistema cargará el formulario correspondiente.</p>
    <div className="grid grid-cols-1 gap-2.5">
      {templates.map(t => (
        <button key={t.id} onClick={() => onSelect(t.id)} className={`w-full text-left p-3.5 rounded-xl border-2 transition-all ${selected === t.id ? 'border-[#1a4fa0] bg-blue-50' : 'border-slate-200 hover:border-slate-300 bg-white'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${selected === t.id ? 'bg-[#1a4fa0]' : 'bg-slate-100'}`}>
              <FileText size={13} className={selected === t.id ? 'text-white' : 'text-slate-400'} />
            </div>
            <div className="min-w-0 flex-1">
              <p className={`font-semibold text-xs ${selected === t.id ? 'text-[#1a4fa0]' : 'text-slate-900'}`}>{t.name}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{t.description} · SLA {t.sla_business_days}d</p>
            </div>
            {selected === t.id && <div className="w-4 h-4 rounded-full bg-[#1a4fa0] flex items-center justify-center shrink-0"><Check size={10} className="text-white" /></div>}
          </div>
        </button>
      ))}
    </div>
  </div>
)

const isFullWidth = (field: TemplateField) =>
  field.type === 'textarea' || field.key === 'OBJETO_CONTRATO' || field.key === 'DOMICILIO_EMPRESA_1' || field.key === 'DOMICILIO_EMPRESA_2' || field.key === 'NOMBRE_REPRESENTANTE_1' || field.key === 'NOMBRE_REPRESENTANTE_2'

const Step2 = ({ templateFields, formData, onChange, errors }: {
  templateFields: TemplateFields | null; formData: Record<string, string>
  onChange: (k: string, v: string) => void; errors: Record<string, string>
}) => {
  if (!templateFields) return (
    <div className="text-center py-10">
      <div className="w-5 h-5 border-2 border-[#1a4fa0] border-t-transparent rounded-full animate-spin mx-auto" />
      <p className="text-xs text-slate-400 mt-2">Cargando formulario...</p>
    </div>
  )
  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-900 mb-0.5">Datos del contrato</h2>
      <p className="text-xs text-slate-500 mb-4">Completa los campos requeridos.</p>
      <div className="space-y-5">
        {[...templateFields.field_groups].sort((a, b) => a.order - b.order).map(group => (
          <div key={group.id}>
            <div className="flex items-center gap-2 mb-2.5">
              <div className="h-px flex-1 bg-slate-100" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2">{group.label}</span>
              <div className="h-px flex-1 bg-slate-100" />
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {group.fields.map(field => (
                <div key={field.key} className={isFullWidth(field) ? 'col-span-2' : 'col-span-1'}>
                  <Field field={field} value={formData[field.key] ?? ''} onChange={v => onChange(field.key, v)} error={errors[field.key]} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const Step3Anexos = ({ attachmentDefs, uploadedFiles, onUpload, onRemove, existingAttachments, isCorrection }: {
  attachmentDefs: AttachmentDef[]; uploadedFiles: UploadedFile[]
  onUpload: (defId: string, file: File, defName?: string) => void; onRemove: (defId: string) => void
  existingAttachments: ExistingAttachment[]; isCorrection: boolean
}) => {
  const formatSize = (bytes: number) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  const findExisting = (defId: string) => existingAttachments.find(a => a.attachment_def_id === defId && a.is_current !== false)
  if (attachmentDefs.length === 0) return (
    <div className="text-center py-10">
      <FileCheck size={28} className="text-slate-300 mx-auto mb-2" />
      <p className="text-sm text-slate-500 font-medium">Sin anexos requeridos</p>
      <p className="text-xs text-slate-400 mt-0.5">Este tipo de contrato no requiere documentos adicionales.</p>
    </div>
  )
  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-900 mb-0.5">Documentos anexos</h2>
      <p className="text-xs text-slate-500 mb-4">
        {isCorrection
          ? 'Reemplaza únicamente los documentos que necesites corregir. Los demás se conservan tal cual.'
          : 'Adjunta los documentos antes de enviar el contrato.'}
      </p>
      <div className="space-y-3">
        {attachmentDefs.map(def => {
          const uploaded = uploadedFiles.find(f => f.defId === def.id)
          const existing = !uploaded ? findExisting(def.id) : undefined
          const accept = def.allowed_mime_types.join(',')
          const mimeLabel = def.allowed_mime_types.map(m => m.split('/')[1].toUpperCase()).join(', ')
          return (
            <div key={def.id} className={`border-2 rounded-xl p-3.5 transition-all ${uploaded ? 'border-green-300 bg-green-50' : existing ? 'border-[#1a4fa0]/30 bg-blue-50/40' : def.is_required ? 'border-slate-200 bg-white' : 'border-dashed border-slate-200 bg-white'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${uploaded ? 'bg-green-100' : existing ? 'bg-blue-100' : 'bg-slate-100'}`}>
                  {uploaded ? <FileCheck size={16} className="text-green-600" /> : existing ? <FileCheck size={16} className="text-[#1a4fa0]" /> : <Paperclip size={16} className="text-slate-400" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium text-slate-900">{def.name}</p>
                    {def.is_required
                      ? <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-medium">Obligatorio</span>
                      : <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">Opcional</span>}
                    {existing && !uploaded && <span className="text-[10px] bg-blue-50 text-[#1a4fa0] px-1.5 py-0.5 rounded font-medium">Ya cargado</span>}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">Formato: {mimeLabel}</p>
                </div>
                {uploaded
                  ? <button onClick={() => onRemove(def.id)} className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition shrink-0"><X size={13} /></button>
                  : <label className="flex items-center gap-1.5 text-xs text-[#1a4fa0] border border-[#1a4fa0]/30 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-blue-50 transition shrink-0">
                      {existing ? <><RotateCcw size={12} />Reemplazar</> : <><Upload size={12} />Subir</>}
                      <input type="file" accept={accept} className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) onUpload(def.id, file, def.name); e.target.value = '' }} />
                    </label>
                }
              </div>
              {uploaded && (
                <div className="mt-2 flex items-center gap-2 bg-white border border-green-200 rounded-lg px-2.5 py-1.5">
                  <FileCheck size={12} className="text-green-500 shrink-0" />
                  <p className="text-[11px] font-medium text-slate-700 truncate flex-1">{uploaded.name}</p>
                  <p className="text-[10px] text-slate-400 shrink-0">{formatSize(uploaded.file.size)}</p>
                </div>
              )}
              {existing && !uploaded && (
                <div className="mt-2 flex items-center gap-2 bg-white border border-[#1a4fa0]/20 rounded-lg px-2.5 py-1.5">
                  <FileCheck size={12} className="text-[#1a4fa0] shrink-0" />
                  <p className="text-[11px] font-medium text-slate-700 truncate flex-1">{existing.original_name}</p>
                  <span className="text-[10px] text-slate-400 shrink-0">versión actual</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const Step4Preview = ({ formData, templateSlug, templateName }: { formData: Record<string, string>; templateSlug: string; templateName: string }) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  useEffect(() => {
    setLoading(true); setError(false)
    api.post(`/api/v1/legal/envelopes/contract-templates/${templateSlug}/preview`, formData, { responseType: 'text', headers: { 'Content-Type': 'application/json' } })
      .then(res => {
        const html = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
        if (iframeRef.current) { const doc = iframeRef.current.contentDocument; if (doc) { doc.open(); doc.write(html); doc.close() } }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [formData, templateSlug])
  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Vista previa</h2>
          <p className="text-xs text-slate-500">Revisa el documento antes de enviarlo al área legal.</p>
        </div>
        <button onClick={async () => { try { const res = await api.post(`/api/v1/legal/envelopes/contract-templates/${templateSlug}/preview-pdf`, formData, { responseType: 'blob' }); const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' })); const a = document.createElement('a'); a.href = url; a.download = 'contrato-preview.pdf'; a.click(); URL.revokeObjectURL(url) } catch (e) { console.error(e) } }} className="flex items-center gap-1.5 text-xs text-slate-500 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition">
          <Download size={13} />PDF
        </button>
      </div>
      <div className="border-2 border-slate-200 rounded-xl overflow-hidden bg-slate-50" style={{ height: '65vh' }}>
        {loading && <div className="flex flex-col items-center justify-center h-full gap-2"><Loader2 size={24} className="text-[#1a4fa0] animate-spin" /><p className="text-xs text-slate-400">Generando vista previa...</p></div>}
        {error && <div className="flex flex-col items-center justify-center h-full gap-2"><AlertCircle size={24} className="text-red-400" /><p className="text-xs text-slate-500">No se pudo generar la vista previa.</p></div>}
        <iframe ref={iframeRef} className="w-full h-full bg-white" style={{ display: loading || error ? 'none' : 'block', border: 'none' }} onLoad={() => setLoading(false)} title={`Preview ${templateName}`} />
      </div>
      <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-2.5">
        <AlertCircle size={12} className="text-amber-500 shrink-0" />
        <p className="text-[11px] text-amber-700">Vista previa — el folio real se asignará al enviar.</p>
      </div>
    </div>
  )
}

const Step5 = ({ templateName, isSubmitting, onConfirm, error, attachmentCount, isCorrection }: {
  templateName: string; isSubmitting: boolean; onConfirm: () => void; error?: string; attachmentCount: number; isCorrection: boolean
}) => (
  <div className="text-center py-4">
    <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3"><Send size={24} className="text-[#1a4fa0]" /></div>
    <h2 className="text-sm font-semibold text-slate-900 mb-1.5">{isCorrection ? '¿Listo para reenviar?' : '¿Listo para enviar?'}</h2>
    <p className="text-xs text-slate-500 mb-2 max-w-sm mx-auto">
      {isCorrection
        ? <>Al confirmar, el contrato <strong>{templateName}</strong> corregido volverá al área legal para una nueva revisión.</>
        : <>Al confirmar, el contrato <strong>{templateName}</strong> será enviado al área legal para revisión.</>}
    </p>
    {attachmentCount > 0 && <div className="flex items-center justify-center gap-1.5 text-xs text-green-600 mb-2"><FileCheck size={13} /><span>{attachmentCount} documento{attachmentCount > 1 ? 's' : ''} {isCorrection ? (attachmentCount > 1 ? 'actualizados' : 'actualizado') : (attachmentCount > 1 ? 'adjuntos' : 'adjunto')}</span></div>}
    <p className="text-[11px] text-slate-400 mb-5 max-w-sm mx-auto">{isCorrection ? 'El SLA sigue corriendo; el reenvío no lo reinicia.' : 'El SLA comenzará a contar desde este momento.'}</p>
    {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 mb-4 max-w-sm mx-auto text-left"><AlertCircle size={13} className="text-red-500 shrink-0" /><p className="text-xs text-red-700">{error}</p></div>}
    <button onClick={onConfirm} disabled={isSubmitting} className="flex items-center gap-2 bg-[#1a4fa0] text-white text-sm font-medium px-8 py-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition mx-auto">
      {isSubmitting
        ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{isCorrection ? 'Reenviando...' : 'Enviando...'}</>
        : <><Send size={15} />{isCorrection ? 'Reenviar al área legal' : 'Enviar al área legal'}</>}
    </button>
  </div>
)

const CompanySelector = ({ companies, onSelect }: {
  companies: { id: string; slug: string; name: string }[]
  onSelect: (c: { id: string; slug: string; name: string }) => void
}) => {
  const [selected, setSelected] = useState('')
  return (
    <div className="max-w-sm mx-auto">
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-1">
          <Users size={15} className="text-[#1a4fa0]" />
          <h2 className="text-sm font-semibold text-slate-900">¿En nombre de qué empresa?</h2>
        </div>
        <p className="text-xs text-slate-500 mb-4">Selecciona la empresa para la que estás creando este contrato.</p>
        <select
          value={selected}
          onChange={e => {
            setSelected(e.target.value)
            const company = companies.find(c => c.id === e.target.value)
            if (company) onSelect(company)
          }}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 bg-white outline-none focus:border-[#1a4fa0] focus:ring-1 focus:ring-[#1a4fa0]/10 transition-all"
        >
          <option value="">Selecciona una empresa...</option>
          {companies.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

function NuevoContratoInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const correctionId = searchParams.get('correct')
  const isCorrection = !!correctionId

  const { user } = useAuthStore()
  const [step, setStep] = useState(1)
  const [templates, setTemplates] = useState<any[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [templateFields, setTemplateFields] = useState<TemplateFields | null>(null)
  const [loadingFields, setLoadingFields] = useState(false)
  const [attachmentDefs, setAttachmentDefs] = useState<AttachmentDef[]>([])
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [formData, setFormData] = useState<Record<string, string>>(DEMO_DATA)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [selectedCompany, setSelectedCompany] = useState<{ id: string; slug: string; name: string } | null>(null)
  const [availableCompanies, setAvailableCompanies] = useState<{ id: string; slug: string; name: string }[]>([])

  // Modo corrección
  const [originalFormData, setOriginalFormData] = useState<Record<string, string>>({})
  const [existingAttachments, setExistingAttachments] = useState<ExistingAttachment[]>([])
  const [correctionFolio, setCorrectionFolio] = useState('')
  const [loadingCorrection, setLoadingCorrection] = useState(isCorrection)
  const correctionLoadedRef = useRef(false)
  const pendingCorrectionForm = useRef<Record<string, string> | null>(null)

  const needsCompanySelect = !isCorrection && (user?.roles?.includes('super_admin') || (user?.companies?.length || 0) > 1) && !selectedCompany

  // Carga de empresas — solo en modo creación
  useEffect(() => {
    if (isCorrection) return
    const isSuperAdmin = user?.roles?.includes('super_admin')
    if (isSuperAdmin || (user?.companies?.length || 0) > 1) {
      api.get('/api/v1/companies/?is_active=true&per_page=100')
        .then(res => {
          const all = res.data?.data?.data || []
          const filtered = isSuperAdmin ? all : all.filter((c: any) => user?.companies?.includes(c.company_id))
          setAvailableCompanies(filtered.map((c: any) => ({ id: c.company_id, slug: c.slug, name: c.nombre_comercial || c.name })))
        })
        .catch(() => {})
    } else if ((user?.companies?.length || 0) === 1) {
      api.get(`/api/v1/companies/${user?.companies?.[0]}`)
        .then(res => {
          const c = res.data?.data
          if (c) setSelectedCompany({ id: c.company_id, slug: c.slug, name: c.nombre_comercial || c.name })
        })
        .catch(() => {})
    }
  }, [user, isCorrection])

  useEffect(() => {
    api.get('/api/v1/legal/envelopes/contract-templates').then(res => setTemplates(res.data.templates || [])).catch(() => setTemplates([]))
  }, [])

  // Carga del sobre a corregir — precarga tipo, empresa, datos y anexos existentes
  useEffect(() => {
    if (!isCorrection || templates.length === 0 || correctionLoadedRef.current) return
    correctionLoadedRef.current = true
    setLoadingCorrection(true)
    ;(async () => {
      try {
        const [envRes, attRes] = await Promise.all([
          api.get(`/api/v1/legal/envelopes/${correctionId}`),
          api.get(`/api/v1/legal/envelopes/${correctionId}/attachments`),
        ])
        const detail = envRes.data
        const env = detail.envelope || detail
        setExistingAttachments(attRes.data || [])
        setCorrectionFolio(env.folio || '')
        pendingCorrectionForm.current = env.form_data || {}
        // Empresa — se usa para armar la ruta de subida en MinIO
        try {
          const cRes = await api.get(`/api/v1/companies/${env.company_id}`)
          const c = cRes.data?.data
          if (c) setSelectedCompany({ id: c.company_id, slug: c.slug, name: c.nombre_comercial || c.name })
          else setSelectedCompany({ id: env.company_id, slug: '', name: env.company_name })
        } catch { setSelectedCompany({ id: env.company_id, slug: '', name: env.company_name }) }
        // Mapea el tipo de contrato del sobre al template del stepper
        const tpl = templates.find((t: any) => t.contract_type_id === env.contract_type_id)
        if (tpl) setSelectedTemplate(tpl.id)
        else setSubmitError('No se encontró el template asociado a este tipo de contrato.')
        setStep(2)
      } catch (e) {
        setSubmitError('No se pudo cargar el sobre para corrección.')
      } finally {
        setLoadingCorrection(false)
      }
    })()
  }, [isCorrection, correctionId, templates])

  useEffect(() => {
    if (!selectedTemplate) return
    setLoadingFields(true)
    Promise.all([
      api.get(`/api/v1/legal/envelopes/contract-templates/${selectedTemplate}/fields`),
      api.get(`/api/v1/legal/envelopes/types/${templates.find(t => t.id === selectedTemplate)?.contract_type_id || selectedTemplate}/attachments`),
    ])
      .then(([fieldsRes, attachRes]) => {
        setTemplateFields(fieldsRes.data)
        setAttachmentDefs(attachRes.data || [])
        const defaults: Record<string, string> = isCorrection ? {} : { ...DEMO_DATA }
        fieldsRes.data.field_groups?.forEach((g: FieldGroup) => {
          g.fields.forEach((f: TemplateField) => { if (!defaults[f.key] && f.default !== undefined) defaults[f.key] = f.default.toString() })
        })
        if (isCorrection && pendingCorrectionForm.current) {
          const merged = { ...defaults, ...pendingCorrectionForm.current }
          setFormData(merged)
          setOriginalFormData(merged)
        } else {
          setFormData(defaults)
        }
      })
      .catch(() => { setTemplateFields(null); setAttachmentDefs([]) })
      .finally(() => setLoadingFields(false))
  }, [selectedTemplate])

  const handleFieldChange = (key: string, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }))
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: '' }))
  }
  const handleUpload = (defId: string, file: File, defName?: string) => setUploadedFiles(prev => [...prev.filter(f => f.defId !== defId), { defId, file, name: defName ? defName : file.name }])
  const handleRemove = (defId: string) => setUploadedFiles(prev => prev.filter(f => f.defId !== defId))

  const hasCurrentAttachment = (defId: string) => existingAttachments.some(a => a.attachment_def_id === defId && a.is_current !== false)

  // Calcula la siguiente versión a partir de las versiones ya existentes
  const nextVersionForDef = (defId: string) => {
    const versions = existingAttachments.filter(a => a.attachment_def_id === defId).map(a => a.version_number || 1)
    return versions.length ? Math.max(...versions) + 1 : 1
  }
  const nextContractVersion = () => {
    const versions = existingAttachments.filter(a => !a.attachment_def_id).map(a => a.version_number || 1)
    return versions.length ? Math.max(...versions) + 1 : 1
  }

  const validateStep2 = () => {
    if (!templateFields) return false
    const newErrors: Record<string, string> = {}
    templateFields.field_groups.forEach(g => g.fields.forEach(f => {
      if (f.required && !(formData[f.key] ?? '').trim()) newErrors[f.key] = 'Requerido'
    }))
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const validateStep3 = () => attachmentDefs.filter(d => d.is_required).every(d => uploadedFiles.some(f => f.defId === d.id) || hasCurrentAttachment(d.id))

  const handleNext = () => {
    if (step === 1 && !selectedTemplate) return
    if (step === 2 && !validateStep2()) return
    if (step === 3 && !validateStep3()) return
    setStep(s => s + 1)
  }

  const handleBack = () => {
    const minStep = isCorrection ? 2 : 1
    if (step <= minStep) router.push('/app/legal/solicitud-de-contratos')
    else setStep(s => s - 1)
  }

  const registerAttachment = async (envelopeId: string, d: any, defId?: string, description?: string) => {
    const p: any = { object_key: d.object_key, original_name: d.original_name, stored_name: d.stored_name, bucket: d.bucket, mime_type: d.content_type, size_bytes: d.size_bytes }
    if (defId) p.attachment_def_id = defId
    if (description) p.description = description
    await api.post(`/api/v1/legal/envelopes/${envelopeId}/attachments`, p)
  }

  const uploadAnexos = async (envelopeId: string, folio: string, companySlug: string) => {
    for (const uploaded of uploadedFiles) {
      try {
        const ext = uploaded.file.name.split('.').pop()
        const version = nextVersionForDef(uploaded.defId)
        const baseName = uploaded.name.replace(/\.[^.]+$/, '')
        const anexoName = `${folio}_${baseName}_v${version}.${ext}`
        const renamedFile = new File([uploaded.file], anexoName, { type: uploaded.file.type })
        const aFD = new FormData()
        aFD.append('file', renamedFile)
        aFD.append('module_slug', 'legal')
        aFD.append('submodule_slug', `envelopes/${folio}/attachments`)
        aFD.append('company_slug', companySlug)
        const aUpload = await uploadToStorage(aFD)
        if (aUpload.data?.data?.object_key) await registerAttachment(envelopeId, aUpload.data.data, uploaded.defId)
      } catch (e) { console.error('Error subiendo anexo:', e) }
    }
  }

  const generateAndUploadPdf = async (envelopeId: string, folio: string, companySlug: string, description: string) => {
    try {
      const pdfRes = await api.post(`/api/v1/legal/envelopes/contract-templates/${selectedTemplate}/preview-pdf`, formData, { responseType: 'blob' })
      const cv = nextContractVersion()
      const pdfFile = new File([pdfRes.data], `${folio}_Contrato_v${cv}.pdf`, { type: 'application/pdf' })
      const pdfFD = new FormData()
      pdfFD.append('file', pdfFile)
      pdfFD.append('module_slug', 'legal')
      pdfFD.append('submodule_slug', `envelopes/${folio}`)
      pdfFD.append('company_slug', companySlug)
      const pdfUpload = await uploadToStorage(pdfFD)
      if (pdfUpload.data?.data?.object_key) await registerAttachment(envelopeId, pdfUpload.data.data, undefined, description)
    } catch (e) { console.error('Error generando/subiendo PDF:', e) }
  }

  const handleCreateSubmit = async () => {
    setIsSubmitting(true); setSubmitError('')
    try {
      try { await api.get('/api/v1/legal/envelopes/contract-templates') } catch (e) { /* continúa */ }
      const tpl = templates.find(t => t.id === selectedTemplate)
      const contractTypeId = tpl?.contract_type_id || selectedTemplate
      const payload: any = { contract_type_id: contractTypeId, form_data: formData, is_open_request: false }
      if (selectedCompany?.id) payload.company_id = selectedCompany.id
      const res = await api.post('/api/v1/legal/envelopes', payload)
      const envelopeId = res.data.id
      const folio = res.data.folio
      const companySlug = selectedCompany?.slug || res.data.company_name || 'general'

      await generateAndUploadPdf(envelopeId, folio, companySlug, `Contrato generado — ${folio}`)
      await uploadAnexos(envelopeId, folio, companySlug)

      await api.post(`/api/v1/legal/envelopes/${envelopeId}/submit`, {})
      router.push('/app/legal/solicitud-de-contratos')
    } catch (e: any) {
      setSubmitError(e?.response?.data?.message || e?.response?.data?.detail || 'Error al enviar. Intenta de nuevo.')
      setIsSubmitting(false)
    }
  }

  const handleCorrectionSubmit = async () => {
    setIsSubmitting(true); setSubmitError('')
    try {
      const envelopeId = correctionId as string
      const folio = correctionFolio || 'contrato'
      const companySlug = selectedCompany?.slug || 'general'

      // Regenera el PDF del contrato solo si el solicitante cambió el formulario
      const formChanged = JSON.stringify(formData) !== JSON.stringify(originalFormData)
      if (formChanged) {
        await generateAndUploadPdf(envelopeId, folio, companySlug, `Contrato corregido — ${folio}`)
      }
      // Sube únicamente los anexos que el solicitante reemplazó o agregó
      await uploadAnexos(envelopeId, folio, companySlug)
      // Reenvía — submit actualiza form_data, crea snapshot y pasa a en_revision_legal
      await api.post(`/api/v1/legal/envelopes/${envelopeId}/submit`, { form_data: formData })
      router.push('/app/legal/solicitud-de-contratos')
    } catch (e: any) {
      setSubmitError(e?.response?.data?.message || e?.response?.data?.detail || 'Error al reenviar. Intenta de nuevo.')
      setIsSubmitting(false)
    }
  }

  const handleSubmit = () => (isCorrection ? handleCorrectionSubmit() : handleCreateSubmit())

  const selectedTpl = templates.find(t => t.id === selectedTemplate)
  const requiredPending = attachmentDefs.filter(d => d.is_required && !uploadedFiles.some(f => f.defId === d.id) && !hasCurrentAttachment(d.id))
  const isPreviewStep = step === 4
  const canNext = (step === 1 && !!selectedTemplate) || step === 2 || (step === 3 && requiredPending.length === 0) || step === 4
  const minStep = isCorrection ? 2 : 1

  return (
    <PageWrapper
      title={isCorrection ? 'Corregir contrato' : 'Crear contrato'}
      description={isCorrection ? 'Ajusta lo solicitado por el área legal y reenvía tu contrato' : 'Completa el formulario y envía tu solicitud al área legal'}
      actions={<button onClick={handleBack} className="flex items-center gap-1.5 text-sm text-slate-600 border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition"><ArrowLeft size={14} />{step === minStep ? 'Cancelar' : 'Atrás'}</button>}>
      {isCorrection && loadingCorrection ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 size={26} className="text-[#1a4fa0] animate-spin" />
          <p className="text-xs text-slate-400">Cargando el sobre para corrección...</p>
        </div>
      ) : (
        <>
          {needsCompanySelect && <CompanySelector companies={availableCompanies} onSelect={setSelectedCompany} />}
          {!needsCompanySelect && (
            <div className={isPreviewStep ? 'max-w-5xl mx-auto' : 'max-w-6xl mx-auto'}>
              <StepIndicator current={step} />
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                {step === 1 && <Step1 templates={templates} selected={selectedTemplate} onSelect={setSelectedTemplate} />}
                {step === 2 && <Step2 templateFields={loadingFields ? null : templateFields} formData={formData} onChange={handleFieldChange} errors={errors} />}
                {step === 3 && <Step3Anexos attachmentDefs={attachmentDefs} uploadedFiles={uploadedFiles} onUpload={handleUpload} onRemove={handleRemove} existingAttachments={existingAttachments} isCorrection={isCorrection} />}
                {step === 4 && <Step4Preview formData={formData} templateSlug={selectedTemplate} templateName={selectedTpl?.name ?? ''} />}
                {step === 5 && <Step5 templateName={selectedTpl?.name ?? ''} isSubmitting={isSubmitting} onConfirm={handleSubmit} error={submitError} attachmentCount={uploadedFiles.length} isCorrection={isCorrection} />}
              </div>
              {step === 3 && requiredPending.length > 0 && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2.5">
                  <AlertCircle size={13} className="text-amber-500 shrink-0" />
                  <p className="text-xs text-amber-700">Faltan <strong>{requiredPending.length}</strong> documento{requiredPending.length > 1 ? 's' : ''} obligatorio{requiredPending.length > 1 ? 's' : ''}: {requiredPending.map(d => d.name).join(', ')}</p>
                </div>
              )}
              {step < 5 && (
                <div className="flex justify-end mt-3">
                  <button onClick={handleNext} disabled={!canNext} className="flex items-center gap-2 bg-[#1a4fa0] text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition">
                    {step === 4 ? 'Confirmar y continuar' : 'Continuar'}<ArrowRight size={14} />
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </PageWrapper>
  )
}

export default function NuevoContratoPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 size={26} className="text-[#1a4fa0] animate-spin" /></div>}>
      <NuevoContratoInner />
    </Suspense>
  )
}