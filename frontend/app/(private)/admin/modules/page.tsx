'use client'

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import * as LucideIcons from 'lucide-react'
import {
  Layers, Search, Plus, MoreHorizontal, Pencil, Trash2,
  AlertCircle, X, ChevronDown, ChevronRight, Box, CheckCircle2, XCircle
} from 'lucide-react'
import PageWrapper from '@/components/layout/PageWrapper'
import { useAuthStore } from '@/store/authStore'
import { ModuleRow, SubmoduleRow } from '@/types/module.types'
import { CompanyRow } from '@/types/company.types'
import {
  getModules, getCompanies,
  createModule, updateModule, deleteModule,
  createSubmodule, updateSubmodule, deleteSubmodule,
} from '@/services/adminService'

// ── Clave de eliminacion de modulos ─────────────────────────────────────────────
const MODULE_DELETE_KEY = 'TF9DX4-2JAQSJ-61FVM6-0QB1AK'

// ── Iconos disponibles ────────────────────────────────────────────────────────
const ICONS = [
  // Legal y jurídico
  'scale', 'gavel', 'scroll', 'file-check-2', 'shield-check',
  'book-open', 'book-marked', 'stamp', 'pen-line', 'file-signature',
  // Finanzas y contabilidad
  'calculator', 'wallet', 'credit-card', 'receipt', 'trending-up',
  'trending-down', 'piggy-bank', 'banknote', 'coins', 'percent',
  // Documentos y expedientes
  'file-text', 'file-search', 'folder-open', 'archive', 'clipboard-list',
  'file-plus', 'file-minus', 'files', 'paperclip', 'printer',
  // Operaciones
  'briefcase', 'layers', 'kanban', 'bar-chart-2', 'layout-dashboard',
  'git-branch', 'workflow', 'activity', 'pulse', 'network',
  // Recursos y personal
  'users', 'user-check', 'graduation-cap', 'heart-pulse', 'badge',
  'user-cog', 'users-round', 'contact', 'id-card', 'award',
  // Logística e inventario
  'truck', 'package', 'warehouse', 'factory', 'boxes',
  'forklift', 'container', 'ship', 'plane', 'map-pin',
  // Comunicación
  'mail', 'message-square', 'bell', 'phone', 'send',
  'message-circle', 'inbox', 'at-sign', 'rss', 'megaphone',
  // Administración
  'building-2', 'landmark', 'globe', 'database', 'settings-2',
  'server', 'hard-drive', 'monitor', 'layout', 'table-2',
  // Tiempo y seguimiento
  'calendar', 'clock', 'timer', 'flag', 'target',
  'calendar-check', 'alarm-clock', 'hourglass', 'milestone', 'list-checks',
  // Seguridad y acceso
  'shield', 'lock', 'key', 'eye', 'fingerprint',
  'shield-alert', 'scan', 'qr-code', 'badge-check', 'circle-check',
]

// Mapa de iconos a componentes de Lucide

function DynamicIcon({ name, size = 18, className = '' }: { name: string; size?: number; className?: string }) {
  const iconName = name.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join('')
  const Icon = (LucideIcons as any)[iconName]
  if (!Icon) return <LucideIcons.Box size={size} className={className} />
  return <Icon size={size} className={className} />
}

// ── Modal módulo ──────────────────────────────────────────────────────────────
function ModuleForm({
  module, companies, onClose, onSaved,
}: {
  module?: ModuleRow
  companies: CompanyRow[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    company_id: module?.company_id ?? '',
    name: module?.name ?? '',
    description: module?.description ?? '',
    icon: module?.icon ?? '',
    order: module?.order ?? 0,
  })
  const [isSaving, setIsSaving] = useState(false)
  const [scaffolding, setScaffolding] = useState(false)
  const [scaffoldDone, setScaffoldDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [iconSearch, setIconSearch] = useState('')

  const handleSave = async () => {
    if (!form.company_id) return setError('Selecciona una empresa')
    if (!form.name.trim()) return setError('El nombre es obligatorio')
    setIsSaving(true)
    try {
      if (module) {
        await updateModule(module.module_id, {
          name: form.name.trim(),
          description: form.description.trim() || null,
          icon: form.icon.trim() || null,
          order: form.order,
        })
        onSaved()
      } else {
        const res = await createModule({
          company_id: form.company_id,
          name: form.name.trim(),
          description: form.description.trim() || null,
          icon: form.icon.trim() || null,
          order: form.order,
        })
        const slug = res.data?.data?.slug ?? form.name.trim().toLowerCase().replace(/\s+/g, '-')
        setIsSaving(false)
        setScaffolding(true)
        const [scaffoldResult] = await Promise.allSettled([
          fetch('http://localhost:3002/scaffold/module', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug }),
          }),
          new Promise(resolve => setTimeout(resolve, 5000)),
        ])
        setScaffolding(false)
        onSaved()
      }
    } catch (err: any) {
      const msg = (err?.response?.data?.message ?? '') as string
      setError(msg.replace(/con slug '[^']*'/g, '').replace(/^Modulo\b/, 'El módulo') || 'No se pudo guardar')
      setIsSaving(false)
      setScaffolding(false)
    }
  }

  if (scaffoldDone) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 flex flex-col items-center gap-4 text-center">
          <div className="p-3 bg-emerald-50 rounded-xl">
            <CheckCircle2 size={32} className="text-emerald-500" />
          </div>
          <div>
            <p className="font-semibold text-slate-800 text-base mb-1">Módulo creado exitosamente</p>
            <p className="text-sm text-slate-500">Cierra sesión y vuelve a entrar para verlo en el menú lateral.</p>
          </div>
          <button
            onClick={onSaved}
            className="px-6 py-2 text-sm font-medium bg-[#1a4fa0] text-white rounded-lg hover:bg-blue-700 transition"
          >
            Entendido
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Layers size={18} className="text-blue-600" />
            </div>
            <h2 className="font-semibold text-slate-800">{module ? 'Editar módulo' : 'Nuevo módulo'}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle size={15} className="flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Empresa — solo al crear */}
          {!module && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                Empresa <span className="text-red-500">*</span>
              </label>
              <select
                value={form.company_id}
                onChange={(e) => setForm(p => ({ ...p, company_id: e.target.value }))}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Selecciona una empresa...</option>
                {companies.filter(c => c.is_active).map(c => (
                  <option key={c.company_id} value={c.company_id}>{c.nombre_comercial}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="Ej. Legal"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 bg-white outline-none hover:border-slate-300 focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#1a4fa0]/10 transition-all duration-150"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Descripción</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
              rows={2}
              placeholder="Descripción opcional..."
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 bg-white outline-none hover:border-slate-300 focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#1a4fa0]/10 transition-all duration-150 resize-none"
            />
          </div>

          {/* Selector de icono — popover flotante */}
          <div className="relative">
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
              Ícono
            </label>
            <button
              type="button"
              onClick={() => setShowIconPicker(p => !p)}
              className="w-full flex items-center gap-3 px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-700 hover:border-[#1a4fa0] hover:ring-2 hover:ring-[#1a4fa0]/10 transition-all duration-150 bg-white"
            >
              {form.icon ? (
                <>
                  <div className="w-7 h-7 rounded-lg bg-[#1a4fa0] flex items-center justify-center shrink-0">
                    <DynamicIcon name={form.icon} size={15} className="text-white" />
                  </div>
                  <span className="text-slate-700">{form.icon}</span>
                </>
              ) : (
                <>
                  <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    <DynamicIcon name="box" size={15} className="text-slate-400" />
                  </div>
                  <span className="text-slate-400">Seleccionar ícono...</span>
                </>
              )}
            </button>

            {showIconPicker && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowIconPicker(false)} />
                <div className="absolute z-50 top-full mt-2 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                  <div className="p-2 border-b border-slate-100">
                    <input
                      type="text"
                      value={iconSearch}
                      onChange={e => setIconSearch(e.target.value)}
                      placeholder="Buscar ícono..."
                      className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a4fa0]/20 focus:border-[#1a4fa0]"
                      autoFocus
                    />
                  </div>
                  <div className="grid grid-cols-8 gap-0 max-h-48 overflow-y-auto p-1">
                    {ICONS.filter(i => i.includes(iconSearch.toLowerCase())).map(icon => (
                      <button
                        key={icon}
                        type="button"
                        onClick={() => { setForm(p => ({ ...p, icon: p.icon === icon ? '' : icon })); setShowIconPicker(false) }}
                        title={icon}
                        className={`flex items-center justify-center p-2.5 rounded-lg transition-colors ${
                          form.icon === icon
                            ? 'bg-[#1a4fa0] text-white'
                            : 'hover:bg-blue-50 hover:text-[#1a4fa0] text-slate-600'
                        }`}
                      >
                        <DynamicIcon name={icon} size={16} />
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Orden</label>
            <input
              type="number"
              value={form.order}
              onChange={(e) => setForm(p => ({ ...p, order: parseInt(e.target.value) || 0 }))}
              min={0}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || scaffolding}
            className="px-5 py-2 text-sm font-medium bg-[#1a4fa0] text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
          >
            {isSaving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {isSaving ? 'Guardando...' : 'Guardar módulo'}
          </button>
        </div>
      </div>

      {/* Modal de progreso scaffold */}
      {scaffolding && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl px-10 py-10 flex flex-col items-center gap-5 w-full max-w-sm mx-4">
            <div className="w-14 h-14 border-4 border-[#1a4fa0] border-t-transparent rounded-full animate-spin" />
            <div className="text-center">
              <p className="text-base font-semibold text-slate-800 mb-1">Creando módulo</p>
              <p className="text-sm text-slate-400">Esto puede tomar unos segundos...</p>
              <p className="text-xs text-slate-300 mt-2">Esto puede tomar unos segundos</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Modal submódulo ───────────────────────────────────────────────────────────
function SubmoduleForm({
  moduleId, moduleSlug, submodule, onClose, onSaved,
}: {
  moduleId: string
  moduleSlug: string
  submodule?: SubmoduleRow
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    name: submodule?.name ?? '',
    description: submodule?.description ?? '',
    icon: submodule?.icon ?? '',
    order: submodule?.order ?? 0,
  })
  const [isSaving, setIsSaving] = useState(false)
  const [scaffolding, setScaffolding] = useState(false)
  const [scaffoldDone, setScaffoldDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [iconSearch, setIconSearch] = useState('')

  const handleSave = async () => {
    if (!form.name.trim()) return setError('El nombre es obligatorio')
    setIsSaving(true)
    try {
      if (submodule) {
        await updateSubmodule(moduleId, submodule.submodule_id, {
          name: form.name.trim(),
          description: form.description.trim() || null,
          icon: form.icon.trim() || null,
          order: form.order,
        })
        onSaved()
      } else {
        const res = await createSubmodule(moduleId, {
          name: form.name.trim(),
          description: form.description.trim() || null,
          icon: form.icon.trim() || null,
          order: form.order,
        })
        const subSlug = res.data?.data?.slug ?? form.name.trim().toLowerCase().replace(/\s+/g, '-')
        // Obtener slug del modulo padre
        // moduleSlug viene como prop
        setIsSaving(false)
        setScaffolding(true)
        await Promise.allSettled([
          fetch('http://localhost:3002/scaffold/submodule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ moduleSlug: moduleSlug, subSlug }),
          }),
          new Promise(resolve => setTimeout(resolve, 5000)),
        ])
        setScaffolding(false)
        setScaffoldDone(true)
      }
    } catch (err: any) {
      const msg = (err?.response?.data?.message ?? '') as string
      setError(msg.replace(/con slug '[^']*'/g, '') || 'No se pudo guardar')
      setIsSaving(false)
      setScaffolding(false)
    }
  }

  if (scaffoldDone) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 flex flex-col items-center gap-4 text-center">
          <div className="p-3 bg-emerald-50 rounded-xl">
            <CheckCircle2 size={32} className="text-emerald-500" />
          </div>
          <div>
            <p className="font-semibold text-slate-800 text-base mb-1">Submódulo creado exitosamente</p>
            <p className="text-sm text-slate-500">Cierra sesión y vuelve a entrar para verlo en el menú lateral.</p>
          </div>
          <button
            onClick={onSaved}
            className="px-6 py-2 text-sm font-medium bg-[#1a4fa0] text-white rounded-lg hover:bg-blue-700 transition"
          >
            Entendido
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-50 rounded-lg">
              <Box size={18} className="text-violet-600" />
            </div>
            <h2 className="font-semibold text-slate-800">{submodule ? 'Editar submódulo' : 'Nuevo submódulo'}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle size={15} className="flex-shrink-0" />
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="Ej. Expedientes"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 bg-white outline-none hover:border-slate-300 focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#1a4fa0]/10 transition-all duration-150"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Descripción</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
              rows={2}
              placeholder="Descripción opcional..."
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 bg-white outline-none hover:border-slate-300 focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#1a4fa0]/10 transition-all duration-150 resize-none"
            />
          </div>
          {/* Selector de icono — popover flotante */}
          <div className="relative">
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
              Ícono
            </label>
            <button
              type="button"
              onClick={() => setShowIconPicker(p => !p)}
              className="w-full flex items-center gap-3 px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-700 hover:border-[#1a4fa0] hover:ring-2 hover:ring-[#1a4fa0]/10 transition-all duration-150 bg-white"
            >
              {form.icon ? (
                <>
                  <div className="w-7 h-7 rounded-lg bg-[#1a4fa0] flex items-center justify-center shrink-0">
                    <DynamicIcon name={form.icon} size={15} className="text-white" />
                  </div>
                  <span className="text-slate-700">{form.icon}</span>
                </>
              ) : (
                <>
                  <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    <DynamicIcon name="box" size={15} className="text-slate-400" />
                  </div>
                  <span className="text-slate-400">Seleccionar ícono...</span>
                </>
              )}
            </button>

            {showIconPicker && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowIconPicker(false)} />
                <div className="absolute z-50 top-full mt-2 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                  <div className="p-2 border-b border-slate-100">
                    <input
                      type="text"
                      value={iconSearch}
                      onChange={e => setIconSearch(e.target.value)}
                      placeholder="Buscar ícono..."
                      className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a4fa0]/20 focus:border-[#1a4fa0]"
                      autoFocus
                    />
                  </div>
                  <div className="grid grid-cols-8 gap-0 max-h-48 overflow-y-auto p-1">
                    {ICONS.filter(i => i.includes(iconSearch.toLowerCase())).map(icon => (
                      <button
                        key={icon}
                        type="button"
                        onClick={() => { setForm(p => ({ ...p, icon: p.icon === icon ? '' : icon })); setShowIconPicker(false) }}
                        title={icon}
                        className={`flex items-center justify-center p-2.5 rounded-lg transition-colors ${
                          form.icon === icon
                            ? 'bg-[#1a4fa0] text-white'
                            : 'hover:bg-blue-50 hover:text-[#1a4fa0] text-slate-600'
                        }`}
                      >
                        <DynamicIcon name={icon} size={16} />
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Orden</label>
            <input
              type="number"
              value={form.order}
              onChange={(e) => setForm(p => ({ ...p, order: parseInt(e.target.value) || 0 }))}
              min={0}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || scaffolding}
            className="px-5 py-2 text-sm font-medium bg-[#1a4fa0] text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
          >
            {isSaving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {isSaving ? 'Guardando...' : 'Guardar submódulo'}
          </button>
        </div>
      </div>

      {/* Modal de progreso scaffold */}
      {scaffolding && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl px-10 py-10 flex flex-col items-center gap-5 w-full max-w-sm mx-4">
            <div className="w-14 h-14 border-4 border-[#1a4fa0] border-t-transparent rounded-full animate-spin" />
            <div className="text-center">
              <p className="text-base font-semibold text-slate-800 mb-1">Creando submódulo</p>
              <p className="text-sm text-slate-400">Esto puede tomar unos segundos...</p>
              <p className="text-xs text-slate-300 mt-2">Esto puede tomar unos segundos</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Modal confirmar eliminación ───────────────────────────────────────────────
function ConfirmDelete({
  title, description, onClose, onConfirm, isLoading, error, requireKey = false,
}: {
  title: string
  description: string
  onClose: () => void
  onConfirm: () => void
  isLoading: boolean
  error: string | null
  requireKey?: boolean
}) {
  const [key, setKey] = useState('')
  const [keyError, setKeyError] = useState<string | null>(null)

  const handleConfirm = () => {
    if (requireKey) {
      if (key.trim().toUpperCase() !== MODULE_DELETE_KEY) {
        setKeyError('Clave incorrecta')
        return
      }
    }
    onConfirm()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-red-50 rounded-lg">
            <Trash2 size={18} className="text-red-500" />
          </div>
          <h2 className="font-semibold text-slate-800">{title}</h2>
        </div>
        <p className="text-sm text-slate-600 mb-4">{description}</p>
        {requireKey && (
          <div className="mb-4">
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
              Clave de confirmación
            </label>
            <input
              type="text"
              value={key}
              onChange={(e) => { setKey(e.target.value.toUpperCase()); setKeyError(null) }}
              placeholder="XXXXXX-XXXXXX-XXXXXX-XXXXXX"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm font-mono text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
            />
            {keyError && <p className="text-xs text-red-500 mt-1">{keyError}</p>}
          </div>
        )}
        {error && (
          <div className="mb-4 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}
        <div className="flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {isLoading && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {isLoading ? 'Eliminando...' : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function ModulesPage() {
  const { isSuperAdmin } = useAuthStore()
  const [mounted, setMounted] = useState(false)
  const [modules, setModules] = useState<ModuleRow[]>([])
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // Menus
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [openSubMenuId, setOpenSubMenuId] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })

  // Modales módulo
  const [showModuleForm, setShowModuleForm] = useState(false)
  const [editingModule, setEditingModule] = useState<ModuleRow | null>(null)
  const [deletingModule, setDeletingModule] = useState<ModuleRow | null>(null)
  const [isDeletingModule, setIsDeletingModule] = useState(false)
  const [deleteModuleError, setDeleteModuleError] = useState<string | null>(null)

  // Modales submódulo
  const [addingSubmoduleToModule, setAddingSubmoduleToModule] = useState<{ id: string; slug: string } | null>(null)
  const [editingSubmodule, setEditingSubmodule] = useState<{ moduleId: string; moduleSlug: string; submodule: SubmoduleRow } | null>(null)
  const [deletingSubmodule, setDeletingSubmodule] = useState<{ moduleId: string; submodule: SubmoduleRow } | null>(null)
  const [isDeletingSubmodule, setIsDeletingSubmodule] = useState(false)
  const [deleteSubmoduleError, setDeleteSubmoduleError] = useState<string | null>(null)

  const [error, setError] = useState<string | null>(null)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => { return () => { if (errorTimerRef.current) clearTimeout(errorTimerRef.current) } }, [])

  const showError = (msg: string) => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    setError(msg)
    errorTimerRef.current = setTimeout(() => setError(null), 3000)
  }

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [modulesRes, companiesRes] = await Promise.all([
        getModules({ per_page: 100 }),
        getCompanies({ per_page: 100, is_active: true }),
      ])
      // Cargar submodulos de cada modulo
      const modulesData: ModuleRow[] = modulesRes.data?.data?.data ?? []
      const withSubs = await Promise.all(
        modulesData.map(async (m) => {
          try {
            const { getModule } = await import('@/services/adminService')
            const res = await getModule(m.module_id)
            return res.data?.data ?? m
          } catch {
            return m
          }
        })
      )
      setModules(withSubs)
      setCompanies(companiesRes.data?.data?.data ?? [])
    } catch {
      showError('No se pudo cargar la información')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { if (mounted) fetchData() }, [mounted, fetchData])

  const openMenu = (e: React.MouseEvent<HTMLButtonElement>, id: string, isSub = false) => {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    setMenuPos({ top: rect.bottom + window.scrollY + 4, right: window.innerWidth - rect.right })
    if (isSub) {
      setOpenSubMenuId(id)
      setOpenMenuId(null)
    } else {
      setOpenMenuId(id)
      setOpenSubMenuId(null)
    }
  }

  const toggleExpand = (moduleId: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(moduleId) ? next.delete(moduleId) : next.add(moduleId)
      return next
    })
  }

  const handleDeleteModule = async () => {
    if (!deletingModule) return
    setIsDeletingModule(true)
    setDeleteModuleError(null)
    try {
      await deleteModule(deletingModule.module_id)
      setDeletingModule(null)
      fetchData()
    } catch (err: any) {
      setDeleteModuleError(err?.response?.data?.message ?? 'No se pudo eliminar el módulo')
    } finally {
      setIsDeletingModule(false)
    }
  }

  const handleDeleteSubmodule = async () => {
    if (!deletingSubmodule) return
    setIsDeletingSubmodule(true)
    setDeleteSubmoduleError(null)
    try {
      await deleteSubmodule(deletingSubmodule.moduleId, deletingSubmodule.submodule.submodule_id)
      setDeletingSubmodule(null)
      fetchData()
    } catch (err: any) {
      setDeleteSubmoduleError(err?.response?.data?.message ?? 'No se pudo eliminar el submódulo')
    } finally {
      setIsDeletingSubmodule(false)
    }
  }

  const getCompanyName = (companyId: string) =>
    companies.find(c => c.company_id === companyId)?.nombre_comercial ?? companyId

  if (!mounted) return null

  const searchLower = search.toLowerCase()
  const filtered = modules.filter(m =>
    !search ||
    m.name.toLowerCase().includes(searchLower) ||
    (m.description ?? '').toLowerCase().includes(searchLower) ||
    getCompanyName(m.company_id).toLowerCase().includes(searchLower)
  )

  return (
    <PageWrapper
      title="Módulos"
      description="Administración de módulos y submódulos del sistema"
      actions={
        mounted && isSuperAdmin() ? (
          <button
            onClick={() => setShowModuleForm(true)}
            className="flex items-center gap-2 bg-[#1a4fa0] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            <Plus size={15} />
            Nuevo módulo
          </button>
        ) : null
      }
    >
      {/* Buscador */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative" style={{ width: '320px' }}>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o empresa..."
            autoComplete="off"
            className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 bg-white outline-none hover:border-slate-300 focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#1a4fa0]/10 transition-all duration-150"
          />
        </div>
        {error && (
          <div className="px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}
      </div>

      {isLoading && (
        <div className="flex justify-center py-20 text-slate-400 text-sm">Cargando...</div>
      )}

      {/* Lista de módulos */}
      {!isLoading && (
        <div className="space-y-3">
          {filtered.map(module => {
            const expanded = expandedIds.has(module.module_id)
            const submodules = module.submodules ?? []

            return (
              <div key={module.module_id} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-[#1a4fa0]/30 hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">

                {/* Header del módulo */}
                <div
                  className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => toggleExpand(module.module_id)}
                >
                  {/* Chevron */}
                  <div className="text-slate-400 shrink-0">
                    {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </div>

                  {/* Icono del módulo */}
                  <div className="w-9 h-9 rounded-lg bg-[#1a4fa0] flex items-center justify-center shrink-0">
                    {module.icon ? <DynamicIcon name={module.icon} size={16} className="text-white" /> : <Layers size={16} className="text-white" />}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-slate-800 truncate">{module.name}</p>
                      <span className="text-xs font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{module.slug}</span>
                      {module.is_active
                        ? <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                        : <XCircle size={14} className="text-red-400 shrink-0" />
                      }
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <p className="text-xs text-slate-400">{getCompanyName(module.company_id)}</p>
                      {module.description && (
                        <p className="text-xs text-slate-400 truncate">· {module.description}</p>
                      )}
                      <p className="text-xs text-slate-400 shrink-0">· {submodules.length} submódulo{submodules.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>

                  {/* Acciones */}
                  {mounted && isSuperAdmin() && (
                    <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setAddingSubmoduleToModule({ id: module.module_id, slug: module.slug }) }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-100 transition"
                      >
                        <Plus size={12} />
                        Submódulo
                      </button>
                      <button
                        onClick={(e) => openMenu(e, module.module_id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                      >
                        <MoreHorizontal size={18} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Submódulos expandidos */}
                {expanded && (
                  <div className="border-t border-slate-100">
                    {submodules.length === 0 ? (
                      <div className="px-5 py-6 text-center">
                        <p className="text-sm text-slate-400">Sin submódulos — agrega el primero</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {submodules.map(sub => (
                          <div key={sub.submodule_id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                            <div className="w-7 h-7 rounded-md bg-violet-100 flex items-center justify-center shrink-0">
                              {sub.icon ? <DynamicIcon name={sub.icon} size={13} className="text-violet-600" /> : <Box size={13} className="text-violet-600" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-slate-700 truncate">{sub.name}</p>
                                <span className="text-xs font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{sub.slug}</span>
                                {sub.is_active
                                  ? <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                                  : <XCircle size={12} className="text-red-400 shrink-0" />
                                }
                              </div>
                              {sub.description && (
                                <p className="text-xs text-slate-400 truncate mt-0.5">{sub.description}</p>
                              )}
                            </div>
                            <span className="text-xs text-slate-400 shrink-0">Orden: {sub.order}</span>
                            {mounted && isSuperAdmin() && (
                              <button
                                onClick={(e) => openMenu(e, sub.submodule_id, true)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                              >
                                <MoreHorizontal size={18} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {filtered.length === 0 && !isLoading && (
            <div className="text-center py-20 text-slate-400 text-sm">
              {search ? `No se encontraron resultados para "${search}"` : 'No hay módulos registrados'}
            </div>
          )}
        </div>
      )}

      {/* Menu flotante módulo */}
      {openMenuId && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpenMenuId(null)} />
          <div className="fixed z-50 w-44 bg-white border-2 border-slate-300 rounded-xl shadow-2xl py-1.5 flex flex-col" style={{ top: menuPos.top, right: menuPos.right }}>
            <button
              onClick={() => { const m = modules.find(m => m.module_id === openMenuId); if (m) setEditingModule(m); setOpenMenuId(null) }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-300 transition-colors"
            >
              <Pencil size={14} className="text-slate-400" />
              Editar
            </button>
            <div className="h-px bg-slate-200 my-1" />
            <button
              onClick={() => { const m = modules.find(m => m.module_id === openMenuId); if (m) { setDeletingModule(m); setDeleteModuleError(null) }; setOpenMenuId(null) }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-200 transition-colors"
            >
              <Trash2 size={14} className="text-red-400" />
              Eliminar
            </button>
          </div>
        </>
      )}

      {/* Menu flotante submódulo */}
      {openSubMenuId && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpenSubMenuId(null)} />
          <div className="fixed z-50 w-44 bg-white border-2 border-slate-300 rounded-xl shadow-2xl py-1.5 flex flex-col" style={{ top: menuPos.top, right: menuPos.right }}>
            <button
              onClick={() => {
                for (const m of modules) {
                  const sub = m.submodules?.find(s => s.submodule_id === openSubMenuId)
                  if (sub) { setEditingSubmodule({ moduleId: m.module_id, moduleSlug: m.slug, submodule: sub }); break }
                }
                setOpenSubMenuId(null)
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-300 transition-colors"
            >
              <Pencil size={14} className="text-slate-400" />
              Editar
            </button>
            <div className="h-px bg-slate-200 my-1" />
            <button
              onClick={() => {
                for (const m of modules) {
                  const sub = m.submodules?.find(s => s.submodule_id === openSubMenuId)
                  if (sub) { setDeletingSubmodule({ moduleId: m.module_id, submodule: sub }); setDeleteSubmoduleError(null); break }
                }
                setOpenSubMenuId(null)
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-200 transition-colors"
            >
              <Trash2 size={14} className="text-red-400" />
              Eliminar
            </button>
          </div>
        </>
      )}

      {/* Modal crear/editar módulo */}
      {(showModuleForm || editingModule) && (
        <ModuleForm
          module={editingModule ?? undefined}
          companies={companies}
          onClose={() => { setShowModuleForm(false); setEditingModule(null) }}
          onSaved={() => { setShowModuleForm(false); setEditingModule(null); fetchData() }}
        />
      )}

      {/* Modal crear/editar submódulo */}
      {addingSubmoduleToModule && (
        <SubmoduleForm
          moduleId={addingSubmoduleToModule.id}
          moduleSlug={addingSubmoduleToModule.slug}
          onClose={() => setAddingSubmoduleToModule(null)}
          onSaved={() => { setAddingSubmoduleToModule(null); fetchData() }}
        />
      )}

      {editingSubmodule && (
        <SubmoduleForm
          moduleId={editingSubmodule.moduleId}
          moduleSlug={editingSubmodule.moduleSlug}
          submodule={editingSubmodule.submodule}
          onClose={() => setEditingSubmodule(null)}
          onSaved={() => { setEditingSubmodule(null); fetchData() }}
        />
      )}

      {/* Modal eliminar módulo */}
      {deletingModule && (
        <ConfirmDelete
          title="Eliminar módulo"
          description={`¿Estás seguro de que deseas eliminar el módulo "${deletingModule.name}"? Esta acción no se puede deshacer.`}
          onClose={() => { setDeletingModule(null); setDeleteModuleError(null) }}
          onConfirm={handleDeleteModule}
          isLoading={isDeletingModule}
          error={deleteModuleError}
          requireKey
        />
      )}

      {/* Modal eliminar submódulo */}
      {deletingSubmodule && (
        <ConfirmDelete
          title="Eliminar submódulo"
          description={`¿Estás seguro de que deseas eliminar el submódulo "${deletingSubmodule.submodule.name}"?`}
          onClose={() => { setDeletingSubmodule(null); setDeleteSubmoduleError(null) }}
          onConfirm={handleDeleteSubmodule}
          isLoading={isDeletingSubmodule}
          error={deleteSubmoduleError}
        />
      )}

    </PageWrapper>
  )
}
