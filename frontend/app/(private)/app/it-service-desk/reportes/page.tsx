'use client'

import ConstructorReportes from '@/components/app/it-service-desk/reportes/ConstructorReportes'

// La ruta (Inicio / Modulo / Pagina) vive en el navbar: la pagina no lleva titulo ni subtitulo.
export default function ReportesPage() {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <ConstructorReportes />
    </div>
  )
}
