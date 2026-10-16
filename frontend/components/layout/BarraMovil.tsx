'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Menu, MessageSquareText, Sparkles } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useAssistantStore } from '@/store/assistantStore'

// Barra inferior en el telefono (menos de 768 px): lo que mas se usa, al alcance del pulgar.
// Inicio · Mesa de Soporte · Asistente · Menu (abre el cajon con todos los modulos).
const MESA = '/app/it-service-desk/mesa-de-soporte'

export default function BarraMovil() {
  const pathname = usePathname()
  const { user } = useAuthStore()
  const { isOpen, setOpen } = useAssistantStore()
  const roles: string[] = (user as any)?.roles ?? []
  const tieneMesa = roles.some(r => r === 'super_admin' || r === 'admin_empresa' || r.startsWith('it-service-desk'))
  const clase = (on: boolean) => `flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${on ? 'text-[#1a4fa0]' : 'text-slate-500'}`

  return (
    <nav aria-label="Navegación principal"
      className={`fixed inset-x-0 bottom-0 z-30 grid border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur md:hidden ${tieneMesa ? 'grid-cols-4' : 'grid-cols-3'}`}>
      <Link href="/" className={clase(pathname === '/' || pathname === '/app')}><Home size={22} />Inicio</Link>
      {tieneMesa && <Link href={MESA} className={clase(pathname.startsWith(MESA))}><MessageSquareText size={22} />Mesa</Link>}
      <button type="button" onClick={() => setOpen(!isOpen)} className={clase(isOpen)}><Sparkles size={22} />Asistente</button>
      <button type="button" onClick={() => window.dispatchEvent(new Event('menu-movil:abrir'))} className={clase(false)}><Menu size={22} />Menú</button>
    </nav>
  )
}
