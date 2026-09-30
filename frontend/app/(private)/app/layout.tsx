export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="h-full bg-gray-50 flex flex-col">
      {children}
    </div>
  )
}
