'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

// Guardia de la seccion de administracion: solo super admin y Admin Empresa.
// Sin el rol, no se renderiza la pagina (y no se pide nada al backend).
export default function SoloAdmin({ children }: { children: ReactNode }) {
  const user = useAuthStore((s: any) => s.user)
  const isAdmin = useAuthStore((s: any) => s.isAdmin)
  const [montado, setMontado] = useState(false)
  useEffect(() => { setMontado(true) }, [])

  if (!montado || !user) return null
  if (isAdmin()) return <>{children}</>
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-sm w-full rounded-2xl border border-slate-300 bg-white p-6 text-center">
        <span className="mx-auto mb-3 grid w-12 h-12 place-items-center rounded-xl bg-amber-50 text-amber-600"><ShieldAlert size={24} /></span>
        <h1 className="text-[16px] font-bold text-slate-800">No tienes acceso a esta sección</h1>
        <p className="mt-1 text-[13.5px] text-slate-500">La administración de la intranet es solo para administradores. Si lo necesitas, pídele acceso a tu administrador.</p>
        <Link href="/app" className="mt-4 inline-flex h-9 items-center rounded-lg bg-[#1a4fa0] px-4 text-[13.5px] font-semibold text-white hover:bg-[#153f82]">Ir al inicio</Link>
      </div>
    </div>
  )
}
