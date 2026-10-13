import SoloAdmin from '@/components/auth/SoloAdmin'
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <><SoloAdmin>{children}</SoloAdmin></>
}
