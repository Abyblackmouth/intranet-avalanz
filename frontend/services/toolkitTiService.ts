import api from './api'

// ── Toolkit TI: plugins ──────────────────────────────────────────────────────
const BASE = '/api/v1/toolkit-ti'
export const getPlugins = () => api.get(`${BASE}/plugins`)
export const cambiarPlugin = (slug: string, data: { activo: boolean }) => api.patch(`${BASE}/plugins/${slug}`, data)
export const ejecutarPlugin = (slug: string, data: FormData) =>
  api.post(`${BASE}/plugins/${slug}/ejecutar`, data, { headers: { 'Content-Type': 'multipart/form-data' } })
export const getEjecuciones = (slug: string) => api.get(`${BASE}/plugins/${slug}/ejecuciones`)
export const getEjecucion = (id: string) => api.get(`${BASE}/plugins/ejecuciones/${id}`)
