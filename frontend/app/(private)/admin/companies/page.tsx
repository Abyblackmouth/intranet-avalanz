'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Search, Plus, MoreHorizontal, Pencil, Eye, Trash2, Layers, X, Check } from 'lucide-react'
import PageWrapper from '@/components/layout/PageWrapper'
import { useAuthStore } from '@/store/authStore'
import { GroupRow, CompanyRow } from '@/types/company.types'
import {
  getGroups, getCompanies, enableCompany, disableCompany, deleteCompany, updateCompany,
  getFamilies, createFamily, updateFamily,
} from '@/services/adminService'
import CompanyForm from '@/components/admin/companies/CompanyForm'
import CompanyEditForm from '@/components/admin/companies/CompanyEditForm'
import CompanyDetail from '@/components/admin/companies/CompanyDetail'

interface Family { id: string; name: string; clave: string; is_active: boolean; companies: number }
type Operando = 'todas' | 'si' | 'no'

const errMsg = (err: any, fb: string) => {
  const d = err?.response?.data
  return (typeof d?.detail === 'string' ? d.detail : d?.message) ?? fb
}
const inputCls = 'bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-800 outline-none hover:border-slate-400 focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#1a4fa0]/15 transition'

// ── Panel de familias ───────────────────────────────────────────────────────
function FamiliasPanel({ families, onClose, onChanged }: { families: Family[]; onClose: () => void; onChanged: () => void }) {
  const [nueva, setNueva] = useState('')
  const [nuevaClave, setNuevaClave] = useState('')
  const [clave, setClave] = useState('')
  const [editando, setEditando] = useState<string | null>(null)
  const [nombre, setNombre] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (fn: () => Promise<any>) => {
    setBusy(true); setError(null)
    try { await fn(); onChanged(); return true } catch (e) { setError(errMsg(e, 'No se pudo guardar')); return false } finally { setBusy(false) }
  }
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose} />
      <aside className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col" aria-label="Familias de empresas">
        <header className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-[family-name:var(--font-jakarta)] text-[17px] font-bold text-slate-900">Familias de empresas</h2>
            <p className="text-[13px] text-slate-500 mt-0.5">Agrupan las empresas por negocio (CORPORATIVO, CNCI, TODITO…). Se usan en toda la intranet.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </header>

        <div className="px-5 py-4 border-b border-slate-100 flex gap-2">
          <input className={`${inputCls} flex-1`} placeholder="Nueva familia (p. ej. VANTA MEDIA)" value={nueva}
            onChange={e => setNueva(e.target.value)} />
          <input className={`${inputCls} w-20 font-mono uppercase`} placeholder="Clave" maxLength={4} value={nuevaClave}
            aria-label="Clave de 4 letras" onChange={e => setNuevaClave(e.target.value.toUpperCase())} />
          <button type="button" disabled={!nueva.trim() || busy}
            onClick={async () => { if (await run(() => createFamily({ name: nueva.trim(), clave: nuevaClave.trim() || undefined }))) { setNueva(''); setNuevaClave('') } }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-[#1a4fa0] hover:bg-blue-700 disabled:opacity-40 transition">
            <Plus size={14} /> Agregar
          </button>
        </div>
        {error && <p className="mx-5 mt-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[13px] text-red-700">{error}</p>}

        <ul className="flex-1 overflow-y-auto px-3 py-3">
          {families.length === 0 && <li className="text-center text-[13px] text-slate-400 py-10">Todavía no hay familias.</li>}
          {families.map(f => (
            <li key={f.id} className={`flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-slate-50 ${f.is_active ? '' : 'opacity-60'}`}>
              <span className="w-12 shrink-0 text-center text-[11px] font-mono font-semibold text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">{f.clave}</span>
              {editando === f.id ? (
                <form className="flex-1 flex gap-1.5" onSubmit={async e => { e.preventDefault(); if (await run(() => updateFamily(f.id, { name: nombre, ...(clave !== f.clave ? { clave } : {}) }))) setEditando(null) }}>
                  <input autoFocus className={`${inputCls} flex-1 !py-1`} value={nombre} onChange={e => setNombre(e.target.value)} />
                  <input className={`${inputCls} w-16 !py-1 font-mono uppercase`} maxLength={4} aria-label="Clave" value={clave} onChange={e => setClave(e.target.value.toUpperCase())} />
                  <button type="submit" disabled={busy} aria-label="Guardar" className="w-8 rounded-lg text-emerald-700 hover:bg-emerald-50"><Check size={16} className="mx-auto" /></button>
                  <button type="button" onClick={() => setEditando(null)} aria-label="Cancelar" className="w-8 rounded-lg text-slate-400 hover:bg-slate-100"><X size={16} className="mx-auto" /></button>
                </form>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{f.name}</p>
                    <p className="text-[12px] text-slate-500">{f.companies} empresa{f.companies === 1 ? '' : 's'}</p>
                  </div>
                  <button type="button" onClick={() => { setEditando(f.id); setNombre(f.name); setClave(f.clave) }} aria-label={`Renombrar ${f.name}`}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil size={14} /></button>
                  <button type="button" role="switch" aria-checked={f.is_active} aria-label={`${f.is_active ? 'Desactivar' : 'Activar'} ${f.name}`} disabled={busy}
                    onClick={() => run(() => updateFamily(f.id, { is_active: !f.is_active }))}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${f.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                    <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${f.is_active ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
        <p className="px-5 pt-3 text-[12px] text-amber-700">La clave aparece en los folios de los tickets (INC-<b>CNCI</b>-000001). Elígela antes de salir a producción y después no la cambies.</p>
        <p className="px-5 py-3 border-t border-slate-100 text-[12px] text-slate-500">Una familia desactivada deja de ofrecerse al asignar empresas, pero las que ya la tienen la conservan.</p>
      </aside>
    </>
  )
}

// ── Página ──────────────────────────────────────────────────────────────────
export default function CompaniesPage() {
  const { isSuperAdmin } = useAuthStore()
  const [mounted, setMounted] = useState(false)
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [families, setFamilies] = useState<Family[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [savingFamilyId, setSavingFamilyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [fGrupo, setFGrupo] = useState('')
  const [fFamilia, setFFamilia] = useState('')      // '' todas · 'none' sin familia · id
  const [fOperando, setFOperando] = useState<Operando>('todas')
  const [showForm, setShowForm] = useState(false)
  const [showFamilias, setShowFamilias] = useState(false)
  const [editingCompany, setEditingCompany] = useState<CompanyRow | null>(null)
  const [detailCompany, setDetailCompany] = useState<CompanyRow | null>(null)
  const [deletingCompany, setDeletingCompany] = useState<CompanyRow | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const admin = mounted && isSuperAdmin()

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => () => { if (errorTimerRef.current) clearTimeout(errorTimerRef.current) }, [])

  const showError = (msg: string) => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    setError(msg)
    errorTimerRef.current = setTimeout(() => setError(null), 4000)
  }

  const fetchFamilies = useCallback(async () => {
    try { const r = await getFamilies(); setFamilies(r.data?.data ?? []) } catch { /* sin permiso o sin familias */ }
  }, [])

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [groupsRes, companiesRes] = await Promise.all([getGroups({ per_page: 100 }), getCompanies({ per_page: 100 })])
      setGroups(groupsRes.data?.data?.data ?? [])
      setCompanies(companiesRes.data?.data?.data ?? [])
    } catch {
      showError('No se pudo cargar la información')
    } finally {
      setIsLoading(false)
    }
    fetchFamilies()
  }, [fetchFamilies])

  useEffect(() => { if (mounted) fetchData() }, [mounted, fetchData])

  const grupoDe = useMemo(() => Object.fromEntries(groups.map(g => [g.group_id, g.name])), [groups])
  const familiaDe = useMemo(() => Object.fromEntries(families.map(f => [f.id, f])), [families])

  const handleToggle = async (company: CompanyRow) => {
    if (togglingId) return
    setTogglingId(company.company_id)
    const nuevo = !company.is_active
    setCompanies(prev => prev.map(c => c.company_id === company.company_id ? { ...c, is_active: nuevo } : c))
    try {
      if (company.is_active) await disableCompany(company.company_id)
      else await enableCompany(company.company_id)
    } catch (err) {
      setCompanies(prev => prev.map(c => c.company_id === company.company_id ? { ...c, is_active: company.is_active } : c))
      showError(errMsg(err, 'No se pudo cambiar el estado'))
    } finally {
      setTogglingId(null)
    }
  }

  const asignarFamilia = async (company: CompanyRow, familyId: string) => {
    setSavingFamilyId(company.company_id)
    const antes = company.family_id ?? null
    setCompanies(prev => prev.map(c => c.company_id === company.company_id ? { ...c, family_id: familyId || null } : c))
    try {
      await updateCompany(company.company_id, { family_id: familyId })
      fetchFamilies()   // para refrescar el conteo de cada familia
    } catch (err) {
      setCompanies(prev => prev.map(c => c.company_id === company.company_id ? { ...c, family_id: antes } : c))
      showError(errMsg(err, 'No se pudo asignar la familia'))
    } finally {
      setSavingFamilyId(null)
    }
  }

  const handleDelete = async () => {
    if (!deletingCompany) return
    setIsDeleting(true); setDeleteError(null)
    try {
      await deleteCompany(deletingCompany.company_id)
      setDeletingCompany(null)
      fetchData()
    } catch (err) {
      setDeleteError(errMsg(err, 'No se pudo eliminar la empresa'))
    } finally {
      setIsDeleting(false)
    }
  }

  const openMenu = (e: React.MouseEvent<HTMLButtonElement>, companyId: string) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    setOpenMenuId(companyId)
  }

  if (!mounted) return null

  const q = search.trim().toLowerCase()
  const filtradas = companies
    .filter(c => !q || c.nombre_comercial.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || (c.rfc ?? '').toLowerCase().includes(q))
    .filter(c => !fGrupo || c.group_id === fGrupo)
    .filter(c => !fFamilia || (fFamilia === 'none' ? !c.family_id : c.family_id === fFamilia))
    .filter(c => fOperando === 'todas' || (fOperando === 'si' ? c.is_active : !c.is_active))
    .sort((a, b) => (grupoDe[a.group_id] ?? '').localeCompare(grupoDe[b.group_id] ?? '') || a.nombre_comercial.localeCompare(b.nombre_comercial))
  const operando = companies.filter(c => c.is_active).length
  const sinFamilia = companies.filter(c => !c.family_id).length
  const menuCompany = companies.find(c => c.company_id === openMenuId)
  const familiasActivas = families.filter(f => f.is_active)

  const Resumen = ({ label, valor, tono = 'slate', onClick }: { label: string; valor: number; tono?: 'slate' | 'green' | 'amber'; onClick?: () => void }) => (
    <button type="button" onClick={onClick} disabled={!onClick}
      className={`text-left bg-white border rounded-xl px-4 py-2.5 transition ${onClick ? 'hover:border-slate-400 cursor-pointer' : 'cursor-default'} ${tono === 'amber' ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200'}`}>
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <span className={`block text-[20px] font-semibold leading-tight ${tono === 'green' ? 'text-emerald-700' : tono === 'amber' ? 'text-amber-700' : 'text-slate-900'}`}>{valor}</span>
    </button>
  )

  return (
    <PageWrapper
      title="Empresas"
      description="Catálogo de grupos, familias y empresas de toda la intranet"
      actions={admin ? (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowFamilias(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:border-[#1a4fa0] hover:text-[#1a4fa0] transition">
            <Layers size={15} /> Familias
          </button>
          <button type="button" onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-[#1a4fa0] rounded-lg hover:bg-blue-700 transition">
            <Plus size={15} /> Nueva empresa
          </button>
        </div>
      ) : null}
    >
      {/* Resumen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Resumen label="Grupos" valor={groups.length} />
        <Resumen label="Empresas" valor={companies.length} />
        <Resumen label="Operando" valor={operando} tono="green" onClick={() => setFOperando('si')} />
        <Resumen label="Sin familia" valor={sinFamilia} tono={sinFamilia ? 'amber' : 'slate'} onClick={sinFamilia ? () => setFFamilia('none') : undefined} />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o RFC" autoComplete="off" className={`${inputCls} w-full pl-8`} />
        </div>
        <select aria-label="Grupo" className={inputCls} value={fGrupo} onChange={e => setFGrupo(e.target.value)}>
          <option value="">Todos los grupos</option>
          {groups.map(g => <option key={g.group_id} value={g.group_id}>{g.name}</option>)}
        </select>
        <select aria-label="Familia" className={inputCls} value={fFamilia} onChange={e => setFFamilia(e.target.value)}>
          <option value="">Todas las familias</option>
          <option value="none">Sin familia</option>
          {families.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <div className="inline-flex rounded-lg border border-slate-300 bg-white overflow-hidden text-sm" role="group" aria-label="Operando">
          {([['todas', 'Todas'], ['si', 'Operando'], ['no', 'No operando']] as [Operando, string][]).map(([v, l], i) => (
            <button key={v} type="button" aria-pressed={fOperando === v} onClick={() => setFOperando(v)}
              className={`px-3 py-1.5 ${i ? 'border-l border-slate-200' : ''} ${fOperando === v ? 'bg-[#1a4fa0] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{l}</button>
          ))}
        </div>
        {(search || fGrupo || fFamilia || fOperando !== 'todas') && (
          <button type="button" onClick={() => { setSearch(''); setFGrupo(''); setFFamilia(''); setFOperando('todas') }} className="text-[13px] text-slate-500 hover:text-slate-800 underline">Limpiar filtros</button>
        )}
        <span className="ml-auto text-[12px] text-slate-400 font-mono">{filtradas.length} de {companies.length}</span>
      </div>
      {error && <div role="alert" className="mb-3 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-300 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5 w-28">Operando</th>
                <th className="px-4 py-2.5">Empresa</th>
                <th className="px-4 py-2.5 w-40">RFC</th>
                <th className="px-4 py-2.5 w-36">Grupo</th>
                <th className="px-4 py-2.5 w-52">Familia</th>
                <th className="px-2 py-2.5 w-12"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={6} className="py-16 text-center text-slate-400">Cargando…</td></tr>}
              {!isLoading && filtradas.length === 0 && <tr><td colSpan={6} className="py-16 text-center text-slate-400">No hay empresas con estos filtros.</td></tr>}
              {!isLoading && filtradas.map(c => {
                const fam = c.family_id ? familiaDe[c.family_id] : null
                return (
                  <tr key={c.company_id} className={`border-b border-slate-100 last:border-0 hover:bg-slate-50/70 ${c.is_active ? '' : 'text-slate-400'}`}>
                    <td className="px-4 py-2.5">
                      {admin ? (
                        <button type="button" role="switch" aria-checked={c.is_active} aria-label={`${c.is_active ? 'Marcar como no operando' : 'Marcar como operando'} ${c.nombre_comercial}`}
                          onClick={() => handleToggle(c)} disabled={togglingId === c.company_id}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:cursor-wait ${c.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${c.is_active ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
                        </button>
                      ) : (
                        <span className={`text-[12px] font-medium ${c.is_active ? 'text-emerald-700' : 'text-slate-400'}`}>{c.is_active ? 'Operando' : 'No operando'}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 min-w-0">
                      <p className={`font-semibold ${c.is_active ? 'text-slate-900' : 'text-slate-500'}`}>{c.nombre_comercial}</p>
                      <p className="text-[12px] text-slate-500 truncate max-w-[420px]" title={c.name}>{c.name}</p>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[12.5px]">{c.rfc ?? <span className="italic text-slate-300">Sin RFC</span>}</td>
                    <td className="px-4 py-2.5 text-[13px]">{grupoDe[c.group_id] ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      {admin ? (
                        <select aria-label={`Familia de ${c.nombre_comercial}`} value={c.family_id ?? ''} disabled={savingFamilyId === c.company_id}
                          onChange={e => asignarFamilia(c, e.target.value)}
                          className={`${inputCls} w-full !py-1 !text-[13px] ${c.family_id ? '' : '!border-amber-300 !bg-amber-50/60'}`}>
                          <option value="">Sin familia</option>
                          {familiasActivas.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                          {fam && !fam.is_active && <option value={fam.id}>{fam.name} (inactiva)</option>}
                        </select>
                      ) : (
                        <span className="text-[13px]">{fam?.name ?? '—'}</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      {admin && (
                        <button type="button" onClick={e => openMenu(e, c.company_id)} aria-label={`Acciones de ${c.nombre_comercial}`}
                          className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                          <MoreHorizontal size={18} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Menú de acciones */}
      {openMenuId && menuCompany && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpenMenuId(null)} />
          <div role="menu" className="fixed z-50 w-44 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5" style={{ top: menuPos.top, right: menuPos.right }}>
            <button role="menuitem" type="button" onClick={() => { setDetailCompany(menuCompany); setOpenMenuId(null) }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"><Eye size={14} className="text-slate-400" /> Ver detalle</button>
            <button role="menuitem" type="button" onClick={() => { setEditingCompany(menuCompany); setOpenMenuId(null) }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"><Pencil size={14} className="text-slate-400" /> Editar</button>
            <div className="h-px bg-slate-200 my-1" />
            <button role="menuitem" type="button" onClick={() => { setDeletingCompany(menuCompany); setDeleteError(null); setOpenMenuId(null) }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50"><Trash2 size={14} className="text-red-400" /> Eliminar</button>
          </div>
        </>
      )}

      {showFamilias && <FamiliasPanel families={families} onClose={() => setShowFamilias(false)} onChanged={fetchFamilies} />}

      {showForm && <CompanyForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); fetchData() }} />}

      {deletingCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div role="alertdialog" aria-labelledby="eliminar-titulo" className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-50 rounded-lg"><Trash2 size={18} className="text-red-500" /></div>
              <h2 id="eliminar-titulo" className="font-semibold text-slate-800">Eliminar empresa</h2>
            </div>
            <p className="text-sm text-slate-600 mb-2">¿Eliminar <span className="font-semibold">{deletingCompany.nombre_comercial}</span>?</p>
            <p className="text-xs text-slate-500 mb-4">La empresa debe estar como no operando y sin usuarios asociados. Esta acción no se puede deshacer.</p>
            {deleteError && <div className="mb-4 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{deleteError}</div>}
            <div className="flex items-center justify-end gap-3">
              <button type="button" onClick={() => { setDeletingCompany(null); setDeleteError(null) }} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">Cancelar</button>
              <button type="button" onClick={handleDelete} disabled={isDeleting}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50">
                {isDeleting && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {isDeleting ? 'Eliminando…' : 'Eliminar empresa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detailCompany && <CompanyDetail company={detailCompany} onClose={() => setDetailCompany(null)} />}

      {editingCompany && (
        <CompanyEditForm company={editingCompany} onClose={() => setEditingCompany(null)} onSaved={() => { setEditingCompany(null); fetchData() }} />
      )}
    </PageWrapper>
  )
}
