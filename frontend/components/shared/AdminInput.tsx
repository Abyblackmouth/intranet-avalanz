import { Search } from 'lucide-react'

interface AdminInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode
}

export default function AdminInput({ icon, className = '', ...props }: AdminInputProps) {
  return (
    <div className="relative">
      {icon && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
          {icon}
        </span>
      )}
      <input
        {...props}
        className={`
          w-full py-2 border border-slate-200 rounded-lg text-sm text-slate-900
          placeholder:text-slate-400 bg-white outline-none
          hover:border-slate-300
          focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#1a4fa0]/10
          transition-all duration-150
          ${icon ? 'pl-8 pr-3' : 'px-3'}
          ${className}
        `}
      />
    </div>
  )
}
