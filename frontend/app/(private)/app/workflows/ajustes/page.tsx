'use client'

// Workflows → Ajustes (solo super admin): ajustes del módulo, conexiones con las
// plataformas y usuarios de plataformas. Sin título: la ruta vive en el navbar.
import { useEffect, useState } from 'react'
import { Lock, SlidersHorizontal, Plug, Users } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import AjustesGenerales from '@/components/app/workflows/ajustes/AjustesGenerales'
import ConexionesConfig from '@/components/app/workflows/ajustes/ConexionesConfig'
import UsuariosPlataformas from '@/components/app/workflows/ajustes/UsuariosPlataformas'

type Tab = 'ajustes' | 'conexiones' | 'usuarios'
const TABS: { key: Tab; label: string; icon: typeof Plug }[] = [
  { key: 'ajustes', label: 'Ajustes', icon: SlidersHorizontal },
  { key: 'conexiones', label: 'Conexiones', icon: Plug },
  { key: 'usuarios', label: 'Usuarios de plataformas', icon: Users },
]

export default function WorkflowsAjustesPage() {
  const { isSuperAdmin } = useAuthStore()
  const [mounted, setMounted] = useState(false)
  const [tab, setTab] = useState<Tab>('ajustes')
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null

  if (!isSuperAdmin()) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center bg-white border border-slate-300 rounded-2xl p-8">
        <Lock className="w-8 h-8 mx-auto text-slate-400" />
        <p className="mt-3 font-semibold text-slate-800">Solo el super admin puede ver los ajustes</p>
        <p className="mt-1 text-sm text-slate-500">Si necesitas cambiar alguno, pídeselo al administrador de la intranet.</p>
      </div>
    )
  }

  return (
    <div className="px-6 pt-3 pb-6 max-[1440px]:px-4 max-md:px-3 max-md:pb-4">
      <div className="flex items-center gap-1 border-b-2 border-slate-300 mb-4 overflow-x-auto [scrollbar-width:none]">
        {TABS.map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 -mb-0.5 transition-colors max-md:px-3 ${tab === t.key ? 'border-[#1a4fa0] text-[#1a4fa0]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>
      {tab === 'ajustes' && <AjustesGenerales />}
      {tab === 'conexiones' && <ConexionesConfig />}
      {tab === 'usuarios' && <UsuariosPlataformas />}
    </div>
  )
}
