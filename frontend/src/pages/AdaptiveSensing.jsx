import { useState } from 'react'
import { motion } from 'framer-motion'
import { getObservations } from '../api'
import StationDropdown from '../components/StationDropdown.jsx'
import { Loading, siteName, useData } from '../components/ui.jsx'

const rise = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } }
const timeLabel = (value) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const dateLabel = (value) => new Date(value).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })
const intervalLabel = (seconds = 0) => seconds >= 60 ? `${Math.round(seconds / 60)} min` : `${seconds} sec`

export default function AdaptiveSensing() {
  const [site, setSite] = useState('ambatale')
  const observations = useData(() => getObservations(site), [site])
  if (!observations) return <Loading />
  if (!observations.length) return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600">No adaptive sensing data is available for {siteName(site)}.</div>

  const latest = observations[observations.length - 1]
  const previous = observations.at(-2)
  const reading = latest.readings
  const sampling = latest.sampling || {}
  const highPriority = sampling.transmission_priority === 'high'
  const interval = intervalLabel(sampling.interval_s)
  const confidence = Math.round((latest.sensor_confidence || 0) * 100)
  const battery = Math.round(latest.battery_pct ?? 0)
  const prioritySet = new Set(sampling.priority_parameters || [])
  const priorityParams = [
    { id: 'turbidity_ntu', name: 'Turbidity', value: reading.turbidity_ntu, unit: 'NTU', icon: 'turbidity', tint: 'text-amber-700', soft: 'bg-amber-50' },
    { id: 'ph', name: 'pH', value: reading.ph, unit: '', icon: 'drop', tint: 'text-emerald-700', soft: 'bg-emerald-50' },
    { id: 'ec_us_cm', name: 'Conductivity', value: reading.ec_us_cm, unit: 'µS/cm', icon: 'conductivity', tint: 'text-sky-700', soft: 'bg-sky-50' },
    { id: 'tds_ppm', name: 'Total dissolved solids', value: reading.tds_ppm, unit: 'ppm', icon: 'tds', tint: 'text-cyan-700', soft: 'bg-cyan-50' },
    { id: 'temp_c', name: 'Water temperature', value: reading.temp_c, unit: '°C', icon: 'temperature', tint: 'text-violet-700', soft: 'bg-violet-50' },
  ]
  const delta = previous ? latest.rainfall_mm_h - previous.rainfall_mm_h : null
  const deltaLabel = delta === null ? 'Trend needs more readings' : delta > 0.05 ? `↑ ${delta.toFixed(1)} mm/h since previous sample` : delta < -0.05 ? `↓ ${Math.abs(delta).toFixed(1)} mm/h since previous sample` : 'Nearly unchanged from previous sample'
  const sortedFactors = [
    { label: 'Rainfall', value: `${latest.rainfall_mm_h} mm/h`, detail: deltaLabel, icon: 'rain', tint: 'text-blue-700', soft: 'bg-blue-50' },
    { label: 'Priority parameters', value: `${prioritySet.size} selected`, detail: prioritySet.size ? priorityParams.filter((item) => prioritySet.has(item.id)).map((item) => item.name).join(' · ') : 'No parameter priorities reported', icon: 'activity', tint: 'text-teal-700', soft: 'bg-teal-50' },
    { label: 'Sensor confidence', value: `${confidence}%`, detail: 'Latest reported confidence', icon: 'shield', tint: 'text-emerald-700', soft: 'bg-emerald-50' },
    { label: 'Battery level', value: `${battery}%`, detail: 'Latest reported battery', icon: 'battery', tint: battery < 30 ? 'text-amber-700' : 'text-emerald-700', soft: battery < 30 ? 'bg-amber-50' : 'bg-emerald-50' },
  ]

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 sm:space-y-7">
      <motion.header {...rise} transition={{ duration: 0.3 }} className="flex flex-wrap items-start justify-between gap-5 border-b border-slate-200 pb-5 sm:pb-6">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">AquaShield · field intelligence</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Adaptive sensing</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">See how current rainfall, sensor health, and water readings shape the monitoring schedule at each site.</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-right shadow-sm">
          <p className="font-mono text-sm font-semibold text-slate-800">{timeLabel(latest.timestamp)}</p>
          <p className="mt-0.5 text-[11px] uppercase tracking-wider text-slate-500">{dateLabel(latest.timestamp)} · local time</p>
        </div>
      </motion.header>

      <motion.section {...rise} transition={{ duration: 0.28, delay: 0.03 }} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Adaptive sensing site and current mode">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700"><MetricIcon name="drop" /></span>
          <div>
            <p id="adaptive-site-label" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Monitoring station</p>
            <StationDropdown site={site} onChange={setSite} labelId="adaptive-site-label" />
          </div>
        </div>
        <div className={`inline-flex items-center gap-3 rounded-xl border px-4 py-2.5 ${highPriority ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
          <span className={`size-2.5 rounded-full ${highPriority ? 'bg-amber-500' : 'bg-emerald-500'}`} />
          <div>
            <p className={`text-sm font-semibold ${highPriority ? 'text-amber-800' : 'text-emerald-800'}`}>{highPriority ? 'Elevated priority active' : 'Routine priority active'}</p>
            <p className="text-xs text-slate-600">Sampling every {interval}</p>
          </div>
        </div>
      </motion.section>

      <motion.div {...rise} transition={{ duration: 0.3, delay: 0.06 }} className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 sm:px-5 ${highPriority ? 'border-amber-200 bg-amber-50/70' : 'border-teal-200 bg-teal-50/70'}`} role="status">
        <div className="flex items-center gap-3">
          <span className={`grid size-9 place-items-center rounded-xl ${highPriority ? 'bg-amber-100 text-amber-700' : 'bg-teal-100 text-teal-700'}`}><MetricIcon name="activity" /></span>
          <div>
            <p className="text-sm font-semibold text-slate-900">{highPriority ? 'Elevated sampling priority' : 'Routine sampling schedule'}</p>
            <p className="text-xs text-slate-600">{(sampling.reasons || []).join(' · ') || 'No schedule explanation was reported.'}</p>
          </div>
        </div>
        <span className={`rounded-lg px-3 py-1.5 font-mono text-xs font-semibold uppercase ${highPriority ? 'bg-amber-100 text-amber-800' : 'bg-teal-100 text-teal-800'}`}>{sampling.transmission_priority || 'normal'} priority</span>
      </motion.div>

      <section aria-labelledby="adaptive-factors-title">
        <div className="mb-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">Current station signals</p>
          <h2 id="adaptive-factors-title" className="mt-1 text-lg font-semibold text-slate-900 sm:text-xl">Environmental context &amp; sensor health</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {sortedFactors.map((factor, index) => (
            <motion.article key={factor.label} {...rise} transition={{ duration: 0.26, delay: 0.04 * index }} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-600">{factor.label}</p>
                <span className={`grid size-9 place-items-center rounded-xl ${factor.soft} ${factor.tint}`}><MetricIcon name={factor.icon} /></span>
              </div>
              <p className={`mt-4 font-mono text-xl font-semibold tracking-tight tabular-nums ${factor.tint}`}>{factor.value}</p>
              <p className="mt-1 min-h-5 text-xs leading-5 text-slate-500">{factor.detail}</p>
            </motion.article>
          ))}
        </div>
      </section>

      <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)]">
        <motion.section {...rise} transition={{ duration: 0.3, delay: 0.12 }} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="priority-table-title">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">Schedule configuration</p>
              <h2 id="priority-table-title" className="mt-1 text-lg font-semibold text-slate-900">Parameter monitoring priorities</h2>
            </div>
            <span className="rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-xs font-semibold text-slate-700">Every {interval}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3 font-semibold sm:px-5">Parameter</th><th className="px-4 py-3 font-semibold">Latest reading</th><th className="px-4 py-3 font-semibold sm:px-5">Focus</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {priorityParams.map((item) => {
                  const isPriority = prioritySet.has(item.id)
                  return <tr key={item.id} className="transition-colors hover:bg-slate-50/70">
                    <th scope="row" className="px-4 py-3.5 font-medium text-slate-800 sm:px-5">{item.name}</th>
                    <td className="px-4 py-3.5 font-mono font-semibold tabular-nums text-slate-800">{item.value}{item.unit && <span className="ml-1 text-xs font-medium text-slate-500">{item.unit}</span>}</td>
                    <td className="px-4 py-3.5 sm:px-5"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${isPriority ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'}`}><span className={`size-1.5 rounded-full ${isPriority ? 'bg-amber-500' : 'bg-slate-400'}`} />{isPriority ? 'Priority' : 'Routine'}</span></td>
                  </tr>
                })}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-3 text-xs leading-5 text-slate-500 sm:px-5">Priority parameters and station interval are reported by the current sensing configuration.</p>
        </motion.section>

        <div className="space-y-5">
          <motion.section {...rise} transition={{ duration: 0.3, delay: 0.16 }} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">Decision context</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">Why this schedule?</h2>
            <ul className="mt-4 space-y-3">
              {(sampling.reasons || []).map((reason) => <li key={reason} className="flex items-start gap-2.5 text-sm leading-5 text-slate-600"><span className="mt-1.5 size-2 shrink-0 rounded-full bg-teal-600" /><span className="first-letter:uppercase">{reason}</span></li>)}
              {!sampling.reasons?.length && <li className="text-sm text-slate-500">No schedule explanation was provided for this observation.</li>}
            </ul>
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-medium text-slate-500">Current interval</p>
              <p className="mt-1 font-mono text-2xl font-semibold tracking-tight text-slate-900">{interval}</p>
            </div>
          </motion.section>
          <motion.section {...rise} transition={{ duration: 0.3, delay: 0.2 }} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-sm font-semibold text-slate-900">Sensor readiness</h2>
            <div className="mt-4 space-y-4">
              <ReadinessMeter label="Sensor confidence" value={confidence} />
              <ReadinessMeter label="Battery level" value={battery} tone={battery < 30 ? 'amber' : 'emerald'} />
            </div>
          </motion.section>
        </div>
      </section>

      <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">Adaptive schedules support research monitoring. Confirm unusual sensor readings with field sampling before operational action.</p>
    </div>
  )
}

function ReadinessMeter({ label, value, tone = 'teal' }) {
  const colors = { teal: 'bg-teal-600', emerald: 'bg-emerald-500', amber: 'bg-amber-500' }
  return <div>
    <div className="mb-2 flex items-center justify-between gap-3"><span className="text-sm text-slate-600">{label}</span><span className="font-mono text-sm font-semibold tabular-nums text-slate-800">{value}%</span></div>
    <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}><motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, Math.max(0, value))}%` }} transition={{ duration: 0.6 }} className={`h-full rounded-full ${colors[tone]}`} /></div>
  </div>
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
    shield: <><path d="M12 3 19 6v5.3c0 4.7-2.9 7.8-7 9.7-4.1-1.9-7-5-7-9.7V6l7-3Z" /><path d="M12 8v4.5m0 3h.01" /></>,
    battery: <><rect x="3" y="7" width="17" height="10" rx="2" /><path d="M22 10v4m-15-4v4m5-4v4" /></>,
  }
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>{paths[name]}</svg>
}
