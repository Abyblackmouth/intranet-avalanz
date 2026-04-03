'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  MoreHorizontal, Eye, Pencil, Lock, Unlock, KeyRound,
  LogOut, Trash2, ShieldCheck, ShieldOff, ChevronLeft, ChevronRight,
} from 'lucide-react'
import api from '@/services/api'
import { UserRow } from '@/types/user.types'
import UserDetail from '@/components/admin/users/UserDetail'

// ── Helpers ───────────────────────────────────────────────────────────────────

const StatusBadge = ({ user }: { user: UserRow }) => {
  if (user.is_locked) return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-600 border border-red-200">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
      Bloqueado
    </span>
  )
  if (!user.is_active) return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
      Inactivo
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-600 border border-green-200">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
      Activo
    </span>
  )
}

const RoleBadge = ({ roles }: { roles: string[] }) => {
  const roleColors: Record<string, string> = {
    super_admin:   'bg-red-100 text-red-700 border-red-200',
    admin_empresa: 'bg-amber-100 text-amber-700 border-amber-200',
    default:       'bg-blue-100 text-blue-700 border-blue-200',
  }
  if (!roles || roles.length === 0) return (
    <span className="text-xs text-slate-400">Sin rol</span>
  )
  return (
    <div className="flex flex-wrap gap-1">
      {roles.slice(0, 2).map((role) => {
        const color = roleColors[role] || roleColors.default
        const label = role.replace(/_/g, ' ').toUpperCase()
        return (
          <span key={role} className={`inline-flex px-2 py-0.5 rounded-md text-xs font-semibold border ${color}`}>
            {label}
          </span>
        )
      })}
      {roles.length > 2 && (
        <span className="text-xs text-slate-400">+{roles.length - 2}</span>
      )}
    </div>
  )
}

const TwoFABadge = ({ configured }: { configured: boolean }) =>
  configured ? (
    <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
      <ShieldCheck size={13} /> Activo
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-slate-400">
      <ShieldOff size={13} /> Inactivo
    </span>
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

const Avatar = ({ name }: { name: string }) => {
  const initials = name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()
  return (
    <div className="w-8 h-8 rounded-lg bg-[#1a4fa0] flex items-center justify-center shrink-0">
      <span className="text-white text-xs font-bold">{initials}</span>
    </div>
  )
}

// ── Action Menu ───────────────────────────────────────────────────────────────

const ActionMenu = ({
  user, onRefresh, onViewDetail,
}: {
  user: UserRow
  onRefresh: () => void
  onViewDetail: () => void
}) => {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)

  const openMenu = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setMenuPos({
        top: rect.bottom + window.scrollY + 4,
        right: window.innerWidth - rect.right,
      })
    }
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const handleScroll = () => setOpen(false)
    window.addEventListener('scroll', handleScroll, true)
    return () => window.removeEventListener('scroll', handleScroll, true)
  }, [open])

  const action = async (fn: () => Promise<void>) => {
    setLoading(true)
    setOpen(false)
    try { await fn() } finally { setLoading(false); onRefresh() }
  }

  const toggleLock = () => action(async () => {
    await api.patch(`/api/v1/users/${user.user_id}`, { is_active: user.is_locked ? true : false })
  })

  const resetPassword = () => action(async () => {
    await api.post(`/api/v1/auth/password-reset/request`, { email: user.email })
  })

  const revokeSessions = () => action(async () => {
    await api.post(`/api/v1/auth/sessions/revoke-all`, { user_id: user.user_id })
  })

  return (
    <>
      <button
        ref={btnRef}
        onClick={openMenu}
        disabled={loading}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
      >
        {loading
          ? <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
          : <MoreHorizontal size={16} />
        }
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="fixed z-50 w-52 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5"
            style={{ top: menuPos.top, right: menuPos.right }}
          >
            <MenuItem
              icon={<Eye size={14} />}
              label="Ver detalle"
              onClick={() => { setOpen(false); onViewDetail() }}
            />
            <MenuItem
              icon={<Pencil size={14} />}
              label="Editar"
              onClick={() => setOpen(false)}
            />
            <MenuItem
              icon={<KeyRound size={14} />}
              label="Resetear contrasena"
              onClick={resetPassword}
            />
            <div className="h-px bg-slate-100 my-1" />
            <MenuItem
              icon={user.is_locked
                ? <Unlock size={14} />
                : <Lock size={14} />
              }
              label={user.is_locked ? 'Desbloquear cuenta' : 'Bloquear cuenta'}
              onClick={toggleLock}
              danger={!user.is_locked}
            />
            <MenuItem
              icon={<LogOut size={14} />}
              label="Revocar sesiones"
              onClick={revokeSessions}
              danger
            />
            <div className="h-px bg-slate-100 my-1" />
            <MenuItem
              icon={<Trash2 size={14} />}
              label="Eliminar usuario"
              onClick={() => setOpen(false)}
              danger
            />
          </div>
        </>
      )}
    </>
  )
}

const MenuItem = ({
  icon, label, onClick, danger = false,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
}) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition
      ${danger
        ? 'text-red-600 hover:bg-red-50'
        : 'text-slate-700 hover:bg-slate-50'
      }`}
  >
    <span className="shrink-0">{icon}</span>
    {label}
  </button>
)

// ── Tabla principal ───────────────────────────────────────────────────────────

interface UserTableProps {
  users: UserRow[]
  isLoading: boolean
  onRefresh: () => void
  page: number
  perPage: number
  total: number
  onPageChange: (page: number) => void
}

export default function UserTable({
  users, isLoading, onRefresh, page, perPage, total, onPageChange,
}: UserTableProps) {
  const totalPages = Math.ceil(total / perPage)
  const [detailUserId, setDetailUserId] = useState<string | null>(null)

  if (isLoading) return (
    <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
      <div className="w-8 h-8 border-2 border-[#1a4fa0] border-t-transparent rounded-full animate-spin mx-auto" />
      <p className="text-slate-400 text-sm mt-3">Cargando usuarios...</p>
    </div>
  )

  if (!users.length) return (
    <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
      <p className="text-slate-400 text-sm">No se encontraron usuarios</p>
    </div>
  )

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Usuario</th>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Empresa</th>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Rol</th>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">2FA</th>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Estado</th>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Ultima conexion</th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((user) => (
              <tr key={user.user_id} className="hover:bg-slate-50/60 transition">

                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={user.full_name} />
                    <div>
                      <p className="text-sm font-medium text-slate-900 leading-tight">{user.full_name}</p>
                      <p className="text-xs text-slate-400 leading-tight">{user.email}</p>
                    </div>
                  </div>
                </td>

                <td className="px-4 py-3">
                  <p className="text-sm text-slate-700">{user.company_name || '—'}</p>
                </td>

                <td className="px-4 py-3">
                  <RoleBadge roles={user.roles} />
                </td>

                <td className="px-4 py-3">
                  <TwoFABadge configured={user.is_2fa_configured} />
                </td>

                <td className="px-4 py-3">
                  <StatusBadge user={user} />
                </td>

                <td className="px-4 py-3">
                  <p className="text-xs text-slate-500">{formatRelative(user.last_login_at)}</p>
                </td>

                <td className="px-4 py-3">
                  <ActionMenu
                    user={user}
                    onRefresh={onRefresh}
                    onViewDetail={() => setDetailUserId(user.user_id)}
                  />
                </td>

              </tr>
            ))}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <p className="text-xs text-slate-400">
              Mostrando {(page - 1) * perPage + 1} a {Math.min(page * perPage, total)} de {total} usuarios
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onPageChange(page - 1)}
                disabled={page === 1}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft size={15} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .map((p, idx, arr) => (
                  <>
                    {idx > 0 && arr[idx - 1] !== p - 1 && (
                      <span key={`dots-${p}`} className="text-slate-300 text-xs px-1">...</span>
                    )}
                    <button
                      key={p}
                      onClick={() => onPageChange(p)}
                      className={`w-8 h-8 rounded-lg text-sm transition ${
                        p === page
                          ? 'bg-[#1a4fa0] text-white font-medium'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {p}
                    </button>
                  </>
                ))}
              <button
                onClick={() => onPageChange(page + 1)}
                disabled={page === totalPages}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {detailUserId && (
        <UserDetail
          userId={detailUserId}
          onClose={() => setDetailUserId(null)}
          onRefresh={onRefresh}
        />
      )}
    </>
  )
}