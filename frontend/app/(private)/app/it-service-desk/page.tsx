'use client'

import { useState, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useAuthStore } from '@/store/authStore'
import { getDashboardStats } from '@/services/itServiceDeskService'
import { Lock, TrendingUp, Clock, Users } from 'lucide-react'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

interface SlaCount { a_tiempo: number; vencido: number; en_backlog?: number; por_vencer: number }
interface PorUsuario { nombre: string; a_tiempo: number; vencido: number; total: number }

interface Stats {
  scope: string
  rango: { desde: string; hasta: string }
  total_completados_periodo: number
  sla_general: SlaCount
  por_especialidad: { funcional: number; tecnico: number } | null
  sla_tecnico: SlaCount | null
  sla_funcional: SlaCount | null
  histograma: { fecha: string; cantidad: number }[]
  por_usuario: PorUsuario[] | null
}

function firstDayOfMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const COLOR_ON_TIME = '#059669'
const COLOR_OVERDUE = '#dc2626'
const COLOR_BACKLOG = '#94a3b8'
const COLOR_PRONTO = '#f97316'

function KpiCard({ label, value, icon: Icon, color }: { label: string; value: number | string; icon: any; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-300 shadow-md p-5 flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}15` }}>
        <Icon size={22} style={{ color }} />
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="text-2xl font-bold text-slate-800 mt-0.5">{value}</p>
      </div>
    </div>
  )
}

function DonutChart({ title, sla, big = false, showPorVencer = false }: { title: string; sla: SlaCount; big?: boolean; showPorVencer?: boolean }) {
  const enBacklog = sla.en_backlog ?? 0
  const aTiempoMostrado = showPorVencer ? sla.a_tiempo : sla.a_tiempo + sla.por_vencer
  const total = sla.a_tiempo + sla.vencido + enBacklog + sla.por_vencer
  const height = big ? 280 : 240
  const data = [
    { value: aTiempoMostrado, name: 'A tiempo', itemStyle: { color: COLOR_ON_TIME } },
    { value: sla.vencido, name: 'Vencido', itemStyle: { color: COLOR_OVERDUE } },
  ]
  if (enBacklog > 0 || sla.en_backlog !== undefined) {
    data.push({ value: enBacklog, name: 'En backlog', itemStyle: { color: COLOR_BACKLOG } })
  }
  if (showPorVencer) {
    data.push({ value: sla.por_vencer, name: 'Por vencer', itemStyle: { color: COLOR_PRONTO } })
  }
  const option = {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, left: 'center', itemGap: 4, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 10 } },
    series: [{
      type: 'pie',
      radius: ['55%', '75%'], center: ['50%', '42%'],
      avoidLabelOverlap: true,
      label: {
        show: true,
        formatter: (p: any) => (p.value > 0 ? `${p.percent}%` : ''),
        fontSize: big ? 15 : 12,
        fontWeight: 'bold',
      },
      labelLine: { show: false },
      data,
    }],
  }
  return (
    <div className="bg-white rounded-2xl border border-slate-300 shadow-md p-5">
      <p className={`font-bold uppercase tracking-wide text-slate-500 mb-2 ${big ? 'text-sm' : 'text-xs'}`}>{title}</p>
      {total === 0 ? (
        <div className="flex items-center justify-center text-slate-300 text-sm" style={{ height }}>Sin tickets abiertos en el rango</div>
      ) : (
        <ReactECharts option={option} style={{ height }} />
      )}
    </div>
  )
}

function PorUsuarioChart({ data }: { data: PorUsuario[] }) {
  const sorted = [...data].sort((a, b) => a.total - b.total)
  const option = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { top: 0, textStyle: { fontSize: 12 } },
    grid: { left: 150, right: 40, top: 35, bottom: 10 },
    xAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#f1f5f9' } } },
    yAxis: { type: 'category', data: sorted.map(d => d.nombre), axisTick: { show: false }, axisLabel: { fontSize: 11 } },
    series: [
      { name: 'A tiempo', type: 'bar', stack: 'total', data: sorted.map(d => d.a_tiempo), itemStyle: { color: COLOR_ON_TIME }, barMaxWidth: 22 },
      {
        name: 'Vencido', type: 'bar', stack: 'total', data: sorted.map(d => d.vencido), itemStyle: { color: COLOR_OVERDUE }, barMaxWidth: 22,
        label: { show: true, position: 'right', formatter: (p: any) => `${sorted[p.dataIndex].total}`, fontWeight: 'bold' },
      },
    ],
  }
  return (
    <div className="bg-white rounded-2xl border border-slate-300 shadow-md p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Tickets abiertos por persona asignada</p>
      {data.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-slate-300 text-sm">Sin asignaciones en el rango</div>
      ) : (
        <ReactECharts option={option} style={{ height: Math.max(180, sorted.length * 42 + 40) }} />
      )}
    </div>
  )
}

function HistogramChart({ data }: { data: { fecha: string; cantidad: number }[] }) {
  const option = {
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 20, top: 20, bottom: 60 },
    xAxis: { type: 'category', data: data.map(d => d.fecha.slice(5)), axisLabel: { fontSize: 10, rotate: 45 } },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#f1f5f9' } } },
    dataZoom: [
      { type: 'inside', start: 0, end: 100 },
      { type: 'slider', start: 0, end: 100, height: 18, bottom: 5 },
    ],
    series: [{
      type: 'line', data: data.map(d => d.cantidad), smooth: true, symbol: 'circle', symbolSize: 7,
      lineStyle: { color: '#7c2d12', width: 2.5 }, itemStyle: { color: '#7c2d12' },
      areaStyle: { color: 'rgba(124, 45, 18, 0.08)' },
    }],
  }
  return (
    <div className="bg-white rounded-2xl border border-slate-300 shadow-md p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Volumen diario de tickets</p>
      <ReactECharts option={option} style={{ height: 320 }} />
    </div>
  )
}

export default function ItServiceDeskDashboardPage() {
  const { user } = useAuthStore()
  const roles: string[] = user?.roles ?? []

  const hasFullAccess = roles.includes('it-service-desk:incident-manager')
    || roles.includes('it-service-desk:project-manager')
    || roles.includes('it-service-desk:comite-directivo')
    || roles.includes('super_admin')
  const isEspecialista = roles.includes('it-service-desk:especialista-funcional') || roles.includes('it-service-desk:especialista-tecnico')
  const canViewDashboard = hasFullAccess || isEspecialista

  const [showPorVencer, setShowPorVencer] = useState(false)
  const [dateFrom, setDateFrom] = useState(firstDayOfMonth())
  const [dateTo, setDateTo] = useState(today())
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!canViewDashboard) { setLoading(false); return }
    setLoading(true)
    setError(null)
    getDashboardStats({ date_from: dateFrom, date_to: dateTo })
      .then(res => setStats(res.data))
      .catch(err => setError(err?.response?.data?.detail ?? 'No se pudieron cargar las metricas'))
      .finally(() => setLoading(false))
  }, [dateFrom, dateTo, canViewDashboard])

  const slaGeneralTotal = stats ? stats.sla_general.a_tiempo + stats.sla_general.vencido + (stats.sla_general.en_backlog ?? 0) : 0
  const slaPercent = useMemo(() => {
    if (!stats || slaGeneralTotal === 0) return null
    return Math.round((stats.sla_general.a_tiempo / slaGeneralTotal) * 100)
  }, [stats, slaGeneralTotal])

  if (!canViewDashboard) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-32 text-center px-6">
        <div className="p-5 bg-slate-100 rounded-2xl mb-6">
          <Lock size={40} className="text-slate-400" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">IT Service Desk</h1>
        <p className="text-slate-400 text-sm max-w-sm">
          Selecciona un submódulo del menú lateral para comenzar.
        </p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard de métricas</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {hasFullAccess ? 'Vista completa del módulo' : `Vista de tu especialidad (${stats?.scope ?? '...'})`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPorVencer(v => !v)}
            className={`px-3 py-2 rounded-lg text-sm font-medium border transition ${showPorVencer ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-slate-500 border-slate-300 hover:border-orange-300'}`}
          >
            Por vencer
          </button>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          <span className="text-slate-400 text-sm">a</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-[#7c2d12] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error || !stats ? (
        <div className="text-center py-20 text-red-500 text-sm">{error ?? 'No se pudieron cargar las metricas'}</div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard label="Completados en el periodo" value={stats.total_completados_periodo} icon={TrendingUp} color={COLOR_ON_TIME} />
            <KpiCard label="Cumplimiento de SLA" value={slaPercent !== null ? `${slaPercent}%` : '—'} icon={Clock} color={slaPercent !== null && slaPercent >= 80 ? COLOR_ON_TIME : COLOR_OVERDUE} />
            <KpiCard label="Tickets abiertos" value={slaGeneralTotal} icon={Users} color="#1a4fa0" />
          </div>

          {/* 3 donas en una sola fila -- General un poco mas ancho que las otras 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr_1fr] gap-4">
            <DonutChart title="SLA general (tickets abiertos)" sla={stats.sla_general} big showPorVencer={showPorVencer} />
            {hasFullAccess && stats.sla_funcional && <DonutChart title="SLA — Funcional" sla={stats.sla_funcional} showPorVencer={showPorVencer} />}
            {hasFullAccess && stats.sla_tecnico && <DonutChart title="SLA — Técnico" sla={stats.sla_tecnico} showPorVencer={showPorVencer} />}
          </div>

          <HistogramChart data={stats.histograma} />

          {hasFullAccess && stats.por_usuario && (
            <PorUsuarioChart data={stats.por_usuario} />
          )}
        </div>
      )}
    </div>
  )
}
