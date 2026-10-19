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
  activo: boolean; version: number; correos: Record<string, unknown> | null; resumen: ResumenConfig | null; hoja: HojaCfg | null; grupos: number; instancias_activas: number; updated_at: string | null
}
export interface CampoResumen { clave: string; etiqueta: string; tipo: 'texto' | 'moneda' | 'numero' | 'fecha' }
export interface ResumenConfig { numero: string; campos: CampoResumen[] }
export interface ResumenTramite { numero: string; numero_es_folio: boolean; campos: (CampoResumen & { valor: string })[]; texto: string }
export interface SeccionesTramite { escalares: { clave: string; etiqueta: string; valor: string }[]; tablas: { clave: string; titulo: string; columnas: string[]; filas: Record<string, string>[] }[] }
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
export const updateFlujo = (id: string, data: { process_id?: string; aliases?: string[]; nombre?: string; descripcion?: string | null; result_service?: string; activo?: boolean; resumen?: ResumenConfig }) =>
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

// ── Trámites (Bandeja, Seguimiento, página pública) ────────────────────────
export interface EtapaTramite {
  id: string; orden: number; nombre: string; tipo: string; puesto_esperado: string | null; condicion: string | null
  aprobador_user_id: string | null; aprobador_nombre: string; aprobador_email: string | null; suplente_user_id: string | null; suplente_nombre: string | null
  status: 'pendiente' | 'en_turno' | 'aprobada' | 'rechazada' | 'omitida' | 'no_alcanzada' | 'reasignada'; nota: string | null
  decidio_user_id: string | null; decidio_nombre: string | null; decidio_id_externo: string | null; decidio_en: string | null; comentario: string | null; en_turno_desde: string | null
}
export interface Tramite {
  id: string; folio: string; flujo_id: string; flujo_nombre: string | null; process_id: string; result_service: string
  conexion_id: string; conexion_titulo: string | null; conexion_slug: string | null; external_key: string
  company_group: string; tenant_id: string; company_name: string; origen_clave: string
  requester: { id: string; login: string | null; user_id: string | null; name: string; email: string | null }
  card_data: Record<string, unknown>; grupo_nombre: string
  status: 'en_aprobacion' | 'aprobada' | 'rechazada' | 'sustituida' | 'cancelada' | 'error_configuracion'
  etapa_actual: number | null; approved: boolean | null; decidida_en: string | null
  afectacion: 'pendiente' | 'aplicada' | 'fallida' | null; afectada_en: string | null; mensaje_plataforma: string | null
  sustituida_por_id: string | null; created_at: string | null; updated_at: string | null
  etapa_en_turno?: EtapaTramite | null; me_toca?: boolean; total?: number | null; resumen?: ResumenTramite
}
export interface ArchivoTramite { id: string; tipo: string; nombre: string; mime_type: string | null; size_bytes: number | null; sha256: string | null; uploaded_at: string; url?: string | null }
export interface BitacoraTramite { accion: string; por: string; rol: string; fecha: string; detail: Record<string, unknown> | null }
export interface CorreoTramite { id: string; plantilla: string; para: string | null; email: string; fecha: string; resultado: string; reenvio: boolean }
export interface Transaccion {
  id: string; instancia_id: string | null; folio: string | null; direccion: 'entrada' | 'salida'; tipo: string
  estado: 'recibido' | 'pendiente_envio' | 'enviado' | 'error' | 'abandonado'; intento: number; proximo_intento: string | null
  respuesta_status: number | null; respuesta_body: string | null; error: string | null; created_at: string | null; updated_at: string | null; payload?: unknown
}
export interface TramiteDetalle extends Tramite {
  etapas: EtapaTramite[]; archivos: ArchivoTramite[]; bitacora: BitacoraTramite[]; correos: CorreoTramite[]; transacciones: Transaccion[]
  puedo_decidir: boolean; puedo_administrar: boolean; soy_solicitante: boolean
  vista: 'administrador' | 'solicitante' | 'aprobador'; total_etapas: number; mi_etapa?: EtapaTramite | null
  secciones: SeccionesTramite; resumen_config: ResumenConfig | null; hoja: HojaTramite
  liga?: { estado: 'vigente' | 'usada' | 'invalidada' | 'vencida' | 'cerrada'; etapa_orden: number; etapa_nombre: string; expira: string; decido_como: string; mensaje: string }
}
export interface Resumen { me_toca: number; en_aprobacion: number; sin_aplicar: number; error_configuracion: number; mis_tramites: number; ultimos: Tramite[]; ve_todo: boolean }

export const getBandeja = (filtro: 'mias' | 'decididas' | 'participo', q = '') => api.get<Tramite[]>(`${BASE}/bandeja`, { params: { filtro, q } })
export const getTramite = (id: string) => api.get<TramiteDetalle>(`${BASE}/bandeja/${id}`)
export const decidirTramite = (id: string, data: { aprobar: boolean; comentario?: string }) => api.post<TramiteDetalle>(`${BASE}/bandeja/${id}/decidir`, data)
export const getResumen = () => api.get<Resumen>(`${BASE}/seguimiento/resumen`)
export const getTramites = (params: { status?: string; flujo_id?: string; origen_clave?: string; q?: string }) => api.get<Tramite[]>(`${BASE}/seguimiento/instancias`, { params })
export const reasignarTramite = (id: string, data: { user_id: string; nombre: string; email?: string | null; motivo: string }) => api.post<TramiteDetalle>(`${BASE}/seguimiento/instancias/${id}/reasignar`, data)
export const reprocesarTramite = (id: string) => api.post<TramiteDetalle>(`${BASE}/seguimiento/instancias/${id}/reprocesar`)
export const reenviarAviso = (id: string) => api.post<TramiteDetalle>(`${BASE}/seguimiento/instancias/${id}/reenviar-aviso`)
export const getTransacciones = (params: { estado?: string; instancia_id?: string }) => api.get<Transaccion[]>(`${BASE}/seguimiento/transacciones`, { params })
export const getTransaccion = (id: string) => api.get<Transaccion>(`${BASE}/seguimiento/transacciones/${id}`)
export const reenviarTransaccion = (id: string) => api.post<{ estado: string; status: number | null; error: string | null; mensaje: string | null }>(`${BASE}/seguimiento/transacciones/${id}/reenviar`)
export const getLigaPublica = (token: string) => api.get<TramiteDetalle>(`${BASE}/public/aprobar/${token}`)
export const decidirPorLiga = (token: string, data: { aprobar: boolean; comentario?: string }) => api.post<{ ok: boolean; status: string; folio: string; mensaje: string }>(`${BASE}/public/aprobar/${token}/decidir`, data)

// ── Hoja del trámite (plantilla por flujo) ─────────────────────────────────
export type TipoCampoHoja = 'texto' | 'moneda' | 'numero' | 'fecha' | 'porcentaje'
export interface CampoHojaCfg { clave: string; etiqueta: string; tipo: TipoCampoHoja }
export interface ColumnaHojaCfg extends CampoHojaCfg { alinear: 'izq' | 'centro' | 'der'; detalle: string }
export interface TotalHojaCfg extends CampoHojaCfg { destacado: boolean }
export interface TablaHojaCfg { clave: string; titulo: string; columnas: ColumnaHojaCfg[]; totales: TotalHojaCfg[] }
export interface HojaCfg {
  documento: { etiqueta: string; numero: string; area: string }
  tarjetas: CampoHojaCfg[]; adjuntos: boolean; tablas: TablaHojaCfg[]
}
export interface HojaTramite {
  cabecera: { flujo: string; etiqueta: string; numero: string; numero_es_folio: boolean; folio: string; fecha: string; empresa: string; solicitado_por: string; area: string; grupo: string; filial: string }
  estatus: { texto: string; tono: 'turno' | 'ok' | 'no' | 'aviso' | 'neutro' }
  tarjetas: { etiqueta: string; valor: string }[]
  adjuntos: { id: string; nombre: string; ext: string; tamano: string; url: string | null }[]
  tablas: { titulo: string; columnas: { etiqueta: string; alinear: string; tipo: string }[]; filas: { valor: string; detalle: string }[][]; totales: { etiqueta: string; valor: string; destacado: boolean }[]; col_total: number }[]
}
export const getHojaSugerida = (flujoId: string) => api.get<{ hoja: HojaCfg; folio: string; claves: string[] }>(`${BASE}/flujos/${flujoId}/hoja/sugerida`)
export const previsualizarHoja = (flujoId: string, hoja: HojaCfg | null) => api.post<{ hoja: HojaTramite; pagina_html: string; correo_html: string; folio: string }>(`${BASE}/flujos/${flujoId}/hoja/vista-previa`, { hoja })
export const probarHoja = (flujoId: string, hoja: HojaCfg | null) => api.post<{ ok: boolean; para: string }>(`${BASE}/flujos/${flujoId}/hoja/prueba`, { hoja })
export const guardarHoja = (flujoId: string, hoja: HojaCfg) => api.patch<FlujoDetalle>(`${BASE}/flujos/${flujoId}`, { hoja })
