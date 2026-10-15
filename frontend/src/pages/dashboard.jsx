import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts'
import { getNetwork, getObservations, getRecommendations, getRisk } from '../api'
import { siteName, useData } from '../components/ui.jsx'

const USE_API = import.meta.env.VITE_USE_API === 'true'

const SITES_CONFIG = [
  { id: 'ambatale', name: 'Ambatale Intake', role: 'Primary Municipal Intake', pop: '420,000', badge: 'Critical Risk', tone: 'rose' },
  { id: 'biyagama', name: 'Biyagama Plant', role: 'Secondary Industrial Intake', pop: '180,000', badge: 'Moderate Watch', tone: 'amber' },
]

const PARAM_CONFIG = {
  turbidity: { label: 'Turbidity', unit: 'NTU', key: 'turbidity_ntu', threshold: 50, thresholdLabel: 'WHO Warning Limit (50 NTU)', color: '#0d9488', gradientFrom: '#0d9488', gradientTo: '#14b8a6' },
  ph: { label: 'pH Level', unit: 'pH', key: 'ph', threshold: 8.5, thresholdLabel: 'Upper Safe Threshold (8.5)', color: '#3b82f6', gradientFrom: '#2563eb', gradientTo: '#60a5fa' },
  rainfall: { label: 'Precipitation', unit: 'mm/h', key: 'rainfall', threshold: 8.0, thresholdLabel: 'Storm Surge Trigger (8 mm/h)', color: '#6366f1', gradientFrom: '#4f46e5', gradientTo: '#818cf8' },
  tds: { label: 'Dissolved Solids', unit: 'ppm', key: 'tds_ppm', threshold: 250, thresholdLabel: 'TDS Elevated Guide (250 ppm)', color: '#d97706', gradientFrom: '#d97706', gradientTo: '#fbbf24' },
}

export default function Dashboard() {
  const [selectedSite, setSelectedSite] = useState('ambatale')
  const [activeParam, setActiveParam] = useState('turbidity')
  const [timeRange, setTimeRange] = useState(6)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState(new Date())
  const [checkedActions, setCheckedActions] = useState({ 0: false, 1: false, 2: false })

  const net = useData(getNetwork)
  const rawRisk = useData(getRisk)
  const rawRecs = useData(getRecommendations)
  const observations = useData(() => getObservations(selectedSite), [selectedSite])

  const handleRefresh = () => {
    setIsRefreshing(true)
    setTimeout(() => {
      setIsRefreshing(false)
      setLastSyncTime(new Date())
    }, 700)
  }

  const toggleAction = (index) => {
    setCheckedActions((prev) => ({ ...prev, [index]: !prev[index] }))
  }

  if (!net || !rawRisk || !rawRecs || !observations) return <DashboardSkeleton />

  const risk = rawRisk.filter((item) => ['ambatale', 'biyagama'].includes(item.site_id))
  const recs = rawRecs.filter((item) => ['ambatale', 'biyagama'].includes(item.site_id))
  const riskBySite = Object.fromEntries(risk.map((item) => [item.site_id, item]))
  const topRecommendation = recs[0]
  const topRisk = riskBySite[topRecommendation?.site_id || 'ambatale']
  const criticalSites = risk.filter((item) => item.risk_category === 'critical').length
  const anomalyCount = risk.filter((item) => item.anomaly?.flag).length
  const totalPopulation = recs.reduce((sum, item) => sum + item.population_exposed, 0)
  const predictedFailures = net.nodes.filter((node) => node.predicted_failure).length
  const currentObs = observations[observations.length - 1]
  const sampling = currentObs?.sampling || {}
  const isHighPrioritySampling = sampling.transmission_priority === 'high'

  // Prepare chart series
  const filteredObservations = observations.slice(-Math.min(observations.length, timeRange * 4))
  const chartData = filteredObservations.map((obs) => ({
    time: new Date(obs.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    turbidity_ntu: obs.readings.turbidity_ntu,
    ph: obs.readings.ph,
    rainfall: obs.rainfall_mm_h,
    tds_ppm: obs.readings.tds_ppm,
    battery: obs.battery_pct,
  }))

  const activeParamMeta = PARAM_CONFIG[activeParam]
  const paramValues = chartData.map((d) => d[activeParamMeta.key]).filter((v) => typeof v === 'number')
  const currentVal = paramValues[paramValues.length - 1] || 0
  const peakVal = paramValues.length ? Math.max(...paramValues) : 0
  const avgVal = paramValues.length ? +(paramValues.reduce((a, b) => a + b, 0) / paramValues.length).toFixed(1) : 0

  return (
    <div className="space-y-7 pb-10">
      {/* 1. EXECUTIVE COMMAND HEADER */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/70 to-sky-50/30 p-6 shadow-[0_4px_25px_-5px_rgba(15,23,42,0.06)] sm:p-7"
      >
        <div className="absolute -right-16 -top-20 size-72 rounded-full bg-cyan-400/10 blur-3xl pointer-events-none" />
        <div className="absolute right-40 -bottom-20 size-60 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100/90 px-3 py-1 text-xs font-bold uppercase tracking-wider text-sky-800">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-sky-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-sky-600" />
                </span>
                Kelani Basin Early Warning System
              </span>

              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${USE_API ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100/80 text-amber-900'}`}>
                <span className={`size-1.5 rounded-full ${USE_API ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                {USE_API ? 'Live Telemetry Connected' : 'Research Demonstration Mode'}
              </span>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl lg:text-4xl">
              Water Safety &amp; Risk Command Center
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
              Synchronized AI intelligence integrating real-time river telemetry, self-healing LoRa mesh resilience, and automated emergency decision response.
            </p>
          </div>

          {/* Quick controls bar */}
          <div className="grid w-full max-w-[31rem] grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] lg:w-auto lg:min-w-[31rem]">
            <div
              className="flex min-h-14 items-center gap-3 rounded-full border border-slate-200/90 bg-white/95 px-5 py-3 shadow-[0_8px_24px_-12px_rgba(15,23,42,0.28)] backdrop-blur-md sm:min-w-0"
              title="Telemetry feed status"
            >
              <span className="relative flex size-3 shrink-0">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/60" />
                <span className="relative inline-flex size-3 rounded-full bg-emerald-500 ring-4 ring-emerald-500/10" />
              </span>
              <span className="text-sm font-medium text-slate-500">Last telemetry</span>
              <time className="ml-auto text-base font-bold tracking-tight text-slate-800 tabular-nums">
                {lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </time>
            </div>

            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="inline-flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-full border border-slate-200/90 bg-white/95 px-5 text-sm font-semibold text-slate-700 shadow-[0_8px_24px_-12px_rgba(15,23,42,0.28)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:text-slate-950 hover:shadow-[0_12px_28px_-12px_rgba(15,23,42,0.35)] active:translate-y-0 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
              title={isRefreshing ? 'Syncing telemetry feed' : 'Refresh telemetry feed'}
            >
              <span className="grid size-7 place-items-center rounded-full bg-slate-100 text-slate-500">
                <RefreshIcon className={`size-4 ${isRefreshing ? 'animate-spin text-teal-600' : ''}`} />
              </span>
              <span>{isRefreshing ? 'Syncing…' : 'Sync data'}</span>
            </button>

            <Link
              to="/decision"
              className="group inline-flex min-h-14 items-center gap-3 rounded-full bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800 px-5 text-sm font-semibold text-white shadow-[0_10px_24px_-10px_rgba(15,23,42,0.65)] transition hover:-translate-y-0.5 hover:from-slate-800 hover:to-slate-700 hover:shadow-[0_14px_28px_-10px_rgba(15,23,42,0.7)] active:translate-y-0 active:scale-[0.98] sm:col-span-2"
            >
              <span className="grid size-8 place-items-center rounded-full bg-amber-400/15 ring-1 ring-amber-300/20">
                <ShieldAlertIcon className="size-4 text-amber-300" />
              </span>
              <span>Response protocol</span>
              <ArrowUpRightIcon className="ml-auto size-4 text-slate-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white" />
            </Link>
          </div>
        </div>

        {/* Quick Station Switcher Tabs */}
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-200/80 pt-4">
          <span className="mr-1 text-xs font-bold uppercase tracking-wider text-slate-400">Monitoring Station:</span>
          {SITES_CONFIG.map((site) => {
            const isSelected = selectedSite === site.id
            const siteRisk = riskBySite[site.id]?.risk_category || 'low'
            return (
              <button
                key={site.id}
                onClick={() => setSelectedSite(site.id)}
                className={`group flex items-center gap-2.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer ${
                  isSelected
                    ? 'border border-blue-500/30 bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : 'border border-slate-200/80 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className={`size-2 rounded-full ${isSelected ? 'bg-white' : siteRisk === 'critical' ? 'bg-rose-500' : siteRisk === 'moderate' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                <span>{site.name}</span>
                <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  {site.pop}
                </span>
              </button>
            )
          })}
        </div>
      </motion.header>

      {/* 2. EXECUTIVE METRICS GRID (4 HIGH-IMPACT CARDS) */}
      <section aria-label="Executive Intelligence KPIs" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Metric 1: River Risk Alert */}
        <motion.div
          whileHover={{ y: -3, transition: { duration: 0.2 } }}
          className="relative overflow-hidden rounded-3xl border border-rose-200/90 bg-gradient-to-br from-rose-50/80 via-white to-white p-5 shadow-sm"
        >
          <div className="flex items-start justify-between">
            <span className="grid size-11 place-items-center rounded-2xl bg-rose-100 text-rose-700 shadow-sm">
              <AlertTriangleIcon className="size-5" />
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-bold text-rose-800">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-rose-600" />
              </span>
              {criticalSites} Critical Site
            </span>
          </div>
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-rose-700">Contamination Hazard</p>
            <p className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">
              84<span className="text-xl text-rose-600 font-semibold">%</span>
            </p>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
              <span>Ambatale Intake flagged</span>
              <span className="font-semibold text-rose-700">{anomalyCount} anomaly</span>
            </div>
          </div>
          <div className="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-rose-100">
            <div className="h-full rounded-full bg-gradient-to-r from-rose-500 to-red-600" style={{ width: '84%' }} />
          </div>
        </motion.div>

        {/* Metric 2: Population Served */}
        <motion.div
          whileHover={{ y: -3, transition: { duration: 0.2 } }}
          className="relative overflow-hidden rounded-3xl border border-sky-200/90 bg-gradient-to-br from-sky-50/80 via-white to-white p-5 shadow-sm"
        >
          <div className="flex items-start justify-between">
            <span className="grid size-11 place-items-center rounded-2xl bg-sky-100 text-sky-700 shadow-sm">
              <UsersIcon className="size-5" />
            </span>
            <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-bold text-sky-800">
              Kelani Basin
            </span>
          </div>
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-sky-800">Populations Safeguarded</p>
            <p className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">
              {totalPopulation.toLocaleString()}<span className="text-xl font-semibold text-sky-700"> residents</span>
            </p>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
              <span>Across {recs.length} service zones (Ambatale &amp; Biyagama)</span>
              <span className="font-semibold text-sky-700">100% active coverage</span>
            </div>
          </div>
          <div className="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-sky-100">
            <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-blue-600" style={{ width: '100%' }} />
          </div>
        </motion.div>

        {/* Metric 3: LoRa Mesh PDR */}
        <motion.div
          whileHover={{ y: -3, transition: { duration: 0.2 } }}
          className="relative overflow-hidden rounded-3xl border border-teal-200/90 bg-gradient-to-br from-teal-50/80 via-white to-white p-5 shadow-sm"
        >
          <div className="flex items-start justify-between">
            <span className="grid size-11 place-items-center rounded-2xl bg-teal-100 text-teal-700 shadow-sm">
              <RadioIcon className="size-5" />
            </span>
            <span className="rounded-full bg-teal-100 px-2.5 py-1 text-[11px] font-bold text-teal-800">
              {net.nodes.length - predictedFailures}/{net.nodes.length} Healthy Nodes
            </span>
          </div>
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-teal-800">Mesh Delivery Reliability</p>
            <p className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">
              {net.pdr_percent}<span className="text-xl font-semibold text-teal-600">%</span>
            </p>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
              <span>{net.latency_ms} ms round-trip delay</span>
              <span className="font-semibold text-teal-700">{net.recovery_s}s failover</span>
            </div>
          </div>
          <div className="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-teal-100">
            <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500" style={{ width: `${net.pdr_percent}%` }} />
          </div>
        </motion.div>

        {/* Metric 4: Adaptive Sensing Cadence */}
        <motion.div
          whileHover={{ y: -3, transition: { duration: 0.2 } }}
          className="relative overflow-hidden rounded-3xl border border-violet-200/90 bg-gradient-to-br from-violet-50/80 via-white to-white p-5 shadow-sm"
        >
          <div className="flex items-start justify-between">
            <span className="grid size-11 place-items-center rounded-2xl bg-violet-100 text-violet-700 shadow-sm">
              <ActivityIcon className="size-5" />
            </span>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${isHighPrioritySampling ? 'bg-amber-100 text-amber-900' : 'bg-violet-100 text-violet-800'}`}>
              {isHighPrioritySampling ? 'Rapid Storm Cadence' : 'Standard Routine'}
            </span>
          </div>
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-800">Adaptive Sampling Rate</p>
            <p className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">
              {sampling.interval_s ? `${Math.round(sampling.interval_s / 60)}` : '2'}<span className="text-xl font-semibold text-violet-600"> min</span>
            </p>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
              <span>Rainfall {currentObs?.rainfall_mm_h || 11.2} mm/h</span>
              <span className="font-semibold text-violet-700">82% battery avg</span>
            </div>
          </div>
          <div className="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-violet-100">
            <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-600" style={{ width: isHighPrioritySampling ? '85%' : '30%' }} />
          </div>
        </motion.div>
      </section>

      {/* 3. INTERACTIVE END-TO-END RESEARCH PIPELINE STEPPER */}
      <section aria-label="AquaShield 4-Stage Research Architecture" className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-sky-700">Research Framework</span>
            <h2 className="text-lg font-bold text-slate-900">Synchronized 4-Stage Intelligence Pipeline</h2>
          </div>
          <span className="text-xs text-slate-500">Sensor reading to emergency intervention</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { step: '01', title: 'Adaptive Sensing', tag: 'Dynamic Sampling', detail: 'Rapid 120s cadence during storm events', href: '/sensing?view=adaptive', color: 'border-cyan-200 bg-cyan-50/60 text-cyan-900' },
            { step: '02', title: 'LoRa Mesh Network', tag: 'Resilient Topology', detail: 'Automated rerouting around failing node R4', href: '/network', color: 'border-blue-200 bg-blue-50/60 text-blue-900' },
            { step: '03', title: 'AI Contamination Risk', tag: 'Explainable XAI', detail: '6-Hour lead-time risk forecast & SHAP weights', href: '/prediction', color: 'border-violet-200 bg-violet-50/60 text-violet-900' },
            { step: '04', title: 'Decision Support', tag: 'Ranked Actions', detail: 'Prioritized intake shutdown & alert protocols', href: '/decision', color: 'border-rose-200 bg-rose-50/60 text-rose-900' },
          ].map((item) => (
            <Link
              key={item.step}
              to={item.href}
              className={`group relative flex flex-col justify-between rounded-2xl border p-4 transition-all hover:-translate-y-1 hover:shadow-md ${item.color}`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex size-8 items-center justify-center rounded-xl bg-white font-mono text-xs font-black shadow-sm">
                    {item.step}
                  </span>
                  <span className="rounded-lg bg-white/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                    {item.tag}
                  </span>
                </div>
                <h3 className="mt-3 text-base font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                  {item.title}
                </h3>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  {item.detail}
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-black/5 pt-2 text-xs font-semibold text-slate-700">
                <span>Inspect Stage</span>
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 4. MAIN SPLIT CONTENT: TELEMETRY ANALYSIS + INCIDENT COMMAND */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(340px,1fr)]">
        {/* LEFT COLUMN: INTERACTIVE TELEMETRY & STATION MATRIX */}
        <div className="space-y-6">
          {/* Interactive Multi-Parameter Telemetry Visualizer */}
          <section className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-teal-500 animate-pulse" />
                  <p className="text-xs font-bold uppercase tracking-wider text-teal-700">
                    Live Telemetry Stream · {siteName(selectedSite)}
                  </p>
                </div>
                <h2 className="mt-1 text-xl font-bold text-slate-900">
                  Sensor Diagnostics &amp; Trend Analysis
                </h2>
              </div>

              {/* Time Horizon Selector */}
              <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                {[
                  { label: '1H', val: 1 },
                  { label: '3H', val: 3 },
                  { label: '6H', val: 6 },
                  { label: '24H', val: 24 },
                ].map((range) => (
                  <button
                    key={range.label}
                    onClick={() => setTimeRange(range.val)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all cursor-pointer ${
                      timeRange === range.val
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-950'
                    }`}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Parameter Selector Tabs */}
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Object.entries(PARAM_CONFIG).map(([key, config]) => {
                const isSelected = activeParam === key
                const latestReading = currentObs?.readings?.[config.key] ?? (key === 'rainfall' ? currentObs?.rainfall_mm_h : 0)
                return (
                  <button
                    key={key}
                    onClick={() => setActiveParam(key)}
                    className={`relative rounded-2xl border p-3.5 text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-blue-500/40 bg-blue-50/70 shadow-sm ring-1 ring-blue-500/20'
                        : 'border-slate-200/70 bg-slate-50/60 hover:bg-slate-100/60 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="font-semibold">{config.label}</span>
                      <span className="text-[10px] font-mono font-bold uppercase text-slate-400">{config.unit}</span>
                    </div>
                    <p className="mt-1.5 text-xl font-extrabold tracking-tight text-slate-900">
                      {latestReading ?? '--'}{' '}
                      <span className="text-xs font-semibold text-slate-500">{config.unit}</span>
                    </p>
                    <div className="mt-1 text-[11px] font-medium text-slate-500">
                      {latestReading > config.threshold ? (
                        <span className="font-bold text-amber-600">Exceeds alert level</span>
                      ) : (
                        <span className="text-emerald-700">Within nominal bounds</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Chart Statistics Bar */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-slate-50/80 px-4 py-3 text-xs">
              <div className="flex items-center gap-6">
                <div>
                  <span className="text-slate-400">Current:</span>{' '}
                  <span className="font-bold text-slate-900">{currentVal} {activeParamMeta.unit}</span>
                </div>
                <div>
                  <span className="text-slate-400">Peak in period:</span>{' '}
                  <span className="font-bold text-rose-600">{peakVal} {activeParamMeta.unit}</span>
                </div>
                <div>
                  <span className="text-slate-400">Average:</span>{' '}
                  <span className="font-bold text-slate-800">{avgVal} {activeParamMeta.unit}</span>
                </div>
              </div>
              <span className="text-[11px] font-medium text-slate-500">
                {activeParamMeta.thresholdLabel}
              </span>
            </div>

            {/* AreaChart */}
            <div className="mt-4 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 12, right: 8, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="paramFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={activeParamMeta.color} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={activeParamMeta.color} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="time"
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                  />
                  <YAxis
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                  />
                  <Tooltip
                    content={<CustomChartTooltip unit={activeParamMeta.unit} paramLabel={activeParamMeta.label} />}
                  />
                  <ReferenceLine
                    y={activeParamMeta.threshold}
                    stroke="#f43f5e"
                    strokeDasharray="4 4"
                    label={{ value: 'Warning Limit', fill: '#f43f5e', fontSize: 10, position: 'insideTopRight' }}
                  />
                  <Area
                    type="monotone"
                    dataKey={activeParamMeta.key}
                    stroke={activeParamMeta.color}
                    strokeWidth={2.8}
                    fill="url(#paramFill)"
                    activeDot={{ r: 5, fill: activeParamMeta.color, stroke: '#fff', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
              <span>{chartData[0]?.time || 'Start'}</span>
              <span>Context-Adaptive Frequency: Sampling interval adjusts automatically during rainfall surges</span>
              <span>{chartData[chartData.length - 1]?.time || 'Now'}</span>
            </div>
          </section>

          {/* Site Assessment & Risk Matrix */}
          <section className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Network Telemetry</span>
                <h2 className="text-xl font-bold text-slate-900">River Basin Monitoring Matrix</h2>
              </div>
              <Link to="/prediction" className="text-xs font-bold text-blue-700 hover:text-blue-900">
                View Full AI Predictions →
              </Link>
            </div>

            <div className="divide-y divide-slate-100">
              {recs.map((item) => {
                const assessment = riskBySite[item.site_id]
                const isSelected = selectedSite === item.site_id
                const riskScore = Math.round(assessment.risk_score * 100)
                const isCritical = assessment.risk_category === 'critical'
                const isModerate = assessment.risk_category === 'moderate'

                return (
                  <div
                    key={item.site_id}
                    className={`grid gap-4 py-4 transition-all sm:grid-cols-[minmax(0,1.2fr)_auto] sm:items-center ${
                      isSelected ? 'bg-sky-50/40 px-3 -mx-3 rounded-2xl' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-slate-900 text-base">{siteName(item.site_id)}</h3>
                        <RiskBadge level={assessment.risk_category} />
                        {assessment.anomaly.flag && (
                          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-bold text-orange-800">
                            Anomaly Flagged
                          </span>
                        )}
                        {isSelected && (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                            Active Stream
                          </span>
                        )}
                      </div>

                      <p className="mt-1 text-xs text-slate-500">
                        {item.population_exposed.toLocaleString()} residents protected · AI Confidence {Math.round(assessment.confidence * 100)}%
                      </p>

                      {/* Score bar */}
                      <div className="mt-2.5 flex items-center gap-3">
                        <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full ${
                              isCritical ? 'bg-rose-500' : isModerate ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${riskScore}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold tabular-nums text-slate-700">{riskScore}% Risk</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 sm:flex-col sm:items-end">
                      <p className="text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg px-2.5 py-1">
                        {item.actions[0]?.action}
                      </p>
                      <button
                        onClick={() => setSelectedSite(item.site_id)}
                        className={`text-xs font-bold transition-colors cursor-pointer ${
                          isSelected ? 'text-blue-700' : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {isSelected ? '✓ Chart Focused' : 'Focus Chart →'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN: HIGHEST RESPONSE PRIORITY & NETWORK RADAR */}
        <div className="space-y-6">
          {/* Emergency Incident Command Action Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden rounded-3xl border border-rose-300 bg-gradient-to-b from-rose-50/90 via-white to-white shadow-md ring-1 ring-rose-200"
          >
            {/* Header banner */}
            <div className="border-b border-rose-200/80 bg-gradient-to-r from-rose-600 to-red-600 px-5 py-4 text-white">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                  <span className="size-1.5 rounded-full bg-white animate-ping" />
                  Priority Incident Alert
                </span>
                <span className="font-mono text-xs font-bold text-rose-100">Rank #1 Protocol</span>
              </div>
              <h3 className="mt-2 text-xl font-black text-white">
                {siteName(topRecommendation.site_id)}
              </h3>
              <p className="text-xs text-rose-100">
                Severe pollution pattern detected within 6-hour projection window.
              </p>
            </div>

            <div className="p-5">
              <div className="rounded-2xl bg-rose-50/70 p-4 border border-rose-100">
                <p className="text-[11px] font-bold uppercase tracking-wider text-rose-800">Primary Immediate Directive</p>
                <p className="mt-1 text-base font-bold text-slate-900">{topRecommendation.actions[0]?.action}</p>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">{topRecommendation.actions[0]?.rationale}</p>
              </div>

              {/* Interactive Verification Checklist */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                  <span className="font-bold text-slate-700">Mitigation Checklist</span>
                  <span className="font-mono text-[11px]">
                    {Object.values(checkedActions).filter(Boolean).length} of {topRecommendation.actions.length} Executed
                  </span>
                </div>
                <div className="space-y-2">
                  {topRecommendation.actions.map((act, idx) => (
                    <label
                      key={act.action}
                      onClick={() => toggleAction(idx)}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-2.5 transition-all ${
                        checkedActions[idx]
                          ? 'border-emerald-200 bg-emerald-50/60 text-emerald-950'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={!!checkedActions[idx]}
                        onChange={() => {}}
                        className="mt-0.5 size-4 rounded text-blue-600 focus:ring-blue-500"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs font-bold ${checkedActions[idx] ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                            {act.action}
                          </span>
                          <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-rose-800">
                            {act.urgency}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{act.rationale}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between gap-3">
                <span className="text-[11px] text-slate-500">
                  Priority Score: <strong>{topRecommendation.priority_score.toFixed(2)}</strong>
                </span>
                <Link
                  to="/decision"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-rose-700"
                >
                  Full Action Protocol →
                </Link>
              </div>
            </div>
          </motion.div>

          {/* LoRa Mesh Network Live Topology Radar */}
          <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Network Resilience</span>
                <h3 className="text-base font-bold text-slate-900">LoRa Mesh Auto-Recovery</h3>
              </div>
              <Link to="/network" className="text-xs font-bold text-blue-700 hover:text-blue-900">
                Topology Map →
              </Link>
            </div>

            <div className="mt-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-4 text-white shadow-inner">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Active Routing Path</span>
                <span className="font-mono text-emerald-400 font-bold">● Reroute Nominal</span>
              </div>

              {/* Active Path Visualizer */}
              <div className="mt-3 flex items-center justify-between gap-1 text-center">
                {net.active_path.map((node, i) => (
                  <div key={node} className="flex items-center flex-1">
                    <div className="flex flex-col items-center flex-1">
                      <span className="grid size-9 place-items-center rounded-xl bg-teal-500/20 border border-teal-400 font-mono text-xs font-black text-teal-300 shadow-[0_0_12px_rgba(20,184,166,0.3)]">
                        {node}
                      </span>
                      <span className="mt-1 text-[10px] font-semibold text-slate-400">
                        {i === 0 ? 'Sensor' : i === net.active_path.length - 1 ? 'Gateway' : 'Relay'}
                      </span>
                    </div>
                    {i < net.active_path.length - 1 && (
                      <span className="text-teal-400/80 font-bold text-xs -mt-3 animate-pulse">→</span>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-4 border-t border-slate-700/80 pt-3 text-xs text-slate-300 flex items-center justify-between">
                <span>Degraded Node R4 (19% batt)</span>
                <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                  Self-Healed via R2/R5
                </span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-2.5">
                <p className="text-slate-400 text-[10px] uppercase font-bold">PDR</p>
                <p className="mt-0.5 text-base font-extrabold text-slate-900">{net.pdr_percent}%</p>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-2.5">
                <p className="text-slate-400 text-[10px] uppercase font-bold">Latency</p>
                <p className="mt-0.5 text-base font-extrabold text-slate-900">{net.latency_ms} ms</p>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-2.5">
                <p className="text-slate-400 text-[10px] uppercase font-bold">Failover</p>
                <p className="mt-0.5 text-base font-extrabold text-slate-900">{net.recovery_s} s</p>
              </div>
            </div>
          </div>

          {/* Explainable AI (SHAP Reasoning Engine) */}
          <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-violet-700">Explainable AI</span>
                <h3 className="text-base font-bold text-slate-900">Risk Factor Attribution</h3>
              </div>
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800">
                SHAP XAI
              </span>
            </div>

            <p className="mt-3 text-xs text-slate-600 leading-relaxed">
              Factors driving the 6-hour contamination risk forecast at Ambatale Intake:
            </p>

            <div className="mt-4 space-y-2.5">
              {(topRisk.explanation || []).map((factor) => {
                const isPositive = factor.contribution > 0
                const pct = Math.abs(Math.round(factor.contribution * 100))
                return (
                  <div key={factor.feature} className="text-xs">
                    <div className="flex items-center justify-between text-slate-700">
                      <span className="truncate max-w-[210px] font-medium" title={factor.feature}>
                        {factor.feature}
                      </span>
                      <span className={`font-mono font-bold ${isPositive ? 'text-rose-600' : 'text-teal-600'}`}>
                        {isPositive ? `+${pct}%` : `-${pct}%`}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${isPositive ? 'bg-rose-500' : 'bg-teal-500'}`}
                        style={{ width: `${Math.min(100, pct * 2)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-4 rounded-xl bg-violet-50/70 p-3 text-[11px] text-violet-900 leading-snug border border-violet-100">
              💡 <strong>Model insight:</strong> Heavy rainfall in upstream catchment accelerates sediment runoff into Ambatale, raising turbidity before bacterial markers appear.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function CustomChartTooltip({ active, payload, label, unit, paramLabel }) {
  if (!active || !payload || !payload.length) return null
  const value = payload[0].value

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/95 p-3.5 shadow-xl backdrop-blur-md">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Timestamp: {label}</p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-2xl font-black text-slate-900">{value}</span>
        <span className="text-xs font-bold text-slate-500">{unit}</span>
      </div>
      <p className="text-xs font-semibold text-teal-700 mt-0.5">{paramLabel}</p>
    </div>
  )
}

function RiskBadge({ level }) {
  const styles = {
    low: 'bg-emerald-100 text-emerald-800 ring-emerald-300',
    moderate: 'bg-amber-100 text-amber-900 ring-amber-300',
    high: 'bg-orange-100 text-orange-900 ring-orange-300',
    critical: 'bg-rose-100 text-rose-800 ring-rose-300',
  }[level] || 'bg-slate-100 text-slate-700 ring-slate-300'

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold capitalize ring-1 ring-inset ${styles}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {level}
    </span>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" role="status" aria-label="Loading AquaShield Command Center">
      <div className="h-44 rounded-3xl bg-slate-200" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-36 rounded-3xl bg-slate-200" />
        ))}
      </div>
      <div className="h-28 rounded-3xl bg-slate-200" />
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="h-96 rounded-3xl bg-slate-200" />
        <div className="h-96 rounded-3xl bg-slate-200" />
      </div>
    </div>
  )
}

// Crisp inline SVG Icons
function AlertTriangleIcon({ className = 'size-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function UsersIcon({ className = 'size-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function RadioIcon({ className = 'size-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="2" />
      <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
    </svg>
  )
}

function ActivityIcon({ className = 'size-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  )
}

function RefreshIcon({ className = 'size-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 21h5v-5" />
    </svg>
  )
}

function ShieldAlertIcon({ className = 'size-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}

function ArrowUpRightIcon({ className = 'size-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M7 17 17 7" />
      <path d="M7 7h10v10" />
    </svg>
  )
}
