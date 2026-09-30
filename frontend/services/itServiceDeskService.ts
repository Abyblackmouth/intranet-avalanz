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
export const getIncidents = (params?: { status?: string; severity_id?: string; search?: string; order?: string; limit?: number; offset?: number }) =>
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
