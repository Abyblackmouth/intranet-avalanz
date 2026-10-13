'use client'

// La navegacion entre submodulos ya la resuelve el Sidebar general
// (arbol expandible por modulo) -- este layout ya NO duplica esa
// navegacion en un panel aparte. Se deja como punto de extension por
// si el modulo necesita envolver sus paginas con algo propio despues
// (fondo, providers, etc.), sin volver a agregar un menu redundante.
export default function ToolkitTiLayout({ children }: { children: React.ReactNode }) {
  return <div className="h-full overflow-auto">{children}</div>
}
