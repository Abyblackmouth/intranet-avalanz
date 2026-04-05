'use client'

import { X, Building2, MapPin, FileText, CheckCircle2, XCircle, Calendar } from 'lucide-react'
import { CompanyRow } from '@/types/company.types'
import { useState } from 'react'

interface CompanyDetailProps {
  company: CompanyRow
  onClose: () => void
}

type Tab = 'info' | 'domicilio'

// Campo vertical: label arriba, valor abajo
const Field = ({ label, value }: { label: string; value: string | null | undefined }) => (
  <div className="flex items-start justify-between py-3 border-b border-slate-100 last:border-0 gap-4">
    <span className="text-sm text-slate-500 shrink-0">{label}</span>
    <span className={`text-sm font-medium text-right ${value ? 'text-slate-800' : 'text-slate-300 italic font-normal'}`}>
      {value || 'Sin datos'}
    </span>
  </div>
)

const FieldRow = Field

function isVigente(fechaStr: string): boolean {
  const meses: Record<string, number> = {
    ENERO: 0, FEBRERO: 1, MARZO: 2, ABRIL: 3, MAYO: 4, JUNIO: 5,
    JULIO: 6, AGOSTO: 7, SEPTIEMBRE: 8, OCTUBRE: 9, NOVIEMBRE: 10, DICIEMBRE: 11,
  }
  const match = fechaStr.match(/(\d{1,2})\s+DE\s+(\w+)\s+DE\s+(\d{4})/i)
  if (!match) return false
  const mes = meses[match[2].toUpperCase()]
  if (mes === undefined) return false
  const fecha = new Date(parseInt(match[3]), mes, parseInt(match[1]))
  return fecha >= new Date()
}

export default function CompanyDetail({ company, onClose }: CompanyDetailProps) {
  const [activeTab, setActiveTab] = useState<Tab>('info')

  const initials = company.nombre_comercial.slice(0, 2).toUpperCase()
  const hasAddress = company.calle || company.colonia || company.municipio || company.estado
  const vigente = company.constancia_fecha_vigencia ? isVigente(company.constancia_fecha_vigencia) : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative w-full max-w-xl h-full bg-white shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#1a4fa0] flex items-center justify-center shrink-0">
              <span className="text-white text-sm font-bold">{initials}</span>
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">{company.nombre_comercial}</h2>
              <p className="text-xs text-slate-500">{company.rfc ?? 'Sin RFC'}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 shrink-0">
          {[
            { id: 'info', label: 'Información' },
            { id: 'domicilio', label: 'Domicilio fiscal' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={`flex-1 py-3 text-sm font-medium transition border-b-2 ${
                activeTab === tab.id
                  ? 'border-[#1a4fa0] text-[#1a4fa0]'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">

          {/* Tab Info */}
          {activeTab === 'info' && (
            <div className="p-6 space-y-5">

              {/* Badge de estado */}
              <div className={`flex items-center gap-3 p-4 rounded-xl border ${
                company.is_active
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-red-50 border-red-200'
              }`}>
                {company.is_active ? (
                  <CheckCircle2 size={20} className="text-emerald-500 shrink-0" />
                ) : (
                  <XCircle size={20} className="text-red-400 shrink-0" />
                )}
                <div>
                  <p className={`text-sm font-semibold ${company.is_active ? 'text-emerald-700' : 'text-red-600'}`}>
                    {company.is_active ? 'Empresa activa' : 'Empresa inactiva'}
                  </p>
                  <p className="text-xs text-slate-400">
                    {company.is_active
                      ? 'Disponible para asignación de usuarios y módulos'
                      : 'No disponible para asignación de usuarios'}
                  </p>
                </div>
              </div>

              {/* Datos generales */}
              <div className="bg-white rounded-xl border border-slate-200 px-4">
                <div className="flex items-center gap-2 py-3 border-b border-slate-100">
                  <Building2 size={14} className="text-slate-400" />
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Datos generales</p>
                </div>
                <Field label="Razón social" value={company.name} />
                <Field label="Nombre comercial" value={company.nombre_comercial} />
                <FieldRow label="RFC" value={company.rfc} />
                <FieldRow label="Alta en sistema" value={new Date(company.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })} />
                {company.description && (
                  <Field label="Descripción" value={company.description} />
                )}
              </div>

              {/* Constancia SAT */}
              <div className="bg-white rounded-xl border border-slate-200 px-4">
                <div className="flex items-center gap-2 py-3 border-b border-slate-100">
                  <FileText size={14} className="text-slate-400" />
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Constancia SAT</p>
                </div>

                {!company.constancia_fecha_emision && !company.constancia_fecha_vigencia ? (
                  <div className="py-6 text-center">
                    <Calendar size={20} className="text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">Sin constancia registrada</p>
                  </div>
                ) : (
                  <>
                    <FieldRow label="Fecha de emisión" value={company.constancia_fecha_emision} />
                    <div className="flex items-center justify-between py-3 gap-3">
                      <p className="text-sm text-slate-500 shrink-0">Vigencia</p>
                      <div className="flex items-center gap-2">
                        {vigente !== null && (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            vigente
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-red-50 text-red-600'
                          }`}>
                            {vigente ? 'Vigente' : 'Vencida'}
                          </span>
                        )}
                        <p className={`text-sm font-medium text-right ${
                          vigente === true ? 'text-emerald-600' :
                          vigente === false ? 'text-red-500' : 'text-slate-300 italic font-normal'
                        }`}>
                          {company.constancia_fecha_vigencia ?? 'Sin datos'}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>

            </div>
          )}

          {/* Tab Domicilio */}
          {activeTab === 'domicilio' && (
            <div className="p-6">

              {!hasAddress ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="p-4 bg-slate-100 rounded-2xl mb-4">
                    <MapPin size={28} className="text-slate-400" />
                  </div>
                  <p className="text-sm font-semibold text-slate-600 mb-1">Sin domicilio registrado</p>
                  <p className="text-xs text-slate-400">Edita la empresa para agregar el domicilio fiscal</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 px-4">
                  <div className="flex items-center gap-2 py-3 border-b border-slate-100">
                    <MapPin size={14} className="text-slate-400" />
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Domicilio fiscal</p>
                  </div>

                  {/* Dirección completa en un campo */}
                  {(company.calle || company.num_ext) && (
                    <Field
                      label="Calle y número"
                      value={[company.calle, company.num_ext, company.num_int ? `Int. ${company.num_int}` : null]
                        .filter(Boolean).join(' ')}
                    />
                  )}
                  <FieldRow label="Colonia" value={company.colonia} />
                  <FieldRow label="C.P." value={company.cp} />
                  <FieldRow label="Municipio" value={company.municipio} />
                  <FieldRow label="Estado" value={company.estado} />
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
