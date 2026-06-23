'use client'

import { useAuthStore } from '@/store/authStore'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import * as LucideIcons from 'lucide-react'

function SubIcon({ icon }: { icon?: string | null }) {
  if (!icon) return <LucideIcons.Box size={14} />
  const name = icon.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join('')
  const Icon = (LucideIcons as any)[name]
  return Icon ? <Icon size={14} /> : <LucideIcons.Box size={14} />
}

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore()
  const pathname = usePathname()
  const mod = (user?.modules ?? []).find((m: any) => m.slug === 'legal')
  const submodules: any[] = (mod as any)?.submodules ?? []

  return (
    <div className="flex flex-col h-full">
      {submodules.length > 0 && (
        <div className="bg-white border-b border-slate-200 px-6 shrink-0">
          <div className="flex items-center gap-1">
            {submodules.map((sub: any) => {
              const href = `/app/legal/${sub.slug}`
              const active = pathname.startsWith(href)
              return (
                <Link
                  key={sub.slug}
                  href={href}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    active
                      ? 'border-[#1a4fa0] text-[#1a4fa0]'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <SubIcon icon={sub.icon} />
                  {sub.name}
                </Link>
              )
            })}
          </div>
        </div>
      )}
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  )
}
