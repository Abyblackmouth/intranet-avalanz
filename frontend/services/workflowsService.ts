import api from './api'

const BASE = '/api/v1/workflows'

// ── Tipos ────────────────────────────────────────────────────────────────
export interface Ajuste {
  key: string; grupo: string; label: string; descripcion: string
  tipo: 'bool' | 'int' | 'opcion' | 'texto'
  default: string; valor: string; opciones?: [string, string][]; min?: number; max?: number; max_len?: number
}
export interface CambioAjuste { key: string; label: string; anterior: string | null; nuevo: string; usuario: string; fecha: string }

export interface EmpresaConexion { id: string; clave: string; nombre: string; company_id: string | null; activa: boolean }
export interface Conexion {
  id: string; slug: string; titulo: string; url_base: string
  auth_tipo: 'ninguna' | 'basica' | 'token'; auth_usuario: string | null; tiene_secreto: boolean
  token_entrada: string | null; timeout_seg: number; reintentos_max: number; espaciado_min: number[]
  activa: boolean; flujos: number; empresas: EmpresaConexion[]
}
export interface ConexionDatos {
  slug?: string; titulo?: string; url_base?: string; auth_tipo?: string; auth_usuario?: string | null
  auth_secreto?: string; borrar_secreto?: boolean; timeout_seg?: number; reintentos_max?: number
  espaciado_min?: number[]; activa?: boolean
}
export interface UsuarioPlataforma {
  id: string; conexion_id: string; id_externo: string; login_externo: string | null; email: string | null
  nombre: string; user_id: string | null; ligado: boolean; ultima_vez: string | null
}
export interface UsuarioIntranet { id: string; name: string; email: string; puesto?: string; departamento?: string; is_locked?: boolean }

// ── Ajustes del módulo (solo super admin) ─────────────────────────────────
export const getAjustes = () => api.get<Ajuste[]>(`${BASE}/ajustes`)
export const getAjustesHistorial = () => api.get<CambioAjuste[]>(`${BASE}/ajustes/historial`)
export const updateAjuste = (key: string, valor: string | number | boolean) =>
  api.put<{ key: string; valor: string; cambio: boolean }>(`${BASE}/ajustes/${key}`, { valor })

// ── Conexiones ─────────────────────────────────────────────────────────────
export const getConexiones = () => api.get<Conexion[]>(`${BASE}/ajustes/conexiones`)
export const createConexion = (data: ConexionDatos) => api.post<Conexion>(`${BASE}/ajustes/conexiones`, data)
export const updateConexion = (id: string, data: ConexionDatos) => api.patch<Conexion>(`${BASE}/ajustes/conexiones/${id}`, data)
export const deleteConexion = (id: string) => api.delete(`${BASE}/ajustes/conexiones/${id}`)
export const regenerarTokenConexion = (id: string) => api.post<{ token_entrada: string }>(`${BASE}/ajustes/conexiones/${id}/regenerar-token`)
export const probarConexion = (id: string) =>
  api.post<{ ok: boolean; status: number | null; ms: number | null; mensaje: string }>(`${BASE}/ajustes/conexiones/${id}/probar`)
export const addEmpresaConexion = (id: string, data: { clave: string; nombre?: string; company_id?: string | null }) =>
  api.post<EmpresaConexion>(`${BASE}/ajustes/conexiones/${id}/empresas`, data)
export const updateEmpresaConexion = (id: string, empresaId: string, data: { nombre?: string; company_id?: string | null; activa?: boolean }) =>
  api.patch<EmpresaConexion>(`${BASE}/ajustes/conexiones/${id}/empresas/${empresaId}`, data)
export const removeEmpresaConexion = (id: string, empresaId: string) => api.delete(`${BASE}/ajustes/conexiones/${id}/empresas/${empresaId}`)

// ── Usuarios de plataformas ───────────────────────────────────────────────
export const getUsuariosPlataforma = (params?: { conexion_id?: string; pendientes?: boolean; q?: string }) =>
  api.get<UsuarioPlataforma[]>(`${BASE}/ajustes/usuarios`, { params })
export const buscarUsuariosIntranet = (q: string) => api.get<UsuarioIntranet[]>(`${BASE}/ajustes/usuarios/buscar-intranet`, { params: { q } })
export const guardarUsuarioPlataforma = (data: { conexion_id: string; id_externo: string; login_externo?: string | null; email?: string | null; nombre?: string | null; user_id?: string | null }) =>
  api.post<UsuarioPlataforma>(`${BASE}/ajustes/usuarios`, data)
export const quitarUsuarioPlataforma = (id: string) => api.delete(`${BASE}/ajustes/usuarios/${id}`)
