import { motion } from 'framer-motion'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts'
import { getRisk } from '../api'
import { useData, Pill, Loading, Panel, siteName } from '../components/ui.jsx'

const enter = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } }

export default function Prediction() {
  const risk = useData(getRisk)
  if (!risk) return <Loading />

  return (
    <div className="space-y-6 sm:space-y-7">
      <motion.header {...enter} transition={{ duration: 0.3 }} className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">Predictive analysis · research model</p>
        <h1 className="mt-1 font-sans text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Risk forecast</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
          Expected contamination risk over the next {risk[0]?.horizon_h ?? 6} hours, with the factors behind each score. Factors describe the model, not proven causes.
        </p>
      </motion.header>

      <div className="space-y-4">
        {risk.map((assessment, index) => (
          <motion.div key={assessment.site_id} {...enter} transition={{ duration: 0.3, delay: index * 0.06 }}>
            <Panel>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="mr-1 text-lg font-semibold text-slate-900">{siteName(assessment.site_id)}</h2>
                <Pill level={assessment.risk_category} />
                {assessment.anomaly.flag && <Pill level="critical">Unusual pattern</Pill>}
              </div>

              <div className="mt-5 grid items-center gap-6 lg:grid-cols-[minmax(220px,0.7fr)_minmax(0,1.3fr)]">
                <div>
                  <p className="metric-value">{Math.round(assessment.risk_score * 100)}<span className="text-2xl">%</span></p>
                  <p className="mt-1 text-sm text-slate-500">Risk score · model confidence {Math.round(assessment.confidence * 100)}%</p>
                  <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`Risk score ${Math.round(assessment.risk_score * 100)} percent`}>
                    <div className={`h-full rounded-full ${riskColor[assessment.risk_category] || 'bg-slate-500'}`} style={{ width: `${assessment.risk_score * 100}%` }} />
                  </div>
                  <p className="mt-3 text-sm leading-5 text-slate-600">
                    {assessment.anomaly.flag ? 'Readings resemble a pollution pattern. This is a model signal, not confirmation of contamination.' : 'No unusual readings were flagged by the current model.'}
                  </p>
                </div>

                <div className="min-w-0">
                  <h3 className="mb-2 text-sm font-semibold text-slate-800">Factors contributing to this forecast</h3>
                  <div className="h-56 w-full" role="img" aria-label={`Feature contribution chart for ${siteName(assessment.site_id)}`}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={assessment.explanation} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="feature" width={185} tick={{ fontSize: 12, fill: '#475569' }} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(value) => [Number(value).toFixed(3), 'Model contribution']} contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0', boxShadow: '0 8px 24px rgba(15,23,42,0.08)' }} />
                        <Bar dataKey="contribution" name="Model contribution" radius={4}>
                          {assessment.explanation.map((factor) => <Cell key={factor.feature} fill={factor.contribution >= 0 ? '#e05252' : '#2787a8'} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-4 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-rose-500" />Raises score</span>
                    <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-cyan-700" />Lowers score</span>
                  </div>
                </div>
              </div>
            </Panel>
          </motion.div>
        ))}
      </div>
      <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
        Forecasts are research decision support. Validate elevated risk with confirmatory field sampling before operational action.
      </p>
    </div>
  )
}

const riskColor = {
  low: 'bg-emerald-500',
  moderate: 'bg-amber-500',
  high: 'bg-orange-500',
  critical: 'bg-rose-500',
}
