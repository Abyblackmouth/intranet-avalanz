// ─────────────────────────────────────────────────────────────────────────────
// COMO se ve: tamanos y colores del menu en un solo lugar.
// ─────────────────────────────────────────────────────────────────────────────

export const ICONO_MODULO = { size: 17, strokeWidth: 1.9 }
export const ICONO_SUB = { size: 15, strokeWidth: 1.9 }

/** Fila de modulo o de administracion (32 px). */
export const FILA = 'group/fila relative w-full flex items-center gap-2.5 h-8 rounded-lg text-[13.5px] transition-colors duration-75 outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fa0]/40'
export const FILA_NORMAL = 'text-slate-700 font-medium hover:bg-[#1a4fa0]/8 hover:text-slate-900'
/** Pagina activa (hoja del menu): azul solido. */
export const FILA_ACTIVA = 'bg-[#1a4fa0] text-white font-semibold hover:bg-[#173f82]'
/** Modulo que contiene la pagina activa: solo texto azul, para no competir con la hoja activa. */
export const FILA_CONTIENE = 'text-[#1a4fa0] font-semibold hover:bg-[#1a4fa0]/8'

/** Fila de submodulo (28 px). */
export const SUB = 'group/fila relative flex items-center gap-2 h-7 pl-2.5 pr-1 rounded-md text-[13px] whitespace-nowrap transition-colors duration-75 outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fa0]/40'
export const SUB_NORMAL = 'text-slate-600 hover:bg-[#1a4fa0]/8 hover:text-slate-900'
export const SUB_ACTIVO = 'bg-[#1a4fa0] text-white font-semibold hover:bg-[#173f82]'

/** Titulo de seccion plegable. */
export const SECCION = 'w-full flex items-center gap-1 px-2.5 pt-3.5 pb-1.5 text-[10.5px] font-semibold uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors'
