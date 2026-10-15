'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { armarModulos, filtrar, itemsAdmin, normal, type Modulo } from './menu'
import { usePreferencias } from './usePreferencias'
import { FILA, FILA_ACTIVA, FILA_NORMAL } from './estilos'
import { jakarta } from './fuentes'
import Seccion from './Seccion'
import ItemModulo, { BotonFijar } from './ItemModulo'
import MenuFlotante from './MenuFlotante'
import PieRol from './PieRol'

// El armazon del menu: encabezado, buscador (Ctrl + K), Fijados, Administracion, Mis modulos y pie.
export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, isAdmin, isSuperAdmin, isLoggingOut } = useAuthStore()
  const prefs = usePreferencias()
  const [montado, setMontado] = useState(false)
  const [recogido, setRecogido] = useState(false)
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [flot, setFlot] = useState<{ mod: Modulo; top: number; left: number } | null>(null)
  const cierre = useRef<ReturnType<typeof setTimeout> | null>(null)
  const buscador = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setMontado(true)
    // En laptops de 13"-15" abre recogido (solo iconos) para dar espacio a las tablas
    if (window.innerWidth <= 1440) setRecogido(true)
  }, [])

  // El modulo donde estas se abre solo
  useEffect(() => {
    const m = pathname.match(/^\/app\/([^/]+)/)
    if (m) setAbiertos(prev => (prev.has(m[1]) ? prev : new Set(prev).add(m[1])))
    setFlot(null)
  }, [pathname])

  // Ctrl + K (o Cmd + K): ir al buscador del menu
  useEffect(() => {
    const atajo = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setRecogido(false)
        setTimeout(() => buscador.current?.focus(), 60)
      }
    }
    document.addEventListener('keydown', atajo)
    return () => document.removeEventListener('keydown', atajo)
  }, [])

  // El menu flotante se cierra con Esc o al hacer clic fuera
  useEffect(() => {
    if (!flot) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setFlot(null) }
    const fuera = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('[role="menu"], aside')) setFlot(null) }
    document.addEventListener('keydown', esc)
    document.addEventListener('mousedown', fuera)
    return () => { document.removeEventListener('keydown', esc); document.removeEventListener('mousedown', fuera) }
  }, [flot])

  const modulos = useMemo(() => armarModulos(user), [user])
  const admin = useMemo(() => (montado && isAdmin() ? itemsAdmin(isSuperAdmin()) : []), [montado, user, isAdmin, isSuperAdmin])
  const buscando = q.trim().length > 0
  const modsVisibles = useMemo(() => filtrar(modulos, q), [modulos, q])
  const adminVisible = useMemo(() => (buscando ? admin.filter(a => normal(a.label).includes(normal(q.trim()))) : admin), [admin, q, buscando])

  // Paginas fijadas, con su nombre e icono actuales (las que ya no existen se ignoran)
  const fijados = useMemo(() => {
    const todo = new Map<string, { nombre: string; ruta: string; icon: ReactNode }>()
    admin.forEach(a => todo.set(a.href, { nombre: a.label, ruta: `Administración › ${a.label}`, icon: a.icon }))
    modulos.forEach(m => {
      if (!m.subs.length) todo.set(m.href, { nombre: m.nombre, ruta: m.nombre, icon: m.icon })
      m.subs.forEach(s => todo.set(s.href, { nombre: s.slug ? s.nombre : m.nombre, ruta: s.ruta, icon: s.icon }))
    })
    return prefs.fijados.map(h => ({ href: h, ...todo.get(h)! })).filter(x => x.nombre)
  }, [prefs.fijados, admin, modulos])

  if (isLoggingOut) return null

  const enRuta = (href: string, exacto = false) => (exacto ? pathname === href : pathname === href || pathname.startsWith(href + '/'))
  const alternar = (slug: string) => setAbiertos(prev => { const n = new Set(prev); n.has(slug) ? n.delete(slug) : n.add(slug); return n })
  const abrirFlot = (mod: Modulo, el: HTMLElement) => {
    if (!recogido || !mod.subs.length) return
    if (cierre.current) clearTimeout(cierre.current)
    const r = el.getBoundingClientRect()
    const alto = 40 + mod.subs.length * 28
    setFlot({ mod, left: r.right + 10, top: Math.max(8, Math.min(r.top - 6, window.innerHeight - alto - 8)) })
  }
  const cerrarFlot = () => { cierre.current = setTimeout(() => setFlot(null), 220) }

  // Enter en el buscador: ir al primer resultado
  const irAlPrimero = () => {
    const m = modsVisibles[0]
    const destino = adminVisible[0]?.href ?? (m ? (m.subs.find(s => s.slug) ?? m.subs[0])?.href ?? m.href : null)
    if (destino) { router.push(destino); setQ(''); buscador.current?.blur() }
  }

  const filaSimple = (href: string, nombre: string, icon: ReactNode, key: string, titulo?: string) => {
    const activo = enRuta(href)
    return (
      <div key={key} className="group/li relative">
        <Link href={href} title={recogido ? nombre : titulo} aria-current={activo ? 'page' : undefined}
          className={`${FILA} ${jakarta.className} ${activo ? FILA_ACTIVA : FILA_NORMAL} ${recogido ? 'justify-center px-0' : 'px-2.5 pr-7'}`}>
          <span className="shrink-0 grid size-5 place-items-center">{icon}</span>
          {!recogido && <span className="truncate flex-1">{nombre}</span>}
        </Link>
        {!recogido && <BotonFijar fijado={prefs.estaFijado(href)} onClick={() => prefs.alternarFijado(href)} activo={activo} />}
      </div>
    )
  }

  return (
    <aside suppressHydrationWarning
      className={`relative flex flex-col h-screen bg-white border-r border-slate-200 transition-[width] duration-300 shrink-0 ${montado && recogido ? 'w-16' : 'w-56 max-[1440px]:w-52'}`}>

      {/* Boton para recoger o abrir */}
      {montado && (
        <button onClick={() => { setRecogido(!recogido); setFlot(null) }}
          aria-label={recogido ? 'Abrir menú' : 'Recoger menú'} title={recogido ? 'Abrir menú' : 'Recoger menú'}
          className="absolute -right-3 top-4 z-30 grid size-6 place-items-center rounded-full bg-[#1a4fa0] text-white shadow-md hover:bg-[#173f82] transition">
          {recogido ? <ChevronRight size={13} strokeWidth={2.6} /> : <ChevronLeft size={13} strokeWidth={2.6} />}
        </button>
      )}

      {/* Encabezado: logo y nombre en un renglon */}
      <div className={`flex h-14 shrink-0 items-center gap-2.5 border-b border-slate-200 ${montado && recogido ? 'justify-center' : 'px-4'}`}>
        <img src="/logo_200.png" alt="Avalanz" className="size-7 shrink-0 object-contain" />
        {!(montado && recogido) && <span className={`truncate text-[15px] font-bold text-slate-800 ${jakarta.className}`}>Intranet Avalanz</span>}
      </div>

      {/* Buscador del menu */}
      {montado && (recogido ? (
        <button type="button" onClick={() => { setRecogido(false); setTimeout(() => buscador.current?.focus(), 60) }}
          aria-label="Buscar en el menú (Ctrl + K)" title="Buscar en el menú (Ctrl + K)"
          className="mx-auto mt-2.5 grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-[#1a4fa0]/8 hover:text-slate-800">
          <Search size={16} />
        </button>
      ) : (
        <div className="px-2.5 pt-2.5">
          <label className="flex h-8 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 focus-within:border-[#1a4fa0] focus-within:bg-white">
            <Search size={14} className="shrink-0 text-slate-400" />
            <input ref={buscador} value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar…" aria-label="Buscar en el menú"
              onKeyDown={e => { if (e.key === 'Enter') irAlPrimero(); if (e.key === 'Escape') { setQ(''); e.currentTarget.blur() } }}
              className="min-w-0 flex-1 bg-transparent text-[13px] text-slate-800 outline-none placeholder:text-slate-400" />
            {buscando
              ? <button type="button" onClick={() => setQ('')} aria-label="Limpiar búsqueda" className="text-slate-400 hover:text-slate-600"><X size={13} /></button>
              : <kbd className="rounded border border-slate-200 bg-white px-1 text-[10px] font-semibold text-slate-400">Ctrl K</kbd>}
          </label>
        </div>
      ))}

      {/* Navegacion */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-3" onMouseLeave={cerrarFlot} aria-label="Menú principal">
        {montado && !buscando && fijados.length > 0 && (
          <Seccion titulo="Fijados" plegada={prefs.plegada('fijados')} onAlternar={() => prefs.alternarSeccion('fijados')} recogido={recogido}>
            {fijados.map(f => filaSimple(f.href, f.nombre, f.icon, `fijado-${f.href}`, f.ruta))}
          </Seccion>
        )}

        {montado && adminVisible.length > 0 && (
          <Seccion titulo="Administración" plegada={!buscando && prefs.plegada('admin')} onAlternar={() => prefs.alternarSeccion('admin')} recogido={recogido}>
            {adminVisible.map(a => filaSimple(a.href, a.label, a.icon, a.href))}
          </Seccion>
        )}

        {montado && modsVisibles.length > 0 && (
          <Seccion titulo="Mis módulos" plegada={!buscando && prefs.plegada('modulos')} onAlternar={() => prefs.alternarSeccion('modulos')} recogido={recogido}>
            {modsVisibles.map(mod => (
              <ItemModulo key={mod.slug} mod={mod} recogido={recogido} abierto={buscando || abiertos.has(mod.slug)} enRuta={enRuta}
                onAlternar={() => alternar(mod.slug)} onFlotante={el => abrirFlot(mod, el)}
                estaFijado={prefs.estaFijado} onFijar={prefs.alternarFijado} />
            ))}
          </Seccion>
        )}

        {montado && buscando && !adminVisible.length && !modsVisibles.length && (
          <p className="px-3 py-6 text-center text-xs text-slate-400">Nada coincide con “{q.trim()}”</p>
        )}
      </nav>

      {montado && <PieRol user={user} recogido={recogido} />}

      {flot && (
        <MenuFlotante mod={flot.mod} top={flot.top} left={flot.left} enRuta={enRuta}
          onEntrar={() => cierre.current && clearTimeout(cierre.current)} onSalir={cerrarFlot} />
      )}
    </aside>
  )
}
