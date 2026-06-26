import { useEffect, useCallback } from 'react'
import { useNotificationStore } from '@/store/notificationStore'
import { getNotifications, getUnreadCount, markAsRead, markAllAsRead } from '@/services/notificationService'
import { useWSEvent } from '@/hooks/useWebSocket'

export function useNotifications() {
  const {
    notifications,
    unreadCount,
    isOpen,
    setNotifications,
    markAsRead: markReadLocal,
    markAllAsRead: markAllReadLocal,
    setUnreadCount,
    setIsOpen,
  } = useNotificationStore()

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await getNotifications({ per_page: 20 })
      setNotifications(res.data?.data?.data ?? [])
    } catch {}
  }, [setNotifications])

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await getUnreadCount()
      console.log('[NOTIFY] unread-count response:', JSON.stringify(res.data))
      const count = res.data?.data?.unread ?? res.data?.data?.count ?? 0
      console.log('[NOTIFY] setUnreadCount llamado con:', count)
      setUnreadCount(count)
    } catch {}
  }, [setUnreadCount])

  const handleMarkAsRead = useCallback(async (id: string) => {
    markReadLocal(id)
    try {
      await markAsRead(id)
    } catch {}
  }, [markReadLocal])

  const handleMarkAllAsRead = useCallback(async () => {
    markAllReadLocal()
    try {
      await markAllAsRead()
    } catch {}
  }, [markAllReadLocal])

  const toggleOpen = useCallback(() => {
    const opening = !isOpen
    setIsOpen(opening)
    if (opening) fetchNotifications()
  }, [isOpen, setIsOpen, fetchNotifications])

  useEffect(() => {
    fetchUnreadCount()
    const interval = setInterval(fetchUnreadCount, 30000)
    return () => clearInterval(interval)
  }, [fetchUnreadCount])

  // Actualizar contador en tiempo real via WebSocket
  useWSEvent('notification.new', useCallback((data) => {
    console.log('[WS] notification.new recibido:', data)
    fetchUnreadCount().then(() => {
      console.log('[WS] unreadCount actualizado:', useNotificationStore.getState().unreadCount)
    })
  }, [fetchUnreadCount]))

  // Actualizar tabla legal en tiempo real
  useWSEvent('legal.tabla_actualizada', useCallback(() => {
    fetchUnreadCount()
  }, [fetchUnreadCount]))

  return {
    notifications,
    unreadCount,
    isOpen,
    toggleOpen,
    handleMarkAsRead,
    handleMarkAllAsRead,
    fetchNotifications,
  }
}
