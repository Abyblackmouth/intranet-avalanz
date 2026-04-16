import { useEffect, useCallback } from 'react'
import { useNotificationStore } from '@/store/notificationStore'
import { getNotifications, getUnreadCount, markAsRead, markAllAsRead } from '@/services/notificationService'

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
      setUnreadCount(res.data?.data?.count ?? 0)
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
    const interval = setInterval(fetchUnreadCount, 60000)
    return () => clearInterval(interval)
  }, [fetchUnreadCount])

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
