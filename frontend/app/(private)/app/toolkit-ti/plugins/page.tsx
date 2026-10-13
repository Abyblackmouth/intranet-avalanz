'use client'

import PluginsLista from '@/components/app/toolkit-ti/plugins/PluginsLista'

// La ruta (Inicio / Modulo / Pagina) vive en el navbar: la pagina no lleva titulo ni subtitulo.
export default function PluginsPage() {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-auto px-6 max-[1440px]:px-4 pt-3 pb-6 max-[1440px]:pb-4 min-h-0">
        <PluginsLista />
      </div>
    </div>
  )
}
