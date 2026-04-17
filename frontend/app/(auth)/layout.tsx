export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center p-4" style={{
      background: 'radial-gradient(ellipse at 65% 15%, rgba(219,234,254,0.45) 0%, transparent 55%), radial-gradient(ellipse at 20% 85%, rgba(241,245,249,0.6) 0%, transparent 50%), #ffffff'
    }}>
      {children}
    </main>
  )
}
