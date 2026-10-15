'use client'
import React from 'react'

import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import {
  MoreHorizontal, Eye, Pencil, Lock, Unlock, KeyRound, FileDown,
  LogOut, Trash2, ShieldCheck, ShieldOff, ChevronLeft, ChevronRight, X, FileText,
} from 'lucide-react'
import { toggleLockUser, revokeAllSessions, deleteUser, resetUserPassword } from '@/services/adminService'
import { useAuthStore } from '@/store/authStore'
import { UserRow } from '@/types/user.types'
import UserDetail from '@/components/admin/users/UserDetail'
import UserEditForm from '@/components/admin/users/UserEditForm'
import UserAuditReport from '@/components/admin/users/UserAuditReport'

const StatusBadge = ({ user }: { user: UserRow }) => {
  if (user.is_locked) return (
    <span className="inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[11px] font-medium bg-red-50 text-red-600 border border-red-200">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />Bloqueado
    </span>
  )
  if (!user.is_active) return (
    <span className="inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[11px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />Inactivo
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[11px] font-medium bg-green-50 text-green-600 border border-green-200">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />Activo
    </span>
  )
}

const RoleBadge = ({ roles }: { roles: string[] }) => {
  const roleColors: Record<string, string> = {
    super_admin: 'bg-red-100 text-red-700 border-red-200',
    admin_empresa: 'bg-amber-100 text-amber-700 border-amber-200',
    default: 'bg-blue-100 text-blue-700 border-blue-200',
  }
  if (!roles || roles.length === 0) return <span className="text-xs text-slate-400">Sin rol</span>
  return (
    <div className="flex flex-wrap gap-1">
      {roles.slice(0, 2).map((role) => (
        <span key={role} className={`inline-flex px-1.5 py-px rounded text-[10.5px] font-semibold border whitespace-nowrap ${roleColors[role] || roleColors.default}`}>
          {role.replace(/_/g, ' ').toUpperCase()}
        </span>
      ))}
      {roles.length > 2 && <span className="text-xs text-slate-400">+{roles.length - 2}</span>}
    </div>
  )
}

const TwoFABadge = ({ configured }: { configured: boolean }) =>
  configured ? (
    <span className="inline-flex items-center gap-1 text-[11.5px] text-green-600 font-medium"><ShieldCheck size={12} /> Activo</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11.5px] text-slate-400"><ShieldOff size={12} /> Inactivo</span>
  )

const formatRelative = (dateStr: string | null) => {
  if (!dateStr) return 'Nunca'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Ahora'
  if (mins < 60) return `Hace ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `Hace ${hrs} hr`
  const days = Math.floor(hrs / 24)
  return `Hace ${days} dia${days > 1 ? 's' : ''}`
}

const avatarColors = [
  'bg-[#1a4fa0]',
  'bg-violet-500',
  'bg-teal-500',
  'bg-orange-400',
  'bg-rose-500',
  'bg-emerald-500',
]

const Avatar = ({ name }: { name: string }) => {
  const initials = name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()
  const colorIndex = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % avatarColors.length
  const color = avatarColors[colorIndex]
  return (
    <div className={`size-6 rounded-md ${color} flex items-center justify-center shrink-0`}>
      <span className="text-white text-[9.5px] font-bold">{initials}</span>
    </div>
  )
}

const LockModal = ({ user, onConfirm, onClose, isLoading }: { user: UserRow; onConfirm: (r: string) => void; onClose: () => void; isLoading: boolean }) => {
  const [reason, setReason] = useState('')
  const action = user.is_locked ? 'desbloquear' : 'bloquear'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-slate-900 capitalize">{action} usuario</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Vas a <strong>{action}</strong> la cuenta de <strong>{user.full_name}</strong>.
          {user.is_locked && user.lock_reason && <span className="block mt-1 text-xs text-slate-400">Motivo anterior: {user.lock_reason}</span>}
        </p>
        <div className="mb-5">
          <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Motivo <span className="text-red-500">*</span></label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder={`Escribe el motivo para ${action} esta cuenta...`} rows={3} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4fa0] resize-none" />
        </div>
        <div className="flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-100">Cancelar</button>
          <button onClick={() => onConfirm(reason)} disabled={!reason.trim() || isLoading} className={`px-5 py-2 text-sm font-medium rounded-lg disabled:opacity-50 flex items-center gap-2 ${user.is_locked ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-red-600 text-white hover:bg-red-700'}`}>
            {isLoading && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {action.charAt(0).toUpperCase() + action.slice(1)}
          </button>
        </div>
      </div>
    </div>
  )
}

const ConfirmModal = ({ title, message, confirmLabel, onConfirm, onClose, isLoading, danger = true }: { title: string; message: string; confirmLabel: string; onConfirm: () => void; onClose: () => void; isLoading: boolean; danger?: boolean }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center">
    <div className="absolute inset-0 bg-black/40" />
    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
      </div>
      <p className="text-sm text-slate-600 mb-6">{message}</p>
      <div className="flex items-center justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-100">Cancelar</button>
        <button onClick={onConfirm} disabled={isLoading} className={`px-5 py-2 text-sm font-medium rounded-lg disabled:opacity-50 flex items-center gap-2 ${danger ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-[#1a4fa0] text-white hover:bg-blue-700'}`}>
          {isLoading && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
)

const ResetPasswordModal = ({
  user,
  onConfirm,
  onClose,
  isLoading,
}: {
  user: UserRow
  onConfirm: (password: string) => void
  onClose: () => void
  isLoading: boolean
}) => {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const rules = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  }
  const allValid = Object.values(rules).every(Boolean)
  const matches = password === confirm && confirm.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-slate-900">Resetear contrasena</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Define una nueva contrasena para <strong>{user.full_name}</strong>. El usuario debera cambiarla en su proximo inicio de sesion.
        </p>
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
              Nueva contrasena <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Minimo 8 caracteres"
              autoComplete="new-password"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4fa0]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
              Confirmar contrasena <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Repite la contrasena"
              autoComplete="new-password"
              className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4fa0] ${
                confirm.length > 0
                  ? matches ? 'border-green-400' : 'border-red-400'
                  : 'border-slate-300'
              }`}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5 mb-5">
          {[
            { key: 'length', label: 'Minimo 8 caracteres' },
            { key: 'upper', label: 'Una mayuscula' },
            { key: 'lower', label: 'Una minuscula' },
            { key: 'number', label: 'Un numero' },
            { key: 'special', label: 'Un caracter especial' },
          ].map(({ key, label }) => (
            <span key={key} className={`text-xs flex items-center gap-1 ${rules[key as keyof typeof rules] ? 'text-green-600' : 'text-slate-400'}`}>
              <span>{rules[key as keyof typeof rules] ? '✓' : '○'}</span> {label}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100">
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(password)}
            disabled={!allValid || !matches || isLoading}
            className="px-5 py-2 text-sm font-medium rounded-lg bg-[#1a4fa0] text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {isLoading && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            Resetear contrasena
          </button>
        </div>
      </div>
    </div>
  )
}

const ActionMenu = ({
  user,
  onRefresh,
  onViewDetail,
  onEdit,
  onResetPassword,
  onViewDocuments,
}: {
  user: UserRow
  onRefresh: () => void
  onViewDetail: () => void
  onEdit: () => void
  onResetPassword: () => void
  onViewDocuments: () => void
}) => {
  const { user: adminUser } = useAuthStore()
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })
  const [showLockModal, setShowLockModal] = useState(false)
  const [showRevokeModal, setShowRevokeModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [loadingLock, setLoadingLock] = useState(false)
  const [loadingRevoke, setLoadingRevoke] = useState(false)
  const [loadingDelete, setLoadingDelete] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)

  const openMenu = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      const menuHeight = 280
      const spaceBelow = window.innerHeight - rect.bottom
      const top = spaceBelow < menuHeight
        ? rect.top + window.scrollY - menuHeight - 4
        : rect.bottom + window.scrollY + 4
      setMenuPos({ top, right: window.innerWidth - rect.right })
    }
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const handleScroll = () => setOpen(false)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [open])

  const handleLock = async (reason: string) => {
    setLoadingLock(true)
    try { await toggleLockUser(user.user_id, !user.is_locked, reason); setShowLockModal(false); onRefresh() }
    catch (e) { console.error('Lock error', e) } finally { setLoadingLock(false) }
  }

  const handleRevoke = async () => {
    setLoadingRevoke(true)
    try { await revokeAllSessions(user.user_id, adminUser?.full_name || 'Administrador', adminUser?.email || ''); setShowRevokeModal(false); onRefresh() }
    catch (e) { console.error('Revoke error', e) } finally { setLoadingRevoke(false) }
  }

  const handleDelete = async () => {
    setLoadingDelete(true)
    try { await deleteUser(user.user_id); setShowDeleteModal(false); onRefresh() }
    catch (e) { console.error('Delete error', e) } finally { setLoadingDelete(false) }
  }

  const anyLoading = loadingLock || loadingRevoke || loadingDelete

  return (
    <>
      <button ref={btnRef} onClick={openMenu} disabled={anyLoading} className="w-8 h-6 rounded-md flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
        {anyLoading ? <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" /> : <MoreHorizontal size={20} />}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed z-50 w-52 bg-white border-2 border-slate-300 rounded-xl shadow-2xl py-1.5" style={{ top: menuPos.top, right: menuPos.right }}>
            <MenuItem icon={<Eye size={14} />} label="Ver detalle" onClick={() => { setOpen(false); onViewDetail() }} />
            <MenuItem icon={<FileText size={14} />} label="Documentos" onClick={() => { setOpen(false); onViewDocuments() }} />
            <UserAuditReport user={user} />
            {!user.is_protected && <MenuItem icon={<Pencil size={14} />} label="Editar" onClick={() => { setOpen(false); onEdit() }} />}
            <MenuItem icon={<KeyRound size={14} />} label="Resetear contrasena" onClick={() => { setOpen(false); onResetPassword() }} />
            <div className="h-px bg-slate-100 my-1" />
            {!user.is_protected && (
              <MenuItem icon={user.is_locked ? <Unlock size={14} /> : <Lock size={14} />} label={user.is_locked ? 'Desbloquear cuenta' : 'Bloquear cuenta'} onClick={() => { setOpen(false); setShowLockModal(true) }} danger={!user.is_locked} />
            )}
            <MenuItem icon={<LogOut size={14} />} label="Revocar sesiones" onClick={() => { setOpen(false); setShowRevokeModal(true) }} danger />
            {!user.is_protected && (
              <>
                <div className="h-px bg-slate-100 my-1" />
                <MenuItem icon={<Trash2 size={14} />} label="Eliminar usuario" onClick={() => { setOpen(false); setShowDeleteModal(true) }} danger />
              </>
            )}
          </div>
        </>
      )}

      {showLockModal && <LockModal user={user} onConfirm={handleLock} onClose={() => setShowLockModal(false)} isLoading={loadingLock} />}
      {showRevokeModal && <ConfirmModal title="Revocar sesiones" message={`Se cerrarán todas las sesiones activas de ${user.full_name}.`} confirmLabel="Revocar" onConfirm={handleRevoke} onClose={() => setShowRevokeModal(false)} isLoading={loadingRevoke} />}
      {showDeleteModal && <ConfirmModal title="Eliminar usuario" message={`Esta acción eliminará permanentemente la cuenta de ${user.full_name}. No se puede deshacer.`} confirmLabel="Eliminar" onConfirm={handleDelete} onClose={() => setShowDeleteModal(false)} isLoading={loadingDelete} />}
    </>
  )
}

const MenuItem = ({ icon, label, onClick, danger = false }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition ${danger ? 'text-red-600 hover:bg-red-200' : 'text-slate-700 hover:bg-slate-300'}`}>
    <span className="shrink-0">{icon}</span>{label}
  </button>
)

export type ColUsuario = 'nombre' | 'email' | 'matricula' | 'puesto' | 'departamento' | 'empresa' | 'rol' | 'twofa' | 'estado' | 'conexion'
export interface OrdenUsuarios { col: ColUsuario; dir: 'asc' | 'desc' }

interface UserTableProps {
  users: UserRow[]
  isLoading: boolean
  onRefresh: () => void
  page: number
  perPage: number
  total: number
  onPageChange: (page: number) => void
  onPerPageChange: (n: number) => void
  orden: OrdenUsuarios | null
  onOrden: (o: OrdenUsuarios | null) => void
  /** Avisa cuantas filas caben en el espacio visible (para "Ajustar a pantalla"). */
  onCapacidad?: (filas: number) => void
  /** 0 = ajustar a pantalla */
  modoPagina: number
}

const COLUMNAS: { col: ColUsuario | null; titulo: string; clase?: string }[] = [
  { col: 'nombre', titulo: 'Usuario' },
  { col: 'email', titulo: 'Correo' },
  { col: 'matricula', titulo: 'Matrícula' },
  { col: 'puesto', titulo: 'Puesto' },
  { col: 'departamento', titulo: 'Departamento' },
  { col: 'empresa', titulo: 'Empresa' },
  { col: 'rol', titulo: 'Rol' },
  { col: 'twofa', titulo: '2FA' },
  { col: null, titulo: '', clase: 'w-8' },
  { col: 'estado', titulo: 'Estado' },
  { col: 'conexion', titulo: 'Última conexión' },
  { col: null, titulo: '', clase: 'w-10' },
]
const TD = 'px-2 py-1 text-xs text-slate-700 whitespace-nowrap'

export default function UserTable({ users, isLoading, onRefresh, page, perPage, total, onPageChange, onPerPageChange, orden, onOrden, onCapacidad, modoPagina }: UserTableProps) {
  const zona = useRef<HTMLDivElement>(null)
  const pie = useRef<HTMLDivElement>(null)
  const [alto, setAlto] = useState<number | null>(null)
  // La tabla ocupa desde donde empieza hasta el fondo de la ventana (menos la paginacion), y con ese
  // alto se calcula cuantas filas caben. Se mide contra la ventana, no contra la tabla, para que el
  // alto no dependa de las filas que se muestran.
  useLayoutEffect(() => {
    const el = zona.current
    if (!el) return
    const medir = () => {
      const libre = window.innerHeight - el.getBoundingClientRect().top - (pie.current?.offsetHeight ?? 38) - 18
      const disponible = Math.max(220, Math.floor(libre))
      setAlto(disponible)
      if (onCapacidad) {
        const cab = el.querySelector('thead')?.getBoundingClientRect().height ?? 30
        const fila = el.querySelector('tbody tr[data-fila]')?.getBoundingClientRect().height ?? 33
        const barra = el.scrollWidth > el.clientWidth ? 14 : 0
        onCapacidad(Math.max(5, Math.floor((disponible - cab - barra - 2) / Math.max(20, fila))))
      }
    }
    medir()
    window.addEventListener('resize', medir)
    const ro = new ResizeObserver(medir)
    ro.observe(document.body)
    return () => { window.removeEventListener('resize', medir); ro.disconnect() }
  }, [onCapacidad, users.length > 0])
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  const [detailUserId, setDetailUserId] = useState<string | null>(null)
  const [detailInitialTab, setDetailInitialTab] = useState<string>("info")
  const [editUserId, setEditUserId] = useState<string | null>(null)
  const [resetUser, setResetUser] = useState<UserRow | null>(null)
  const [loadingReset, setLoadingReset] = useState(false)

  const handleReset = async (password: string) => {
    if (!resetUser) return
    setLoadingReset(true)
    try { await resetUserPassword(resetUser.user_id, password); setResetUser(null); onRefresh() }
    catch (e) { console.error('Reset error', e) } finally { setLoadingReset(false) }
  }
  const ordenar = (col: ColUsuario) => onOrden(orden?.col !== col ? { col, dir: 'asc' } : orden.dir === 'asc' ? { col, dir: 'desc' } : null)

  return (
    <>
      <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div ref={zona} style={alto ? { height: alto } : undefined} className="overflow-auto">
          <table className="w-full border-separate border-spacing-0">
            <thead className="sticky top-0 z-10">
              <tr>
                {COLUMNAS.map((c, i) => (
                  <th key={i} className={`border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap ${c.clase ?? ''}`}>
                    {c.col ? (
                      <button type="button" onClick={() => ordenar(c.col!)} className="inline-flex items-center gap-1 uppercase hover:text-slate-800">
                        {c.titulo}
                        <span className={`text-[9px] ${orden?.col === c.col ? 'text-[#1a4fa0]' : 'text-slate-300'}`}>{orden?.col === c.col ? (orden.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
                      </button>
                    ) : c.titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={COLUMNAS.length} className="py-12 text-center">
                  <div className="mx-auto size-7 animate-spin rounded-full border-2 border-[#1a4fa0] border-t-transparent" />
                  <p className="mt-2 text-sm text-slate-400">Cargando usuarios…</p>
                </td></tr>
              ) : !users.length ? (
                <tr><td colSpan={COLUMNAS.length} className="py-12 text-center text-sm text-slate-400">No se encontraron usuarios</td></tr>
              ) : users.map((user) => (
                <tr key={user.user_id} data-fila className="group hover:bg-[#1a4fa0]/5 [&>td]:border-b [&>td]:border-slate-100">
                  <td className={TD}>
                    <div className="flex items-center gap-2">
                      <Avatar name={user.full_name} />
                      <span className="font-semibold text-slate-800">{user.full_name}</span>
                      {user.is_protected && <span className="rounded bg-slate-100 px-1 text-[10.5px] font-medium text-slate-500">Protegido</span>}
                    </div>
                  </td>
                  <td className={`${TD} text-slate-500`}><span className="block max-w-60 truncate" title={user.email}>{user.email}</span></td>
                  <td className={`${TD} tabular-nums text-slate-500`}>{user.matricula || '—'}</td>
                  <td className={TD}><span className="block max-w-48 truncate" title={user.puesto || ''}>{user.puesto || '—'}</span></td>
                  <td className={TD}><span className="block max-w-40 truncate" title={user.departamento || ''}>{user.departamento || '—'}</span></td>
                  <td className={TD}>{user.company_name || '—'}</td>
                  <td className={TD}><RoleBadge roles={user.roles} /></td>
                  <td className={TD}><TwoFABadge configured={user.is_2fa_configured} /></td>
                  <td className="px-2 py-1 text-center">
                    {user.is_locked
                      ? <Lock size={18} className="text-red-500 mx-auto" />
                      : <Unlock size={18} className="text-green-500 mx-auto" />
                    }
                  </td>
                  <td className={TD}><StatusBadge user={user} /></td>
                  <td className={`${TD} text-slate-500`}>{formatRelative(user.last_login_at)}</td>
                  <td className="px-1 py-1">
                    <ActionMenu
                      user={user}
                      onRefresh={onRefresh}
                      onViewDetail={() => setDetailUserId(user.user_id)}
                      onEdit={() => setEditUserId(user.user_id)}
                      onResetPassword={() => setResetUser(user)}
                      onViewDocuments={() => { setDetailUserId(user.user_id); setDetailInitialTab("documents") }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div ref={pie} className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 px-3 py-1.5">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>{total ? `${(page - 1) * perPage + 1}–${Math.min(page * perPage, total)} de ${total}` : '0 usuarios'}</span>
            <select value={modoPagina} onChange={e => onPerPageChange(Number(e.target.value))} aria-label="Usuarios por página"
              className="h-6 rounded-md border border-slate-300 bg-white px-1 text-xs text-slate-600 outline-none focus:border-[#1a4fa0]">
              <option value={0}>Ajustar a pantalla</option>
              {[25, 50, 100].map(n => <option key={n} value={n}>{n} por página</option>)}
            </select>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-0.5">
              <button onClick={() => onPageChange(page - 1)} disabled={page === 1} aria-label="Anterior" className="grid size-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-40"><ChevronLeft size={14} /></button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1).map((p, idx, arr) => (
                <React.Fragment key={p}>
                  {idx > 0 && arr[idx - 1] !== p - 1 && <span className="px-1 text-xs text-slate-300">…</span>}
                  <button onClick={() => onPageChange(p)} className={`size-7 rounded-md text-xs ${p === page ? 'bg-[#1a4fa0] font-semibold text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{p}</button>
                </React.Fragment>
              ))}
              <button onClick={() => onPageChange(page + 1)} disabled={page === totalPages} aria-label="Siguiente" className="grid size-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-40"><ChevronRight size={14} /></button>
            </div>
          )}
        </div>
      </div>

      {detailUserId && <UserDetail userId={detailUserId} initialTab={detailInitialTab} onClose={() => { setDetailUserId(null); setDetailInitialTab("info") }} onRefresh={onRefresh} />}
      {editUserId && <UserEditForm userId={editUserId} onClose={() => setEditUserId(null)} onSuccess={onRefresh} />}
      {resetUser && <ResetPasswordModal user={resetUser} onConfirm={handleReset} onClose={() => setResetUser(null)} isLoading={loadingReset} />}
    </>
  )
}
