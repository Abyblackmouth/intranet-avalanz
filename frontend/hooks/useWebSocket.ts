'use client'
import { useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '@/store/authStore'

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
    const raw = localStorage.getItem('auth-storage')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.state?.token ?? null
  } catch {
    return null
  }
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
  }

  socket.onmessage = (e) => {
    try {
      const msg: WSEvent = JSON.parse(e.data)
      // Disparar handlers por evento exacto
      handlers.get(msg.event)?.forEach(h => h(msg.data))
      // Disparar handlers globales (*)
      handlers.get('*')?.forEach(h => h(msg))
    } catch {}
  }

  socket.onclose = () => {
    isConnecting = false
    socket = null
    // Reconectar en 5 segundos
    reconnectTimer = setTimeout(connect, 5000)
  }

  socket.onerror = () => {
    socket?.close()
  }
}

export function initWebSocket() {
  if (typeof window === 'undefined') return
  connect()
}

export function useWSEvent(event: string, handler: WSEventHandler) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const wrapped: WSEventHandler = (data) => handlerRef.current(data)
    if (!handlers.has(event)) handlers.set(event, new Set())
    handlers.get(event)!.add(wrapped)

    // Asegurar conexión activa
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
