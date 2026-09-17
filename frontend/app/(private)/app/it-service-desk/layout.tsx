'use client'

// La navegacion entre submodulos ya la resuelve el Sidebar general
// (arbol expandible por modulo) -- este layout ya no duplica esa
// navegacion en un panel aparte.
export default function ItServiceDeskLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-full overflow-auto overflow-x-hidden bg-[#eef0f2]">
      <div
        className="absolute -top-24 -left-24 w-[40vw] h-[40vw] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(220,225,235,0.55) 0%, rgba(238,240,242,0) 70%)' }}
      />
      <div
        className="absolute bottom-0 -right-24 w-[45vw] h-[45vw] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(235,228,222,0.5) 0%, rgba(238,240,242,0) 70%)' }}
      />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  )
}
