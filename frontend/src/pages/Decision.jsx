import { lazy } from 'react'
import { motion } from 'framer-motion'
import { useSearchParams } from 'react-router-dom'
import { getRecommendations } from '../api'
import { useData, Pill, Loading, Panel, siteName, urgencyText } from '../components/ui.jsx'

const enter = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } }
const AlertsPage = lazy(() => import('./Alerts.jsx'))

export default function Decision() {
  const [searchParams] = useSearchParams()
  return searchParams.get('view') === 'alerts' ? <AlertsPage /> : <DecisionSupport />
}

function DecisionSupport() {
  const recs = useData(getRecommendations)
  if (!recs) return <Loading />

  return (
    <div className="space-y-6 sm:space-y-7">
      <motion.header {...enter} transition={{ duration: 0.3 }} className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">Decision support · field response</p>
        <h1 className="mt-1 font-sans text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Response priorities</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">Review each recommended action, its urgency, and the factors that shaped the site ranking.</p>
      </motion.header>

      <div className="space-y-4">
        {recs.map((recommendation, index) => (
          <motion.div key={recommendation.site_id} {...enter} transition={{ duration: 0.3, delay: index * 0.06 }}>
            <Panel className={recommendation.rank === 1 ? 'border-l-4 border-l-rose-500' : ''}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-900 text-sm font-semibold text-white">{recommendation.rank}</span>
                <h2 className="text-lg font-semibold text-slate-900">{siteName(recommendation.site_id)}</h2>
                <span className="text-sm tabular-nums text-slate-500">{recommendation.population_exposed.toLocaleString()} people served</span>
                <Pill level={recommendation.communication_status}>{`Link ${recommendation.communication_status}`}</Pill>
              </div>

              <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
                <section aria-label={`Recommended actions for ${siteName(recommendation.site_id)}`}>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Recommended actions</h3>
                  <ol className="space-y-4">
                    {recommendation.actions.map((action, actionIndex) => (
                      <li key={action.action} className="flex gap-3">
                        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{actionIndex + 1}</span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <strong className="text-sm font-semibold text-slate-900">{action.action}</strong>
                            <UrgencyBadge urgency={action.urgency} />
                          </div>
                          <p className="mt-1 text-sm leading-5 text-slate-600">{action.rationale}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>

                <section aria-label="Ranking factors" className="rounded-xl bg-slate-50 p-4">
                  <h3 className="mb-3 text-sm font-semibold text-slate-800">What drove the ranking</h3>
                  {recommendation.factors.length === 0 && <p className="text-sm text-slate-500">Factor weights appear here once Component 4 provides them.</p>}
                  <div className="space-y-3">
                    {recommendation.factors.map((factor) => (
                      <div key={factor.name} className="grid grid-cols-[minmax(0,1fr)_minmax(70px,120px)_36px] items-center gap-2 text-xs">
                        <span className="truncate text-slate-600" title={factor.name}>{factor.name}</span>
                        <span className="h-2 overflow-hidden rounded-full bg-slate-200" role="img" aria-label={`${factor.name} weight ${Math.round(factor.weight * 100)} percent`}>
                          <span className="block h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, factor.weight * 100 * 1.6)}%` }} />
                        </span>
                        <span className="text-right font-semibold tabular-nums text-slate-700">{Math.round(factor.weight * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </Panel>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function UrgencyBadge({ urgency }) {
  const style = {
    now: 'bg-rose-50 text-rose-800 ring-rose-200',
    within_1h: 'bg-amber-50 text-amber-800 ring-amber-200',
    within_6h: 'bg-sky-50 text-sky-800 ring-sky-200',
    monitor: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  }[urgency] || 'bg-slate-100 text-slate-700 ring-slate-200'
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${style}`}>{urgencyText[urgency] || urgency}</span>
}
