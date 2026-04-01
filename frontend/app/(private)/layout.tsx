import AuthProvider from '@/components/auth/AuthProvider'

export default function PrivateLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthProvider>
      <div className="min-h-screen">
        {children}
      </div>
    </AuthProvider>
  )
}