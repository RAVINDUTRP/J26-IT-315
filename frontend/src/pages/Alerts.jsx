import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { getNetwork, getObservations, getRisk } from '../api'
import { Loading, siteName, useData } from '../components/ui.jsx'

const enter = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } }
const monitoredSites = ['ambatale', 'biyagama']
const formatTime = (value) => value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Current system signal'

export default function Alerts() {
  const [filter, setFilter] = useState('all')
  const risk = useData(getRisk)
  const network = useData(getNetwork)
  const ambatale = useData(() => getObservations('ambatale'))
  const biyagama = useData(() => getObservations('biyagama'))

  const observationsBySite = { ambatale, biyagama }
  const alerts = useMemo(() => {
    if (!risk || !network || !ambatale || !biyagama) return null
    const current = []

    risk.forEach((assessment) => {
      if (!['critical', 'high', 'moderate'].includes(assessment.risk_category)) return
      const latest = observationsBySite[assessment.site_id]?.at(-1)
      const score = Math.round(assessment.risk_score * 100)
      current.push({
        id: `risk-${assessment.site_id}`,
        severity: assessment.risk_category === 'critical' ? 'critical' : 'warning',
        source: 'Risk forecast',
        location: siteName(assessment.site_id),
        time: latest?.timestamp,
        title: `${assessment.risk_category === 'critical' ? 'Critical' : 'Elevated'} model risk estimate`,
        description: `${siteName(assessment.site_id)} has a ${score}% estimated risk over the next ${assessment.horizon_h} hours${assessment.anomaly?.flag ? ', with an unusual pattern flagged by the model' : ''}. Confirm unusual readings with field sampling.`,
        href: '/prediction',
        action: 'Review forecast',
      })
    })

    network.nodes.filter((node) => node.predicted_failure).forEach((node) => {
      current.push({
        id: `network-${node.id}`,
        severity: node.predicted_failure >= 0.7 ? 'warning' : 'info',
        source: 'LoRa mesh',
        location: `Node ${node.id}`,
        title: 'Predicted node reliability issue',
        description: `${node.id} has a ${Math.round(node.predicted_failure * 100)}% predicted failure likelihood. The network reports an alternate active route.`,
        href: '/network',
        action: 'Review network',
      })
    })

    monitoredSites.forEach((site) => {
      const latest = observationsBySite[site]?.at(-1)
      if (!latest) return
      const sampling = latest.sampling || {}
      if (sampling.transmission_priority === 'high') {
        current.push({
          id: `sampling-${site}`,
          severity: 'warning',
          source: 'Adaptive sensing',
          location: siteName(site),
          time: latest.timestamp,
          title: 'Elevated sampling priority active',
          description: `${(sampling.reasons || []).join(' · ') || 'Current conditions triggered increased monitoring.'} Sampling is scheduled every ${sampling.interval_s >= 60 ? `${Math.round(sampling.interval_s / 60)} min` : `${sampling.interval_s} sec`}.`,
          href: '/sensing?view=adaptive',
          action: 'Review schedule',
        })
      }
      if ((latest.battery_pct ?? 100) < 30) {
        current.push({
          id: `battery-${site}`,
          severity: 'warning',
          source: 'Sensor health',
          location: siteName(site),
          time: latest.timestamp,
          title: 'Sensor battery is low',
          description: `The latest reported battery level is ${Math.round(latest.battery_pct)}%. Review the station during the next field visit.`,
          href: '/sensing',
          action: 'View station',
        })
      }
    })

    const order = { critical: 0, warning: 1, info: 2 }
    return current.sort((a, b) => order[a.severity] - order[b.severity] || (b.time || '').localeCompare(a.time || ''))
  }, [risk, network, ambatale, biyagama])

  if (!alerts) return <Loading />

  const counts = {
    all: alerts.length,
    critical: alerts.filter((alert) => alert.severity === 'critical').length,
    warning: alerts.filter((alert) => alert.severity === 'warning').length,
  }
  const visibleAlerts = filter === 'all' ? alerts : alerts.filter((alert) => alert.severity === filter)

  return (
    <div className="space-y-6 sm:space-y-7">
      <motion.header {...enter} transition={{ duration: 0.3 }} className="flex flex-wrap items-end justify-between gap-5 border-b border-slate-200 pb-5 sm:pb-6">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">AquaShield · system notifications</p>
          <h1 className="mt-1 font-sans text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Alerts &amp; notifications</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">Review current signals from water-quality monitoring, adaptive sensing, and the LoRa mesh.</p>
        </div>
        <span className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold ${counts.critical ? 'border-rose-200 bg-rose-50 text-rose-800' : counts.warning ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
          <span className={`size-2 rounded-full ${counts.critical ? 'bg-rose-500' : counts.warning ? 'bg-amber-500' : 'bg-emerald-500'}`} />
          {counts.critical ? 'Critical signals need review' : counts.warning ? 'Monitoring signals need review' : 'No elevated signals'}
        </span>
      </motion.header>

      <section aria-label="Alert summary" className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Current signals" value={counts.all} tone="blue" detail="Generated from latest system data" />
        <SummaryCard label="Critical" value={counts.critical} tone="rose" detail="Highest priority for review" />
        <SummaryCard label="Warnings" value={counts.warning} tone="amber" detail="Follow up with monitoring" />
      </section>

      <section aria-labelledby="current-alerts-title">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Live system signals</p>
            <h2 id="current-alerts-title" className="mt-1 text-xl font-semibold text-slate-900">Current alerts</h2>
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm" role="group" aria-label="Filter alerts by severity">
            {[['all', 'All', counts.all], ['critical', 'Critical', counts.critical], ['warning', 'Warnings', counts.warning]].map(([key, label, count]) => (
              <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)} className={`rounded-lg px-3 py-2 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 ${filter === key ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                {label}<span className={`ml-1.5 tabular-nums ${filter === key ? 'text-white/70' : 'text-slate-400'}`}>{count}</span>
              </button>
            ))}
          </div>
        </div>

        {visibleAlerts.length ? (
          <div className="space-y-3">
            {visibleAlerts.map((alert, index) => <AlertCard key={alert.id} alert={alert} index={index} />)}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><AlertIcon /></span>
            <h3 className="mt-4 text-base font-semibold text-slate-900">No {filter === 'all' ? 'current' : filter} alerts</h3>
            <p className="mt-1 text-sm text-slate-500">The latest system data has no signals in this category.</p>
          </div>
        )}
      </section>

      <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">Alerts summarize current research and telemetry signals. Model estimates do not confirm contamination; validate unusual water readings with field sampling.</p>
    </div>
  )
}

function SummaryCard({ label, value, tone, detail }) {
  const colors = {
    blue: 'border-blue-100 bg-blue-50 text-blue-800',
    rose: 'border-rose-100 bg-rose-50 text-rose-800',
    amber: 'border-amber-100 bg-amber-50 text-amber-800',
  }
  return (
    <article className={`rounded-2xl border p-4 shadow-sm sm:p-5 ${colors[tone]}`}>
      <p className="text-sm font-medium opacity-80">{label}</p>
      <p className="metric-value mt-2">{value}</p>
      <p className="mt-1 text-xs text-slate-600">{detail}</p>
    </article>
  )
}

function AlertCard({ alert, index }) {
  const styles = {
    critical: { surface: 'border-rose-200 bg-rose-50/70', icon: 'bg-rose-100 text-rose-700', badge: 'bg-rose-100 text-rose-800', label: 'Critical' },
    warning: { surface: 'border-amber-200 bg-amber-50/70', icon: 'bg-amber-100 text-amber-700', badge: 'bg-amber-100 text-amber-800', label: 'Warning' },
    info: { surface: 'border-sky-200 bg-sky-50/70', icon: 'bg-sky-100 text-sky-700', badge: 'bg-sky-100 text-sky-800', label: 'Information' },
  }
  const style = styles[alert.severity]

  return (
    <motion.article {...enter} transition={{ duration: 0.28, delay: index * 0.035 }} className={`grid gap-4 rounded-2xl border p-4 shadow-sm sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:p-5 ${style.surface}`}>
      <span className={`grid size-11 place-items-center rounded-xl ${style.icon}`}><AlertIcon /></span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span className="font-semibold text-slate-700">{alert.source}</span><span aria-hidden="true">·</span><span>{alert.location}</span><span aria-hidden="true">·</span><time dateTime={alert.time || undefined}>{formatTime(alert.time)}</time>
        </div>
        <h3 className="mt-1.5 text-base font-semibold text-slate-950">{alert.title}</h3>
        <p className="mt-1 text-sm leading-5 text-slate-600">{alert.description}</p>
      </div>
      <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
        <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${style.badge}`}>{style.label}</span>
        <Link to={alert.href} className="inline-flex items-center gap-1.5 rounded-lg border border-white/80 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-white hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500">
          {alert.action}<span aria-hidden="true">→</span>
        </Link>
      </div>
    </motion.article>
  )
}

function AlertIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-5"><path d="M12 3 20 7v5.5c0 4.2-3.2 7.1-8 9.5-4.8-2.4-8-5.3-8-9.5V7l8-4Z" /><path d="M12 8v4m0 3h.01" /></svg>
}
