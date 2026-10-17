'use client'

import { Construction } from 'lucide-react'

export default function WorkflowsPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full py-32 text-center px-6">
      <div className="p-5 bg-blue-50 rounded-2xl mb-6">
        <Construction size={40} className="text-[#1a4fa0]" />
      </div>
      <p className="text-slate-400 text-sm max-w-sm">
        Selecciona un submódulo del menú lateral para comenzar.
      </p>
    </div>
  )
}
