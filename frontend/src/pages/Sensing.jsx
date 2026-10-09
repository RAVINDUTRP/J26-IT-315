import { useState } from 'react'
import { motion } from 'framer-motion'
import { ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { getObservations } from '../api'
import { useData, siteName } from '../components/ui.jsx'

const SITES = ['ambatale', 'biyagama', 'hanwella']
const enter = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } }

const formatTime = (value) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const formatDateTime = (value) => new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
const formatInterval = (seconds) => seconds >= 60 ? `${Math.round(seconds / 60)} min` : `${seconds} sec`
const parameterName = (value) => value.replace('_ntu', '').replace('_us_cm', '').replaceAll('_', ' ')

export default function Sensing() {
  const [site, setSite] = useState('ambatale')
  const observations = useData(() => getObservations(site), [site])

  return (
    <div className="space-y-6 sm:space-y-7">
      <motion.header {...enter} transition={{ duration: 0.3, ease: 'easeOut' }} className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Field observations · adaptive sensing</p>
          <h1 className="font-sans text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Water quality</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
            Review recent sensor readings and see how rainfall and water conditions influence the sampling schedule.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm">
          <span className="size-2 rounded-full bg-emerald-500" />
          Research monitoring
        </div>
      </motion.header>

      <section aria-label="Monitoring stations" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-800">Select a monitoring station</h2>
          <p className="text-xs text-slate-500">Readings are shown for the selected site</p>
        </div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Monitoring stations">
          {SITES.map((id) => (
            <button
              key={id}
              id={`station-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={id === site}
              aria-controls="station-observations"
              onClick={() => setSite(id)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 ${id === site ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'}`}
            >
              {siteName(id)}
            </button>
          ))}
        </div>
      </section>

      {!observations ? <ObservationLoading /> : observations.length ? (
        <div id="station-observations" role="tabpanel" aria-labelledby={`station-tab-${site}`}>
          <ObservationBody observations={observations} site={site} />
        </div>
      ) : (
        <div role="status" className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h2 className="font-semibold text-slate-900">No observations available</h2>
          <p className="mt-1 text-sm text-slate-500">There are no sensor readings to display for {siteName(site)} yet.</p>
        </div>
      )}
    </div>
  )
}

function ObservationBody({ observations, site }) {
  const latest = observations[observations.length - 1]
  const first = observations[0]
  const readings = latest.readings
  const trend = observations.map((item) => ({
    time: formatTime(item.timestamp),
    turbidity: item.readings.turbidity_ntu,
    rainfall: item.rainfall_mm_h,
  }))
  const turbidityChange = readings.turbidity_ntu - first.readings.turbidity_ntu
  const sampling = latest.sampling || {}
  const interval = sampling.interval_s ? formatInterval(sampling.interval_s) : 'Not set'
  const priority = sampling.transmission_priority || 'normal'
  const metrics = [
    { label: 'Turbidity', value: readings.turbidity_ntu, unit: 'NTU', note: 'Suspended particles' },
    { label: 'pH', value: readings.ph, unit: '', note: 'Acidity / alkalinity' },
    { label: 'Conductivity', value: readings.ec_us_cm, unit: 'µS/cm', note: 'Electrical conductivity' },
    { label: 'Dissolved solids', value: readings.tds_ppm, unit: 'ppm', note: 'Total dissolved solids' },
    { label: 'Water temperature', value: readings.temp_c, unit: '°C', note: 'Field temperature' },
    { label: 'Sensor battery', value: Math.round(latest.battery_pct), unit: '%', note: 'Remaining charge', battery: true },
  ]

  return (
    <div className="space-y-5 sm:space-y-6">
      <motion.section {...enter} transition={{ duration: 0.3, delay: 0.04 }} aria-label="Latest sensor readings" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {metrics.map((metric, index) => (
          <motion.article
            key={metric.label}
            {...enter}
            transition={{ duration: 0.28, delay: index * 0.045 }}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
          >
            <p className="text-sm font-medium text-slate-600">{metric.label}</p>
            <p className="mt-3 flex items-baseline gap-1.5 text-3xl font-semibold tracking-tight text-slate-950">
              <span>{metric.value}</span>
              {metric.unit && <span className="text-sm font-medium text-slate-500">{metric.unit}</span>}
            </p>
            {metric.battery ? (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`Battery ${Math.round(latest.battery_pct)} percent`}>
                <div className="h-full rounded-full bg-teal-600" style={{ width: `${Math.max(0, Math.min(100, latest.battery_pct))}%` }} />
              </div>
            ) : <p className="mt-2 text-xs text-slate-500">{metric.note}</p>}
          </motion.article>
        ))}
      </motion.section>

      <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(290px,0.8fr)]">
        <motion.article {...enter} transition={{ duration: 0.32, delay: 0.08 }} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Environmental trend · {siteName(site)}</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">Turbidity and rainfall</h2>
              <p className="mt-1 text-sm text-slate-500">Recent observations · rainfall is shown on the right axis</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-600">
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-teal-700" />Turbidity (NTU)</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-sky-200" />Rainfall (mm/h)</span>
            </div>
          </div>
          <div className="h-[280px] w-full sm:h-[320px]" role="img" aria-label={`Chart of turbidity and rainfall observations for ${siteName(site)}`}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trend} margin={{ top: 8, right: 4, bottom: 0, left: -16 }}>
                <CartesianGrid stroke="#e8eef1" vertical={false} />
                <XAxis dataKey="time" interval="preserveStartEnd" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#dbe4e8' }} />
                <YAxis yAxisId="turbidity" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={42} />
                <YAxis yAxisId="rainfall" orientation="right" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={38} />
                <Tooltip
                  formatter={(value, name) => [
                    `${value} ${name === 'Rainfall' ? 'mm/h' : 'NTU'}`,
                    name,
                  ]}
                  contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0', boxShadow: '0 8px 24px rgba(15,23,42,0.08)' }}
                />
                <Bar yAxisId="rainfall" dataKey="rainfall" name="Rainfall" fill="#b7d7e4" radius={[3, 3, 0, 0]} maxBarSize={20} />
                <Line yAxisId="turbidity" type="monotone" dataKey="turbidity" name="Turbidity" stroke="#0f766e" strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: '#0f766e', stroke: '#fff', strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
            <span>{formatTime(first.timestamp)} – {formatTime(latest.timestamp)}</span>
            <span className={turbidityChange >= 0 ? 'text-amber-700' : 'text-emerald-700'}>
              {turbidityChange >= 0 ? '+' : ''}{turbidityChange.toFixed(1)} NTU across this period
            </span>
          </div>
        </motion.article>

        <motion.aside {...enter} transition={{ duration: 0.32, delay: 0.13 }} className="flex flex-col rounded-2xl border border-teal-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">Adaptive sensing</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">Current sampling plan</h2>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${priority === 'high' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
                {priority} priority
              </span>
            </div>
          </div>
          <div className="space-y-5 p-5 sm:p-6">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-teal-100 bg-teal-50/70 p-3.5">
                <p className="text-xs font-medium text-teal-800">Recommended interval</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Every {interval}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <p className="text-xs font-medium text-slate-500">Sensor confidence</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{Math.round((latest.sensor_confidence || 0) * 100)}%</p>
                <p className="mt-1 text-xs text-slate-500">Latest: {formatTime(latest.timestamp)}</p>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-800">Parameters receiving priority</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {(sampling.priority_parameters || []).map((parameter) => (
                  <span key={parameter} className="rounded-full border border-teal-100 bg-teal-50 px-2.5 py-1 text-xs font-medium capitalize text-teal-800">
                    {parameterName(parameter)}
                  </span>
                ))}
                {!sampling.priority_parameters?.length && <span className="text-sm text-slate-500">No priority parameters reported</span>}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-800">Why this schedule?</h3>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {(sampling.reasons || []).map((reason) => (
                  <li key={reason} className="flex min-w-0 items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-sm leading-5 text-slate-600">
                    <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-teal-600" />
                    <span className="first-letter:uppercase">{reason}</span>
                  </li>
                ))}
                {!sampling.reasons?.length && <li className="text-sm text-slate-500">No schedule explanation was provided.</li>}
              </ul>
            </div>
            <p className="border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">
              The schedule responds to observed conditions; confirm unusual readings with field sampling before operational action.
            </p>
          </div>
        </motion.aside>
      </section>

      <motion.footer {...enter} transition={{ duration: 0.28, delay: 0.16 }} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
        <span>Station: <strong className="font-semibold text-slate-700">{siteName(site)}</strong></span>
        <span>Observation recorded {formatDateTime(latest.timestamp)}</span>
      </motion.footer>
    </div>
  )
}

function ObservationLoading() {
  return (
    <motion.div {...enter} transition={{ duration: 0.2 }} className="space-y-4" aria-label="Loading station observations" aria-live="polite">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {[1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white" />)}
      </div>
      <div className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-white" />
    </motion.div>
  )
}
