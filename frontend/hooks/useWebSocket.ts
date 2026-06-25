'use client'
import { useEffect, useRef } from 'react'

type WSEventHandler = (data: any) => void

interface WSEvent {
  event: string
  module: string | null
  data: any
  timestamp: string
}

const handlers: Map<string, Set<WSEventHandler>> = new Map()
let socket: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let isConnecting = false

function getToken(): string | null {
  try {
    const cookies = document.cookie.split(';')
    for (const cookie of cookies) {
      const [key, value] = cookie.trim().split('=')
      if (key === 'access_token') return decodeURIComponent(value)
    }
    return null
  } catch {
    return null
  }
}

function dispatch(event: string, data: any) {
  handlers.get(event)?.forEach(h => h(data))
  handlers.get('*')?.forEach(h => h({ event, data }))
}

function connect() {
  if (isConnecting || socket?.readyState === WebSocket.OPEN) return
  const token = getToken()
  if (!token) return
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL
  if (!wsUrl) return

  isConnecting = true
  socket = new WebSocket(`${wsUrl}?token=${token}`)

  socket.onopen = () => {
    isConnecting = false
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    // Heartbeat cada 30 segundos
    const heartbeat = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'ping' }))
      } else {
        clearInterval(heartbeat)
      }
    }, 30000)
  }

  socket.onmessage = (e) => {
    try {
      const msg: WSEvent = JSON.parse(e.data)
      if (msg.event === 'notification.new') {
        // Agregar al notificationStore directamente
        import('@/store/notificationStore').then(({ useNotificationStore }) => {
          const store = useNotificationStore.getState()
          const notif = msg.data
          if (notif?.id) {
            store.addNotification({ ...notif, id: notif.id ?? notif._id })
          } else {
            store.setUnreadCount(store.unreadCount + 1)
          }
        }).catch(() => {})
      }
      if (msg.event === 'session.revoked' || (msg as any).code === 4001) {
        import('@/store/authStore').then(({ useAuthStore }) => {
          useAuthStore.getState().logout()
          window.location.href = '/login'
        }).catch(() => {})
        return
      }
      dispatch(msg.event, msg.data)
    } catch {}
  }

  socket.onclose = (e) => {
    isConnecting = false
    socket = null
    if (e.code === 4001 || e.code === 4002) return
    reconnectTimer = setTimeout(connect, 5000)
  }

  socket.onerror = () => {
    socket?.close()
  }
}

export function useWSEvent(event: string, handler: WSEventHandler) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const wrapped: WSEventHandler = (data) => handlerRef.current(data)
    if (!handlers.has(event)) handlers.set(event, new Set())
    handlers.get(event)!.add(wrapped)
    connect()
    return () => {
      handlers.get(event)?.delete(wrapped)
    }
  }, [event])
}

export function useWebSocket() {
  useEffect(() => {
    connect()
  }, [])
}
