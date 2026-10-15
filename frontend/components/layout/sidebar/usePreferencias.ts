import { useCallback, useEffect, useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Lo que el menu RECUERDA en este navegador: secciones plegadas y paginas fijadas.
// ─────────────────────────────────────────────────────────────────────────────

const CLAVE = 'intranet:sidebar'
interface Prefs { plegadas: string[]; fijados: string[] }
const VACIO: Prefs = { plegadas: [], fijados: [] }

function leer(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(CLAVE) || '{}')
    return { plegadas: Array.isArray(p.plegadas) ? p.plegadas : [], fijados: Array.isArray(p.fijados) ? p.fijados.slice(0, 12) : [] }
  } catch { return VACIO }
}

export function usePreferencias() {
  const [prefs, setPrefs] = useState<Prefs>(VACIO)
  useEffect(() => { setPrefs(leer()) }, [])

  const guardar = useCallback((cambio: (p: Prefs) => Prefs) => {
    setPrefs(prev => {
      const sig = cambio(prev)
      try { localStorage.setItem(CLAVE, JSON.stringify(sig)) } catch { /* modo privado: no se recuerda */ }
      return sig
    })
  }, [])

  const alternarSeccion = useCallback((id: string) => guardar(p => ({
    ...p, plegadas: p.plegadas.includes(id) ? p.plegadas.filter(x => x !== id) : [...p.plegadas, id],
  })), [guardar])

  const alternarFijado = useCallback((href: string) => guardar(p => ({
    ...p, fijados: p.fijados.includes(href) ? p.fijados.filter(x => x !== href) : [...p.fijados, href].slice(0, 12),
  })), [guardar])

  return {
    plegada: (id: string) => prefs.plegadas.includes(id),
    fijados: prefs.fijados,
    estaFijado: (href: string) => prefs.fijados.includes(href),
    alternarSeccion, alternarFijado,
  }
}
