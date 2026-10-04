// ----------------------------------------------------------------------
// Datos de sesion para el asistente
// Lee del JWT (sin verificarlo: solo para mostrar) el nombre para el
// saludo y la marca de inicio de sesion que liga la conversacion.
// ----------------------------------------------------------------------
import { getAccessToken } from '@/services/api'

export interface SessionClaims {
  firstName: string
  sessionKey: string
}

// Payload del JWT decodificado como UTF-8 (nombres con acentos)
const decodePayload = (token: string): Record<string, unknown> | null => {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = part + '='.repeat((4 - (part.length % 4)) % 4)
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return null
  }
}

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()

// Nombre del saludo: el del correo (nombre_apellido), que es como la
// persona se identifica; si no, el primer nombre de full_name
const preferredName = (email: string, fullName: string): string => {
  const local = email.split('@')[0] ?? ''
  const fromEmail = local.split(/[._-]/)[0] ?? ''
  // Solo si el correo separa nombre y apellido (nombre_apellido, nombre.apellido);
  // si no (andreshinojosaj), se usa el primer nombre de full_name
  if (/[._-]/.test(local) && /^[a-záéíóúñ]{2,}$/i.test(fromEmail)) return capitalize(fromEmail)
  return capitalize(fullName.trim().split(/\s+/)[0] ?? '')
}

export const readSessionClaims = (): SessionClaims => {
  const token = getAccessToken()
  const payload = token ? decodePayload(token) : null
  if (!payload) return { firstName: '', sessionKey: '' }
  const email = String(payload.email ?? '')
  const fullName = String(payload.full_name ?? '')
  const sessionKey = String(payload.session_started_at ?? payload.user_id ?? '')
  return { firstName: preferredName(email, fullName), sessionKey: `${payload.user_id ?? ''}|${sessionKey}` }
}
