'use client'

// Workflows → Flujos. Lista (TablaPantalla) y, al abrir uno, el detalle con sus pestañas:
// Grupos de aprobación · Simular · Datos generales · Versiones. Sin título: la ruta vive en el navbar.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Plus, Search, Lock, Users, Play, SlidersHorizontal, History, FileText } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import TablaPantalla, { Columna } from '@/components/ui/TablaPantalla'
import { Flujo, FlujoDetalle, getFlujos, getFlujo, updateFlujo } from '@/services/workflowsService'
import { Interruptor, btnPrimario, btnSecundario, inputCls, errMsg } from '@/components/app/workflows/compartidos'
import GruposConfig from '@/components/app/workflows/flujos/GruposConfig'
import HojaConfig from '@/components/app/workflows/flujos/HojaConfig'
import { Simulador, DatosGenerales, Versiones, FormNuevoFlujo } from '@/components/app/workflows/flujos/FlujoPestanas'

type Tab = 'grupos' | 'hoja' | 'simular' | 'datos' | 'versiones'
const TABS: { key: Tab; label: string; icon: typeof Users }[] = [
  { key: 'grupos', label: 'Grupos de aprobación', icon: Users },
  { key: 'hoja', label: 'Hoja', icon: FileText },
  { key: 'simular', label: 'Simular', icon: Play },
  { key: 'datos', label: 'Datos generales', icon: SlidersHorizontal },
  { key: 'versiones', label: 'Versiones', icon: History },
]
const ROLES_LECTURA = ['workflows:administrador', 'workflows:disenador', 'workflows:auditoria']
const ROLES_EDICION = ['workflows:administrador', 'workflows:disenador']

export default function FlujosPage() {
  const { user, isSuperAdmin } = useAuthStore()
  const [mounted, setMounted] = useState(false)
  const [lista, setLista] = useState<Flujo[]>([])
  const [cargando, setCargando] = useState(true)
  const [q, setQ] = useState('')
  const [nuevo, setNuevo] = useState(false)
  const [flujo, setFlujo] = useState<FlujoDetalle | null>(null)
  const [tab, setTab] = useState<Tab>('grupos')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setMounted(true) }, [])

  const roles = user?.roles ?? []
  const puedeVer = isSuperAdmin() || roles.some(r => ROLES_LECTURA.includes(r))
  const puedeEditar = isSuperAdmin() || roles.some(r => ROLES_EDICION.includes(r))

  const cargarLista = useCallback(async () => {
    setCargando(true)
    try { const r = await getFlujos(); setLista(r.data ?? []) } catch (e) { setError(errMsg(e, 'No se pudieron cargar los flujos')) } finally { setCargando(false) }
  }, [])
  useEffect(() => { if (mounted && puedeVer) cargarLista() }, [mounted, puedeVer, cargarLista])

  const abrir = async (id: string) => {
    try { const r = await getFlujo(id); setFlujo(r.data); setTab('grupos') } catch (e) { setError(errMsg(e, 'No se pudo abrir el flujo')) }
  }
  const cerrar = () => { setFlujo(null); cargarLista() }
  const alternarActivo = async (f: Flujo) => {
    try { await updateFlujo(f.id, { activo: !f.activo }); cargarLista(); if (flujo?.id === f.id) abrir(f.id) } catch (e) { setError(errMsg(e, 'No se pudo cambiar')) }
  }

  const filtradas = useMemo(() => {
    const n = q.trim().toLowerCase()
    return n ? lista.filter(f => [f.nombre, f.process_id, f.conexion_titulo, f.result_service].some(x => (x ?? '').toLowerCase().includes(n))) : lista
  }, [lista, q])

  const columnas: Columna<Flujo>[] = [
    { id: 'nombre', titulo: 'Flujo', orden: f => f.nombre, celda: f => <button type="button" onClick={() => abrir(f.id)} className="font-semibold text-[#1a4fa0] hover:underline text-left">{f.nombre}</button> },
    { id: 'process', titulo: 'processId', orden: f => f.process_id, celda: f => <span className="font-mono text-[12.5px]">{f.process_id}</span> },
    { id: 'plat', titulo: 'Plataforma', orden: f => f.conexion_titulo ?? '', celda: f => f.conexion_titulo ?? '—' },
    { id: 'rs', titulo: 'resultService', orden: f => f.result_service, celda: f => <span className="font-mono text-[12.5px]">{f.result_service || <span className="text-amber-700">sin capturar</span>}</span> },
    { id: 'grupos', titulo: 'Grupos', orden: f => f.grupos, clase: 'text-right', celda: f => f.grupos },
    { id: 'activos', titulo: 'En aprobación', orden: f => f.instancias_activas, clase: 'text-right', celda: f => f.instancias_activas },
    { id: 'version', titulo: 'Versión', orden: f => f.version, clase: 'text-right', celda: f => `v${f.version}` },
    { id: 'estado', titulo: 'Estado', orden: f => Number(f.activo), celda: f => (
      <span className="inline-flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${f.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{f.activo ? 'Activo' : 'Inactivo'}</span>
        {puedeEditar && <Interruptor on={f.activo} onChange={() => alternarActivo(f)} label={`Activar ${f.nombre}`} />}
      </span>) },
  ]

  if (!mounted) return null
  if (!puedeVer) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center bg-white border border-slate-300 rounded-2xl p-8">
        <Lock className="w-8 h-8 mx-auto text-slate-400" />
        <p className="mt-3 font-semibold text-slate-800">Flujos es para quien administra o diseña los workflows</p>
        <p className="mt-1 text-sm text-slate-500">Si te toca aprobar, tu lugar es la Bandeja. Si necesitas definir flujos, pide el rol de administrador o diseñador del módulo.</p>
      </div>
    )
  }

  if (flujo) {
    return (
      <div className="px-6 pt-3 pb-6 max-[1440px]:px-4 max-md:px-3 max-md:pb-4">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <button type="button" className={btnSecundario} onClick={cerrar}><ArrowLeft size={14} /> Flujos</button>
          <h2 className="text-[16px] font-bold text-slate-900">{flujo.nombre}</h2>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[12px]">{flujo.process_id}</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[12px]">{flujo.conexion_titulo}</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[12px]">→ {flujo.result_service || 'resultService?'}</span>
          <span className="text-[12px] text-slate-400">v{flujo.version}</span>
          <label className="ml-auto flex items-center gap-2 text-[13px] text-slate-600">
            <Interruptor on={flujo.activo} onChange={() => alternarActivo(flujo)} label="Flujo activo" disabled={!puedeEditar} /> {flujo.activo ? 'Activo' : 'Inactivo'}
          </label>
        </div>
        <div className="flex items-center gap-1 border-b-2 border-slate-300 mb-4 overflow-x-auto [scrollbar-width:none]">
          {TABS.map(t => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className={`flex shrink-0 items-center gap-2 whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 -mb-0.5 transition-colors max-md:px-3 ${tab === t.key ? 'border-[#1a4fa0] text-[#1a4fa0]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </div>
        {error && <p className="mb-3 text-[13px] text-red-600">{error}</p>}
        {tab === 'grupos' && <GruposConfig flujo={flujo} onChange={setFlujo} puedeEditar={puedeEditar} />}
        {tab === 'hoja' && <HojaConfig flujo={flujo} onChange={setFlujo} puedeEditar={puedeEditar} />}
        {tab === 'simular' && <Simulador flujo={flujo} />}
        {tab === 'datos' && <DatosGenerales flujo={flujo} onChange={setFlujo} puedeEditar={puedeEditar} onEliminado={cerrar} />}
        {tab === 'versiones' && <Versiones flujo={flujo} />}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col px-6 pt-3 pb-4 max-[1440px]:px-4 max-md:px-3">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative w-full max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={`${inputCls} w-full pl-8`} placeholder="Buscar flujo, processId, plataforma…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <span className="text-[13px] text-slate-500">{filtradas.length} flujo{filtradas.length === 1 ? '' : 's'}</span>
        {puedeEditar && <button type="button" className={`${btnPrimario} ml-auto`} onClick={() => setNuevo(true)}><Plus size={14} /> Nuevo flujo</button>}
      </div>
      {error && <p className="mb-3 text-[13px] text-red-600">{error}</p>}
      <TablaPantalla<Flujo> filas={filtradas} columnas={columnas} clave={f => f.id} cargando={cargando} unidad="flujos" reinicio={q}
        vacio={<div className="py-10 text-center text-[13px] text-slate-500">Todavía no hay flujos. Crea el primero con «Nuevo flujo»: necesitas una conexión en Ajustes.</div>} />
      {nuevo && <FormNuevoFlujo onClose={() => setNuevo(false)} onCreado={id => { setNuevo(false); abrir(id) }} />}
    </div>
  )
}
