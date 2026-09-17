'use client'

// La navegacion entre submodulos ya la resuelve el Sidebar general
// (arbol expandible por modulo) -- este layout ya no duplica esa
// navegacion en un panel aparte.
export default function ItServiceDeskLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-full overflow-auto overflow-x-hidden bg-white flex flex-col">
      {children}
    </div>
  )
}
