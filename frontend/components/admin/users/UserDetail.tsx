'use client'
import { useState, useEffect, useRef } from 'react'
import {
  X, User, Mail, Hash, Briefcase, Building2, Shield, ShieldCheck, ShieldOff,
  Globe, Lock, Clock, Monitor, Wifi, WifiOff, ChevronDown, ChevronUp, LogOut,
  FileText, Upload, Download, Trash2, Eye, AlertCircle, CheckCircle2
} from 'lucide-react'
import { getUser, getUserSessions, getUserLoginHistory } from '@/services/adminService'
import { getUserFiles, uploadUserFile, downloadUserFile, deleteUserFile } from '@/services/uploadService'
import { UserRow } from '@/types/user.types'
import api from '@/services/api'

interface UserDetailProps {
  userId: string
  initialTab?: string
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

interface UserFile {
  id: string
  user_id: string
  original_name: string
  stored_name: string
  object_key: string
  bucket: string
  mime_type: string
  extension: string
  size_bytes: number
  size_mb: number
  checksum: string
  description: string
  is_deleted: boolean
  uploaded_by: string
  uploaded_at: string
  last_modified_by: string | null
  last_modified_at: string | null
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

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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

export default function UserDetail({ userId, initialTab = 'info', onClose, onRefresh }: UserDetailProps) {
  const [user, setUser] = useState<UserRow | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [history, setHistory] = useState<LoginEntry[]>([])
  const [files, setFiles] = useState<UserFile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'info' | 'sessions' | 'history' | 'documents'>(initialTab as any)
  const [revokingSession, setRevokingSession] = useState<string | null>(null)

  // Documents state
  const [isUploading, setIsUploading] = useState(false)
  const [uploadDescription, setUploadDescription] = useState('')
  const [showUploadForm, setShowUploadForm] = useState(false)
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null)
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null)
  const [fileError, setFileError] = useState('')
  const [fileSuccess, setFileSuccess] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      try {
        const [userRes, sessionsRes, historyRes, filesRes] = await Promise.all([
          getUser(userId),
          getUserSessions(userId),
          getUserLoginHistory(userId),
          getUserFiles(userId),
        ])
        setUser(userRes.data.data)
        setSessions(sessionsRes.data.data || [])
        setHistory(historyRes.data.data || [])
        setFiles(filesRes.data.data || [])
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

  const ALLOWED_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  ]
  const MAX_SIZE_MB = 50

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    setFileError('')
    setFileSuccess('')
    if (!ALLOWED_TYPES.includes(file.type)) {
      setFileError('Tipo de archivo no permitido. Usa PDF, Word, Excel, JPG o PNG.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setFileError('El archivo supera el limite de 50 MB.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    setIsUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('company_slug', user.company_name.toLowerCase().replace(/\s+/g, '-'))
      formData.append('description', uploadDescription || 'Sin descripción')

      const res = await uploadUserFile(userId, formData)
      setFiles(prev => [res.data.data, ...prev])
      setShowUploadForm(false)
      setUploadDescription('')
      setFileSuccess('Archivo subido correctamente')
      setTimeout(() => setFileSuccess(''), 3000)
    } catch {
      setFileError('Error al subir el archivo. Verifica el tipo y tamaño.')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDownload = async (file: UserFile) => {
    setDownloadingFileId(file.id)
    try {
      const res = await downloadUserFile(userId, file.id)
      const url = res.data.data.url
      window.open(url, '_blank')
    } catch {
      setFileError('Error al generar el enlace de descarga.')
      setTimeout(() => setFileError(''), 3000)
    } finally {
      setDownloadingFileId(null)
    }
  }

  const handleDeleteFile = async (fileId: string) => {
    if (!confirm('¿Eliminar este archivo? Esta acción no se puede deshacer.')) return
    setDeletingFileId(fileId)
    try {
      await deleteUserFile(userId, fileId, 'Eliminado por administrador')
      setFiles(prev => prev.filter(f => f.id !== fileId))
      setFileSuccess('Archivo eliminado correctamente')
      setTimeout(() => setFileSuccess(''), 3000)
    } catch {
      setFileError('Error al eliminar el archivo.')
      setTimeout(() => setFileError(''), 3000)
    } finally {
      setDeletingFileId(null)
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
            { id: 'documents', label: `Documentos${files.length ? ` (${files.length})` : ''}` },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 py-3 text-xs font-medium transition border-b-2 ${
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
                            entry.success ? 'border-slate-100 bg-white' : 'border-red-100 bg-red-50'
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

              {/* Tab: Documentos */}
              {activeTab === 'documents' && (
                <div className="p-6 space-y-4">

                  {/* Alertas */}
                  {fileError && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
                      <AlertCircle size={14} className="shrink-0" />
                      {fileError}
                    </div>
                  )}
                  {fileSuccess && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-xs">
                      <CheckCircle2 size={14} className="shrink-0" />
                      {fileSuccess}
                    </div>
                  )}

                  {/* Formulario de subida */}
                  {showUploadForm ? (
                    <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                      <p className="text-xs font-semibold text-slate-700">Subir nuevo documento</p>
                      <input
                        type="text"
                        placeholder="Descripción del documento (opcional)"
                        value={uploadDescription}
                        onChange={e => setUploadDescription(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 bg-white outline-none focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#1a4fa0]/10 transition-all duration-150"
                      />
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                        onChange={handleUploadFile}
                        disabled={isUploading}
                        className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-[#1a4fa0] file:text-white hover:file:bg-blue-700 cursor-pointer"
                      />
                      <p className="text-xs text-slate-400">
                        Formatos permitidos: PDF, Word, Excel, JPG, PNG — Máximo 50 MB
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setShowUploadForm(false); setUploadDescription('') }}
                          className="flex-1 py-2 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowUploadForm(true)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-white bg-[#1a4fa0] rounded-xl hover:bg-blue-700 transition"
                    >
                      <Upload size={15} />
                      Subir documento
                    </button>
                  )}

                  {/* Lista de archivos */}
                  {files.length === 0 ? (
                    <div className="text-center py-10">
                      <FileText size={32} className="text-slate-300 mx-auto mb-3" />
                      <p className="text-sm text-slate-400">Sin documentos registrados</p>
                      <p className="text-xs text-slate-300 mt-1">
                        Sube el formato de alta u otros documentos del empleado
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {files.map(file => (
                        <div key={file.id} className="border border-slate-200 rounded-xl p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                                <FileText size={14} className="text-[#1a4fa0]" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-800 truncate">
                                  {file.description || file.original_name}
                                </p>
                                <p className="text-xs text-slate-400 truncate">{file.original_name}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-xs text-slate-400">
                                    {formatBytes(file.size_bytes)}
                                  </span>
                                  <span className="text-xs text-slate-300">·</span>
                                  <span className="text-xs text-slate-400">
                                    {formatRelative(file.uploaded_at)}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => handleDownload(file)}
                                disabled={downloadingFileId === file.id}
                                title="Descargar"
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-[#1a4fa0] transition disabled:opacity-50"
                              >
                                <Download size={13} />
                              </button>
                              <button
                                onClick={() => handleDeleteFile(file.id)}
                                disabled={deletingFileId === file.id}
                                title="Eliminar"
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-600 transition disabled:opacity-50"
                              >
                                <Trash2 size={13} />
                              </button>
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
    <span className="text-sm text-slate-800 font-medium text-right max-w-50 truncate">{value}</span>
  </div>
)

