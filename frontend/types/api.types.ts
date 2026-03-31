// ── Respuesta base del API ────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean
  message: string
  timestamp: string
  data?: T
}

export interface PaginationMeta {
  total: number
  page: number
  per_page: number
  total_pages: number
  has_next: boolean
  has_prev: boolean
}

export interface PaginatedResponse<T> {
  success: boolean
  message: string
  timestamp: string
  data: {
    data: T[]
    meta: PaginationMeta
  }
}

export interface ErrorResponse {
  success: false
  error_code: string
  message: string
  detail: unknown
  path: string
}

// ── Parámetros de paginación ──────────────────────────────────────────────────

export interface PaginationParams {
  page?: number
  per_page?: number
}