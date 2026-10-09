import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { getNetwork, getObservations, getRecommendations, getRisk } from '../api'
import { siteName, useData } from '../components/ui.jsx'

const USE_API = import.meta.env.VITE_USE_API === 'true'
const motionIn = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
}

export default function Dashboard() {
  const net = useData(getNetwork)
  const risk = useData(getRisk)
  const recs = useData(getRecommendations)
  const observations = useData(() => getObservations('ambatale'))

  if (!net || !risk || !recs || !observations) return <DashboardLoading />

  const riskBySite = Object.fromEntries(risk.map((item) => [item.site_id, item]))
  const topRecommendation = recs[0]
  const topRisk = riskBySite[topRecommendation.site_id]
  const criticalSites = risk.filter((item) => item.risk_category === 'critical').length
  const anomalyCount = risk.filter((item) => item.anomaly.flag).length
  const exposedPopulation = recs.reduce((total, item) => total + item.population_exposed, 0)
  const predictedFailures = net.nodes.filter((node) => node.predicted_failure).length
  const latest = observations[observations.length - 1]
  const turbidityTrend = observations.map((item) => ({
    time: new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    turbidity: item.readings.turbidity_ntu,
  }))
  const kpis = [
    { label: 'Monitoring stations', value: recs.length, detail: 'Across the Kelani Basin', tone: 'blue' },
    { label: 'Critical risk sites', value: criticalSites, detail: `${anomalyCount} unusual pattern${anomalyCount === 1 ? '' : 's'} flagged`, tone: 'red' },
    { label: 'Packet delivery', value: `${net.pdr_percent}%`, detail: `${net.latency_ms} ms end-to-end delay`, tone: 'teal' },
    { label: 'People served', value: formatPopulation(exposedPopulation), detail: 'Across monitored service areas', tone: 'violet' },
  ]

  return (
    <div className="space-y-6 sm:space-y-7">
      <motion.header {...motionIn} transition={{ duration: 0.32, ease: 'easeOut' }} className="flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-3xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Research monitoring · Kelani Basin</p>
          <h1 className="font-sans text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Water safety overview</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
            A connected view of field observations, resilient communications, contamination risk, and response priorities.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${USE_API ? 'border-sky-200 bg-sky-50 text-sky-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
            <span className={`size-2 rounded-full ${USE_API ? 'bg-sky-500' : 'bg-amber-500'}`} />
            {USE_API ? 'API configured' : 'Demonstration data'}
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">6-hour outlook</span>
        </div>
      </motion.header>

      <section aria-label="Research monitoring indicators" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((metric, index) => (
          <motion.article
            key={metric.label}
            {...motionIn}
            transition={{ duration: 0.3, delay: index * 0.055, ease: 'easeOut' }}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-slate-600">{metric.label}</p>
              <span className={`mt-0.5 size-2.5 rounded-full ${toneDot[metric.tone]}`} />
            </div>
            <p className="metric-value mt-3">{metric.value}</p>
            <p className="mt-1 text-xs text-slate-500">{metric.detail}</p>
          </motion.article>
        ))}
      </section>

      <section aria-label="Research pipeline" className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-800">End-to-end monitoring pipeline</h2>
          <span className="text-xs text-slate-500">Observation to response</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { to: '/sensing', number: '01', title: 'Adaptive sensing', detail: 'Field readings and context', color: 'border-cyan-200 bg-cyan-50 text-cyan-800' },
            { to: '/network', number: '02', title: 'LoRa mesh', detail: 'Store, forward, reroute', color: 'border-blue-200 bg-blue-50 text-blue-800' },
            { to: '/prediction', number: '03', title: 'Risk assessment', detail: 'Explainable 6-hour outlook', color: 'border-violet-200 bg-violet-50 text-violet-800' },
            { to: '/decision', number: '04', title: 'Decision support', detail: 'Ranked response actions', color: 'border-rose-200 bg-rose-50 text-rose-800' },
          ].map((step) => (
            <Link key={step.number} to={step.to} className={`group flex items-center gap-3 rounded-xl border p-3 transition hover:-translate-y-0.5 hover:shadow-sm ${step.color}`}>
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/80 text-xs font-bold tabular-nums">{step.number}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{step.title}</span>
                <span className="block text-xs opacity-75">{step.detail}</span>
              </span>
              <span aria-hidden="true" className="ml-auto text-lg opacity-40 transition group-hover:translate-x-0.5 group-hover:opacity-80">→</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.85fr)]">
        <motion.div {...motionIn} transition={{ duration: 0.32, delay: 0.08 }} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Station assessment</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">Risk by monitoring site</h2>
            </div>
            <Link to="/prediction" className="text-sm font-semibold text-blue-700 hover:text-blue-900">View model details <span aria-hidden="true">→</span></Link>
          </div>
          <div className="divide-y divide-slate-100">
            {recs.map((recommendation) => {
              const assessment = riskBySite[recommendation.site_id]
              return (
                <div key={recommendation.site_id} className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{siteName(recommendation.site_id)}</h3>
                      <RiskBadge level={assessment.risk_category} />
                      {assessment.anomaly.flag && <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-800">Pattern flagged</span>}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{recommendation.population_exposed.toLocaleString()} people served · model confidence {Math.round(assessment.confidence * 100)}%</p>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`Risk score ${Math.round(assessment.risk_score * 100)} percent`}>
                      <div className={`h-full rounded-full ${riskBar[assessment.risk_category]}`} style={{ width: `${assessment.risk_score * 100}%` }} />
                    </div>
                  </div>
                  <div className="sm:max-w-52 sm:text-right">
                    <p className="text-2xl font-semibold tracking-tight tabular-nums text-slate-950">{Math.round(assessment.risk_score * 100)}<span className="text-base font-medium text-slate-400">%</span></p>
                    <p className="text-xs text-slate-500">6-hour risk estimate</p>
                    <p className="mt-2 text-xs font-medium text-slate-700">{recommendation.actions[0].action}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </motion.div>

        <div className="space-y-4">
          <motion.article {...motionIn} transition={{ duration: 0.32, delay: 0.13 }} className="overflow-hidden rounded-2xl border border-rose-200 bg-white shadow-sm">
            <div className="border-b border-rose-100 bg-rose-50/80 px-4 py-3.5 sm:px-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rose-700">Highest response priority</p>
                  <h2 className="mt-1 text-lg font-semibold text-slate-900">{siteName(topRecommendation.site_id)}</h2>
                </div>
                <RiskBadge level={topRisk.risk_category} />
              </div>
            </div>
            <div className="p-4 sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Recommended first action</p>
              <p className="mt-1 text-base font-semibold leading-6 text-slate-900">{topRecommendation.actions[0].action}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{topRecommendation.actions[0].rationale}</p>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-slate-500">Rank {topRecommendation.rank} · score {topRecommendation.priority_score.toFixed(2)}</span>
                <Link to="/decision" className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700">
                  Review response plan <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          </motion.article>

          <motion.article {...motionIn} transition={{ duration: 0.32, delay: 0.18 }} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Network resilience</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">LoRa mesh health</h2>
              </div>
              <Link to="/network" aria-label="View mesh network details" className="grid size-9 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900">→</Link>
            </div>
            <div className="mt-4 flex items-end justify-between gap-3">
              <div>
                <p className="metric-value">{net.pdr_percent}<span className="text-base font-medium text-slate-400">%</span></p>
                <p className="text-xs text-slate-500">Packet delivery ratio</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">{net.nodes.length - predictedFailures} healthy · {predictedFailures} at risk</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`Packet delivery ratio ${net.pdr_percent} percent`}>
              <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-400" style={{ width: `${net.pdr_percent}%` }} />
            </div>
            <div className="mt-3 flex justify-between text-xs text-slate-500"><span>{net.nodes.length} mesh nodes</span><span>{net.recovery_s}s reroute recovery</span></div>
          </motion.article>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(260px,0.7fr)]">
        <motion.article {...motionIn} transition={{ duration: 0.32, delay: 0.2 }} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Water-quality signal</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">Ambatale turbidity trend</h2>
              <p className="mt-1 text-xs text-slate-500">Recent observations · NTU</p>
            </div>
            <div className="text-right">
              <p className="metric-value">{latest.readings.turbidity_ntu}<span className="ml-1 text-sm font-medium text-slate-500">NTU</span></p>
              <p className="text-xs text-slate-500">Latest reading</p>
            </div>
          </div>
          <div className="mt-4 h-44 w-full" role="img" aria-label="Line chart showing recent turbidity observations at Ambatale">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={turbidityTrend} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id="turbidityFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0f9e9a" stopOpacity={0.24} />
                    <stop offset="95%" stopColor="#0f9e9a" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" hide />
                <Tooltip formatter={(value) => [`${value} NTU`, 'Turbidity']} labelFormatter={(label) => `Observed at ${label}`} contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0', boxShadow: '0 8px 24px rgba(15,23,42,0.08)' }} />
                <Area type="monotone" dataKey="turbidity" stroke="#0f9e9a" strokeWidth={2.5} fill="url(#turbidityFill)" activeDot={{ r: 4, fill: '#0f9e9a', stroke: '#fff', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
            <span>{turbidityTrend[0]?.time}</span>
            <span>Sampling interval adapts to conditions</span>
            <span>{turbidityTrend[turbidityTrend.length - 1]?.time}</span>
          </div>
        </motion.article>

        <motion.aside {...motionIn} transition={{ duration: 0.32, delay: 0.24 }} className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 sm:p-5">
          <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-sky-800">Research context</span>
          <h2 className="mt-3 text-lg font-semibold text-slate-900">Interpret risk as decision support</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            The model combines sensor trends and environmental context to prioritize follow-up. A risk estimate is not a confirmed contamination event; validate findings with field sampling.
          </p>
          <Link to="/prediction" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-sky-800 hover:text-sky-950">Explore model explanations <span aria-hidden="true">→</span></Link>
        </motion.aside>
      </section>
    </div>
  )
}

const toneDot = {
  blue: 'bg-blue-500',
  red: 'bg-rose-500',
  teal: 'bg-teal-500',
  violet: 'bg-violet-500',
}

const riskBar = {
  low: 'bg-emerald-500',
  moderate: 'bg-amber-500',
  high: 'bg-orange-500',
  critical: 'bg-rose-500',
}

function RiskBadge({ level }) {
  const color = {
    low: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    moderate: 'bg-amber-50 text-amber-800 ring-amber-200',
    high: 'bg-orange-50 text-orange-800 ring-orange-200',
    critical: 'bg-rose-50 text-rose-800 ring-rose-200',
  }[level] || 'bg-slate-100 text-slate-700 ring-slate-200'
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ring-inset ${color}`}>{level}</span>
}

function formatPopulation(value) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function DashboardLoading() {
  return (
    <motion.div {...motionIn} transition={{ duration: 0.25 }} className="space-y-5" aria-label="Loading dashboard" aria-live="polite">
      <div className="h-8 w-64 animate-pulse rounded-lg bg-slate-200" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white" />)}
      </div>
      <div className="h-72 animate-pulse rounded-2xl border border-slate-200 bg-white" />
    </motion.div>
  )
}
