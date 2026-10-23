// Nombres de las redes conocidas, para mostrarlos en pantalla en lugar de "Corporativa".
// Las redes que entran sin 2FA viven en el .env del auth-service (CORPORATE_IP_RANGES);
// aqui solo se les da nombre. Para nombrar otra red, agrega una linea.
const REDES: { cidr: string; nombre: string }[] = [
  { cidr: '187.189.108.139/32', nombre: 'Vanta Media' },
]

const aNumero = (ip: string) => ip.split('.').reduce((n, o) => ((n << 8) + (Number(o) & 255)) >>> 0, 0)

export function nombreDeRed(ip?: string | null): string | null {
  const limpia = (ip || '').replace(/^::ffff:/, '').trim()
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(limpia)) return null
  const n = aNumero(limpia)
  for (const r of REDES) {
    const [base, bits] = r.cidr.split('/')
    const b = Number(bits ?? 32)
    const mascara = b === 0 ? 0 : (0xffffffff << (32 - b)) >>> 0
    if (((n & mascara) >>> 0) === ((aNumero(base) & mascara) >>> 0)) return r.nombre
  }
  return null
}

// Una red con nombre se muestra como conocida (azul), entre como entre; si no, "Corporativa" o "Externa"
export const etiquetaRed = (x: { ip_address?: string | null; is_corporate_network?: boolean }) =>
  nombreDeRed(x.ip_address) ?? (x.is_corporate_network ? 'Corporativa' : 'Externa')
