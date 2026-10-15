'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Filter, X } from 'lucide-react'
import type { UserRow } from '@/types/user.types'

// Filtro dinamico de Usuarios (mismo diseno que el filtro maestro de la Mesa de Soporte):
// un solo campo que sugiere empresa, rol, estado, 2FA, puesto y departamento, con su conteo.
// Dentro de un mismo grupo las opciones se suman (O); entre grupos se combinan (Y).

export type CampoUsuario = 'empresa' | 'rol' | 'estado' | 'twofa' | 'puesto' | 'departamento'
export interface FiltroUsuario { campo: CampoUsuario; valor: string; etiqueta: string }

const GRUPOS: { campo: CampoUsuario; titulo: string }[] = [
  { campo: 'estado', titulo: 'Estado' },
  { campo: 'rol', titulo: 'Rol' },
  { campo: 'empresa', titulo: 'Empresa' },
  { campo: 'twofa', titulo: '2FA' },
  { campo: 'puesto', titulo: 'Puesto' },
  { campo: 'departamento', titulo: 'Departamento' },
]
const CORTO: Record<CampoUsuario, string> = { empresa: 'Empresa', rol: 'Rol', estado: 'Estado', twofa: '2FA', puesto: 'Puesto', departamento: 'Depto.' }

export const etiquetaRol = (r: string) => r.replace(/_/g, ' ').toUpperCase()
export const estadoDe = (u: UserRow) => (u.is_locked ? 'Bloqueado' : u.is_active ? 'Activo' : 'Inactivo')
const normaliza = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

function valoresDe(u: UserRow, campo: CampoUsuario): string[] {
  switch (campo) {
    case 'empresa': return u.company_name ? [u.company_name] : []
    case 'rol': return u.roles?.length ? u.roles : ['__sin_rol__']
    case 'estado': return [estadoDe(u)]
    case 'twofa': return [u.is_2fa_configured ? 'Configurado' : 'Sin configurar']
    case 'puesto': return u.puesto ? [u.puesto] : []
    case 'departamento': return u.departamento ? [u.departamento] : []
  }
}

export function cumpleFiltro(u: UserRow, filtros: FiltroUsuario[]): boolean {
  if (!filtros.length) return true
  const porCampo = new Map<CampoUsuario, Set<string>>()
  for (const f of filtros) { if (!porCampo.has(f.campo)) porCampo.set(f.campo, new Set()); porCampo.get(f.campo)!.add(f.valor) }
  for (const [campo, valores] of porCampo) if (!valoresDe(u, campo).some(v => valores.has(v))) return false
  return true
}

interface Opcion { campo: CampoUsuario; valor: string; etiqueta: string; n: number }

export default function FiltroUsuarios({ usuarios, valor, onChange }: {
  usuarios: UserRow[]; valor: FiltroUsuario[]; onChange: (v: FiltroUsuario[]) => void
}) {
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  const entrada = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [])

  const opciones = useMemo(() => {
    const cuenta = new Map<string, Opcion>()
    for (const u of usuarios) for (const { campo } of GRUPOS) for (const v of valoresDe(u, campo)) {
      const etiqueta = campo === 'rol' ? (v === '__sin_rol__' ? 'Sin rol' : etiquetaRol(v)) : v
      const k = campo + '|' + v
      const o = cuenta.get(k) ?? { campo, valor: v, etiqueta, n: 0 }
      o.n += 1; cuenta.set(k, o)
    }
    return Array.from(cuenta.values())
  }, [usuarios])

  const elegidos = new Set(valor.map(f => f.campo + '|' + f.valor))
  const q = normaliza(texto)
  const grupos = GRUPOS.map(g => {
    let lista = opciones.filter(o => o.campo === g.campo && !elegidos.has(o.campo + '|' + o.valor))
    if (q) lista = lista.filter(o => normaliza(o.etiqueta).includes(q))
    lista = lista.sort((a, b) => b.n - a.n).slice(0, q ? 6 : 4)
    return { ...g, lista }
  }).filter(g => g.lista.length)
  const primera = grupos[0]?.lista[0]

  const agregar = (o: Opcion) => { onChange([...valor, { campo: o.campo, valor: o.valor, etiqueta: o.etiqueta }]); setTexto(''); entrada.current?.focus() }
  const quitar = (i: number) => onChange(valor.filter((_, k) => k !== i))
  const visibles = valor.slice(0, 3)
  const ocultos = valor.length - visibles.length

  return (
    <div ref={caja} className="relative min-w-56 flex-1">
      <div onClick={() => { setAbierto(true); entrada.current?.focus() }}
        className={`flex h-8 items-center gap-1.5 rounded-lg border bg-white pl-2.5 pr-1.5 text-[13px] cursor-text transition ${abierto ? 'border-[#1a4fa0] ring-2 ring-[#1a4fa0]/20' : 'border-slate-300'}`}>
        <Filter size={13} className="shrink-0 text-slate-400" />
        {visibles.map((f, i) => (
          <span key={f.campo + f.valor} className="inline-flex max-w-44 shrink-0 items-center gap-1 rounded-md bg-[#eef4fc] py-0.5 pl-2 pr-1 text-[11.5px] font-medium text-[#1a4fa0]">
            <span className="truncate"><span className="opacity-70">{CORTO[f.campo]}:</span> {f.etiqueta}</span>
            <button type="button" aria-label={`Quitar ${f.etiqueta}`} onClick={e => { e.stopPropagation(); quitar(i) }} className="rounded p-0.5 hover:bg-[#1a4fa0]/15"><X size={11} /></button>
          </span>
        ))}
        {ocultos > 0 && <span className="shrink-0 text-[11.5px] font-medium text-[#1a4fa0]" title={valor.slice(3).map(f => `${CORTO[f.campo]}: ${f.etiqueta}`).join('\n')}>+{ocultos}</span>}
        <input ref={entrada} value={texto} aria-label="Filtro de usuarios"
          onChange={e => { setTexto(e.target.value); setAbierto(true) }} onFocus={() => setAbierto(true)}
          onKeyDown={e => {
            if (e.key === 'Enter' && primera) { e.preventDefault(); agregar(primera) }
            else if (e.key === 'Backspace' && !texto && valor.length) quitar(valor.length - 1)
            else if (e.key === 'Escape') { setAbierto(false); entrada.current?.blur() }
          }}
          placeholder={valor.length ? '' : 'Filtrar por empresa, rol, estado, 2FA, puesto…'}
          className="min-w-16 flex-1 bg-transparent outline-none placeholder:text-slate-400" />
        {valor.length > 0 && (
          <button type="button" aria-label="Quitar todos los filtros" title="Quitar todos los filtros"
            onClick={e => { e.stopPropagation(); onChange([]); setTexto('') }}
            className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X size={13} /></button>
        )}
      </div>
      {abierto && (
        <div className="absolute inset-x-0 z-40 mt-1.5 max-h-80 overflow-auto rounded-xl border-2 border-slate-300 bg-white p-1.5 shadow-xl">
          {grupos.length === 0 ? <p className="px-3 py-3 text-[13px] text-slate-500">Sin coincidencias</p> : grupos.map(g => (
            <div key={g.campo} className="py-1">
              <p className="px-2.5 pb-1 pt-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">{g.titulo}</p>
              {g.lista.map(o => (
                <button key={o.campo + o.valor} type="button" onClick={() => agregar(o)}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-slate-700 hover:bg-[#1a4fa0]/10 ${o === primera ? 'bg-[#1a4fa0]/5' : ''}`}>
                  <span className="truncate">{o.etiqueta}</span>
                  <span className="shrink-0 text-[11.5px] tabular-nums text-slate-400">{o.n}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
