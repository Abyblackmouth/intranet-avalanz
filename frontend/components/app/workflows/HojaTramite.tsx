'use client'

// HojaTramite: la "hoja" del trámite (plantilla por flujo, diseño v9). El servidor manda la
// estructura ya armada y formateada (app/motor/hoja.py); aquí solo se pinta. La misma hoja
// se ve en la liga del correo, en la Bandeja y en la pestaña Solicitud del administrador.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { HojaTramite as Hoja } from '@/services/workflowsService'

const TONO: Record<string, string> = { turno: 'text-[#1a4fa0]', ok: 'text-emerald-700', no: 'text-red-700', aviso: 'text-amber-700', neutro: 'text-slate-600' }
const PUNTO: Record<string, string> = { turno: 'bg-[#1a4fa0] animate-pulse', ok: 'bg-emerald-600', no: 'bg-red-600', aviso: 'bg-amber-500', neutro: 'bg-slate-400' }
const DOC: Record<string, { fondo: string; borde: string; chip: string }> = {
  pdf: { fondo: '#fff5f5', borde: '#fecaca', chip: '#dc2626' },
  xls: { fondo: '#f0fdf4', borde: '#bbf7d0', chip: '#16a34a' }, csv: { fondo: '#f0fdf4', borde: '#bbf7d0', chip: '#16a34a' },
  doc: { fondo: '#eff6ff', borde: '#bfdbfe', chip: '#2563eb' },
  jpg: { fondo: '#fdf4ff', borde: '#f5d0fe', chip: '#a21caf' }, png: { fondo: '#fdf4ff', borde: '#f5d0fe', chip: '#a21caf' },
  xml: { fondo: '#fffbeb', borde: '#fde68a', chip: '#d97706' },
}
const ALINEAR: Record<string, string> = { izq: 'text-left', centro: 'text-center', der: 'text-right' }

const Seccion = ({ titulo, cuenta, children }: { titulo: string; cuenta?: number; children: ReactNode }) => (
  <section className="mb-2.5 overflow-hidden rounded-[14px] border-[1.5px] border-[#c7d6ec] bg-[#f6f9fe]">
    <h3 className="flex items-center gap-2 border-b-[1.5px] border-[#c7d6ec] bg-[#e8f0fb] px-3.5 py-[7px] text-[11px] font-bold uppercase tracking-[.14em] text-[#1a4fa0]">
      {titulo}{cuenta != null && <span className="rounded-full border border-slate-200 bg-white px-2 py-px text-[11px] font-medium tracking-normal text-slate-600">{cuenta}</span>}
    </h3>
    <div className="px-3.5 pb-3 pt-2.5">{children}</div>
  </section>
)

function IconoDoc({ ext }: { ext: string }) {
  const c = DOC[ext] ?? { fondo: '#f1f5f9', borde: '#cbd5e1', chip: '#64748b' }
  return (
    <span className="relative grid h-[42px] w-[33px] place-items-end justify-center rounded-[5px_10px_5px_5px] border-[1.5px] pb-[6px]" style={{ background: c.fondo, borderColor: c.borde }}>
      <span className="absolute -right-[1.5px] -top-[1.5px] size-3 rounded-[0_10px_0_5px]" style={{ background: c.borde }} />
      <i className="rounded-[4px] px-1 py-px text-[8px] font-extrabold not-italic uppercase tracking-wide text-white" style={{ background: c.chip }}>{ext}</i>
    </span>
  )
}

// La hoja tal como la arma el servidor (misma plantilla y estilo que la liga del correo),
// en un iframe que toma la altura de su contenido. Los documentos abren en otra pestaña.
function MarcoHoja({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [alto, setAlto] = useState(600)
  useEffect(() => {
    const f = ref.current
    if (!f) return
    let obs: ResizeObserver | null = null
    const medir = () => { const d = f.contentDocument; if (d?.documentElement) setAlto(d.documentElement.scrollHeight + 2) }
    const alCargar = () => { medir(); try { obs = new ResizeObserver(medir); if (f.contentDocument?.body) obs.observe(f.contentDocument.body) } catch { /* sin ResizeObserver */ } setTimeout(medir, 400) }
    f.addEventListener('load', alCargar)
    return () => { f.removeEventListener('load', alCargar); obs?.disconnect() }
  }, [html])
  return <iframe ref={ref} title="Hoja del trámite" srcDoc={html} style={{ height: alto }} className="block w-full border-0 bg-transparent"
    sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" />
}

export default function HojaTramite({ hoja, html, acciones, embebida, aviso }: {
  hoja: Hoja
  html?: string               // la hoja renderizada en el servidor; si viene, se usa en lugar del armado local
  acciones?: ReactNode        // barra fija de abajo (solo el aprobador en turno)
  embebida?: boolean          // dentro del modal del administrador: sin sombra ni alto mínimo
  aviso?: ReactNode           // mensaje bajo la cinta (liga usada, error, etc.)
}) {
  if (html) {
    return (
      <div>
        {aviso && <div className="mb-2">{aviso}</div>}
        <MarcoHoja html={html} />
        {acciones && <div className="sticky bottom-0 z-10 mt-2 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_-18px_rgba(15,23,42,.4)] backdrop-blur max-md:flex-col max-md:items-stretch">{acciones}</div>}
      </div>
    )
  }
  const c = hoja.cabecera
  return (
    <article className={`flex flex-col overflow-hidden bg-white text-slate-900 ${embebida ? 'rounded-2xl border border-slate-200' : 'min-h-[calc(100vh-26px)] rounded-[20px] shadow-[0_24px_60px_-24px_rgba(15,23,42,.35),0_2px_8px_rgba(15,23,42,.06)] max-md:min-h-screen max-md:rounded-none'}`}>
      {/* Cabecera */}
      <header className="border-b border-[#c7d6ec] bg-[radial-gradient(900px_300px_at_-10%_-40%,rgba(37,99,235,.14),transparent_60%),radial-gradient(600px_220px_at_110%_0%,rgba(26,79,160,.10),transparent_60%)] px-5 pb-2.5 pt-3 max-md:px-3.5">
        <div className="flex flex-wrap items-start justify-between gap-4 max-md:flex-col max-md:gap-2.5">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-[#1a4fa0] to-[#2563eb] shadow-[0_8px_20px_-8px_rgba(26,79,160,.6)]">
              <svg viewBox="0 0 24 24" className="size-[26px]" fill="none" aria-hidden="true"><path d="M12 3 3 20h4.2l1.6-3.4h6.4L16.8 20H21L12 3Zm0 6.2 2.1 4.6H9.9L12 9.2Z" fill="#fff" /></svg>
            </div>
            <div><b className="font-[family-name:var(--font-jakarta)] text-base font-extrabold tracking-tight">Intranet Avalanz</b><small className="block text-xs text-slate-500">Workflows · {c.flujo}</small></div>
          </div>
          <div className="text-right max-md:text-left">
            <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-slate-500">{c.etiqueta}</div>
            <div className="mt-1 font-mono text-[34px] font-extrabold leading-none tracking-tight max-md:text-[28px]">No. {c.numero}</div>
            <div className="mt-1.5 text-xs text-slate-500">{!c.numero_es_folio && <>Folio Intranet <span className="font-mono">{c.folio}</span> · </>}{c.fecha}</div>
          </div>
        </div>
        <div className="mt-1.5">
          <h1 className="m-0 font-[family-name:var(--font-jakarta)] text-[23px] font-extrabold tracking-tight max-md:text-[19px]">{c.empresa}</h1>
          <p className="mt-1.5 text-sm text-slate-500 max-md:text-[13px]">Solicitado por <strong className="text-slate-700">{c.solicitado_por}</strong>{c.area ? ` · ${c.area}` : ''} · Grupo {c.grupo} · Filial {c.filial}</p>
        </div>
      </header>

      {/* Cinta de estatus */}
      <div className="flex items-center gap-3 border-b border-[#c7d6ec] bg-[#e8f0fb] px-5 py-2 max-md:px-3.5" role="status">
        <span className={`size-2.5 rounded-full ${PUNTO[hoja.estatus.tono] ?? PUNTO.neutro}`} />
        <b className={`font-[family-name:var(--font-jakarta)] text-sm font-bold ${TONO[hoja.estatus.tono] ?? TONO.neutro}`}>{hoja.estatus.texto}</b>
      </div>

      <div className="flex-1 px-5 pb-1 pt-3.5 max-md:px-3.5">
        {aviso}
        {hoja.tarjetas.length > 0 && (
          <Seccion titulo="Datos de la solicitud">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,max-content))] gap-x-2.5 gap-y-2 max-md:grid-cols-2 max-[420px]:grid-cols-1">
              {hoja.tarjetas.map((t, i) => (
                <div key={i} className={`min-w-[190px] rounded-[10px] border border-[#c9d8ef] bg-white px-3 py-[7px] max-md:col-span-1 max-md:min-w-0 max-md:max-w-none ${t.ancha ? 'col-span-2 max-w-[660px]' : 'max-w-[320px]'}`}>
                  <div className="text-[11px] font-semibold tracking-wide text-slate-500">{t.etiqueta}</div>
                  <div className="mt-px truncate text-[13px] font-semibold" title={t.valor}>{t.valor}</div>
                </div>
              ))}
            </div>
          </Seccion>
        )}

        {hoja.adjuntos.length > 0 && (
          <Seccion titulo="Archivos adjuntos" cuenta={hoja.adjuntos.length}>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,max-content))] gap-2 max-md:grid-cols-[repeat(auto-fill,minmax(120px,1fr))]">
              {hoja.adjuntos.map(a => (
                <a key={a.id} href={a.url ?? undefined} target="_blank" rel="noreferrer" title={`${a.nombre}${a.tamano ? ' · ' + a.tamano : ''}`}
                  className={`flex min-w-[130px] max-w-[173px] flex-col items-center gap-1 rounded-xl border-[1.5px] border-[#c9d8ef] bg-white px-2.5 pb-[5px] pt-1.5 text-center text-slate-900 no-underline transition hover:-translate-y-0.5 hover:border-[#1a4fa0] hover:shadow-[0_12px_24px_-16px_rgba(26,79,160,.5)] max-md:min-w-0 max-md:max-w-none ${a.url ? '' : 'pointer-events-none'}`}>
                  <IconoDoc ext={a.ext} />
                  <b className="max-w-full truncate text-[11.5px] font-semibold">{a.nombre}</b>
                  {a.tamano && <small className="text-[11px] text-slate-500">{a.tamano}</small>}
                </a>
              ))}
            </div>
          </Seccion>
        )}

        {hoja.tablas.map((t, ti) => (
          <Seccion key={ti} titulo={t.titulo} cuenta={t.filas.length}>
            <div className="overflow-x-auto rounded-[10px] border-[1.5px] border-[#c7d6ec] bg-white">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>{t.columnas.map((col, i) => <th key={i} className={`whitespace-nowrap border-b-[1.5px] border-r border-[#c7d6ec] border-r-[#dbe5f3] bg-[#e8f0fb] px-3 py-2 text-[11px] font-bold uppercase tracking-[.08em] text-[#1a4fa0] last:border-r-0 ${ALINEAR[col.alinear] ?? ''}`}>{col.etiqueta}</th>)}</tr>
                </thead>
                <tbody>
                  {t.filas.map((f, fi) => (
                    <tr key={fi} className="hover:bg-[#fafcff]">
                      {f.map((cel, ci) => (
                        <td key={ci} className={`max-w-[420px] truncate whitespace-nowrap border-b border-r border-slate-300 border-r-slate-200 px-3 py-2 last:border-r-0 ${ALINEAR[t.columnas[ci]?.alinear] ?? ''} ${t.columnas[ci]?.tipo === 'moneda' || t.columnas[ci]?.tipo === 'numero' ? 'tabular-nums' : ''}`} title={cel.detalle ? `${cel.valor} · ${cel.detalle}` : cel.valor}>
                          {cel.valor}{cel.detalle && <span className="ml-2 font-mono text-xs text-slate-500">{cel.detalle}</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {t.totales.length > 0 && (
                  <tfoot>
                    {t.totales.map((tot, i) => (
                      <tr key={i} className={tot.destacado ? 'bg-[#e8f0fb] font-[family-name:var(--font-jakarta)] text-[15px] font-extrabold text-[#1a4fa0]' : 'bg-[#fafcff] text-[13px]'}>
                        <td colSpan={Math.max(1, t.col_total)} className="border-t border-slate-200 px-3 py-[7px] text-right">{tot.etiqueta}</td>
                        <td className="border-t border-slate-200 px-3 py-[7px] text-right tabular-nums">{tot.valor}</td>
                        {t.columnas.length - t.col_total - 1 > 0 && <td colSpan={t.columnas.length - t.col_total - 1} className="border-t border-slate-200" />}
                      </tr>
                    ))}
                  </tfoot>
                )}
              </table>
            </div>
          </Seccion>
        ))}

        {hoja.tarjetas.length === 0 && hoja.tablas.length === 0 && hoja.adjuntos.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-500">Este trámite no trae datos para mostrar.</p>
        )}
      </div>

      {acciones && (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-slate-200 bg-white/90 px-5 py-3 backdrop-blur max-md:flex-col max-md:items-stretch max-md:px-3.5 print:hidden">{acciones}</div>
      )}
      {!embebida && (
        <footer className="flex flex-wrap justify-between gap-3 px-5 pb-3 pt-2 text-xs text-slate-500 max-md:px-3.5 print:hidden">
          <span>Intranet Avalanz · Workflows</span>
          <button type="button" onClick={() => window.print()} className="text-slate-500 hover:text-[#1a4fa0]">Imprimir / PDF</button>
        </footer>
      )}
    </article>
  )
}
