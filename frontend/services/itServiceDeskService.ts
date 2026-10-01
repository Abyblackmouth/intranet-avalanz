import api from './api'

const BASE = '/api/v1/it-service-desk/actualizaciones'

// ── Sistemas ──────────────────────────────────────────────────────────────
export const getSystems = () => api.get(`${BASE}/sistemas`)
export const createSystem = (data: { name: string; is_active?: boolean }) =>
  api.post(`${BASE}/sistemas`, data)
export const updateSystem = (id: string, data: { name: string; is_active?: boolean }) =>
  api.patch(`${BASE}/sistemas/${id}`, data)

// ── Módulos ───────────────────────────────────────────────────────────────
export const getModulesCatalog = (systemId?: string) =>
  api.get(`${BASE}/modulos`, { params: systemId ? { system_id: systemId } : {} })
export const createModuleCatalog = (data: { system_id: string; name: string; is_active?: boolean }) =>
  api.post(`${BASE}/modulos`, data)
export const updateModuleCatalog = (id: string, data: { system_id: string; name: string; is_active?: boolean }) =>
  api.patch(`${BASE}/modulos/${id}`, data)

// ── Especialistas ─────────────────────────────────────────────────────────
export const getSpecialists = () => api.get(`${BASE}/especialistas`)
export const createSpecialist = (data: {
  system_id?: string | null
  module_id?: string | null
  team_type: string
  specialist_user_id: string
  is_active?: boolean
}) => api.post(`${BASE}/especialistas`, data)
export const updateSpecialist = (id: string, data: {
  system_id?: string | null
  module_id?: string | null
  team_type: string
  specialist_user_id: string
  is_active?: boolean
}) => api.patch(`${BASE}/especialistas/${id}`, data)

// ── Usuarios por rol (para el desplegable de "asignar tecnico") ───────────
export const getUsersByRole = (roleSlug: string) =>
  api.get(`/api/v1/it-service-desk/actualizaciones/usuarios-por-rol`, { params: { role_slug: roleSlug } })

// ── Incidencias (tickets) ─────────────────────────────────────────────────
export const getIncidents = (params?: { status?: string; severity_id?: string; search?: string; order?: string; limit?: number; offset?: number; excluir_tipo?: string }) =>
  api.get('/api/v1/it-service-desk/mesa-de-soporte/incidencias', { params })

export const reopenIncident = (incidentId: string, reason: string) =>
  api.post(`/api/v1/it-service-desk/mesa-de-soporte/incidencias/${incidentId}/reabrir`, { reason })

export const closeIncident = (incidentId: string) =>
  api.post(`/api/v1/it-service-desk/mesa-de-soporte/incidencias/${incidentId}/cerrar`)

export const getIncidentDetail = (id: string) =>
  api.get(`/api/v1/it-service-desk/mesa-de-soporte/incidencias/${id}`)

export const createIncident = (formData: FormData) =>
  api.post('/api/v1/it-service-desk/mesa-de-soporte/incidencias', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

export const assignIncident = (id: string, data: { assigned_team: string; assigned_to_user_id: string }) =>
  api.patch(`/api/v1/it-service-desk/mesa-de-soporte/incidencias/${id}/asignar`, data)

export const getSeverities = () => api.get('/api/v1/it-service-desk/mesa-de-soporte/severidades')

// ── Dashboard de metricas ──────────────────────────────────────────────────
export const getDashboardStats = (params?: { date_from?: string; date_to?: string }) =>
  api.get('/api/v1/it-service-desk/mesa-de-soporte/estadisticas', { params })

// ── Exportar concentrado a Excel ────────────────────────────────────────────
export const exportIncidentsExcel = () =>
  api.get('/api/v1/it-service-desk/mesa-de-soporte/reportes/incidencias-excel', { responseType: 'blob' })

// ── Resolver estando logueado ───────────────────────────────────────────────
export const resolveIncident = (incidentId: string, data: FormData) =>
  api.post(`/api/v1/it-service-desk/mesa-de-soporte/incidencias/${incidentId}/resolver`, data, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

// ── Control de Cambios ──────────────────────────────────────────────────────
export const createControlCambio = (data: {
  system_id: string
  module_id?: string
  area_departamento: string
  tipo_solicitud: string
  titulo: string
  descripcion_detallada: string
  justificacion: string
  impacto_si_no_se_realiza: string
  urgencia_solicitada: string
  fecha_requerida?: string
  comentarios_adicionales?: string
}) => api.post('/api/v1/it-service-desk/control-cambios', data)

export const getDepartamentos = () =>
  api.get('/api/v1/it-service-desk/control-cambios/departamentos')


export const getMiPerfilCDC = () =>
  api.get('/api/v1/it-service-desk/control-cambios/mi-perfil')

// ── Control de Cambios ────────────────────────────────────────────────────
export const getControlCambioDetail = (id: string) =>
  api.get(`/api/v1/it-service-desk/control-cambios/${id}`)
export const submitCdcRevision = (id: string, formData: FormData) =>
  api.post(`/api/v1/it-service-desk/control-cambios/${id}/revision`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
export const submitCdcPriorizacion = (id: string, formData: FormData) =>
  api.post(`/api/v1/it-service-desk/control-cambios/${id}/priorizacion`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
export const searchCdcUsuarios = (q: string) =>
  api.get(`/api/v1/it-service-desk/control-cambios/catalogos/usuarios`, { params: { q } })

// ── Arranque de CDC ───────────────────────────────────────────────────────
const CDC = '/api/v1/it-service-desk/control-cambios'
export const getArranque = (id: string) => api.get(`${CDC}/${id}/arranque`)
export const setArranqueClasificacion = (id: string, clasificacion: string) =>
  api.put(`${CDC}/${id}/arranque/clasificacion`, { clasificacion })
export const saveArranqueBorrador = (id: string, tipo: string, datos: any) =>
  api.put(`${CDC}/${id}/arranque/${tipo}/borrador`, { datos })
export const generarArranqueDoc = (id: string, tipo: string) =>
  api.post(`${CDC}/${id}/arranque/${tipo}/generar`)
export const subirArranqueDoc = (id: string, tipo: string, formData: FormData) =>
  api.post(`${CDC}/${id}/arranque/${tipo}/archivo`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
export const iniciarDesarrollo = (id: string) => api.post(`${CDC}/${id}/arranque/cerrar`)  // cierra el arranque -> Diseño funcional

// ── Diseño funcional y técnico ────────────────────────────────────────────
export const getDiseno = (id: string, fase: string) => api.get(`${CDC}/${id}/diseno/${fase}`)
export const saveDisenoBorrador = (id: string, fase: string, datos: any) => api.put(`${CDC}/${id}/diseno/${fase}/borrador`, { datos })
export const generarDiseno = (id: string, fase: string) => api.post(`${CDC}/${id}/diseno/${fase}/generar`)
export const cerrarDiseno = (id: string, fase: string) => api.post(`${CDC}/${id}/diseno/${fase}/cerrar`)
export const getDisenoCandidatos = (id: string) => api.get(`${CDC}/${id}/diseno/candidatos`)
export const reasignarDiseno = (id: string, userId: string) => api.patch(`${CDC}/${id}/diseno/asignar`, { user_id: userId })

// ── En desarrollo ─────────────────────────────────────────────────────────
export const getDesarrollo = (id: string) => api.get(`${CDC}/${id}/desarrollo`)
export const registrarAvance = (id: string, formData: FormData) =>
  api.post(`${CDC}/${id}/desarrollo/avance`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
export const saveEntregaBorrador = (id: string, datos: any) => api.put(`${CDC}/${id}/desarrollo/entrega/borrador`, { datos })
export const generarEntrega = (id: string) => api.post(`${CDC}/${id}/desarrollo/entrega/generar`)
export const liberarPruebas = (id: string) => api.post(`${CDC}/${id}/desarrollo/liberar`)
export const getDesarrolloCandidatos = (id: string) => api.get(`${CDC}/${id}/desarrollo/candidatos`)
export const reasignarDesarrollo = (id: string, userId: string) => api.patch(`${CDC}/${id}/desarrollo/asignar`, { user_id: userId })

// ── En pruebas (UAT) ──────────────────────────────────────────────────────
export const getUat = (id: string) => api.get(`${CDC}/${id}/uat`)
export const saveUatBorrador = (id: string, body: { resultados: Record<string, { cumple: boolean | null; comentario: string }>; comentario_general: string }) =>
  api.put(`${CDC}/${id}/uat/borrador`, body)
export const subirEvidenciaUat = (id: string, formData: FormData) =>
  api.post(`${CDC}/${id}/uat/evidencia`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
export const quitarEvidenciaUat = (id: string, criterioId: string, objectKey: string) =>
  api.patch(`${CDC}/${id}/uat/evidencia/quitar`, { criterio_id: criterioId, object_key: objectKey })
export const emitirUat = (id: string, resultado: 'aceptar' | 'regresar') => api.post(`${CDC}/${id}/uat/emitir`, { resultado })

// ── Paso a producción ─────────────────────────────────────────────────────
export const getProduccion = (id: string) => api.get(`${CDC}/${id}/produccion`)
export const confirmarProduccion = (id: string, formData: FormData) =>
  api.post(`${CDC}/${id}/produccion/confirmar`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })

// ── Terminado: acta de cierre y encuesta ──────────────────────────────────
export const getCierre = (id: string) => api.get(`${CDC}/${id}/cierre`)
export const responderEncuesta = (id: string, body: { satisfaccion: number; cumplio: string; a_tiempo: string; comentarios: string | null }) =>
  api.post(`${CDC}/${id}/cierre/encuesta`, body)
export const saveActaCierreBorrador = (id: string, datos: any) => api.put(`${CDC}/${id}/cierre/acta/borrador`, { datos })
export const generarActaCierre = (id: string) => api.post(`${CDC}/${id}/cierre/acta/generar`)
export const subirActaCierreFirmada = (id: string, formData: FormData) =>
  api.post(`${CDC}/${id}/cierre/acta-firmada`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })

// ── Tablero Proyectos ─────────────────────────────────────────────────────
export const getTableroProyectos = () => api.get(`${CDC}/tablero/proyectos`)
export const exportCdcExcel = () => api.get(`${CDC}/reportes/excel`, { responseType: 'blob' })

// ── Ajustes del módulo (solo super admin) ─────────────────────────────────
export const getAjustes = () => api.get('/api/v1/it-service-desk/ajustes')
export const getAjustesHistorial = () => api.get('/api/v1/it-service-desk/ajustes/historial')
export const updateAjuste = (key: string, valor: string | number | boolean) =>
  api.put(`/api/v1/it-service-desk/ajustes/${encodeURIComponent(key)}`, { valor })

// ── Control de accesos: configuración de formatos ─────────────────────────
const ACC = '/api/v1/it-service-desk/control-accesos/config'
export const accFormatos = () => api.get(`${ACC}/formatos`)
export const accFormato = (id: string) => api.get(`${ACC}/formatos/${id}`)
export const accActualizarFormato = (id: string, data: Record<string, any>) => api.patch(`${ACC}/formatos/${id}`, data)
export const accGuardarEmpresas = (id: string, company_ids: string[]) => api.put(`${ACC}/formatos/${id}/empresas`, { company_ids })
export const accCrearModulo = (id: string, data: { nombre: string; exclusivo_admin?: boolean }) => api.post(`${ACC}/formatos/${id}/modulos`, data)
export const accActualizarModulo = (moduloId: string, data: Record<string, any>) => api.patch(`${ACC}/modulos/${moduloId}`, data)
export const accOrdenarModulos = (id: string, ids: string[]) => api.put(`${ACC}/formatos/${id}/modulos/orden`, { ids })
export const accCrearPerfil = (moduloId: string, nombre: string) => api.post(`${ACC}/modulos/${moduloId}/perfiles`, { nombre })
export const accRenombrarPerfil = (perfilId: string, nombre: string) => api.patch(`${ACC}/perfiles/${perfilId}`, { nombre })
export const accQuitarPerfil = (perfilId: string) => api.delete(`${ACC}/perfiles/${perfilId}`)
export const accCrearRutina = (moduloId: string, nombre: string) => api.post(`${ACC}/modulos/${moduloId}/rutinas`, { nombre })
export const accActualizarRutina = (rutinaId: string, data: Record<string, any>) => api.patch(`${ACC}/rutinas/${rutinaId}`, data)
export const accQuitarRutina = (rutinaId: string) => api.delete(`${ACC}/rutinas/${rutinaId}`)
export const accBuscarUsuarios = (q: string) => api.get('/api/v1/it-service-desk/control-cambios/catalogos/usuarios', { params: { q } })
export const accVistaPrevia = (id: string, empresas?: string[]) =>
  api.get(`${ACC}/formatos/${id}/vista-previa`, { params: empresas ? { empresas: empresas.join(',') } : {}, responseType: 'text' })

// ── Control de accesos: formulario del solicitante ────────────────────────
export const accFormatosDisponibles = () => api.get('/api/v1/it-service-desk/control-accesos/formatos')
export const accFormulario = (id: string) => api.get(`/api/v1/it-service-desk/control-accesos/formatos/${id}/formulario`)
export const accVistaPreviaSolicitud = (id: string, datos: Record<string, any>) =>
  api.post(`/api/v1/it-service-desk/control-accesos/formatos/${id}/vista-previa`, datos, { responseType: 'text' })
export const accEnviarSolicitud = (id: string, datos: Record<string, any>) =>
  api.post(`/api/v1/it-service-desk/control-accesos/formatos/${id}/solicitudes`, datos)
export const accResumenSolicitud = (incidentId: string) =>
  api.get(`/api/v1/it-service-desk/control-accesos/solicitudes/${incidentId}/resumen`)
export const accGenerarPdfSolicitud = (incidentId: string) =>
  api.post(`/api/v1/it-service-desk/control-accesos/solicitudes/${incidentId}/pdf`)
export const marcarRevisado = (incidentId: string) =>
  api.post(`/api/v1/it-service-desk/mesa-de-soporte/incidencias/${incidentId}/revisado`)

// ── Tablero de SLA ──────────────────────────────────────────────────────────
export const slaSeveridades = () => api.get('/api/v1/it-service-desk/mesa-de-soporte/sla/severidades')
export const ajustarSla = (code: string, data: { response_sla_minutes: number; resolution_sla_hours: number; is_24_7: boolean; rca_mandatory: boolean }) =>
  api.put(`/api/v1/it-service-desk/mesa-de-soporte/sla/severidades/${code}`, data)
