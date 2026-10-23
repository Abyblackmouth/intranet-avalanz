'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

// Inicio de la intranet: cada quien cae en SU inicio segun su rol.
// Antes mandaba a todos a /admin/users, y quien no era administrador veia esa pantalla vacia.
export default function InicioApp() {
  const router = useRouter()
  const user = useAuthStore((s: any) => s.user)
  const isAdmin = useAuthStore((s: any) => s.isAdmin)

  // Red de seguridad: si en 8 s no se pudo cargar el usuario, al login (nunca girar para siempre)
  useEffect(() => {
    if (user) return
    const t = setTimeout(() => router.replace(`/login?volver=${encodeURIComponent('/app')}`), 8000)
    return () => clearTimeout(t)
  }, [user, router])

  useEffect(() => {
    if (!user) return
    if (isAdmin()) { router.replace('/admin/users'); return }
    const modulos: string[] = (user.modules || []).map((m: any) => (typeof m === 'string' ? m : m?.slug)).filter(Boolean)
    if (modulos.includes('it-service-desk')) router.replace('/app/it-service-desk/mesa-de-soporte')
    else if (modulos.length) router.replace(`/app/${modulos[0]}`)
    else router.replace('/app/it-service-desk/mesa-de-soporte')
  }, [user, isAdmin, router])

  return (
    <div className="flex flex-1 items-center justify-center py-32">
      <Loader2 size={22} className="animate-spin text-slate-400" aria-label="Cargando" />
    </div>
  )
}
