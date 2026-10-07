'use client'

import { useEffect, useRef } from 'react'

// Pegar imagenes con Ctrl + V en los formularios que suben evidencia.
// Solo toma las imagenes del portapapeles: el texto se sigue pegando normal.
// Las imagenes se entregan con un nombre legible (captura_AAAAMMDD_HHMMSS.png)
// a la misma funcion que ya usa el formulario para los archivos elegidos.
export function usePegarImagenes(alPegar: (archivos: File[]) => void, activo: boolean = true) {
  const ref = useRef(alPegar)
  ref.current = alPegar

  useEffect(() => {
    if (!activo) return
    const manejar = (e: ClipboardEvent) => {
      const imagenes = Array.from(e.clipboardData?.items ?? [])
        .filter(i => i.kind === 'file' && i.type.startsWith('image/'))
        .map(i => i.getAsFile())
        .filter((f): f is File => !!f)
      if (!imagenes.length) return
      e.preventDefault()
      const d = new Date()
      const dd = (n: number) => String(n).padStart(2, '0')
      const sello = `${d.getFullYear()}${dd(d.getMonth() + 1)}${dd(d.getDate())}_${dd(d.getHours())}${dd(d.getMinutes())}${dd(d.getSeconds())}`
      ref.current(imagenes.map((f, k) => {
        const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
        return new File([f], `captura_${sello}${imagenes.length > 1 ? `_${k + 1}` : ''}.${ext}`, { type: f.type })
      }))
    }
    document.addEventListener('paste', manejar)
    return () => document.removeEventListener('paste', manejar)
  }, [activo])
}
