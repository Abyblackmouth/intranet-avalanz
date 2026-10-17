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

// ── Flujos ─────────────────────────────────────────────────────────────────
export interface EtapaDef {
  id: string; orden: number; nombre: string; tipo: 'aprobacion' | 'notificacion' | 'revision'; puesto_esperado: string | null
  tipo_resolucion: string; aprobador_user_id: string | null; aprobador_nombre: string; aprobador_email: string | null
  suplente_user_id: string | null; suplente_nombre: string | null; suplente_email: string | null; condicion: string | null
  comentario_rechazo_obligatorio: boolean; permite_adjuntos: boolean
}
export interface MiembroDef { id: string; user_id: string | null; login_externo: string | null; nombre: string }
export interface GrupoDef {
  id: string; origen_clave: string; nombre: string; es_default: boolean; auto_aprobacion: 'omitir' | 'subir'; activo: boolean; orden: number
  etapas: EtapaDef[]; miembros: MiembroDef[]
}
export interface Flujo {
  id: string; process_id: string; aliases: string[]; nombre: string; descripcion: string | null
  conexion_id: string; conexion_titulo: string | null; conexion_slug: string | null; result_service: string
  activo: boolean; version: number; correos: Record<string, unknown> | null; grupos: number; instancias_activas: number; updated_at: string | null
}
export interface FlujoDetalle extends Flujo {
  grupos_detalle: GrupoDef[]; instancias_total: number
  empresas_conexion: { clave: string; nombre: string; activa: boolean }[]
}
export interface EtapaSimulada {
  orden: number; nombre: string; tipo: string; puesto_esperado: string | null; condicion: string | null
  aprobador_user_id: string | null; aprobador_nombre: string; suplente_nombre: string | null
  status: 'pendiente' | 'en_turno' | 'omitida'; nota: string
}
export interface Simulacion {
  via: 'miembro' | 'default' | 'sin_grupo'; grupo: { id: string; nombre: string; es_default: boolean } | null
  etapas: EtapaSimulada[]; primer_aviso: EtapaSimulada | null; resultado: 'en_aprobacion' | 'aprobada' | 'error_configuracion'; mensaje: string
}
export interface VersionFlujo { id: string; numero: number; vigente: boolean; creada_por: string; creada_en: string; grupos: number }

export type EtapaDatos = Partial<Omit<EtapaDef, 'id' | 'orden' | 'tipo_resolucion'>> & { quitar_suplente?: boolean; mover?: 'subir' | 'bajar' }

export const getFlujos = () => api.get<Flujo[]>(`${BASE}/flujos`)
export const getFlujo = (id: string) => api.get<FlujoDetalle>(`${BASE}/flujos/${id}`)
export const createFlujo = (data: { conexion_id: string; process_id: string; nombre: string; descripcion?: string; result_service?: string; activo?: boolean }) =>
  api.post<Flujo>(`${BASE}/flujos`, data)
export const updateFlujo = (id: string, data: { process_id?: string; aliases?: string[]; nombre?: string; descripcion?: string | null; result_service?: string; activo?: boolean }) =>
  api.patch<FlujoDetalle>(`${BASE}/flujos/${id}`, data)
export const deleteFlujo = (id: string) => api.delete(`${BASE}/flujos/${id}`)
export const getFlujoVersiones = (id: string) => api.get<VersionFlujo[]>(`${BASE}/flujos/${id}/versiones`)
export const simularFlujo = (id: string, data: { origen_clave: string; requester_user_id?: string | null; card_data: Record<string, unknown> }) =>
  api.post<Simulacion>(`${BASE}/flujos/${id}/simular`, data)
export const buscarUsuariosFlujos = (q: string) => api.get<UsuarioIntranet[]>(`${BASE}/flujos/catalogos/usuarios`, { params: { q } })

export const createGrupo = (flujoId: string, data: { origen_clave: string; nombre: string; es_default?: boolean; auto_aprobacion?: 'omitir' | 'subir'; activo?: boolean }) =>
  api.post<FlujoDetalle>(`${BASE}/flujos/${flujoId}/grupos`, data)
export const updateGrupo = (flujoId: string, grupoId: string, data: { origen_clave?: string; nombre?: string; es_default?: boolean; auto_aprobacion?: 'omitir' | 'subir'; activo?: boolean }) =>
  api.patch<FlujoDetalle>(`${BASE}/flujos/${flujoId}/grupos/${grupoId}`, data)
export const deleteGrupo = (flujoId: string, grupoId: string) => api.delete<FlujoDetalle>(`${BASE}/flujos/${flujoId}/grupos/${grupoId}`)
export const addMiembro = (flujoId: string, grupoId: string, data: { user_id: string; nombre: string; login_externo?: string | null }) =>
  api.post<FlujoDetalle>(`${BASE}/flujos/${flujoId}/grupos/${grupoId}/miembros`, data)
export const removeMiembro = (flujoId: string, grupoId: string, miembroId: string) => api.delete<FlujoDetalle>(`${BASE}/flujos/${flujoId}/grupos/${grupoId}/miembros/${miembroId}`)
export const createEtapa = (flujoId: string, grupoId: string, data: EtapaDatos) => api.post<FlujoDetalle>(`${BASE}/flujos/${flujoId}/grupos/${grupoId}/etapas`, data)
export const updateEtapa = (flujoId: string, grupoId: string, etapaId: string, data: EtapaDatos) => api.patch<FlujoDetalle>(`${BASE}/flujos/${flujoId}/grupos/${grupoId}/etapas/${etapaId}`, data)
export const deleteEtapa = (flujoId: string, grupoId: string, etapaId: string) => api.delete<FlujoDetalle>(`${BASE}/flujos/${flujoId}/grupos/${grupoId}/etapas/${etapaId}`)
export interface ConexionResumen { id: string; slug: string; titulo: string; activa: boolean; empresas: { clave: string; nombre: string }[] }
export const getConexionesFlujos = () => api.get<ConexionResumen[]>(`${BASE}/flujos/catalogos/conexiones`)
