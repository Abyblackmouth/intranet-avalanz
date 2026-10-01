// Hoja imprimible de un ticket (cualquier tipo): se arma aparte y se manda al diálogo de impresión.
import { getModulesCatalog, getSeverities, getSystems, accResumenSolicitud } from '@/services/itServiceDeskService'
import { useAuthStore } from '@/store/authStore'

const LOGO = '/logo_200.png'
const ESTATUS: Record<string, string> = {
  en_backlog: 'En backlog', asignado: 'Asignado', en_atencion: 'En atención', escalado: 'Escalado', resuelto: 'Resuelto',
  cerrado: 'Cerrado', registrado: 'Registrado', en_revision: 'En revisión', aprobado: 'Aprobado', rechazado: 'Rechazado',
  priorizado: 'Priorizado', en_arranque: 'Arranque', en_diseno_funcional: 'Diseño funcional', en_diseno_tecnico: 'Diseño técnico',
  en_desarrollo: 'En desarrollo', en_pruebas: 'En pruebas', en_paso_produccion: 'Paso a producción', terminado: 'Terminado', cancelado: 'Cancelado',
}
const esc = (v: any) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const fecha = (iso?: string | null) => iso ? new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Monterrey', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
const lista = (r: any) => (Array.isArray(r?.data) ? r.data : r?.data?.data) ?? []

export async function imprimirTicket(d: any) {
  const [sis, sev, mod] = await Promise.all([getSystems().catch(() => null), getSeverities().catch(() => null), getModulesCatalog().catch(() => null)])
  const sistema = lista(sis).find((x: any) => x.id === d.system_id)?.name ?? '—'
  const modulo = lista(mod).find((x: any) => x.id === d.module_id)?.name
  const sv = lista(sev).find((x: any) => x.id === (d.severity_validated_id || d.severity_reported_id))
  const esAcceso = d.ticket_type === 'solicitud_acceso' || String(d.folio).startsWith('ACC-')
  const acc = esAcceso ? await accResumenSolicitud(d.id).then(r => r.data).catch(() => null) : null
  const usuario: any = (useAuthStore.getState() as any).user ?? {}
  const imprimio = usuario.full_name ?? usuario.name ?? usuario.email ?? ''
  const vencido = (lim?: string | null) => lim && !d.closed_at && new Date(lim) < new Date() ? ' <b class="rojo">· vencido</b>' : ''

  const descripcion = acc ? `
    <div class="chips"><span class="chip">${acc.movimiento === 'modificacion' ? 'Modificación' : 'Alta'}</span><span class="chip">${esc(acc.tipo.motivo)}</span>
      ${acc.tipo.auditoria ? '<span class="chip">Auditoría (visor)</span>' : ''}
      ${acc.tipo.reemplaza_a ? `<span>Reemplaza a <b>${esc(acc.tipo.reemplaza_a)}</b></span>` : ''}
      ${acc.tipo.usuario_modelo ? `<span>Usuario modelo <b>${esc(acc.tipo.usuario_modelo)}</b></span>` : ''}</div>
    <p class="et">Empresas</p>${acc.familias.map((f: any) => `<p><b>${esc(f.nombre)}:</b> ${f.empresas.map(esc).join(', ')}</p>`).join('')}
    <p class="et">Módulos</p><table><tr><th>Módulo</th><th>Perfil</th><th>Rutinas o menús</th></tr>
      ${acc.modulos.map((m: any) => `<tr><td><b>${esc(m.nombre)}</b></td><td>${esc(m.perfil)}</td><td>${m.rutinas.map(esc).join(' | ')}</td></tr>`).join('')}</table>
    <p class="et">Vigencia</p><p>${esc(acc.vigencia)}${acc.observaciones ? ` · ${esc(acc.observaciones)}` : ''}</p>
    <p class="et">Jefe directo</p><p>${esc(acc.jefe?.nombre)} ${acc.jefe?.correo ? `&lt;${esc(acc.jefe.correo)}&gt;` : ''}</p>`
    : `<p class="desc">${esc(d.description)}</p>`

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${esc(d.folio)}</title><style>
    @page { size: A4; margin: 14mm 13mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { margin: 0; font: 9.5pt/1.4 "Segoe UI", Arial, sans-serif; color: #1e293b; }
    .enc { display: flex; align-items: center; gap: 4mm; border-bottom: 2px solid #1a4fa0; padding-bottom: 3mm; }
    .enc img { height: 12mm; } .enc .marca { font-weight: 700; color: #1a4fa0; }
    .enc h1 { flex: 1; margin: 0; font-size: 13pt; color: #0f172a; } .enc .folio { text-align: right; font: 600 10pt monospace; color: #1a4fa0; } .folio-et { display: block; font: 500 8pt Arial, sans-serif; color: #64748b; }
    .estado { margin: 3mm 0 0; display: flex; gap: 2mm; flex-wrap: wrap; }
    .chip { display: inline-block; padding: .4mm 2.4mm; border-radius: 9mm; background: #eef2f7; font-size: 8.5pt; font-weight: 600; }
    h2 { margin: 5mm 0 1.5mm; font-size: 9pt; letter-spacing: .06em; text-transform: uppercase; color: #1a4fa0; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1mm 6mm; } .grid p { margin: 0; } .grid b { color: #64748b; font-weight: 500; }
    .desc { white-space: pre-line; margin: 0; border: 1px solid #cbd5e1; border-radius: 1.5mm; padding: 2.5mm; }
    .chips { display: flex; gap: 2mm; flex-wrap: wrap; align-items: center; } .et { margin: 2.5mm 0 .5mm; font-size: 8pt; font-weight: 700; color: #64748b; text-transform: uppercase; }
    p { margin: 0 0 .8mm; } table { width: 100%; border-collapse: collapse; margin-top: 1mm; }
    th, td { border: 1px solid #cbd5e1; padding: 1mm 1.6mm; text-align: left; vertical-align: top; font-size: 8.8pt; } th { background: #f1f5f9; font-size: 8pt; text-transform: uppercase; color: #475569; }
    .rojo { color: #b91c1c; } .pie { margin-top: 6mm; padding-top: 2mm; border-top: 1px solid #cbd5e1; font-size: 7.8pt; color: #64748b; display: flex; justify-content: space-between; }
  </style></head><body>
    <div class="enc">${LOGO ? `<img src="${window.location.origin}${LOGO}" alt="Grupo Avalanz">` : '<span class="marca">GRUPO AVALANZ</span>'}
      <h1>${esc(d.title)}</h1><div class="folio"><span class="folio-et">Folio número:</span>${esc(d.folio)}</div></div>
    <div class="estado"><span class="chip">${esc(ESTATUS[d.status] ?? d.status)}</span>${sv ? `<span class="chip">${esc(sv.code)} · ${esc(sv.name)}</span>` : ''}</div>

    <h2>Datos generales</h2><div class="grid">
      <p><b>Solicitante:</b> ${esc(d.requester_name)}</p><p><b>Empresa:</b> ${esc(d.requester_company_name)}</p>
      <p><b>Puesto:</b> ${esc(d.requester_puesto || '—')}</p><p><b>Teléfono:</b> ${esc(d.requester_phone || '—')}</p>
      <p><b>Sistema:</b> ${esc(sistema)}${modulo ? ` · ${esc(modulo)}` : ''}</p><p><b>Creado:</b> ${fecha(d.created_at)}</p></div>

    <h2>${esAcceso ? 'Solicitud de acceso' : 'Descripción'}</h2>${descripcion}

    <h2>Asignación</h2><div class="grid">
      <p><b>Asignado a:</b> ${esc(d.assigned_to_name || 'Sin asignar')}</p><p><b>Desde:</b> ${fecha(d.assigned_at)}</p>
      ${d.resolved_at ? `<p><b>Resuelto:</b> ${fecha(d.resolved_at)}</p>` : ''}${d.closed_at ? `<p><b>Cerrado:</b> ${fecha(d.closed_at)}</p>` : ''}</div>

    <h2>SLA</h2><div class="grid">
      <p><b>Respuesta:</b> ${fecha(d.sla_response_limit)}${vencido(d.sla_response_limit)}</p>
      <p><b>Resolución:</b> ${fecha(d.sla_resolution_limit)}${vencido(d.sla_resolution_limit)}</p></div>

    <h2>Bitácora</h2>${(d.activity_log ?? []).length ? `<table><tr><th style="width:32mm">Fecha</th><th>Movimiento</th><th style="width:52mm">Por</th></tr>
      ${d.activity_log.map((e: any) => `<tr><td>${fecha(e.performed_at)}</td><td>${esc(String(e.action).replace(/_/g, ' '))}</td><td>${esc(e.performed_by_name)}</td></tr>`).join('')}</table>` : '<p>Sin movimientos registrados.</p>'}

    <h2>Evidencias</h2>${(d.attachments ?? []).length ? `<table><tr><th>Archivo</th><th style="width:38mm">Tipo</th></tr>
      ${d.attachments.map((a: any) => `<tr><td>${esc(String(a.object_key).split('/').pop())}</td><td>${a.attachment_type === 'evidencia_resolucion' ? 'Resolución' : 'Reporte'}</td></tr>`).join('')}</table>` : '<p>Sin evidencias.</p>'}

    <div class="pie"><span>${esc(d.folio)} · Mesa de Servicios · Intranet Avalanz</span><span>Impreso${imprimio ? ` por ${esc(imprimio)}` : ''} el ${fecha(new Date().toISOString())}</span></div>
  </body></html>`

  const marco = document.createElement('iframe')
  marco.setAttribute('aria-hidden', 'true')
  marco.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none'
  let impreso = false
  marco.onload = () => {
    const doc = marco.contentDocument
    // La primera carga es una hoja en blanco: se espera la del ticket, y se imprime una sola vez
    if (impreso || !doc || doc.title !== String(d.folio)) return
    impreso = true
    const imgs = Array.from(doc.images)
    Promise.all(imgs.map(i => (i.complete ? Promise.resolve() : new Promise(r => { i.onload = i.onerror = r })))).then(() => {
      const w = marco.contentWindow
      w?.addEventListener('afterprint', () => setTimeout(() => marco.remove(), 300))
      w?.focus()
      w?.print()
      setTimeout(() => marco.isConnected && marco.remove(), 60000)   // respaldo, por si el navegador no avisa al cerrar
    })
  }
  marco.srcdoc = html          // el contenido antes de entrar a la página
  document.body.appendChild(marco)
}
