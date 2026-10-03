// ----------------------------------------------------------------------
// Esfera fluida: identidad visual del asistente
// ----------------------------------------------------------------------
import type { CSSProperties } from 'react'
import styles from './FluidOrb.module.css'

interface FluidOrbProps {
  size?: number
  className?: string
}

const FluidOrb = ({ size = 56, className = '' }: FluidOrbProps) => (
  <span className={`${styles.orb} ${className}`} style={{ '--orb-size': `${size}px` } as CSSProperties} aria-hidden="true">
    <span className={`${styles.blob} ${styles.b1}`} />
    <span className={`${styles.blob} ${styles.b2}`} />
    <span className={`${styles.blob} ${styles.b3}`} />
    <span className={`${styles.blob} ${styles.b4}`} />
    <span className={styles.shine} />
  </span>
)

export default FluidOrb
