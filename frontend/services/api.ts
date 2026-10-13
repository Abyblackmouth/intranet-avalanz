import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios'
import Cookies from 'js-cookie'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost'

const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
})

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = Cookies.get('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

let isRefreshing = false
let failedQueue: Array<{
  resolve: (token: string) => void
  reject: (error: unknown) => void
}> = []

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token!)
    }
  })
  failedQueue = []
}

// ── Renovacion anticipada del token ─────────────────────────────────────────
// Se renueva un minuto ANTES de que venza, en lugar de esperar al 401. Asi no se llenan
// los registros de 401 normales y lo que quede en ellos es un error de verdad.
// La renovacion al recibir un 401 (abajo) se queda como respaldo.
const venceEn = (token?: string): number => {
  try {
    const carga = token!.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(carga)).exp * 1000
  } catch { return 0 }
}
export const tokenPorVencer = (token?: string, margenMs = 60_000) => !!token && venceEn(token) - Date.now() < margenMs

let renovacionEnCurso: Promise<string | null> | null = null
export const asegurarToken = async (): Promise<string | null> => {
  const actual = Cookies.get('access_token')
  if (!actual || !tokenPorVencer(actual)) return actual ?? null
  const refreshToken = Cookies.get('refresh_token')
  if (!refreshToken) return actual
  if (!renovacionEnCurso) {
    // Una sola renovacion a la vez: las peticiones que salen juntas la comparten
    renovacionEnCurso = axios.post(`${BASE_URL}/api/v1/auth/refresh`, { refresh_token: refreshToken })
      .then(({ data }) => {
        const nuevo = data?.data?.access_token as string
        if (!nuevo) return null
        Cookies.set('access_token', nuevo, { secure: false, sameSite: 'lax' })
        api.defaults.headers.common.Authorization = `Bearer ${nuevo}`
        return nuevo
      })
      .catch(() => null)
      .finally(() => { setTimeout(() => { renovacionEnCurso = null }, 0) })
  }
  return (await renovacionEnCurso) ?? actual
}

api.interceptors.request.use(async (config) => {
  if (config.url?.includes('/auth/')) return config
  const token = await asegurarToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`
          return api(originalRequest)
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      const refreshToken = Cookies.get('refresh_token')

      if (!refreshToken) {
        processQueue(error, null)
        isRefreshing = false
        clearSession()
        return Promise.reject(error)
      }

      try {
        const { data } = await axios.post(`${BASE_URL}/api/v1/auth/refresh`, {
          refresh_token: refreshToken,
        })

        const newAccessToken = data.data.access_token
        Cookies.set('access_token', newAccessToken, { secure: false, sameSite: 'lax' })
        api.defaults.headers.common.Authorization = `Bearer ${newAccessToken}`
        processQueue(null, newAccessToken)
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
        return api(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError, null)
        clearSession()
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)

export const saveSession = (accessToken: string, refreshToken: string) => {
  Cookies.set('access_token', accessToken, { secure: false, sameSite: 'lax' })
  Cookies.set('refresh_token', refreshToken, { secure: false, sameSite: 'lax' })
}

export const clearSession = () => {
  Cookies.remove('access_token')
  Cookies.remove('refresh_token')
  if (typeof window !== 'undefined') {
    window.location.href = '/login'
  }
}

export const getAccessToken = () => Cookies.get('access_token')
export const getRefreshToken = () => Cookies.get('refresh_token')

export default api
