'use client'

import { useState, useEffect } from 'react'
import {
  X, User, Mail, Hash, Briefcase, Building2, Shield, ShieldCheck, ShieldOff,
  Globe, Lock, Clock, Monitor, Wifi, WifiOff, ChevronDown, ChevronUp, LogOut
} from 'lucide-react'
import { getUser, getUserSessions, getUserLoginHistory } from '@/services/adminService'
import { UserRow } from '@/types/user.types'
import api from '@/services/api'

interface UserDetailProps {
  userId: string
  onClose: () => void
  onRefresh: () => void
}

interface Session {
  session_id: string
  ip_address: string
  user_agent: string
  is_corporate_network: boolean
  session_started_at: string
  last_activity_at: string
  expires_at: string
}

interface LoginEntry {
  id: string
  ip_address: string
  user_agent: string
  is_corporate_network: boolean
  success: boolean
  failure_reason: string | null
  requires_2fa: boolean
  completed_2fa: boolean
  created_at: string
}

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr)
  return date.toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const formatRelative = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Ahora'
  if (mins < 60) return `Hace ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `Hace ${hrs} hr`
  const days = Math.floor(hrs / 24)
  return `Hace ${days} dia${days > 1 ? 's' : ''}`
}

const parseUA = (ua: string) => {
  if (ua.includes('curl')) return 'curl (API)'
  if (ua.includes('Chrome')) return 'Chrome'
  if (ua.includes('Firefox')) return 'Firefox'
  if (ua.includes('Safari')) return 'Safari'
  return ua.substring(0, 30)
}

const RoleBadge = ({ role }: { role: string }) => {
  const colors: Record<string, string> = {
    super_admin: 'bg-red-100 text-red-700 border-red-200',
    admin_empresa: 'bg-amber-100 text-amber-700 border-amber-200',
  }
  const color = colors[role] || 'bg-blue-100 text-blue-700 border-blue-200'
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-semibold border ${color}`}>
      {role.replace(/_/g, ' ').toUpperCase()}
    </span>
  )
}

export default function UserDetail({ userId, onClose, onRefresh }: UserDetailProps) {
  const [user, setUser] = useState<UserRow | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [history, setHistory] = useState<LoginEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'info' | 'sessions' | 'history'>('info')
  const [revokingSession, setRevokingSession] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      try {
        const [userRes, sessionsRes, historyRes] = await Promise.all([
          getUser(userId),
          getUserSessions(userId),
          getUserLoginHistory(userId),
        ])
        setUser(userRes.data.data)
        setSessions(sessionsRes.data.data || [])
        setHistory(historyRes.data.data || [])
      } catch {
        // silencioso
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [userId])

  const handleRevokeSession = async (sessionId: string) => {
    setRevokingSession(sessionId)
    try {
      await api.post('/api/v1/auth/sessions/revoke', { session_id: sessionId })
      setSessions(prev => prev.filter(s => s.session_id !== sessionId))
    } catch {
      // silencioso
    } finally {
      setRevokingSession(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative w-full max-w-xl h-full bg-white shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          {isLoading ? (
            <div className="h-5 w-48 bg-slate-100 rounded animate-pulse" />
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#1a4fa0] flex items-center justify-center shrink-0">
                <span className="text-white text-sm font-bold">
                  {user?.full_name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()}
                </span>
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">{user?.full_name}</h2>
                <p className="text-xs text-slate-500">{user?.email}</p>
              </div>
            </div>
          )}
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 shrink-0">
          {[
            { id: 'info', label: 'Informacion' },
            { id: 'sessions', label: `Sesiones${sessions.length ? ` (${sessions.length})` : ''}` },
            { id: 'history', label: 'Historial' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
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
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (

            <>
              {/* Tab: Informacion */}
              {activeTab === 'info' && user && (
                <div className="p-6 space-y-6">

                  {/* Datos personales */}
                  <div>
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                      Datos personales
                    </h3>
                    <div className="space-y-3">
                      <InfoRow icon={<User size={14} />} label="Nombre" value={user.full_name} />
                      <InfoRow icon={<Mail size={14} />} label="Correo" value={user.email} />
                      <InfoRow icon={<Hash size={14} />} label="Matricula" value={user.matricula || '—'} />
                      <InfoRow icon={<Briefcase size={14} />} label="Puesto" value={user.puesto || '—'} />
                      <InfoRow icon={<Building2 size={14} />} label="Departamento" value={user.departamento || '—'} />
                      <InfoRow icon={<Building2 size={14} />} label="Empresa" value={user.company_name} />
                    </div>
                  </div>

                  {/* Estado de la cuenta */}
                  <div>
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                      Estado de la cuenta
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between py-2">
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <Globe size={14} className="text-slate-400" />
                          Estado
                        </div>
                        {user.is_locked ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-600 border border-red-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                            Bloqueado
                          </span>
                        ) : user.is_active ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-600 border border-green-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                            Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            Inactivo
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between py-2">
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <ShieldCheck size={14} className="text-slate-400" />
                          2FA
                        </div>
                        {user.is_2fa_configured ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                            <ShieldCheck size={13} /> Configurado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-400 font-medium">
                            <ShieldOff size={13} /> Sin configurar
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between py-2">
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <Clock size={14} className="text-slate-400" />
                          Ultima conexion
                        </div>
                        <span className="text-sm text-slate-700">
                          {user.last_login_at ? formatRelative(user.last_login_at) : 'Nunca'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Roles */}
                  {user.roles && user.roles.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                        Roles
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {user.roles.map(role => (
                          <RoleBadge key={role} role={role} />
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              )}

              {/* Tab: Sesiones */}
              {activeTab === 'sessions' && (
                <div className="p-6">
                  {sessions.length === 0 ? (
                    <div className="text-center py-12">
                      <Lock size={32} className="text-slate-300 mx-auto mb-3" />
                      <p className="text-sm text-slate-400">Sin sesiones activas</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {sessions.map(session => (
                        <div key={session.session_id} className="border border-slate-200 rounded-xl p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1.5">
                                <Monitor size={13} className="text-slate-400 shrink-0" />
                                <span className="text-sm font-medium text-slate-800 truncate">
                                  {parseUA(session.user_agent)}
                                </span>
                                {session.is_corporate_network ? (
                                  <span className="inline-flex items-center gap-1 text-xs text-blue-600 shrink-0">
                                    <Wifi size={11} /> Corporativa
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-xs text-slate-400 shrink-0">
                                    <WifiOff size={11} /> Externa
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500">IP: {session.ip_address}</p>
                              <p className="text-xs text-slate-400 mt-1">
                                Inicio: {formatDate(session.session_started_at)}
                              </p>
                              <p className="text-xs text-slate-400">
                                Ultima actividad: {formatRelative(session.last_activity_at)}
                              </p>
                            </div>
                            <button
                              onClick={() => handleRevokeSession(session.session_id)}
                              disabled={revokingSession === session.session_id}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition disabled:opacity-50 shrink-0"
                            >
                              <LogOut size={12} />
                              {revokingSession === session.session_id ? 'Revocando...' : 'Revocar'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Historial */}
              {activeTab === 'history' && (
                <div className="p-6">
                  {history.length === 0 ? (
                    <div className="text-center py-12">
                      <Clock size={32} className="text-slate-300 mx-auto mb-3" />
                      <p className="text-sm text-slate-400">Sin historial de accesos</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {history.map(entry => (
                        <div
                          key={entry.id}
                          className={`flex items-start gap-3 p-3 rounded-lg border ${
                            entry.success
                              ? 'border-slate-100 bg-white'
                              : 'border-red-100 bg-red-50'
                          }`}
                        >
                          <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                            entry.success ? 'bg-green-500' : 'bg-red-500'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className={`text-xs font-semibold ${
                                entry.success ? 'text-green-700' : 'text-red-700'
                              }`}>
                                {entry.success ? 'Acceso exitoso' : 'Acceso fallido'}
                              </span>
                              <span className="text-xs text-slate-400 shrink-0">
                                {formatRelative(entry.created_at)}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5 truncate">
                              {parseUA(entry.user_agent)} — {entry.ip_address}
                            </p>
                            {entry.failure_reason && (
                              <p className="text-xs text-red-600 mt-0.5">{entry.failure_reason}</p>
                            )}
                            <div className="flex items-center gap-3 mt-1">
                              {entry.is_corporate_network ? (
                                <span className="text-xs text-blue-500 flex items-center gap-1">
                                  <Wifi size={10} /> Corporativa
                                </span>
                              ) : (
                                <span className="text-xs text-slate-400 flex items-center gap-1">
                                  <WifiOff size={10} /> Externa
                                </span>
                              )}
                              {entry.requires_2fa && (
                                <span className="text-xs text-slate-400">
                                  2FA: {entry.completed_2fa ? 'completado' : 'no completado'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const InfoRow = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="flex items-center justify-between py-2 border-b border-slate-50">
    <div className="flex items-center gap-2 text-sm text-slate-500">
      <span className="text-slate-400">{icon}</span>
      {label}
    </div>
    <span className="text-sm text-slate-800 font-medium text-right max-w-[60%] truncate">{value}</span>
  </div>
)