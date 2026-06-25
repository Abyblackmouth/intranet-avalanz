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
      // Disparar evento DOM para que cualquier componente pueda escucharlo
      window.dispatchEvent(new CustomEvent('ws:message', { detail: msg }))
      if (msg.event === 'session.revoked') {
        window.location.href = '/login'
      }
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
    const listener = (e: Event) => {
      const msg = (e as CustomEvent<WSEvent>).detail
      if (msg.event === event || event === '*') {
        handlerRef.current(msg.data)
      }
    }
    window.addEventListener('ws:message', listener)
    connect()
    return () => window.removeEventListener('ws:message', listener)
  }, [event])
}

export function useWebSocket() {
  useEffect(() => {
    connect()
  }, [])
}
