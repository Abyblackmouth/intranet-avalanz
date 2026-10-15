import { useAuthStore } from '@/store/authStore'

// ─────────────────────────────────────────────────────────────────────────────
// QUIEN ve que. El backend tambien lo exige: esto solo evita mostrar lo que no se puede usar.
// ─────────────────────────────────────────────────────────────────────────────

/** Submodulos que solo ve el super admin ("modulo/submodulo"). */
export const SOLO_SUPER_ADMIN = new Set(['it-service-desk/ajustes'])

/** Submodulos restringidos a ciertos roles. Super admin ve todo siempre: la regla aplica hacia abajo. */
export const SUBMODULO_ROLES: Record<string, string[]> = {
  // Reportes para presentacion: administradores, Incident Manager y Project Manager
  'it-service-desk/reportes': ['admin_empresa', 'it-service-desk:incident-manager', 'it-service-desk:project-manager'],
  'it-service-desk/actualizaciones': ['it-service-desk:incident-manager'],
}

/** Paginas de administracion que solo ve el super admin (Admin Empresa ve Usuarios y Empresas). */
export const ADMIN_SOLO_SUPER = new Set(['/admin/groups', '/admin/modules', '/admin/roles', '/admin/permissions'])

export function puedeVerSubmodulo(clave: string): boolean {
  const st: any = useAuthStore.getState()
  if (st.isSuperAdmin?.()) return true
  if (SOLO_SUPER_ADMIN.has(clave)) return false
  const permitidos = SUBMODULO_ROLES[clave]
  if (!permitidos) return true
  const roles: string[] = st.user?.roles ?? []
  return permitidos.some(r => roles.includes(r))
}
