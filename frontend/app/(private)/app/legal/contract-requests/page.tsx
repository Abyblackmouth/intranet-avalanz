'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Users, Building2, Layers, ShieldCheck, ShieldOff,
  UserCheck, UserX, TrendingUp, Activity, RefreshCw,
  Server, CheckCircle2, XCircle, Clock
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend
} from 'recharts'
import api from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import PageWrapper from '@/components/layout/PageWrapper'

// ─── Types ───────────────────────────────────────────────────────────────────

interface DashboardMetrics {
  kpis: {
    total_users: number
    active_users: number
    locked_users: number
    inactive_users: number
    total_companies: number
    active_companies: number
    total_groups: number
    total_modules: number
  }
  users_by_company: { company: string; total: number }[]
  roles_distribution: { role: string; total: number }[]
  recent_users: {
    user_id: string
    full_name: string
    email: string
    company: string
    created_at: string
  }[]
  users_last_7_days: { date: string; total: number }[]
}

interface ServiceStatus {
  name: string
  key: string
  status: 'up' | 'down' | 'loading'
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SERVICES: ServiceStatus[] = [
  { name: 'Auth', key: 'auth', status: 'loading' },
  { name: 'Admin', key: 'admin', status: 'loading' },
  { name: 'Upload', key: 'upload', status: 'loading' },
  { name: 'Notify', key: 'notify', status: 'loading' },
  { name: 'WebSocket', key: 'websocket', status: 'loading' },
  { name: 'Email', key: 'email', status: 'loading' },
]

const CHART_COLORS = [
  '#1a4fa0', '#3b82f6', '#6366f1', '#8b5cf6',
  '#ec4899', '#f59e0b', '#10b981', '#64748b',
]

const PIE_COLORS = ['#1a4fa0', '#f59e0b', '#10b981', '#64748b']

// ─── Helper components ───────────────────────────────────────────────────────

const KpiCard = ({
  label, value, sub, icon: Icon, color, trend
}: {
  label: string
  value: number
  sub?: string
  icon: React.ElementType
  color: string
  trend?: 'up' | 'down' | 'neutral'
}) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-[#1a4fa0]/30 hover:-translate-y-0.5 transition-all duration-200 p-5">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</p>
        <p className="text-3xl font-bold text-slate-900">{value.toLocaleString()}</p>
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </div>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        <Icon size={18} className="text-white" />
      </div>
    </div>
  </div>
)

const ServicePill = ({ service }: { service: ServiceStatus }) => (
  <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 border border-slate-100">
    <div className="flex items-center gap-2">
      <Server size={13} className="text-slate-400" />
      <span className="text-xs font-medium text-slate-700">{service.name}</span>
    </div>
    {service.status === 'loading' ? (
      <Clock size={13} className="text-slate-400 animate-pulse" />
    ) : service.status === 'up' ? (
      <CheckCircle2 size={13} className="text-emerald-500" />
    ) : (
      <XCircle size={13} className="text-red-500" />
    )}
  </div>
)

const formatRelative = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Hoy'
  if (days === 1) return 'Ayer'
  return `Hace ${days} días`
}

const avatarColors = [
  'bg-[#1a4fa0]', 'bg-violet-500', 'bg-teal-500',
  'bg-orange-400', 'bg-rose-500', 'bg-emerald-500',
]

const Avatar = ({ name }: { name: string }) => {
  const initials = name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
  const idx = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % avatarColors.length
  return (
    <div className={`w-8 h-8 rounded-lg ${avatarColors[idx]} flex items-center justify-center shrink-0`}>
      <span className="text-white text-xs font-bold">{initials}</span>
    </div>
  )
}

// ─── Custom tooltip for charts ───────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-sm font-bold text-slate-900">{payload[0].value} usuarios</p>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuthStore()
  const [mounted, setMounted] = useState(false)
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [services, setServices] = useState<ServiceStatus[]>(SERVICES)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => { setMounted(true) }, [])

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/dashboard/metrics')
      setMetrics(res.data.data)
      setLastUpdated(new Date())
    } catch {
      // silencioso
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchServices = useCallback(async () => {
    const keys = ['auth', 'admin', 'upload', 'notify', 'websocket', 'email']
    const results = await Promise.allSettled(
      keys.map(k => api.get(`/health/${k}`))
    )
    setServices(keys.map((key, i) => ({
      name: SERVICES.find(s => s.key === key)?.name || key,
      key,
      status: results[i].status === 'fulfilled' ? 'up' : 'down',
    })))
  }, [])

  useEffect(() => {
    if (!mounted) return
    fetchMetrics()
    fetchServices()
  }, [mounted, fetchMetrics, fetchServices])

  const handleRefresh = () => {
    setLoading(true)
    setServices(SERVICES)
    fetchMetrics()
    fetchServices()
  }

  if (!mounted) return null

  const servicesUp = services.filter(s => s.status === 'up').length
  const servicesTotal = services.filter(s => s.status !== 'loading').length

  return (
    <PageWrapper
      title="Dashboard"
      description={lastUpdated
        ? `Actualizado ${lastUpdated.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`
        : 'Cargando métricas...'}
      actions={
        <button
          onClick={handleRefresh}
          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center h-96">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-[#1a4fa0] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-400">Cargando métricas...</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">

          {/* ── Saludo ── */}
          <div className="bg-gradient-to-r from-[#1a4fa0] to-blue-600 rounded-xl p-5 text-white shadow-sm">
            <p className="text-sm font-medium opacity-80">Bienvenido de vuelta</p>
            <p className="text-xl font-bold mt-0.5">{user?.full_name || 'Administrador'}</p>
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${servicesUp === servicesTotal && servicesTotal > 0 ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                <span className="text-xs opacity-90">
                  {servicesUp}/{servicesTotal} servicios activos
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Activity size={12} className="opacity-80" />
                <span className="text-xs opacity-90">
                  {metrics?.kpis.active_users || 0} usuarios activos
                </span>
              </div>
            </div>
          </div>

          {/* ── KPIs ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Total usuarios"
              value={metrics?.kpis.total_users || 0}
              sub={`${metrics?.kpis.active_users || 0} activos`}
              icon={Users}
              color="bg-[#1a4fa0]"
            />
            <KpiCard
              label="Bloqueados"
              value={metrics?.kpis.locked_users || 0}
              sub="cuentas bloqueadas"
              icon={ShieldOff}
              color="bg-red-500"
            />
            <KpiCard
              label="Empresas"
              value={metrics?.kpis.total_companies || 0}
              sub={`${metrics?.kpis.active_companies || 0} activas`}
              icon={Building2}
              color="bg-emerald-500"
            />
            <KpiCard
              label="Módulos activos"
              value={metrics?.kpis.total_modules || 0}
              sub={`${metrics?.kpis.total_groups || 0} grupos`}
              icon={Layers}
              color="bg-violet-500"
            />
          </div>

          {/* ── Gráficas row ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Usuarios por empresa */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <p className="text-sm font-semibold text-slate-900 mb-4">Usuarios por empresa</p>
              {metrics?.users_by_company && metrics.users_by_company.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={metrics.users_by_company} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="company" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                      {metrics.users_by_company.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-52 flex items-center justify-center">
                  <p className="text-sm text-slate-400 italic">Sin datos disponibles</p>
                </div>
              )}
            </div>

            {/* Distribución de roles */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <p className="text-sm font-semibold text-slate-900 mb-4">Distribución de roles</p>
              {metrics?.roles_distribution && metrics.roles_distribution.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie
                        data={metrics.roles_distribution}
                        dataKey="total"
                        nameKey="role"
                        cx="50%"
                        cy="50%"
                        outerRadius={70}
                        innerRadius={40}
                      >
                        {metrics.roles_distribution.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v, n) => [v, n]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 mt-2">
                    {metrics.roles_distribution.map((r, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                          <span className="text-xs text-slate-600">{r.role}</span>
                        </div>
                        <span className="text-xs font-semibold text-slate-900">{r.total}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="h-52 flex items-center justify-center">
                  <p className="text-sm text-slate-400 italic">Sin datos disponibles</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Actividad últimos 7 días + Servicios ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Usuarios creados últimos 7 días */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <p className="text-sm font-semibold text-slate-900 mb-4">Usuarios creados — últimos 7 días</p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={metrics?.users_last_7_days || []} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="total"
                    stroke="#1a4fa0"
                    strokeWidth={2}
                    dot={{ fill: '#1a4fa0', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Estado de servicios */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-slate-900">Estado de servicios</p>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  servicesUp === servicesTotal && servicesTotal > 0
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-amber-50 text-amber-700'
                }`}>
                  {servicesUp}/{servicesTotal} activos
                </span>
              </div>
              <div className="space-y-2">
                {services.map(s => <ServicePill key={s.key} service={s} />)}
              </div>
            </div>
          </div>

          {/* ── Últimos usuarios creados ── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <p className="text-sm font-semibold text-slate-900 mb-4">Últimos usuarios creados</p>
            {metrics?.recent_users && metrics.recent_users.length > 0 ? (
              <div className="space-y-3">
                {metrics.recent_users.map(u => (
                  <div key={u.user_id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.full_name} />
                      <div>
                        <p className="text-sm font-medium text-slate-900 leading-tight">{u.full_name}</p>
                        <p className="text-xs text-slate-400 leading-tight">{u.email}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium text-slate-600">{u.company}</p>
                      <p className="text-xs text-slate-400">{formatRelative(u.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic text-center py-4">Sin usuarios recientes</p>
            )}
          </div>

        </div>
      )}
    </PageWrapper>
  )
}
