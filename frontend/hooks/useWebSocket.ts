'use client'
import { useEffect, useRef } from 'react'
import { useNotificationStore } from '@/store/notificationStore'

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

// Referencia al store fuera del hook para acceder desde onmessage
let storeRef: ReturnType<typeof useNotificationStore.getState> | null = null

export function setStoreRef(store: ReturnType<typeof useNotificationStore.getState>) {
  storeRef = store
}

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
      if (msg.event === 'notification.new' && storeRef) {
        const notif = msg.data
        if (notif?.id) {
          storeRef.addNotification(notif)
        } else {
          storeRef.setUnreadCount(storeRef.unreadCount + 1)
        }
      }
      if (msg.event === 'session.revoked') {
        window.location.href = '/login'
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

  socket.onerror = () => { socket?.close() }
}

export function useWSEvent(event: string, handler: WSEventHandler) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const wrapped: WSEventHandler = (data) => handlerRef.current(data)
    if (!handlers.has(event)) handlers.set(event, new Set())
    handlers.get(event)!.add(wrapped)
    connect()
    return () => { handlers.get(event)?.delete(wrapped) }
  }, [event])
}

export function useWebSocket() {
  const store = useNotificationStore()

  useEffect(() => {
    storeRef = useNotificationStore.getState()
    connect()
  }, [])

  // Actualizar la referencia cuando cambia el store
  useEffect(() => {
    storeRef = useNotificationStore.getState()
  }, [store.unreadCount])
}
