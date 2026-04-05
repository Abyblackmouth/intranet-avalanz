'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Building2, AlertCircle, FileText, Upload, Loader2 } from 'lucide-react'
import { updateCompany } from '@/services/adminService'
import { CompanyRow } from '@/types/company.types'

interface CompanyEditFormProps {
  company: CompanyRow
  onClose: () => void
  onSaved: () => void
}

type Tab = 'datos' | 'sat'

// ── Extracción local del PDF (solo domicilio y fechas) ────────────────────────

function addOneMonth(dateStr: string): string {
  const meses: Record<string, number> = {
    ENERO: 0, FEBRERO: 1, MARZO: 2, ABRIL: 3, MAYO: 4, JUNIO: 5,
    JULIO: 6, AGOSTO: 7, SEPTIEMBRE: 8, OCTUBRE: 9, NOVIEMBRE: 10, DICIEMBRE: 11,
  }
  const nombresM = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
                    'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']
  const match = dateStr.match(/(\d{1,2})\s+DE\s+(\w+)\s+DE\s+(\d{4})/i)
  if (!match) return ''
  const day = parseInt(match[1])
  const mes = meses[match[2].toUpperCase()]
  const year = parseInt(match[3])
  if (mes === undefined) return ''
  const d = new Date(year, mes + 1, day)
  return `${String(d.getDate()).padStart(2,'0')} DE ${nombresM[d.getMonth()]} DE ${d.getFullYear()}`
}

interface ExtractedData {
  rfc: string
  calle: string
  num_ext: string
  num_int: string
  colonia: string
  cp: string
  municipio: string
  estado: string
  constancia_fecha_emision: string
  constancia_fecha_vigencia: string
}

async function parseSATConstancia(file: File): Promise<ExtractedData> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  let fullText = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    fullText += content.items.map((item: any) => item.str).join(' ') + '\n'
  }

  const result: ExtractedData = {
    rfc: '', calle: '', num_ext: '', num_int: '',
    colonia: '', cp: '', municipio: '', estado: '',
    constancia_fecha_emision: '', constancia_fecha_vigencia: '',
  }

  // RFC — solo para validar, no se guarda
  const rfcMatch = fullText.match(/RFC:\s*([A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3})/i)
  if (rfcMatch) result.rfc = rfcMatch[1].trim()

  // Fecha de emisión
  const fechaMatch = fullText.match(/A\s+(\d{1,2}\s+DE\s+\w+\s+DE\s+\d{4})/i)
  if (fechaMatch) {
    result.constancia_fecha_emision = fechaMatch[1].trim()
    result.constancia_fecha_vigencia = addOneMonth(fechaMatch[1].trim())
  }

  // Código Postal
  const cpMatch = fullText.match(/C[oó]digo Postal:?\s*(\d{4,5})/i)
  if (cpMatch) result.cp = cpMatch[1].trim()

  // Calle
  const vialidadMatch = fullText.match(/Nombre\s+de\s+Vialidad:\s*([^\n]+?)(?:\s+N[uú]mero\s+Exterior:|$)/i)
  if (vialidadMatch) result.calle = vialidadMatch[1].trim()

  // Número exterior
  const numExtMatch = fullText.match(/N[uú]mero\s+Exterior:\s*([^\s]+)/i)
  if (numExtMatch) result.num_ext = numExtMatch[1].trim()

  // Número interior
  const numIntMatch = fullText.match(/N[uú]mero\s+Interior:?\s*([^\s][^\n]*?)(?:\s+Nombre\s+de\s+la\s+Colonia:|$)/i)
  if (numIntMatch) result.num_int = numIntMatch[1].trim()

  // Colonia
  const coloniaMatch = fullText.match(/Nombre\s+de\s+la\s+Colonia:\s*([^\n]+?)(?:\s+Nombre\s+de\s+la\s+Localidad:|$)/i)
  if (coloniaMatch) result.colonia = coloniaMatch[1].trim()

  // Municipio — el PDF tiene espacios multiples entre palabras del label
  const municipioIdx = fullText.search(/Nombre\s+del\s+Municipio/i)
  if (municipioIdx !== -1) {
    const afterLabel = fullText.slice(municipioIdx).replace(/Nombre\s+del\s+Municipio[^:]*:\s*/i, '')
    const stopIdx = afterLabel.search(/Nombre\s+de\s+la\s+Entidad|Entre\s+Calle/i)
    const raw = stopIdx !== -1 ? afterLabel.slice(0, stopIdx) : afterLabel.slice(0, 60)
    result.municipio = raw.replace(/\s+/g, ' ').trim()
  }

  // Estado
  const estadoMatch = fullText.match(/Nombre\s+de\s+la\s+Entidad\s+Federativa:\s*([^\n]+?)(?:\s+Entre\s+Calle:|$)/i)
  if (estadoMatch) result.estado = estadoMatch[1].replace(/\s+/g, ' ').trim()

  return result
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function CompanyEditForm({ company, onClose, onSaved }: CompanyEditFormProps) {
  const [tab, setTab] = useState<Tab>('datos')
  const [form, setForm] = useState({
    nombre_comercial: company.nombre_comercial ?? '',
    name: company.name ?? '',
    rfc: company.rfc ?? '',
    description: company.description ?? '',
    calle: company.calle ?? '',
    num_ext: company.num_ext ?? '',
    num_int: company.num_int ?? '',
    colonia: company.colonia ?? '',
    cp: company.cp ?? '',
    municipio: company.municipio ?? '',
    estado: company.estado ?? '',
    constancia_fecha_emision: company.constancia_fecha_emision ?? '',
    constancia_fecha_vigencia: company.constancia_fecha_vigencia ?? '',
  })
  const [isSaving, setIsSaving] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [satSuccess, setSatSuccess] = useState(false)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => { if (errorTimerRef.current) clearTimeout(errorTimerRef.current) }
  }, [])

  const showError = useCallback((msg: string) => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    setError(msg)
    errorTimerRef.current = setTimeout(() => setError(null), 3000)
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf') {
      showError('Solo se aceptan archivos PDF')
      return
    }

    setExtracting(true)
    setSatSuccess(false)
    setError(null)

    try {
      const data = await parseSATConstancia(file)

      if (!data.rfc) {
        showError('No se pudo leer el RFC de la constancia. Verifica que sea un PDF válido del SAT.')
        return
      }

      // Validar que el RFC de la constancia corresponda a la empresa
      const rfcEmpresa = (company.rfc ?? '').toUpperCase().trim()
      const rfcConstancia = data.rfc.toUpperCase().trim()

      if (rfcEmpresa && rfcConstancia !== rfcEmpresa) {
        showError(`La constancia no corresponde a la empresa ${company.nombre_comercial}`)
        return
      }

      // Cargar solo domicilio y fechas — NO nombre ni RFC
      setForm((prev) => ({
        ...prev,
        calle: data.calle || prev.calle,
        num_ext: data.num_ext || prev.num_ext,
        num_int: data.num_int || prev.num_int,
        colonia: data.colonia || prev.colonia,
        cp: data.cp || prev.cp,
        municipio: data.municipio || prev.municipio,
        estado: data.estado || prev.estado,
        constancia_fecha_emision: data.constancia_fecha_emision || prev.constancia_fecha_emision,
        constancia_fecha_vigencia: data.constancia_fecha_vigencia || prev.constancia_fecha_vigencia,
      }))

      setSatSuccess(true)
      setTab('datos')
    } catch {
      showError('No se pudo leer la constancia. Verifica que sea un PDF válido del SAT.')
    } finally {
      setExtracting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleSave = async () => {
    if (!form.nombre_comercial.trim()) return showError('El nombre comercial es obligatorio')
    if (!form.name.trim()) return showError('La razón social es obligatoria')

    setIsSaving(true)
    try {
      await updateCompany(company.company_id, {
        nombre_comercial: form.nombre_comercial.trim(),
        name: form.name.trim(),
        rfc: form.rfc.trim() || null,
        description: form.description.trim() || null,
        calle: form.calle.trim() || null,
        num_ext: form.num_ext.trim() || null,
        num_int: form.num_int.trim() || null,
        colonia: form.colonia.trim() || null,
        cp: form.cp.trim() || null,
        municipio: form.municipio.trim() || null,
        estado: form.estado.trim() || null,
        constancia_fecha_emision: form.constancia_fecha_emision.trim() || null,
        constancia_fecha_vigencia: form.constancia_fecha_vigencia.trim() || null,
      })
      onSaved()
    } catch (err: any) {
      const raw = (err?.response?.data?.message ?? '') as string
      showError(raw.replace(/con slug '[^']*'/g, '').replace(/^Empresa\b/, 'La empresa') || 'No se pudo guardar los cambios')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Building2 size={18} className="text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800 text-base">Editar empresa</h2>
              <p className="text-xs text-slate-400">{company.nombre_comercial}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-6 flex-shrink-0">
          <button
            onClick={() => { setTab('datos'); setError(null) }}
            className={`flex items-center gap-2 py-3 px-1 mr-6 text-sm font-medium border-b-2 transition-colors ${
              tab === 'datos'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Building2 size={15} />
            Datos
          </button>
          <button
            onClick={() => { setTab('sat'); setError(null); setSatSuccess(false) }}
            className={`flex items-center gap-2 py-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              tab === 'sat'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <FileText size={15} />
            Actualizar constancia
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5">

          {/* Tab SAT */}
          {tab === 'sat' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                Carga la constancia SAT vigente de <span className="font-semibold text-slate-700">{company.nombre_comercial}</span>. 
                Solo se actualizará el domicilio y las fechas de vigencia. El RFC y razón social no cambian.
              </p>
              <label className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl py-10 cursor-pointer transition-colors ${
                extracting
                  ? 'border-blue-300 bg-blue-50'
                  : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
              }`}>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={extracting}
                />
                {extracting ? (
                  <>
                    <Loader2 size={32} className="text-blue-500 animate-spin" />
                    <p className="text-sm text-blue-600 font-medium">Leyendo constancia...</p>
                    <p className="text-xs text-slate-400">Validando RFC y extrayendo domicilio</p>
                  </>
                ) : (
                  <>
                    <Upload size={32} className="text-slate-400" />
                    <p className="text-sm text-slate-600 font-medium">Carga la constancia fiscal vigente</p>
                    <p className="text-xs text-slate-400">PDF del SAT · Solo actualiza domicilio y vigencia</p>
                    <p className="text-xs text-slate-400">El archivo no se almacena</p>
                  </>
                )}
              </label>

              {error && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <AlertCircle size={15} className="flex-shrink-0" />
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Tab Datos */}
          {tab === 'datos' && (
            <div className="space-y-4">

              {error && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <AlertCircle size={15} className="flex-shrink-0" />
                  {error}
                </div>
              )}

              {satSuccess && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
                  Domicilio y vigencia actualizados desde la constancia. Revisa y guarda.
                </div>
              )}

              {/* Nombre comercial + Razón social */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                    Nombre comercial <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="nombre_comercial"
                    value={form.nombre_comercial}
                    onChange={handleChange}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                    Razón social <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* RFC + CP */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">RFC</label>
                  <input
                    type="text"
                    name="rfc"
                    value={form.rfc}
                    onChange={(e) => setForm(prev => ({ ...prev, rfc: e.target.value.toUpperCase().slice(0, 13) }))}
                    maxLength={13}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">C.P.</label>
                  <input
                    type="text"
                    name="cp"
                    value={form.cp}
                    onChange={handleChange}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Calle + Num ext + Num int */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Calle</label>
                  <input
                    type="text"
                    name="calle"
                    value={form.calle}
                    onChange={handleChange}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Núm. Ext.</label>
                  <input
                    type="text"
                    name="num_ext"
                    value={form.num_ext}
                    onChange={handleChange}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Núm. Int.</label>
                  <input
                    type="text"
                    name="num_int"
                    value={form.num_int}
                    onChange={handleChange}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Colonia + Municipio + Estado */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Colonia</label>
                  <input
                    type="text"
                    name="colonia"
                    value={form.colonia}
                    onChange={handleChange}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Municipio</label>
                  <input
                    type="text"
                    name="municipio"
                    value={form.municipio}
                    onChange={handleChange}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Estado</label>
                  <input
                    type="text"
                    name="estado"
                    value={form.estado}
                    onChange={handleChange}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Fechas constancia */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Fecha emisión constancia</label>
                  <input
                    type="text"
                    name="constancia_fecha_emision"
                    value={form.constancia_fecha_emision}
                    onChange={handleChange}
                    placeholder="01 DE MARZO DE 2026"
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Vigencia constancia</label>
                  <input
                    type="text"
                    name="constancia_fecha_vigencia"
                    value={form.constancia_fecha_vigencia}
                    onChange={handleChange}
                    placeholder="01 DE ABRIL DE 2026"
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Descripción */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Descripción</label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  rows={2}
                  placeholder="Descripción opcional..."
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || extracting || tab === 'sat'}
            className="px-5 py-2 text-sm font-medium bg-[#1a4fa0] text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
          >
            {isSaving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {isSaving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>

      </div>
    </div>
  )
}
