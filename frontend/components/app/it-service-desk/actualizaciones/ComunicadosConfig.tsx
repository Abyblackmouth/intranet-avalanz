'use client'

import { useEffect, useState } from 'react'
import { Megaphone, Pencil, Trash2, Square } from 'lucide-react'
import { getComunicados, crearComunicado, editarComunicado, borrarComunicado } from '@/services/itServiceDeskService'

// Comunicados operativos: avisos que todos ven en un modal al entrar al IT
// Service Desk mientras esten vigentes. Fechas y horas en hora de Monterrey.

const TZ = 'America/Monterrey'
interface Comunicado { id: string; titulo: string; mensaje: string; inicio: string; fin: string; activo: boolean; version: number; creado_por_nombre?: string }

// ISO (UTC) -> valor para <input type="datetime-local"> en hora de Monterrey
const aLocal = (iso: string) => new Date(iso).toLocaleString('sv-SE', { timeZone: TZ }).replace(' ', 'T').slice(0, 16)
const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-MX', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
function estado(c: Comunicado): { txt: string; clase: string } {
  const ahora = Date.now()
  if (!c.activo || new Date(c.fin).getTime() < ahora) return { txt: 'Terminado', clase: 'bg-slate-100 text-slate-600 border-slate-200' }
  if (new Date(c.inicio).getTime() > ahora) return { txt: 'Programado', clase: 'bg-amber-50 text-amber-700 border-amber-200' }
  return { txt: 'Activo', clase: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
}
const vacio = { titulo: '', mensaje: '', inicio: '', fin: '' }

export default function ComunicadosConfig() {
  const [lista, setLista] = useState<Comunicado[]>([])
  const [form, setForm] = useState(vacio)
  const [editando, setEditando] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = () => getComunicados().then(r => setLista(r.data?.data ?? r.data ?? [])).catch(() => {})
  useEffect(() => { cargar() }, [])

  const valido = form.titulo.trim() && form.mensaje.trim() && form.inicio && form.fin && form.fin > form.inicio
  const guardar = async () => {
    setGuardando(true); setError(null)
    try {
      if (editando) await editarComunicado(editando, form)
      else await crearComunicado(form)
      setForm(vacio); setEditando(null); await cargar()
    } catch (e: any) { setError(e?.response?.data?.detail ?? 'No se pudo guardar el comunicado') }
    finally { setGuardando(false) }
  }
  const editar = (c: Comunicado) => { setEditando(c.id); setForm({ titulo: c.titulo, mensaje: c.mensaje, inicio: aLocal(c.inicio), fin: aLocal(c.fin) }); setError(null) }
  const terminar = async (c: Comunicado) => { await editarComunicado(c.id, { activo: false }).catch(() => {}); cargar() }
  const borrar = async (c: Comunicado) => {
    if (!window.confirm(`¿Borrar el comunicado "${c.titulo}"?`)) return
    await borrarComunicado(c.id).catch(() => {}); cargar()
  }

  const campo = 'w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white outline-none focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#1a4fa0]/20'
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_1fr]">
      <div className="bg-white rounded-2xl border border-slate-300 shadow-md p-5 h-fit">
        <div className="flex items-center gap-2 mb-1">
          <Megaphone size={18} className="text-[#1a4fa0]" />
          <h3 className="font-semibold text-slate-800">{editando ? 'Editar comunicado' : 'Nuevo comunicado'}</h3>
        </div>
        <p className="text-[13px] text-slate-500 mb-4">Aparece en un modal a todos los usuarios del IT Service Desk mientras esté vigente. Horario de Monterrey.</p>
        <div className="grid gap-3">
          <label className="grid gap-1 text-[12px] font-semibold text-slate-600 uppercase tracking-wide">Título
            <input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} maxLength={150}
              placeholder="Ej. Ventana de actualización TOTVS 25" className={`${campo} normal-case tracking-normal font-normal`} />
          </label>
          <label className="grid gap-1 text-[12px] font-semibold text-slate-600 uppercase tracking-wide">Mensaje
            <textarea value={form.mensaje} onChange={e => setForm({ ...form, mensaje: e.target.value })} rows={5}
              placeholder="Ej. Hay una ventana de actualización en TOTVS 25 en curso. No es necesario reportarlo con un ticket."
              className={`${campo} normal-case tracking-normal font-normal resize-y`} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-[12px] font-semibold text-slate-600 uppercase tracking-wide">Inicio
              <input type="datetime-local" value={form.inicio} onChange={e => setForm({ ...form, inicio: e.target.value })} className={`${campo} normal-case tracking-normal font-normal`} />
            </label>
            <label className="grid gap-1 text-[12px] font-semibold text-slate-600 uppercase tracking-wide">Fin
              <input type="datetime-local" value={form.fin} min={form.inicio || undefined} onChange={e => setForm({ ...form, fin: e.target.value })} className={`${campo} normal-case tracking-normal font-normal`} />
            </label>
          </div>
          {form.inicio && form.fin && form.fin <= form.inicio && <p className="text-[12.5px] text-red-600">El fin debe ser después del inicio.</p>}
          {error && <p role="alert" className="text-[12.5px] text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            {editando && <button type="button" onClick={() => { setEditando(null); setForm(vacio); setError(null) }}
              className="px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">Cancelar</button>}
            <button type="button" disabled={!valido || guardando} onClick={guardar}
              className="px-4 py-2 text-sm font-semibold rounded-lg text-white bg-[#1a4fa0] hover:bg-[#173f82] disabled:opacity-50">
              {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Publicar comunicado'}
            </button>
          </div>
          {editando && <p className="text-[12px] text-slate-500">Al guardar, el comunicado vuelve a aparecer a todos, porque cambió.</p>}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-300 shadow-md p-5 min-w-0">
        <h3 className="font-semibold text-slate-800 mb-3">Comunicados</h3>
        {lista.length === 0 ? (
          <p className="text-sm text-slate-400 py-8 text-center">Todavía no hay comunicados.</p>
        ) : (
          <ul className="grid gap-3 m-0 p-0 list-none">
            {lista.map(c => {
              const e = estado(c)
              const vigente = e.txt !== 'Terminado'
              return (
                <li key={c.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full border text-[11.5px] font-semibold ${e.clase}`}>{e.txt}</span>
                        <p className="font-semibold text-slate-800 truncate">{c.titulo}</p>
                      </div>
                      <p className="text-[12.5px] text-slate-500 mt-1">{fechaHora(c.inicio)} → {fechaHora(c.fin)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" title="Editar" onClick={() => editar(c)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-[#1a4fa0]"><Pencil size={15} /></button>
                      {vigente && <button type="button" title="Terminar ahora" onClick={() => terminar(c)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-amber-700"><Square size={15} /></button>}
                      <button type="button" title="Borrar" onClick={() => borrar(c)} className="p-2 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>
                    </div>
                  </div>
                  <p className="text-[13.5px] text-slate-700 mt-2 whitespace-pre-wrap">{c.mensaje}</p>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
