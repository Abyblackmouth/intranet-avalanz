import AuthProvider from '@/components/auth/AuthProvider'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import ToastContainer from '@/components/shared/ToastContainer'
import LogoutGuard from '@/components/auth/LogoutGuard'
import AssistantWidget from '@/components/assistant/AssistantWidget'
import BarraMovil from '@/components/layout/BarraMovil'

export default function PrivateLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthProvider>
      <LogoutGuard>
      <div className="flex h-screen overflow-hidden bg-slate-50 max-md:h-dvh">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <Header />
          <main className="flex-1 overflow-auto min-h-0 max-md:pb-[calc(env(safe-area-inset-bottom,0px)+64px)]">
            {children}
          </main>
          <AssistantWidget />
          <BarraMovil />
        </div>
      </div>
      <ToastContainer />
      </LogoutGuard>
    </AuthProvider>
  )
}
