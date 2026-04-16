'use client'

import { useEffect, useRef } from 'react'
import { Bell, Check, CheckCheck, X, Info, AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react'
import { useNotifications } from '@/hooks/useNotifications'
import { Notification } from '@/store/notificationStore'

// ── Icono por tipo de notificación ────────────────────────────────────────────
function NotificationIcon({ type }: { type: string }) {
  switch (type) {
    case 'success':
      return <CheckCircle size={15} className="text-emerald-500 shrink-0 mt-0.5" />
    case 'warning':
      return <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
    case 'error':
      return <AlertCircle size={15} className="text-red-500 shrink-0 mt-0.5" />
    default:
      return <Info size={15} className="text-blue-500 shrink-0 mt-0.5" />
  }
}

// ── Formato de fecha relativa ─────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Ahora'
  if (mins < 60) return `Hace ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Hace ${hours}h`
  const days = Math.floor(hours / 24)
  return `Hace ${days}d`
}

// ── Item de notificación ──────────────────────────────────────────────────────
function NotificationItem({
  notification,
  onMarkAsRead,
}: {
  notification: Notification
  onMarkAsRead: (id: string) => void
}) {
  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors cursor-default ${
        !notification.is_read ? 'bg-blue-50/50' : ''
      }`}
    >
      <NotificationIcon type={notification.type} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${!notification.is_read ? 'font-semibold text-slate-800' : 'font-medium text-slate-700'}`}>
          {notification.title}
        </p>
        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed line-clamp-2">{notification.body}</p>
        <p className="text-xs text-slate-400 mt-1">{timeAgo(notification.created_at)}</p>
      </div>
      {!notification.is_read && (
        <button
          onClick={() => onMarkAsRead(notification.id)}
          className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition"
          title="Marcar como leída"
        >
          <Check size={13} />
        </button>
      )}
    </div>
  )
}

// ── Panel de notificaciones ───────────────────────────────────────────────────
export function NotificationList() {
  const { notifications, unreadCount, isOpen, toggleOpen, handleMarkAsRead, handleMarkAllAsRead } = useNotifications()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        if (isOpen) toggleOpen()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen, toggleOpen])

  if (!isOpen) return null

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 overflow-hidden"
    >
      {/* Header del panel */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">Notificaciones</span>
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs font-bold bg-blue-100 text-blue-700 rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md transition"
              title="Marcar todas como leídas"
            >
              <CheckCheck size={13} />
              Todas
            </button>
          )}
          <button
            onClick={toggleOpen}
            className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Lista */}
      <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
            <Bell size={28} className="mb-2 opacity-30" />
            <p className="text-sm">Sin notificaciones</p>
          </div>
        ) : (
          notifications.map((n) => (
            <NotificationItem
              key={n.id}
              notification={n}
              onMarkAsRead={handleMarkAsRead}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ── Campana con badge ─────────────────────────────────────────────────────────
export function NotificationBell() {
  const { unreadCount, isOpen, toggleOpen } = useNotifications()

  return (
    <div className="relative">
      <button
        onClick={toggleOpen}
        className={`relative w-9 h-9 rounded-lg flex items-center justify-center transition ${
          isOpen ? 'bg-slate-100 text-slate-700' : 'text-slate-500 hover:bg-slate-100'
        }`}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      <NotificationList />
    </div>
  )
}
