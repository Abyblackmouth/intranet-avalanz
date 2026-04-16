import api from '@/services/api'

export const getNotifications = (params?: Record<string, string | number>) =>
  api.get('/api/v1/notifications/', { params })

export const getUnreadCount = () =>
  api.get('/api/v1/notifications/unread-count')

export const markAsRead = (notificationId: string) =>
  api.patch(`/api/v1/notifications/${notificationId}/read`)

export const markAllAsRead = () =>
  api.patch('/api/v1/notifications/read-all')
