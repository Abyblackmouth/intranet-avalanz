'use client'

// La navegacion entre submodulos ya la resuelve el Sidebar general
// (arbol expandible por modulo) -- este layout ya no duplica esa
// navegacion en un panel aparte.
export default function BovedaLayout({ children }: { children: React.ReactNode }) {
  return <div className="h-full overflow-auto">{children}</div>
}
