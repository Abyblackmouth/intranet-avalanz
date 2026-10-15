import { Inter, Plus_Jakarta_Sans } from 'next/font/google'

// Plus Jakarta Sans en modulos y secciones, Inter en submodulos (Next las sirve desde la intranet).
export const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['500', '600', '700'], display: 'swap' })
export const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], display: 'swap' })
