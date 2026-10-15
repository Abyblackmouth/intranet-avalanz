'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Plus, Search, Upload, X } from 'lucide-react'
import UserTable, { type OrdenUsuarios } from '@/components/admin/users/UserTable'
import UserForm from '@/components/admin/users/UserForm'
import FiltroUsuarios, { cumpleFiltro, estadoDe, etiquetaRol, type FiltroUsuario } from '@/components/admin/users/FiltroUsuarios'
import { useAuthStore } from '@/store/authStore'
import { UserRow } from '@/types/user.types'
import api from '@/services/api'

// Usuarios: se cargan todos de una vez (son pocos) y la busqueda, el filtro dinamico,
// el orden y la paginacion se resuelven en la pantalla, al instante.
// La ruta (Inicio / Administracion / Usuarios) vive en el navbar: sin titulo ni subtitulo.

const normal = (s?: string | null) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export default function UsersPage() {
  const { isSuperAdmin } = useAuthStore()
  const [mounted, setMounted] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [todos, setTodos] = useState<UserRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [buscar, setBuscar] = useState('')
  const [filtros, setFiltros] = useState<FiltroUsuario[]>([])
  const [orden, setOrden] = useState<OrdenUsuarios | null>(null)
  const [page, setPage] = useState(1)
  const [modoPagina, setModoPagina] = useState(0)          // 0 = ajustar a pantalla
  const [capacidad, setCapacidad] = useState(20)
  const perPage = modoPagina || capacidad
  const [exportando, setExportando] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setIsLoading(true)
    try {
      let lista: UserRow[] = [], pagina = 1, total = Infinity
      while ((pagina - 1) * 100 < total && pagina <= 50) {
        const res = await api.get('/api/v1/users/', { params: { page: pagina, per_page: 100 } })
        lista = [...lista, ...(res.data.data.data || [])]
        total = res.data.data.meta?.total ?? lista.length
        pagina++
      }
      setTodos(lista)
    } catch { setTodos([]) } finally { setIsLoading(false) }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  // Busqueda + filtro dinamico + orden
  const filtrados = useMemo(() => {
    const q = normal(buscar.trim())
    let lista = todos.filter(u => cumpleFiltro(u, filtros) && (!q ||
      [u.full_name, u.email, u.matricula, u.puesto, u.departamento, (u as any).phone].some(v => normal(v).includes(q))))
    if (orden) {
      const valor = (u: UserRow): string | number => {
        switch (orden.col) {
          case 'nombre': return normal(u.full_name)
          case 'email': return normal(u.email)
          case 'matricula': return normal(u.matricula)
          case 'puesto': return normal(u.puesto)
          case 'departamento': return normal(u.departamento)
          case 'empresa': return normal(u.company_name)
          case 'rol': return normal((u.roles || []).map(etiquetaRol).join(','))
          case 'twofa': return u.is_2fa_configured ? 1 : 0
          case 'estado': return estadoDe(u)
          case 'conexion': return u.last_login_at ? new Date(u.last_login_at).getTime() : 0
        }
      }
      const s = orden.dir === 'asc' ? 1 : -1
      lista = [...lista].sort((a, b) => { const x = valor(a), y = valor(b); return x < y ? -s : x > y ? s : 0 })
    }
    return lista
  }, [todos, buscar, filtros, orden])

  useEffect(() => { setPage(1) }, [buscar, filtros, orden, modoPagina])
  // Si al cambiar el tamano de la pantalla la pagina actual ya no existe, regresa a la ultima
  useEffect(() => { const ult = Math.max(1, Math.ceil(filtrados.length / perPage)); if (page > ult) setPage(ult) }, [perPage, filtrados.length, page])
  const pagina = filtrados.slice((page - 1) * perPage, page * perPage)

  // Excel de lo que esta filtrado
  const exportar = async () => {
    setExportando(true)
    try {
      const XLSX = await import('xlsx')
      const filas = filtrados.filter(u => !u.is_protected).map(u => ({
        'Matrícula': u.matricula || '', 'Nombre': u.full_name, 'Correo': u.email, 'Teléfono': (u as any).phone || '',
        'Puesto': u.puesto || '', 'Departamento': u.departamento || '', 'Empresa': u.company_name || '',
        'Roles': (u.roles || []).map(etiquetaRol).join(' | '), 'Estado': estadoDe(u),
        '2FA': u.is_2fa_configured ? 'Configurado' : 'Sin configurar',
        'Último acceso': u.last_login_at ? new Date(u.last_login_at).toLocaleString('es-MX', { timeZone: 'America/Monterrey', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : 'Nunca',
        'Fecha de alta': new Date(u.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      }))
      const hoja = XLSX.utils.json_to_sheet(filas)
      hoja['!cols'] = Object.keys(filas[0] ?? { Nombre: '' }).map(k => ({ wch: Math.min(40, Math.max(k.length + 2, ...filas.map(f => String((f as any)[k] ?? '').length + 1))) }))
      hoja['!autofilter'] = { ref: hoja['!ref'] ?? 'A1' }
      const libro = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(libro, hoja, 'Usuarios')
      XLSX.writeFile(libro, `usuarios_${new Date().toISOString().slice(0, 10)}.xlsx`)
    } finally { setExportando(false) }
  }

  const admin = mounted && isSuperAdmin()
  return (
    <div className="flex min-h-0 flex-1 flex-col px-6 pt-3 pb-4 max-[1440px]:px-4 max-[1440px]:pb-3">
      {/* Barra: buscador, filtro dinamico, contador y acciones, en un renglon */}
      <div className="mb-2.5 flex shrink-0 flex-wrap items-center gap-2">
        <label className="flex h-9.5 w-64 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 focus-within:border-[#1a4fa0] focus-within:ring-2 focus-within:ring-[#1a4fa0]/20 max-[1440px]:w-52">
          <Search size={13} className="shrink-0 text-slate-400" />
          <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Nombre, correo, matrícula…" aria-label="Buscar usuario"
            autoComplete="off" className="min-w-0 flex-1 bg-transparent text-[13px] text-slate-800 outline-none placeholder:text-slate-400" />
          {buscar && <button type="button" onClick={() => setBuscar('')} aria-label="Limpiar búsqueda" className="text-slate-400 hover:text-slate-600"><X size={13} /></button>}
        </label>
        <FiltroUsuarios usuarios={todos} valor={filtros} onChange={setFiltros} />
        <span className="shrink-0 text-xs tabular-nums text-slate-500">
          {filtrados.length === todos.length ? `${todos.length} usuarios` : `${filtrados.length} de ${todos.length}`}
        </span>
        {admin && (
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <button type="button" onClick={exportar} disabled={exportando || !filtrados.length}
              title={`Descargar a Excel los ${filtrados.length} usuarios filtrados`}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white text-slate-700 hover:border-[#1a4fa0] hover:text-[#1a4fa0] disabled:opacity-50 whitespace-nowrap">
              {exportando ? <span className="size-3.5 animate-spin rounded-full border-2 border-[#1a4fa0] border-t-transparent" /> : <Download size={15} />} Descargar
            </button>
            <Link href="/admin/users/alta-masiva"
              className="inline-flex h-9.5 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">
              <Upload size={14} /> Alta masiva
            </Link>
            <button type="button" onClick={() => setShowForm(true)}
              className="inline-flex h-9.5 items-center gap-1.5 rounded-xl bg-[#1a4fa0] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#173f82]">
              <Plus size={15} /> Nuevo usuario
            </button>
          </div>
        )}
      </div>

      <UserTable users={pagina} isLoading={isLoading} onRefresh={() => cargar(true)}
        page={page} perPage={perPage} total={filtrados.length} onPageChange={setPage} onPerPageChange={setModoPagina}
        orden={orden} onOrden={setOrden} onCapacidad={setCapacidad} modoPagina={modoPagina} />

      {showForm && <UserForm onClose={() => setShowForm(false)} onSuccess={() => { cargar(true); setShowForm(false) }} />}
    </div>
  )
}
