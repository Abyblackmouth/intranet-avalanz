import { useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'
import { useToastStore } from '@/store/toastStore'
import Cookies from 'js-cookie'

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost/ws'
const HEARTBEAT_INTERVAL = 30000
const RECONNECT_DELAY = 5000

export function useWebSocket() {
  const ws = useRef<WebSocket | null>(null)
  const heartbeat = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isConnecting = useRef(false)

  const { user, logout: clearStore } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const { addToast } = useToastStore()

  const disconnect = useCallback(() => {
    if (heartbeat.current) clearInterval(heartbeat.current)
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
    if (ws.current) {
      ws.current.onclose = null
      ws.current.close()
      ws.current = null
    }
    isConnecting.current = false
  }, [])

  const connect = useCallback(() => {
    if (isConnecting.current || ws.current?.readyState === WebSocket.OPEN) return

    const token = Cookies.get('access_token')
    if (!token || !user) return

    isConnecting.current = true

    try {
      ws.current = new WebSocket(`${WS_URL}?token=${token}`)

      ws.current.onopen = () => {
        isConnecting.current = false
        // Iniciar heartbeat
        heartbeat.current = setInterval(() => {
          if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: 'ping' }))
          }
        }, HEARTBEAT_INTERVAL)
      }

      ws.current.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)

          switch (msg.event) {
            case 'notification.new':
              if (msg.data) {
                // Normalizar el campo id — el backend devuelve notification_id
                const normalized = {
                  ...msg.data,
                  id: msg.data.id ?? msg.data.notification_id,
                }
                addNotification(normalized)
                addToast({
                  type: normalized.type ?? 'info',
                  title: normalized.title,
                  body: normalized.body,
                })
              }
              break

            case 'session.revoked':
              disconnect()
              clearStore()
              window.location.href = '/login'
              break

            case 'connection.established':
              // Conexion confirmada
              break
          }
        } catch {
          // Ignorar mensajes mal formados
        }
      }

      ws.current.onclose = (event) => {
        isConnecting.current = false
        if (heartbeat.current) clearInterval(heartbeat.current)

        // Codigo 4001 = token invalido, no reconectar
        if (event.code === 4001) {
          clearStore()
          window.location.href = '/login'
          return
        }

        // Reconectar automaticamente despues de delay
        reconnectTimer.current = setTimeout(() => {
          if (user) connect()
        }, RECONNECT_DELAY)
      }

      ws.current.onerror = () => {
        isConnecting.current = false
      }

    } catch {
      isConnecting.current = false
    }
  }, [user, addNotification, disconnect, clearStore])

  useEffect(() => {
    if (user) {
      connect()
    } else {
      disconnect()
    }

    return () => disconnect()
  }, [user, connect, disconnect])

  return { connect, disconnect }
}
