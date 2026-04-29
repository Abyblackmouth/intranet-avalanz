'use client'
import { useAuthStore } from '@/store/authStore'

export default function LogoutGuard({ children }: { children: React.ReactNode }) {
  const isLoggingOut = useAuthStore((s) => s.isLoggingOut)
  if (isLoggingOut) return null
  return <>{children}</>
}
