import { readFileSync } from 'fs'
import { join } from 'path'

// Version desplegada de la pantalla: la consulta AvisoVersion para avisar cuando hay una nueva
export const dynamic = 'force-dynamic'

export function GET() {
  let version = 'desconocida'
  try { version = readFileSync(join(process.cwd(), '.next', 'BUILD_ID'), 'utf8').trim() } catch {}
  return new Response(version, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
}
