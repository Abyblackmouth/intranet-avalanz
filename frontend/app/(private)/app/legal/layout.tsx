'use client'

import { useAuthStore } from '@/store/authStore'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import * as LucideIcons from 'lucide-react'

function SubIcon({ icon }: { icon?: string | null }) {
  if (!icon) return <LucideIcons.Box size={15} />
  const name = icon.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join('')
  const Icon = (LucideIcons as any)[name]
  return Icon ? <Icon size={15} /> : <LucideIcons.Box size={15} />
}

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore()
  const pathname = usePathname()
  const mod = (user?.modules ?? []).find((m: any) => m.slug === 'legal')
  const submodules: any[] = mod?.submodules ?? []

  return (
    <div className="flex h-full">
      {submodules.length > 0 && (
        <aside className="w-52 shrink-0 bg-white border-r border-slate-200 flex flex-col py-4 px-2 gap-0.5">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-2 mb-2">
            Legal
          </p>
          {submodules.map((sub: any) => {
            const href = `/app/legal/${sub.slug}`
            const active = pathname.startsWith(href)
            return (
              <Link
                key={sub.slug}
                href={href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-[#1a4fa0] text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <SubIcon icon={sub.icon} />
                {sub.name}
              </Link>
            )
          })}
        </aside>
      )}
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  )
}
