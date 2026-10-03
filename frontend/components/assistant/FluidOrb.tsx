// ----------------------------------------------------------------------
// Esfera fluida: identidad visual del asistente
// elevated agrega sombras en capas y sombra de piso; blink agrega el
// parpadeo periodico con anillo.
// ----------------------------------------------------------------------
import type { CSSProperties } from 'react'
import styles from './FluidOrb.module.css'

interface FluidOrbProps {
  size?: number
  className?: string
  blink?: boolean
  elevated?: boolean
}

const FluidOrb = ({ size = 56, className = '', blink = false, elevated = false }: FluidOrbProps) => (
  <span
    className={[styles.wrap, blink ? styles.blink : '', elevated ? styles.elevated : '', className].join(' ')}
    style={{ '--orb-size': `${size}px` } as CSSProperties}
    aria-hidden="true"
  >
    {elevated && <span className={styles.ground} />}
    <span className={styles.orb}>
      <span className={`${styles.blob} ${styles.b1}`} />
      <span className={`${styles.blob} ${styles.b2}`} />
      <span className={`${styles.blob} ${styles.b3}`} />
      <span className={`${styles.blob} ${styles.b4}`} />
      <span className={styles.shine} />
    </span>
    {blink && <span className={styles.halo} />}
  </span>
)

export default FluidOrb
