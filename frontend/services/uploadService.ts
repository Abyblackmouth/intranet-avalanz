import api from '@/services/api'

// ── Archivos de usuario ───────────────────────────────────────────────────────

export const getUserFiles = (userId: string) =>
  api.get(`/api/v1/users/${userId}/files`)

export const uploadUserFile = (userId: string, formData: FormData) =>
  api.post(`/api/v1/users/${userId}/files`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

export const downloadUserFile = (userId: string, fileId: string) =>
  api.get(`/api/v1/users/${userId}/files/${fileId}/download`)

export const deleteUserFile = (userId: string, fileId: string, reason: string) =>
  api.delete(`/api/v1/users/${userId}/files/${fileId}`, {
    params: { reason },
  })

export const getFileAudit = (userId: string, fileId: string) =>
  api.get(`/api/v1/users/${userId}/files/${fileId}/audit`)

// ── Subida directa al upload-service ─────────────────────────────────────────

export const uploadToStorage = (formData: FormData) =>
  api.post(`/api/v1/upload/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

export const getSignedUrl = (objectKey: string, bucket: string) =>
  api.get(`/api/v1/upload/signed-url`, {
    params: { object_key: objectKey, bucket },
  })

export const deleteFromStorage = (objectKey: string, bucket: string) =>
  api.delete(`/api/v1/upload/`, {
    params: { object_key: objectKey, bucket },
  })
