'use client'

// Liga del correo: /aprobar/{token}. Muestra la página de aprobación de Workflows (diseño v9),
// que se renderiza completa en el servidor (GET /public/aprobar/{token}/pagina). Sin sesión: el
// token es la autorización. La página se sirve desde el mismo dominio, así que la decisión que
// se toma dentro llega directo al API.
import { useParams } from 'next/navigation'

export default function AprobarPorLigaPage() {
  const params = useParams<{ token: string }>()
  const token = encodeURIComponent(params?.token ?? '')
  return (
    <iframe title="Aprobación de Workflows" src={`/api/v1/workflows/public/aprobar/${token}/pagina`}
      className="fixed inset-0 h-full w-full border-0 bg-[#eef2f7]" />
  )
}
