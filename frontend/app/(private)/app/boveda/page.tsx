'use client'

import { Construction } from 'lucide-react'

export default function BovedaPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full py-32 text-center px-6">
      <div className="p-5 bg-blue-50 rounded-2xl mb-6">
        <Construction size={40} className="text-[#1a4fa0]" />
      </div>
      <h1 className="text-2xl font-bold text-slate-800 mb-2">Boveda</h1>
      <p className="text-slate-400 text-sm max-w-sm">
        Selecciona un submódulo del menú lateral para comenzar.
      </p>
    </div>
  )
}
