import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getObservations } from '../api'
import { siteName, useData } from '../components/ui.jsx'

const SITES = ['ambatale', 'biyagama', 'hanwella']
const RANGES = [
  { label: '1H', hours: 1 },
  { label: '3H', hours: 3 },
  { label: '6H', hours: 6 },
]
const rise = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } }

const timeLabel = (value) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const dateLabel = (value) => new Date(value).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })
const intervalLabel = (seconds = 0) => seconds >= 60 ? `${Math.round(seconds / 60)} min` : `${seconds} sec`

export default function Sensing() {
  const [site, setSite] = useState('ambatale')
  const observations = useData(() => getObservations(site), [site])

  return (
    <div className="-mx-[18px] -mt-6 -mb-12 min-h-screen bg-[#edf2f4] px-[18px] pt-6 pb-12 text-slate-900 min-[901px]:-mx-10 min-[901px]:-mt-9 min-[901px]:px-10 min-[901px]:pt-9">
      {!observations ? <PageLoading /> : observations.length ? (
        <MonitoringView observations={observations} site={site} onSiteChange={setSite} />
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm" role="status">
          <h1 className="text-xl font-semibold text-slate-900">No observations available</h1>
          <p className="mt-2 text-sm text-slate-600">There are no sensor readings to show for {siteName(site)} yet.</p>
        </div>
      )}
    </div>
  )
}

function MonitoringView({ observations, site, onSiteChange }) {
  const [range, setRange] = useState(6)
  const latest = observations[observations.length - 1]
  const readings = latest.readings
  const sampling = latest.sampling || {}
  const highPriority = sampling.transmission_priority === 'high'
  const confidence = Math.round((latest.sensor_confidence || 0) * 100)
  const battery = Math.round(latest.battery_pct ?? 0)
  const rangeStart = latest.timestamp ? new Date(latest.timestamp).getTime() - range * 60 * 60 * 1000 : 0
  const selectedObservations = observations.filter((item) => new Date(item.timestamp).getTime() >= rangeStart)
  const chartData = selectedObservations.map((item) => ({
    time: timeLabel(item.timestamp),
    ph: item.readings.ph,
    turbidity: item.readings.turbidity_ntu,
    tds: item.readings.tds_ppm,
  }))

  const metrics = [
    { label: 'pH value', value: readings.ph, unit: '', tint: 'text-emerald-700', soft: 'bg-emerald-50', icon: 'drop', bar: '#10b981', dataKey: 'ph', dataLabel: 'pH' },
    { label: 'Turbidity', value: readings.turbidity_ntu, unit: 'NTU', tint: 'text-amber-700', soft: 'bg-amber-50', icon: 'turbidity', bar: '#f59e0b', dataKey: 'turbidity', dataLabel: 'Turbidity', note: 'Suspended particles' },
    { label: 'Total dissolved solids', value: readings.tds_ppm, unit: 'ppm', tint: 'text-cyan-700', soft: 'bg-cyan-50', icon: 'tds', bar: '#06b6d4', dataKey: 'tds', dataLabel: 'TDS' },
    { label: 'Conductivity', value: readings.ec_us_cm, unit: 'µS/cm', tint: 'text-sky-700', soft: 'bg-sky-50', icon: 'conductivity' },
    { label: 'Water temperature', value: readings.temp_c, unit: '°C', tint: 'text-violet-700', soft: 'bg-violet-50', icon: 'temperature' },
    { label: 'Rainfall context', value: latest.rainfall_mm_h, unit: 'mm/h', tint: 'text-blue-700', soft: 'bg-blue-50', icon: 'rain' },
  ]

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-7 sm:space-y-8">
      <motion.header {...rise} transition={{ duration: 0.32, ease: 'easeOut' }} className="flex flex-wrap items-center justify-between gap-5 border-b border-slate-200 pb-5 sm:pb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">AquaShield · field telemetry</p>
          <h1 className="mt-1 font-sans text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Water Quality Monitoring</h1>
          <p className="mt-1 text-sm text-slate-600 sm:text-base">Sensor readings and adaptive sampling for Kelani Basin monitoring sites.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:gap-5">
          <span className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 font-mono text-xs font-semibold uppercase tracking-wide ${highPriority ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
            <span className={`size-2 rounded-full ${highPriority ? 'bg-amber-500' : 'bg-emerald-500'}`} />
            {highPriority ? 'Elevated sampling' : 'Nominal sensing'}
          </span>
          <div className="text-right font-mono">
            <p className="text-sm font-semibold text-slate-800">{timeLabel(latest.timestamp)}</p>
            <p className="mt-0.5 text-[11px] uppercase tracking-wider text-slate-500">{dateLabel(latest.timestamp)} · local time</p>
          </div>
        </div>
      </motion.header>

      <motion.section {...rise} transition={{ duration: 0.3, delay: 0.04 }} aria-label="Monitoring station selection" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <label className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700">
              <MetricIcon name="drop" className="size-5" />
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Selected monitoring station</span>
              <select
                value={site}
                onChange={(event) => onSiteChange(event.target.value)}
                className="w-full max-w-72 cursor-pointer rounded-lg border-0 bg-transparent p-0 pr-8 text-base font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-teal-500/30 sm:text-lg"
              >
                {SITES.map((id) => <option key={id} value={id}>{siteName(id)}</option>)}
              </select>
            </span>
          </label>
          <div className={`inline-flex items-center gap-3 rounded-xl border px-3.5 py-2.5 ${highPriority ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
            <span className={`relative grid size-2 place-items-center rounded-full ${highPriority ? 'bg-amber-500' : 'bg-emerald-500'}`}>
              <span className={`absolute size-4 animate-ping rounded-full opacity-20 ${highPriority ? 'bg-amber-500' : 'bg-emerald-500'}`} />
            </span>
            <span>
              <span className={`block text-sm font-semibold ${highPriority ? 'text-amber-800' : 'text-emerald-800'}`}>
                {highPriority ? 'Increased monitoring' : 'Normal monitoring'}
              </span>
              <span className="block text-xs text-slate-600">Sampling every {intervalLabel(sampling.interval_s)}</span>
            </span>
          </div>
        </div>
      </motion.section>

      <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.9fr)]">
        <motion.div {...rise} transition={{ duration: 0.32, delay: 0.08 }}>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2 px-0.5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">Latest station sample</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900 sm:text-xl">Live diagnostic readings</h2>
            </div>
            <p className="text-xs text-slate-500">Values from {timeLabel(latest.timestamp)}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {metrics.map((metric, index) => (
              <motion.article
                key={metric.label}
                {...rise}
                transition={{ duration: 0.28, delay: index * 0.04 }}
                whileHover={{ y: -3, boxShadow: '0 12px 24px rgba(15, 23, 42, 0.08)' }}
                className="min-h-36 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_2px_8px_rgba(15,23,42,0.035)] transition-colors hover:border-slate-300 sm:p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-slate-600">{metric.label}</p>
                  <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${metric.soft} ${metric.tint}`}>
                    <MetricIcon name={metric.icon} className="size-5" />
                  </span>
                </div>
                <p className="mt-3 flex flex-wrap items-baseline gap-x-1.5 font-mono text-2xl font-semibold tracking-tight text-slate-950 tabular-nums sm:text-[30px]">
                  <span>{metric.value}</span>
                  {metric.unit && <span className="text-sm font-medium text-slate-500">{metric.unit}</span>}
                </p>
                <p className="mt-2 inline-flex items-center gap-2 text-xs font-medium text-slate-500">
                  <span className={`size-1.5 rounded-full ${metric.tint.replace('text-', 'bg-')}`} />
                  {metric.note || 'Latest measured value'}
                </p>
              </motion.article>
            ))}
          </div>
        </motion.div>

        <motion.aside {...rise} transition={{ duration: 0.32, delay: 0.13 }} className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-white to-slate-50/70 px-5 py-4 sm:px-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">Adaptive sensing</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">Sensor diagnostics</h2>
            </div>
            <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${highPriority ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
              <span className={`size-1.5 rounded-full ${highPriority ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              {sampling.transmission_priority || 'normal'} priority
            </span>
          </div>
          <div className="px-5 py-2 sm:px-6">
            <DiagnosticMeter label="Sensor confidence" value={confidence} tone="teal" />
            <DiagnosticMeter label="Battery level" value={battery} tone={battery < 30 ? 'amber' : 'emerald'} />
            <DiagnosticRow label="Last observation" value={`${timeLabel(latest.timestamp)} · ${dateLabel(latest.timestamp)}`} />
            <DiagnosticRow label="Monitoring station" value={siteName(site)} />
            <DiagnosticRow label="Sensing strategy" value="Context-responsive" valueClass="text-cyan-800" />
            <DiagnosticRow label="Sampling frequency" value={`Every ${intervalLabel(sampling.interval_s)}`} />
          </div>
          <div className="px-5 pb-5 sm:px-6 sm:pb-6">
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 sm:p-4.5">
              <h3 className="text-sm font-semibold text-slate-800">Why this sampling rate?</h3>
              <ul className="mt-2 space-y-1.5">
                {(sampling.reasons || []).map((reason) => (
                  <li key={reason} className="flex items-start gap-2 text-sm leading-5 text-slate-600">
                    <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-teal-600" />
                    <span className="first-letter:uppercase">{reason}</span>
                  </li>
                ))}
                {!sampling.reasons?.length && <li className="text-sm text-slate-500">No schedule explanation was provided.</li>}
              </ul>
            </div>
          </div>
        </motion.aside>
      </section>

      <HistoricalTelemetry data={chartData} range={range} onRangeChange={setRange} metrics={metrics} latest={latest} />

      <motion.footer {...rise} transition={{ duration: 0.28, delay: 0.16 }} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4 text-xs text-slate-500">
        <span>Research data for <strong className="font-semibold text-slate-700">{siteName(site)}</strong></span>
        <span>Readings support monitoring and field follow-up; they do not alone confirm water safety.</span>
      </motion.footer>
    </div>
  )
}

function DiagnosticRow({ label, value, valueClass = 'text-slate-800' }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-slate-100 py-3 last:border-b-0">
      <span className="text-sm text-slate-600">{label}</span>
      <span className={`text-right font-mono text-sm font-semibold ${valueClass}`}>{value}</span>
    </div>
  )
}

function DiagnosticMeter({ label, value, tone }) {
  const colors = {
    teal: { text: 'text-teal-700', bar: 'bg-teal-600' },
    emerald: { text: 'text-emerald-700', bar: 'bg-emerald-500' },
    amber: { text: 'text-amber-700', bar: 'bg-amber-500' },
  }
  const color = colors[tone]

  return (
    <div className="border-b border-slate-100 py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-slate-600">{label}</span>
        <span className={`font-mono text-sm font-semibold tabular-nums ${color.text}`}>{value}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
        <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, Math.max(0, value))}%` }} transition={{ duration: 0.7, ease: 'easeOut' }} className={`h-full rounded-full ${color.bar}`} />
      </div>
    </div>
  )
}

function MetricIcon({ name, className }) {
  const paths = {
    drop: <path d="M12 3.5c-2 3-6 7.2-6 11a6 6 0 0 0 12 0c0-3.8-4-8-6-11Z" />,
    turbidity: <><path d="M3 8h18M5 12h14M7 16h10" /><circle cx="7" cy="8" r="1" /><circle cx="16" cy="12" r="1" /><circle cx="10" cy="16" r="1" /></>,
    tds: <><path d="M12 3.5 19 7v10l-7 3.5L5 17V7l7-3.5Z" /><path d="M8.5 12h7" /></>,
    conductivity: <path d="m13.5 2.5-9 11h7l-1 8 9-11h-7l1-8Z" />,
    temperature: <><path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0Z" /><path d="M12 11v7" /></>,
    rain: <><path d="M12 3.5c-2 3-6 7.2-6 11a6 6 0 0 0 12 0c0-3.8-4-8-6-11Z" /><path d="m9 18 1-2m3 2 1-2" /></>,
  }

  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`size-5 shrink-0 ${className}`}>{paths[name]}</svg>
}

function HistoricalTelemetry({ data, range, onRangeChange, metrics, latest }) {
  const chartConfigs = metrics.filter((metric) => metric.dataKey)
  const rangeLabel = RANGES.find((item) => item.hours === range)?.label || '6H'

  return (
    <motion.section {...rise} transition={{ duration: 0.32, delay: 0.17 }} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 lg:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">Historical telemetry · {siteName(latest.site_id || 'ambatale')}</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900 sm:text-xl">Sensor trends <span className="font-mono text-sm font-medium text-slate-500">({rangeLabel} span)</span></h2>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1" aria-label="Chart time range">
          {RANGES.map((item) => (
            <button
              key={item.label}
              type="button"
              aria-pressed={range === item.hours}
              onClick={() => onRangeChange(item.hours)}
              className={`rounded-lg px-3 py-1.5 font-mono text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 ${range === item.hours ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {chartConfigs.map((metric) => (
          <TelemetryChart key={metric.dataKey} title={metric.dataLabel} unit={metric.unit} metric={metric} data={data} />
        ))}
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-500">Charts show available observations within the selected period. Missing intervals are not interpolated.</p>
    </motion.section>
  )
}

function TelemetryChart({ title, unit, metric, data }) {
  const chartData = useMemo(() => data.map((point) => ({ ...point, shortValue: point[metric.dataKey] })), [data, metric.dataKey])

  return (
    <article className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3.5 sm:p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium text-slate-700">{title} telemetry</h3>
        <span className={`font-mono text-xs font-semibold ${metric.tint}`}>{metric.value}{unit ? ` ${unit}` : ''}</span>
      </div>
      <div className="h-36 min-h-36 w-full" role="img" aria-label={`${title} measurements over the selected time period`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 2, bottom: 0, left: -24 }}>
            <CartesianGrid vertical={false} stroke="#e2e8f0" />
            <XAxis
              dataKey="time"
              interval={Math.max(0, Math.ceil(chartData.length / 5) - 1)}
              tick={{ fill: '#64748b', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: '#cbd5e1' }}
            />
            <YAxis hide domain={[0, 'dataMax + 1']} />
            <Tooltip
              formatter={(value) => [`${value}${unit ? ` ${unit}` : ''}`, title]}
              labelFormatter={(label) => `Observed at ${label}`}
              contentStyle={{ borderRadius: 10, borderColor: '#cbd5e1', background: '#fff', color: '#0f172a', boxShadow: '0 8px 24px rgba(15,23,42,0.08)' }}
              itemStyle={{ color: metric.bar }}
              labelStyle={{ color: '#64748b' }}
            />
            <Bar dataKey="shortValue" fill={metric.bar} radius={[4, 4, 0, 0]} maxBarSize={16} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </article>
  )
}

function PageLoading() {
  return (
    <motion.div {...rise} transition={{ duration: 0.2 }} className="space-y-5" aria-label="Loading water quality telemetry" aria-live="polite">
      <div className="h-20 animate-pulse rounded-2xl border border-slate-200 bg-white" />
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-white" />
        <div className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-white" />
      </div>
      <div className="h-72 animate-pulse rounded-2xl border border-slate-200 bg-white" />
    </motion.div>
  )
}
