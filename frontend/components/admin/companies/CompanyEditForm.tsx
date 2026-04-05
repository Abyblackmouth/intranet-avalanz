'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Building2, AlertCircle } from 'lucide-react'
import { updateCompany } from '@/services/adminService'
import { CompanyRow } from '@/types/company.types'

interface CompanyEditFormProps {
  company: CompanyRow
  onClose: () => void
  onSaved: () => void
}

export default function CompanyEditForm({ company, onClose, onSaved }: CompanyEditFormProps) {
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
  const [error, setError] = useState<string | null>(null)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle size={15} className="flex-shrink-0" />
              {error}
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
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">C.P.</label>
              <input
                type="text"
                name="cp"
                value={form.cp}
                onChange={handleChange}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Núm. Ext.</label>
              <input
                type="text"
                name="num_ext"
                value={form.num_ext}
                onChange={handleChange}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Núm. Int.</label>
              <input
                type="text"
                name="num_int"
                value={form.num_int}
                onChange={handleChange}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Municipio</label>
              <input
                type="text"
                name="municipio"
                value={form.municipio}
                onChange={handleChange}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Estado</label>
              <input
                type="text"
                name="estado"
                value={form.estado}
                onChange={handleChange}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
            disabled={isSaving}
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
