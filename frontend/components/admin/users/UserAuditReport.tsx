'use client'

import { useState } from 'react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { FileDown, Loader2 } from 'lucide-react'
import api from '@/services/api'
import { UserRow } from '@/types/user.types'

interface UserAuditReportProps {
  user: UserRow
}

interface LoginHistoryEntry {
  id: string
  ip_address: string
  user_agent: string
  is_corporate_network: boolean
  success: boolean
  failure_reason: string | null
  requires_2fa: boolean
  completed_2fa: boolean
  created_at: string
}

interface SessionEntry {
  session_id: string
  ip_address: string
  user_agent: string
  is_active: boolean
  session_started_at: string
  last_activity_at: string
}

interface ModuleAccess {
  module_id: string
  module_name: string
  module_slug: string
  role_name: string
  submodules: { name: string; slug: string }[]
}

interface UserDetail {
  user_id: string
  full_name: string
  email: string
  matricula: string | null
  puesto: string | null
  departamento: string | null
  company_name: string
  company_razon_social: string
  company_rfc: string
  roles: string[]
  is_active: boolean
  is_locked: boolean
  is_2fa_configured: boolean
  last_login_at: string | null
  created_at: string
  module_accesses: ModuleAccess[]
}

async function imageToBase64(url: string): Promise<string> {
  const response = await fetch(url)
  const blob = await response.blob()
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.readAsDataURL(blob)
  })
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function parseUserAgent(ua: string): string {
  if (!ua) return '—'
  let browser = 'Desconocido'
  let os = 'Desconocido'
  if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome'
  else if (ua.includes('Firefox')) browser = 'Firefox'
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari'
  else if (ua.includes('Edg')) browser = 'Edge'
  if (ua.includes('Windows')) os = 'Windows'
  else if (ua.includes('Mac')) os = 'macOS'
  else if (ua.includes('Linux')) os = 'Linux'
  else if (ua.includes('Android')) os = 'Android'
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS'
  return `${browser} / ${os}`
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `Hace ${diff}s`
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)}min`
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)}h`
  return `Hace ${Math.floor(diff / 86400)}d`
}

export default function UserAuditReport({ user }: UserAuditReportProps) {
  const [loading, setLoading] = useState(false)

  const generatePDF = async () => {
    setLoading(true)
    try {
      const [detailRes, historyRes, sessionsRes] = await Promise.all([
        api.get(`/api/v1/users/${user.user_id}`),
        api.get(`/api/v1/users/${user.user_id}/login-history`),
        api.get(`/api/v1/users/${user.user_id}/sessions`),
      ])

      const detail: UserDetail = detailRes.data.data
      const history: LoginHistoryEntry[] = historyRes.data.data || []
      const sessions: SessionEntry[] = sessionsRes.data.data || []

      const logoBase64 = await imageToBase64('/logo_200.png')

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageW = doc.internal.pageSize.getWidth()
      const pageH = doc.internal.pageSize.getHeight()

      const BLUE       = [26, 79, 160] as [number, number, number]
      const BLUE_LIGHT = [235, 242, 255] as [number, number, number]
      const SLATE_900  = [15, 23, 42] as [number, number, number]
      const SLATE_600  = [71, 85, 105] as [number, number, number]
      const SLATE_200  = [226, 232, 240] as [number, number, number]
      const SLATE_50   = [248, 250, 252] as [number, number, number]
      const WHITE      = [255, 255, 255] as [number, number, number]
      const GREEN      = [22, 163, 74] as [number, number, number]
      const RED        = [220, 38, 38] as [number, number, number]
      const AMBER      = [217, 119, 6] as [number, number, number]

      const FIELD_H = 11
      const GAP     = 13
      const col1    = 12
      const col2    = pageW / 2 + 2
      const colW    = pageW / 2 - 16
      const fullW   = pageW - 24

      // Draws the page header with logo
      const drawHeader = (title: string, subtitle: string) => {
        doc.setFillColor(...BLUE)
        doc.rect(0, 0, pageW, 42, 'F')
        doc.addImage(logoBase64, 'PNG', 12, 6, 28, 28)
        doc.setTextColor(...WHITE)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(18)
        doc.text(title, 46, 18)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.text(subtitle, 46, 25)
        doc.setFillColor(...BLUE_LIGHT)
        doc.rect(0, 42, pageW, 1.5, 'F')
      }

      // Draws the page footer with page number
      const drawFooter = (pageNum: number, totalPages: number) => {
        const fY = pageH - 12
        doc.setFillColor(...SLATE_50)
        doc.rect(0, fY - 4, pageW, 16, 'F')
        doc.setDrawColor(...SLATE_200)
        doc.setLineWidth(0.3)
        doc.line(12, fY - 4, pageW - 12, fY - 4)
        doc.setTextColor(...SLATE_600)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7.5)
        doc.text('Intranet Avalanz  ·  Documento Confidencial  ·  Uso interno exclusivo', 12, fY + 2)
        doc.text(`Página ${pageNum} de ${totalPages}`, pageW - 12, fY + 2, { align: 'right' })
      }

      // Draws a section title with blue accent bar
      const sectionTitle = (title: string, yPos: number) => {
        doc.setFillColor(...BLUE)
        doc.roundedRect(12, yPos, 4, 6, 1, 1, 'F')
        doc.setTextColor(...BLUE)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(11)
        doc.text(title, 20, yPos + 4.5)
        doc.setDrawColor(...SLATE_200)
        doc.setLineWidth(0.3)
        doc.line(12, yPos + 8, pageW - 12, yPos + 8)
        return yPos + 13
      }

      // Draws a single labeled data field box
      const field = (label: string, value: string, x: number, yPos: number, w: number) => {
        doc.setFillColor(...SLATE_50)
        doc.roundedRect(x, yPos, w, FIELD_H, 1.5, 1.5, 'F')
        doc.setDrawColor(...SLATE_200)
        doc.setLineWidth(0.2)
        doc.roundedRect(x, yPos, w, FIELD_H, 1.5, 1.5, 'S')
        doc.setTextColor(...SLATE_600)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(6)
        doc.text(label.toUpperCase(), x + 3, yPos + 3.8)
        doc.setTextColor(...SLATE_900)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.text(value || '—', x + 3, yPos + 8.5)
      }

      // ════════════════════════════════════════════════
      // PAGE 1 — PERFIL DEL USUARIO
      // ════════════════════════════════════════════════
      drawHeader('Reporte de Perfil y Actividad', 'Intranet Avalanz  ·  Documento Confidencial')

      doc.setFontSize(7.5)
      doc.setTextColor(...BLUE_LIGHT)
      const now = new Date().toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
      doc.text(`Generado: ${now}`, pageW - 14, 16, { align: 'right' })
      doc.text(`ID: ${user.user_id.substring(0, 8).toUpperCase()}`, pageW - 14, 22, { align: 'right' })

      let y = 52
      y = sectionTitle('Información General', y)

      // Avatar with initials
      const initials = detail.full_name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
      doc.setFillColor(...BLUE)
      doc.circle(24, y + 8, 9, 'F')
      doc.setTextColor(...WHITE)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.text(initials, 24, y + 10.5, { align: 'center' })

      doc.setTextColor(...SLATE_900)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      doc.text(detail.full_name, 40, y + 5)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(...SLATE_600)
      doc.text(detail.email, 40, y + 11)

      const statusColor = detail.is_locked ? RED : detail.is_active ? GREEN : SLATE_600
      const statusLabel = detail.is_locked ? 'BLOQUEADO' : detail.is_active ? 'ACTIVO' : 'INACTIVO'
      doc.setFillColor(...statusColor)
      doc.roundedRect(40, y + 13, 20, 5, 1.5, 1.5, 'F')
      doc.setTextColor(...WHITE)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6.5)
      doc.text(statusLabel, 50, y + 16.8, { align: 'center' })

      y += 24

      // Row 1: Empresa | Matrícula
      field('Empresa', detail.company_name, col1, y, colW)
      field('Matrícula', detail.matricula || '—', col2, y, colW)
      y += GAP

      // Row 2: Razón Social — full width
      field('Razón Social', detail.company_razon_social || '—', col1, y, fullW)
      y += GAP

      // Row 3: RFC | 2FA
      field('RFC', detail.company_rfc || '—', col1, y, colW)
      field('2FA', detail.is_2fa_configured ? 'Configurado' : 'Sin configurar', col2, y, colW)
      y += GAP

      // Row 4: Puesto | Departamento
      field('Puesto', detail.puesto || '—', col1, y, colW)
      field('Departamento', detail.departamento || '—', col2, y, colW)
      y += GAP

      // Row 5: Fecha de creación | Último acceso
      field('Fecha de creación', formatDate(detail.created_at), col1, y, colW)
      field('Último acceso', formatDate(detail.last_login_at), col2, y, colW)
      y += GAP

      // Row 6: ID de usuario — full width
      field('ID de usuario', detail.user_id, col1, y, fullW)
      y += GAP + 5

      // ── Roles Globales ──
      y = sectionTitle('Roles Globales', y)

      if (detail.roles && detail.roles.length > 0) {
        let rx = col1
        detail.roles.forEach((role: string) => {
          const bgColor = role === 'super_admin' ? RED : role === 'admin_empresa' ? AMBER : BLUE
          doc.setFillColor(...bgColor)
          doc.roundedRect(rx, y, 38, 7, 2, 2, 'F')
          doc.setTextColor(...WHITE)
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(7)
          doc.text(role.replace(/_/g, ' ').toUpperCase(), rx + 19, y + 4.8, { align: 'center' })
          rx += 42
        })
        y += 14
      } else {
        doc.setTextColor(...SLATE_600)
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(9)
        doc.text('Sin roles globales asignados', col1, y + 4)
        y += 12
      }

      // ── Módulos y Submódulos ──
      y = sectionTitle('Accesos a Módulos y Submódulos', y)

      if (detail.module_accesses && detail.module_accesses.length > 0) {
        autoTable(doc, {
          startY: y,
          head: [['Módulo', 'Rol Asignado', 'Submódulos']],
          body: detail.module_accesses.map((m: ModuleAccess) => [
            m.module_name || m.module_slug,
            m.role_name || '—',
            m.submodules?.length > 0 ? m.submodules.map(s => s.name || s.slug).join(', ') : '—',
          ]),
          margin: { left: 12, right: 12 },
          styles: { fontSize: 8, cellPadding: 3.5, textColor: SLATE_900, lineColor: SLATE_200, lineWidth: 0.2 },
          headStyles: { fillColor: BLUE, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
          alternateRowStyles: { fillColor: SLATE_50 },
          columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 40 },
            1: { cellWidth: 45 },
            2: { cellWidth: 'auto' },
          },
        })
        y = (doc as any).lastAutoTable.finalY + 8
      } else {
        doc.setTextColor(...SLATE_600)
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(9)
        doc.text('Sin módulos asignados', col1, y + 4)
        y += 12
      }

      drawFooter(1, 3)

      // ════════════════════════════════════════════════
      // PAGE 2 — HISTORIAL DE SESIONES
      // ════════════════════════════════════════════════
      doc.addPage()
      drawHeader('Historial de Sesiones', `${detail.full_name}  ·  ${detail.email}`)
      y = 52

      y = sectionTitle('Sesiones Activas', y)

      if (sessions.length > 0) {
        autoTable(doc, {
          startY: y,
          head: [['IP', 'Dispositivo / Navegador', 'Inicio de sesión', 'Última actividad']],
          body: sessions.map((s: SessionEntry) => [
            s.ip_address || '—',
            parseUserAgent(s.user_agent),
            formatDate(s.session_started_at),
            timeAgo(s.last_activity_at),
          ]),
          margin: { left: 12, right: 12 },
          styles: { fontSize: 8, cellPadding: 3.5, textColor: SLATE_900, lineColor: SLATE_200, lineWidth: 0.2 },
          headStyles: { fillColor: BLUE, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
          alternateRowStyles: { fillColor: SLATE_50 },
          columnStyles: {
            0: { cellWidth: 32 },
            1: { cellWidth: 55 },
            2: { cellWidth: 45 },
            3: { cellWidth: 'auto' },
          },
        })
        y = (doc as any).lastAutoTable.finalY + 12
      } else {
        doc.setFillColor(...SLATE_50)
        doc.roundedRect(12, y, pageW - 24, 12, 2, 2, 'F')
        doc.setTextColor(...SLATE_600)
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(9)
        doc.text('No hay sesiones activas en este momento', pageW / 2, y + 7.5, { align: 'center' })
        y += 18
      }

      y = sectionTitle('Historial de Accesos', y)

      const totalH   = history.length
      const exitosos = history.filter((h: LoginHistoryEntry) => h.success).length
      const fallidos = history.filter((h: LoginHistoryEntry) => !h.success).length
      const corporativos = history.filter((h: LoginHistoryEntry) => h.is_corporate_network).length

      const bw = (pageW - 24 - 9) / 4
      const statBox = (label: string, value: number, color: [number, number, number], x: number) => {
        doc.setFillColor(...color)
        doc.roundedRect(x, y, bw, 16, 2, 2, 'F')
        doc.setTextColor(...WHITE)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(16)
        doc.text(String(value), x + bw / 2, y + 10, { align: 'center' })
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        doc.text(label, x + bw / 2, y + 14.5, { align: 'center' })
      }

      statBox('Total', totalH, BLUE, 12)
      statBox('Exitosos', exitosos, GREEN, 12 + bw + 3)
      statBox('Fallidos', fallidos, RED, 12 + (bw + 3) * 2)
      statBox('Red Corporativa', corporativos, AMBER, 12 + (bw + 3) * 3)
      y += 22

      if (history.length > 0) {
        autoTable(doc, {
          startY: y,
          head: [['Fecha y Hora', 'IP', 'Dispositivo', 'Red', 'Resultado', '2FA sesión']],
          body: history.slice(0, 40).map((h: LoginHistoryEntry) => [
            formatDate(h.created_at),
            h.ip_address || '—',
            parseUserAgent(h.user_agent),
            h.is_corporate_network ? 'Corporativa' : 'Externa',
            h.success ? 'Exitoso' : `Fallido${h.failure_reason ? ` (${h.failure_reason})` : ''}`,
            h.requires_2fa ? (h.completed_2fa ? 'Completado' : 'Pendiente') : 'No aplicó',
          ]),
          margin: { left: 12, right: 12 },
          styles: { fontSize: 7.5, cellPadding: 3, textColor: SLATE_900, lineColor: SLATE_200, lineWidth: 0.2 },
          headStyles: { fillColor: BLUE, textColor: WHITE, fontStyle: 'bold', fontSize: 7.5 },
          alternateRowStyles: { fillColor: SLATE_50 },
          columnStyles: {
            0: { cellWidth: 33 },
            1: { cellWidth: 28 },
            2: { cellWidth: 42 },
            3: { cellWidth: 24 },
            4: { cellWidth: 'auto' },
            5: { cellWidth: 26 },
          },
          didParseCell: (data) => {
            if (data.column.index === 4 && data.section === 'body') {
              const val = String(data.cell.raw)
              data.cell.styles.textColor = val.startsWith('Exitoso') ? GREEN : RED
              data.cell.styles.fontStyle = 'bold'
            }
            if (data.column.index === 3 && data.section === 'body') {
              data.cell.styles.textColor = String(data.cell.raw) === 'Corporativa' ? BLUE : SLATE_600
            }
          },
        })
      } else {
        doc.setFillColor(...SLATE_50)
        doc.roundedRect(12, y, pageW - 24, 12, 2, 2, 'F')
        doc.setTextColor(...SLATE_600)
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(9)
        doc.text('Sin historial de accesos registrado', pageW / 2, y + 7.5, { align: 'center' })
      }

      drawFooter(2, 3)

      // ════════════════════════════════════════════════
      // PAGE 3 — TRAZABILIDAD DE OPERACIONES
      // ════════════════════════════════════════════════
      doc.addPage()
      drawHeader('Trazabilidad de Operaciones', `${detail.full_name}  ·  ${detail.email}`)
      y = 52

      y = sectionTitle('Archivos del Expediente', y)

      let fileAudit: any[] = []
      try {
        const auditRes = await api.get(`/api/v1/users/${user.user_id}/files`)
        fileAudit = auditRes.data.data || []
      } catch {
        fileAudit = []
      }

      if (fileAudit.length > 0) {
        autoTable(doc, {
          startY: y,
          head: [['Archivo', 'Tipo', 'Tamaño', 'Subido por', 'Fecha']],
          body: fileAudit.map((f: any) => [
            f.original_name || '—',
            f.mime_type?.split('/')[1]?.toUpperCase() || '—',
            f.size_bytes ? `${(f.size_bytes / 1024).toFixed(0)} KB` : '—',
            f.uploaded_by_name || '—',
            formatDate(f.uploaded_at),
          ]),
          margin: { left: 12, right: 12 },
          styles: { fontSize: 8, cellPadding: 3.5, textColor: SLATE_900, lineColor: SLATE_200, lineWidth: 0.2 },
          headStyles: { fillColor: BLUE, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
          alternateRowStyles: { fillColor: SLATE_50 },
        })
        y = (doc as any).lastAutoTable.finalY + 12
      } else {
        doc.setFillColor(...SLATE_50)
        doc.roundedRect(12, y, pageW - 24, 12, 2, 2, 'F')
        doc.setTextColor(...SLATE_600)
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(9)
        doc.text('Sin archivos en el expediente', pageW / 2, y + 7.5, { align: 'center' })
        y += 18
      }

      y = sectionTitle('Actividad en Módulos Operativos', y)

      doc.setFillColor(...BLUE_LIGHT)
      doc.roundedRect(12, y, pageW - 24, 22, 3, 3, 'F')
      doc.setDrawColor(...BLUE)
      doc.setLineWidth(0.5)
      doc.roundedRect(12, y, 3, 22, 1.5, 1.5, 'F')
      doc.setTextColor(...BLUE)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.text('Pendiente de módulos operativos', 20, y + 8)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...SLATE_600)
      doc.setFontSize(8.5)
      doc.text('El registro de operaciones en módulos como Bóveda, Legal y otros estará disponible', 20, y + 14)
      doc.text('una vez que dichos módulos sean activados en la plataforma.', 20, y + 19)

      drawFooter(3, 3)

      const filename = `reporte_${detail.full_name.replace(/\s+/g, '_').toLowerCase()}_${new Date().toISOString().split('T')[0]}.pdf`
      doc.save(filename)

    } catch (err) {
      console.error('Error generando reporte:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={generatePDF}
      disabled={loading}
      className="w-full flex items-center gap-2.5 px-4 py-2 text-sm transition text-slate-700 hover:bg-slate-300 disabled:opacity-50"
    >
      {loading
        ? <Loader2 size={14} className="animate-spin" />
        : <FileDown size={14} />
      }
      {loading ? 'Generando reporte...' : 'Reporte de auditoría'}
    </button>
  )
}
