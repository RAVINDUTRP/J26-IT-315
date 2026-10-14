import { lazy, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getObservations } from '../api'
import { siteName, useData } from '../components/ui.jsx'

const AdaptiveSensing = lazy(() => import('./AdaptiveSensing.jsx'))

const SITES_CONFIG = [
  { id: 'ambatale', name: 'Ambatale Intake', role: 'Main Municipal Intake', pop: '420,000 residents', alert: 'Elevated Turbidity', tone: 'amber' },
  { id: 'biyagama', name: 'Biyagama Plant', role: 'Secondary Treatment Plant', pop: '180,000 residents', alert: 'Nominal Operations', tone: 'emerald' },
]

const TIME_RANGES = [
  { label: '1H', hours: 1 },
  { label: '3H', hours: 3 },
  { label: '6H', hours: 6 },
  { label: '24H', hours: 24 },
]

const STANDARDS_GUIDE = [
  { param: 'pH Level', key: 'ph', unit: 'pH', standard: '6.5 – 8.5', who: '6.5 – 8.5', desc: 'Acidity / Alkalinity balance' },
  { param: 'Turbidity', key: 'turbidity_ntu', unit: 'NTU', standard: '< 5.0 (Treated) / < 50 (Intake)', who: '< 5.0 NTU', desc: 'Suspended sediment & clarity' },
  { param: 'Total Dissolved Solids', key: 'tds_ppm', unit: 'ppm', standard: '< 500 ppm', who: '< 600 ppm', desc: 'Inorganic salts & organic matter' },
  { param: 'Electrical Conductivity', key: 'ec_us_cm', unit: 'µS/cm', standard: '< 750 µS/cm', who: '< 1000 µS/cm', desc: 'Ionic concentration guide' },
  { param: 'Water Temperature', key: 'temp_c', unit: '°C', standard: 'Ambient (25 – 30°C)', who: 'Ambient', desc: 'Thermal river equilibrium' },
]

const rise = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } }
const timeLabel = (value) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const dateLabel = (value) => new Date(value).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })
const intervalLabel = (seconds = 0) => seconds >= 60 ? `${Math.round(seconds / 60)} min` : `${seconds} sec`

export default function Sensing() {
  const [searchParams] = useSearchParams()
  return searchParams.get('view') === 'adaptive' ? <AdaptiveSensing /> : <WaterQuality />
}

function WaterQuality() {
  const [site, setSite] = useState('ambatale')
  const [activeParam, setActiveParam] = useState('turbidity_ntu')
  const [range, setRange] = useState(6)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState(new Date())

  const observations = useData(() => getObservations(site), [site])

  const handleRefresh = () => {
    setIsRefreshing(true)
    setTimeout(() => {
      setIsRefreshing(false)
      setLastSyncTime(new Date())
    }, 600)
  }

  if (!observations) return <WaterQualitySkeleton />
  if (!observations.length) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">No Telemetry Stream Detected</h2>
        <p className="mt-2 text-sm text-slate-500">No sensor readings are recorded for {siteName(site)}.</p>
      </div>
    )
  }

  const latest = observations[observations.length - 1]
  const readings = latest.readings
  const sampling = latest.sampling || {}
  const highPriority = sampling.transmission_priority === 'high'
  const confidence = Math.round((latest.sensor_confidence || 0) * 100)
  const battery = Math.round(latest.battery_pct ?? 0)

  // Calculate Water Quality Health Index (WQI estimate)
  const isPhGood = readings.ph >= 6.5 && readings.ph <= 8.5
  const isTurbidityGood = readings.turbidity_ntu <= 50
  const isTdsGood = readings.tds_ppm <= 300
  const isEcGood = readings.ec_us_cm <= 500
  let wqiScore = 100
  if (!isTurbidityGood) wqiScore -= 28
  if (!isPhGood) wqiScore -= 20
  if (!isTdsGood) wqiScore -= 12
  if (!isEcGood) wqiScore -= 8

  // Filter observations for chart range
  const rangeStart = latest.timestamp ? new Date(latest.timestamp).getTime() - range * 60 * 60 * 1000 : 0
  const selectedObservations = observations.filter((item) => new Date(item.timestamp).getTime() >= rangeStart)
  const chartData = selectedObservations.map((item) => ({
    time: timeLabel(item.timestamp),
    ph: item.readings.ph,
    turbidity_ntu: item.readings.turbidity_ntu,
    tds_ppm: item.readings.tds_ppm,
    ec_us_cm: item.readings.ec_us_cm,
    temp_c: item.readings.temp_c,
    rainfall_mm_h: item.rainfall_mm_h,
  }))

  const metricsConfig = [
    {
      id: 'turbidity_ntu',
      label: 'Turbidity Level',
      value: readings.turbidity_ntu,
      unit: 'NTU',
      status: readings.turbidity_ntu > 50 ? 'Elevated Warning' : 'Nominal Clarity',
      statusTone: readings.turbidity_ntu > 50 ? 'amber' : 'emerald',
      threshold: 50,
      thresholdLabel: 'Intake Warning Limit (50 NTU)',
      guideline: 'WHO Limit: < 5.0 NTU | Raw Intake: < 50 NTU',
      color: '#d97706',
      bgGlow: 'from-amber-500/10 via-amber-50/50 to-white',
      borderTone: readings.turbidity_ntu > 50 ? 'border-amber-300 ring-1 ring-amber-200' : 'border-slate-200',
      icon: 'turbidity',
      note: 'Colloidal sediment & suspended particles',
      delta: readings.turbidity_ntu > 40 ? '↑ Rapid surge post-rainfall' : 'Normal sediment flow',
      progress: Math.min(100, Math.round((readings.turbidity_ntu / 100) * 100)),
    },
    {
      id: 'ph',
      label: 'pH Balance',
      value: readings.ph,
      unit: 'pH',
      status: isPhGood ? 'Optimal Neutral' : 'Outside Target',
      statusTone: isPhGood ? 'emerald' : 'rose',
      threshold: 8.5,
      thresholdLabel: 'SLS 614 Upper Bound (8.5)',
      guideline: 'Safe Range: 6.5 – 8.5 pH',
      color: '#059669',
      bgGlow: 'from-emerald-500/10 via-emerald-50/50 to-white',
      borderTone: isPhGood ? 'border-emerald-200' : 'border-rose-300 ring-1 ring-rose-200',
      icon: 'drop',
      note: 'Chemical alkalinity & water equilibrium',
      delta: 'Stable buffer capacity',
      progress: Math.min(100, Math.round(((readings.ph - 4) / 6) * 100)),
    },
    {
      id: 'tds_ppm',
      label: 'Total Dissolved Solids',
      value: readings.tds_ppm,
      unit: 'ppm',
      status: isTdsGood ? 'Excellent Mineral Grade' : 'Elevated Dissolved Matter',
      statusTone: isTdsGood ? 'emerald' : 'amber',
      threshold: 250,
      thresholdLabel: 'Advisory Threshold (250 ppm)',
      guideline: 'SLS Standard: < 500 ppm',
      color: '#0284c7',
      bgGlow: 'from-sky-500/10 via-sky-50/50 to-white',
      borderTone: 'border-slate-200',
      icon: 'tds',
      note: 'Dissolved minerals, salts & organics',
      delta: 'Correlated with EC mineralization',
      progress: Math.min(100, Math.round((readings.tds_ppm / 500) * 100)),
    },
    {
      id: 'ec_us_cm',
      label: 'Electrical Conductivity',
      value: readings.ec_us_cm,
      unit: 'µS/cm',
      status: isEcGood ? 'Nominal Conductivity' : 'High Ionic Load',
      statusTone: isEcGood ? 'teal' : 'amber',
      threshold: 400,
      thresholdLabel: 'Ionic Surge Trigger (400 µS/cm)',
      guideline: 'Permissible Bound: < 750 µS/cm',
      color: '#0d9488',
      bgGlow: 'from-teal-500/10 via-teal-50/50 to-white',
      borderTone: 'border-slate-200',
      icon: 'conductivity',
      note: 'Electrolytic capacity and dissolved salts',
      delta: 'Stable electrical profile',
      progress: Math.min(100, Math.round((readings.ec_us_cm / 750) * 100)),
    },
    {
      id: 'temp_c',
      label: 'Water Temperature',
      value: readings.temp_c,
      unit: '°C',
      status: 'Ambient Equilibrium',
      statusTone: 'blue',
      threshold: 32,
      thresholdLabel: 'Thermal Guide (32 °C)',
      guideline: 'Natural Ambient: 25.0 – 30.0 °C',
      color: '#4f46e5',
      bgGlow: 'from-indigo-500/10 via-indigo-50/50 to-white',
      borderTone: 'border-slate-200',
      icon: 'temperature',
      note: 'Biological activity and oxygen dissolution rate',
      delta: 'Consistent diurnal range',
      progress: Math.min(100, Math.round((readings.temp_c / 40) * 100)),
    },
    {
      id: 'rainfall_mm_h',
      label: 'Precipitation Context',
      value: latest.rainfall_mm_h,
      unit: 'mm/h',
      status: latest.rainfall_mm_h > 8 ? 'Heavy Storm Rate' : latest.rainfall_mm_h > 2 ? 'Moderate Showers' : 'Dry Conditions',
      statusTone: latest.rainfall_mm_h > 8 ? 'amber' : 'sky',
      threshold: 8.0,
      thresholdLabel: 'Sediment Runoff Velocity (8.0 mm/h)',
      guideline: 'Trigger for rapid adaptive sensing',
      color: '#6366f1',
      bgGlow: 'from-violet-500/10 via-violet-50/50 to-white',
      borderTone: 'border-slate-200',
      icon: 'rain',
      note: 'Upper catchment rainfall causing river runoff',
      delta: latest.rainfall_mm_h > 5 ? '↑ Storm wave active' : 'Steady baseline',
      progress: Math.min(100, Math.round((latest.rainfall_mm_h / 20) * 100)),
    },
  ]

  const activeMetricObj = metricsConfig.find((m) => m.id === activeParam) || metricsConfig[0]
  const paramSeries = chartData.map((d) => d[activeMetricObj.id]).filter((v) => typeof v === 'number')
  const curVal = paramSeries[paramSeries.length - 1] ?? activeMetricObj.value
  const peakVal = paramSeries.length ? Math.max(...paramSeries) : activeMetricObj.value
  const minVal = paramSeries.length ? Math.min(...paramSeries) : activeMetricObj.value
  const avgVal = paramSeries.length ? +(paramSeries.reduce((a, b) => a + b, 0) / paramSeries.length).toFixed(1) : activeMetricObj.value

  return (
    <div className="space-y-7 pb-10">
      {/* 1. EXECUTIVE WATER INTELLIGENCE HEADER */}
      <motion.header
        {...rise}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="relative overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-br from-white via-slate-50/70 to-teal-50/30 p-6 shadow-[0_4px_25px_-5px_rgba(15,23,42,0.06)] sm:p-7"
      >
        <div className="absolute -right-20 -top-24 size-80 rounded-full bg-teal-400/10 blur-3xl pointer-events-none" />
        <div className="absolute right-40 -bottom-24 size-60 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-100/90 px-3 py-1 text-xs font-bold uppercase tracking-wider text-teal-800">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-teal-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-teal-600" />
                </span>
                Kelani Basin Field Telemetry
              </span>

              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${highPriority ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'}`}>
                <span className={`size-1.5 rounded-full ${highPriority ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                {highPriority ? 'Adaptive Rapid Sampling Active' : 'Nominal Continuous Monitoring'}
              </span>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl lg:text-4xl">
              Water Quality Telemetry &amp; Diagnostics
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
              Real-time multi-spectral diagnostic measurements, regulatory guideline compliance, and context-responsive telemetry across Kelani River treatment intakes.
            </p>
          </div>

          {/* Quick controls bar */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Water Quality Health Score Pill */}
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-2.5 shadow-sm backdrop-blur-md">
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Water Quality Index</p>
                <p className="text-base font-black text-slate-900 tabular-nums">
                  {wqiScore}<span className="text-xs font-bold text-slate-400">/100</span>
                </p>
              </div>
              <span className={`grid size-9 place-items-center rounded-xl text-xs font-black ${wqiScore >= 80 ? 'bg-emerald-100 text-emerald-800' : wqiScore >= 60 ? 'bg-amber-100 text-amber-900' : 'bg-rose-100 text-rose-800'}`}>
                {wqiScore >= 80 ? 'A' : wqiScore >= 60 ? 'B' : 'C'}
              </span>
            </div>

            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 px-3.5 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 active:scale-95 disabled:opacity-50 cursor-pointer"
              title="Refresh telemetry readings"
            >
              <RefreshIcon className={`size-3.5 ${isRefreshing ? 'animate-spin text-teal-600' : 'text-slate-500'}`} />
              <span>{isRefreshing ? 'Syncing...' : 'Sync Feed'}</span>
            </button>

            <Link
              to="/sensing?view=adaptive"
              className="inline-flex items-center gap-2 rounded-2xl bg-teal-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md transition hover:bg-teal-700 hover:shadow-lg active:scale-95"
            >
              <ActivityIcon className="size-3.5" />
              <span>Adaptive Settings</span>
            </Link>
          </div>
        </div>

        {/* Station Switcher Header Tabs */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200/80 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-bold uppercase tracking-wider text-slate-400">Monitoring Station:</span>
            {SITES_CONFIG.map((s) => {
              const isSelected = site === s.id
              return (
                <button
                  key={s.id}
                  onClick={() => setSite(s.id)}
                  className={`group flex items-center gap-2.5 rounded-xl px-4 py-2 text-xs font-semibold transition-all cursor-pointer ${
                    isSelected
                      ? 'border border-teal-500/30 bg-teal-600 text-white shadow-md shadow-teal-500/20'
                      : 'border border-slate-200/80 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span className={`size-2 rounded-full ${isSelected ? 'bg-white' : s.tone === 'amber' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                  <span className="font-bold">{s.name}</span>
                  <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    {s.pop}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="size-2 rounded-full bg-emerald-500" />
            <span>Telemetry timestamp: <strong className="text-slate-800 font-semibold">{timeLabel(latest.timestamp)} · {dateLabel(latest.timestamp)}</strong></span>
          </div>
        </div>
      </motion.header>

      {/* 2. LIVE DIAGNOSTIC READINGS (6 MODERN HIGH-TECH METRIC CARDS) */}
      <section aria-labelledby="live-diagnostics-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3 px-1">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-teal-700">Multi-Spectral Parameters</p>
            <h2 id="live-diagnostics-heading" className="text-xl font-bold text-slate-900">
              Live Station Diagnostics · {siteName(site)}
            </h2>
          </div>
          <span className="text-xs text-slate-500">Click any parameter card to focus historical telemetry</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {metricsConfig.map((metric, idx) => {
            const isSelected = activeParam === metric.id
            return (
              <motion.article
                key={metric.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, delay: idx * 0.04 }}
                whileHover={{ y: -3, transition: { duration: 0.18 } }}
                onClick={() => setActiveParam(metric.id)}
                className={`group relative cursor-pointer overflow-hidden rounded-3xl border bg-gradient-to-br ${metric.bgGlow} p-5 transition-all shadow-sm ${
                  isSelected
                    ? 'border-teal-500/60 ring-2 ring-teal-500/20 shadow-md'
                    : `${metric.borderTone} hover:border-slate-300 hover:shadow-md`
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-xs font-bold text-slate-600">{metric.label}</span>
                    <p className="mt-1 flex items-baseline gap-1.5 text-3xl font-black tracking-tight text-slate-900">
                      <span>{metric.value}</span>
                      {metric.unit && <span className="text-sm font-bold text-slate-500">{metric.unit}</span>}
                    </p>
                  </div>

                  <span className={`grid size-11 shrink-0 place-items-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 ${metric.color}`}>
                    <MetricIcon name={metric.icon} className="size-5" />
                  </span>
                </div>

                {/* Status Pill & Guideline Guide */}
                <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold ${
                    metric.statusTone === 'emerald'
                      ? 'bg-emerald-100 text-emerald-800'
                      : metric.statusTone === 'amber'
                      ? 'bg-amber-100 text-amber-900 font-extrabold'
                      : metric.statusTone === 'rose'
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-sky-100 text-sky-800'
                  }`}>
                    <span className="size-1.5 rounded-full bg-current" />
                    {metric.status}
                  </span>

                  <span className="text-[11px] font-medium text-slate-400 group-hover:text-slate-600 transition-colors">
                    {metric.delta}
                  </span>
                </div>

                {/* Progress bar representing range */}
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${metric.progress}%`,
                      backgroundColor: metric.color,
                    }}
                  />
                </div>

                <p className="mt-2 text-[11px] text-slate-500 leading-snug">
                  {metric.guideline}
                </p>
              </motion.article>
            )
          })}
        </div>
      </section>

      {/* 3. HISTORICAL TELEMETRY WORKSPACE (INTERACTIVE AREA CHART) */}
      <motion.section
        {...rise}
        transition={{ duration: 0.32, delay: 0.12 }}
        className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6"
      >
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-teal-500 animate-pulse" />
              <p className="text-xs font-bold uppercase tracking-wider text-teal-700">
                Continuous Telemetry Feed · {siteName(site)}
              </p>
            </div>
            <h2 className="mt-1 text-xl font-bold text-slate-900">
              {activeMetricObj.label} Trend Analysis <span className="text-sm font-medium text-slate-500">({activeMetricObj.unit})</span>
            </h2>
          </div>

          {/* Time Span Toggle */}
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
            {TIME_RANGES.map((item) => (
              <button
                key={item.label}
                onClick={() => setRange(item.hours)}
                className={`rounded-lg px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
                  range === item.hours
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Statistical Summary Bar */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-slate-50/80 px-4 py-3 text-xs">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <span className="text-slate-400">Current Value:</span>{' '}
              <strong className="font-extrabold text-slate-900 text-sm ml-1">{curVal} {activeMetricObj.unit}</strong>
            </div>
            <div>
              <span className="text-slate-400">Peak Observed:</span>{' '}
              <strong className="font-extrabold text-rose-600 text-sm ml-1">{peakVal} {activeMetricObj.unit}</strong>
            </div>
            <div>
              <span className="text-slate-400">Minimum:</span>{' '}
              <strong className="font-extrabold text-emerald-700 text-sm ml-1">{minVal} {activeMetricObj.unit}</strong>
            </div>
            <div>
              <span className="text-slate-400">Period Average:</span>{' '}
              <strong className="font-extrabold text-slate-800 text-sm ml-1">{avgVal} {activeMetricObj.unit}</strong>
            </div>
          </div>

          <span className="text-[11px] font-semibold text-slate-500">
            {activeMetricObj.thresholdLabel}
          </span>
        </div>

        {/* High-Resolution AreaChart */}
        <div className="mt-5 h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 14, right: 10, bottom: 0, left: -16 }}>
              <defs>
                <linearGradient id="metricAreaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={activeMetricObj.color} stopOpacity={0.32} />
                  <stop offset="95%" stopColor={activeMetricObj.color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#f1f5f9" strokeDasharray="3 3" />
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
                content={<TelemetryTooltip unit={activeMetricObj.unit} labelName={activeMetricObj.label} />}
              />
              <ReferenceLine
                y={activeMetricObj.threshold}
                stroke="#f43f5e"
                strokeDasharray="4 4"
                label={{ value: 'Advisory Limit', fill: '#f43f5e', fontSize: 10, position: 'insideTopRight' }}
              />
              <Area
                type="monotone"
                dataKey={activeMetricObj.id}
                stroke={activeMetricObj.color}
                strokeWidth={2.8}
                fill="url(#metricAreaFill)"
                activeDot={{ r: 5, fill: activeMetricObj.color, stroke: '#fff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-slate-400 border-t border-slate-100 pt-3">
          <span>{chartData[0]?.time || 'Start'}</span>
          <span>Sampling Interval: {intervalLabel(sampling.interval_s)} (context-responsive storm frequency)</span>
          <span>{chartData[chartData.length - 1]?.time || 'Now'}</span>
        </div>
      </motion.section>

      {/* 4. DUAL COLUMN: SENSOR DIAGNOSTICS & REGULATORY COMPLIANCE TABLE */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(340px,1fr)]">
        {/* Compliance Standards Matrix */}
        <section className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Standards Compliance</p>
              <h3 className="text-lg font-bold text-slate-900">National &amp; WHO Water Quality Limits</h3>
            </div>
            <span className="rounded-lg bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800">
              SLS 614 Standards
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="rounded-l-xl px-3.5 py-2.5">Parameter</th>
                  <th className="px-3.5 py-2.5">Observed</th>
                  <th className="px-3.5 py-2.5">SLS Guideline</th>
                  <th className="rounded-r-xl px-3.5 py-2.5">Compliance Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {STANDARDS_GUIDE.map((row) => {
                  const val = readings[row.key]
                  const isOk = row.key === 'turbidity_ntu' ? val <= 50 : row.key === 'ph' ? val >= 6.5 && val <= 8.5 : true
                  return (
                    <tr key={row.key} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-3.5 py-3 font-semibold text-slate-900">
                        {row.param}
                        <span className="block text-[10px] font-normal text-slate-400">{row.desc}</span>
                      </td>
                      <td className="px-3.5 py-3 font-bold tabular-nums text-slate-950 text-sm">
                        {val} <span className="text-[10px] font-semibold text-slate-400">{row.unit}</span>
                      </td>
                      <td className="px-3.5 py-3 text-slate-600 font-medium">{row.standard}</td>
                      <td className="px-3.5 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-bold ${
                          isOk ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
                        }`}>
                          <span className="size-1.5 rounded-full bg-current" />
                          {isOk ? 'Compliant' : 'Warning Alert'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Station Diagnostic Health & Battery Module */}
        <section className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-teal-700">Station Hardware</p>
              <h3 className="text-lg font-bold text-slate-900">Sensor Node Health</h3>
            </div>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${battery > 40 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
              Node Online
            </span>
          </div>

          {/* Gauges */}
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                <span className="text-slate-600">Multi-Sensor Confidence Index</span>
                <span className="text-teal-700 font-bold tabular-nums">{confidence}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-teal-600" style={{ width: `${confidence}%` }} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                <span className="text-slate-600">Station Battery Reserve</span>
                <span className="text-emerald-700 font-bold tabular-nums">{battery}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${battery < 30 ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${battery}%` }} />
              </div>
            </div>
          </div>

          {/* Why this sampling rate card */}
          <div className="rounded-2xl border border-teal-100 bg-teal-50/70 p-4 text-xs text-slate-700 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-teal-900">Adaptive Sampling Rationale</span>
              <span className="font-mono text-[10px] font-bold text-teal-700 uppercase">{sampling.transmission_priority || 'normal'}</span>
            </div>
            <ul className="space-y-1.5 text-slate-600">
              {(sampling.reasons || []).map((reason) => (
                <li key={reason} className="flex items-start gap-2">
                  <span className="size-1.5 rounded-full bg-teal-600 mt-1 shrink-0" />
                  <span className="first-letter:uppercase">{reason}</span>
                </li>
              ))}
              {!sampling.reasons?.length && <li>Routine telemetry interval active across monitoring nodes.</li>}
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-2 text-center text-xs pt-1">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
              <span className="text-[10px] uppercase font-bold text-slate-400">Current Interval</span>
              <p className="mt-0.5 text-sm font-extrabold text-slate-900">{intervalLabel(sampling.interval_s)}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
              <span className="text-[10px] uppercase font-bold text-slate-400">Strategy</span>
              <p className="mt-0.5 text-sm font-extrabold text-teal-700">Context-Aware</p>
            </div>
          </div>
        </section>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 pt-4 text-xs text-slate-400">
        <span>Continuous Research Telemetry for <strong className="text-slate-700 font-semibold">{siteName(site)}</strong></span>
        <span>Sensor observations support early warning response; always corroborate high-turbidity signals with laboratory test kits.</span>
      </footer>
    </div>
  )
}

function TelemetryTooltip({ active, payload, label, unit, labelName }) {
  if (!active || !payload || !payload.length) return null
  const value = payload[0].value

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/95 p-3.5 shadow-xl backdrop-blur-md">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Time: {label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-black text-slate-900 tabular-nums">{value}</span>
        <span className="text-xs font-bold text-slate-500">{unit}</span>
      </div>
      <p className="text-xs font-semibold text-teal-700 mt-0.5">{labelName}</p>
    </div>
  )
}

function WaterQualitySkeleton() {
  return (
    <div className="space-y-6 animate-pulse" role="status" aria-label="Loading Water Quality Telemetry">
      <div className="h-44 rounded-3xl bg-slate-200" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-40 rounded-3xl bg-slate-200" />
        ))}
      </div>
      <div className="h-80 rounded-3xl bg-slate-200" />
    </div>
  )
}

function MetricIcon({ name, className = 'size-5' }) {
  const paths = {
    drop: <path d="M12 3.5c-2 3-6 7.2-6 11a6 6 0 0 0 12 0c0-3.8-4-8-6-11Z" />,
    turbidity: <><path d="M3 8h18M5 12h14M7 16h10" /><circle cx="7" cy="8" r="1" /><circle cx="16" cy="12" r="1" /><circle cx="10" cy="16" r="1" /></>,
    tds: <><path d="M12 3.5 19 7v10l-7 3.5L5 17V7l7-3.5Z" /><path d="M8.5 12h7" /></>,
    conductivity: <path d="m13.5 2.5-9 11h7l-1 8 9-11h-7l1-8Z" />,
    temperature: <><path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0Z" /><path d="M12 11v7" /></>,
    rain: <><path d="M12 3.5c-2 3-6 7.2-6 11a6 6 0 0 0 12 0c0-3.8-4-8-6-11Z" /><path d="m9 18 1-2m3 2 1-2" /></>,
    activity: <path d="M2.5 12h4l3-8 5 16 3.2-8h3.8" />,
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {paths[name] || paths.drop}
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

function ActivityIcon({ className = 'size-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  )
}
