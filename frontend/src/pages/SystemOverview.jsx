import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'

const stages = [
  {
    id: '01',
    title: 'Adaptive sensing',
    short: 'Measure and prioritize',
    description: 'pH, turbidity, conductivity, dissolved solids, temperature, rainfall, and sensor health guide what to sample and when.',
    output: 'Observation + sampling plan',
    href: '/sensing?view=adaptive',
    tone: 'cyan',
    state: 'Rule prototype',
  },
  {
    id: '02',
    title: 'Resilient communication',
    short: 'Deliver through the mesh',
    description: 'Sensor and relay nodes report link quality so an observation can travel toward the gateway over a healthy path.',
    output: 'Routed transmission',
    href: '/network',
    tone: 'blue',
    state: 'Routing prototype',
  },
  {
    id: '03',
    title: 'Contamination risk',
    short: 'Estimate near-term risk',
    description: 'Recent water readings and environmental context are intended to produce an explainable six-hour risk assessment.',
    output: 'Risk + explanation',
    href: '/prediction',
    tone: 'violet',
    state: 'Model not trained',
  },
  {
    id: '04',
    title: 'Decision support',
    short: 'Prioritize a response',
    description: 'Risk, exposed population, and communication status inform a ranked set of follow-up actions for review.',
    output: 'Ranked recommendations',
    href: '/decision',
    tone: 'rose',
    state: 'Heuristic prototype',
  },
]

const toneStyles = {
  cyan: { number: 'bg-cyan-100 text-cyan-800', border: 'border-cyan-200', dot: 'bg-cyan-500', text: 'text-cyan-800', soft: 'bg-cyan-50' },
  blue: { number: 'bg-blue-100 text-blue-800', border: 'border-blue-200', dot: 'bg-blue-500', text: 'text-blue-800', soft: 'bg-blue-50' },
  violet: { number: 'bg-violet-100 text-violet-800', border: 'border-violet-200', dot: 'bg-violet-500', text: 'text-violet-800', soft: 'bg-violet-50' },
  rose: { number: 'bg-rose-100 text-rose-800', border: 'border-rose-200', dot: 'bg-rose-500', text: 'text-rose-800', soft: 'bg-rose-50' },
}

export default function SystemOverview() {
  return (
    <div className="space-y-7 sm:space-y-8">
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-wrap items-end justify-between gap-5 border-b border-slate-200 pb-6"
      >
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">AquaShield · system map</p>
          <h1 className="mt-1 font-sans text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">System overview</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
            How field sensing, resilient communication, contamination-risk research, and response planning fit together for Kelani Basin monitoring.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
          <span className="size-2 rounded-full bg-amber-500" /> Research prototype · demo data
        </span>
      </motion.header>

      <section aria-labelledby="system-flow-title" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">End-to-end workflow</p>
            <h2 id="system-flow-title" className="mt-1 text-xl font-semibold text-slate-950">From river observation to response</h2>
          </div>
          <p className="text-xs text-slate-500">Four research components · one shared data flow</p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {stages.map((stage, index) => {
            const style = toneStyles[stage.tone]
            return (
              <motion.article
                key={stage.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.26, delay: index * 0.045 }}
                className={`relative flex min-h-[270px] flex-col rounded-xl border ${style.border} bg-white p-4 sm:p-5`}
              >
                {index < stages.length - 1 && <span aria-hidden="true" className="absolute -right-[13px] top-8 z-10 hidden h-px w-3 bg-slate-300 xl:block" />}
                <div className="flex items-center justify-between gap-3">
                  <span className={`grid size-9 place-items-center rounded-lg text-xs font-bold tabular-nums ${style.number}`}>{stage.id}</span>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${style.soft} ${style.text}`}>
                    <span className={`size-1.5 rounded-full ${style.dot}`} />{stage.state}
                  </span>
                </div>
                <p className="mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{stage.short}</p>
                <h3 className="mt-1 text-base font-semibold text-slate-950">{stage.title}</h3>
                <p className="mt-2 text-sm leading-5 text-slate-600">{stage.description}</p>
                <div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <span className="text-xs text-slate-500">Output</span>
                  <span className="text-right text-xs font-semibold text-slate-700">{stage.output}</span>
                </div>
                <Link to={stage.href} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:text-blue-900">
                  Open component <span aria-hidden="true">→</span>
                </Link>
              </motion.article>
            )
          })}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Shared system contract</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-950">What moves between components</h2>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <ContractCard title="Observation" fields="Site · timestamp · readings · context · sampling" />
            <ContractCard title="Risk assessment" fields="Six-hour horizon · risk score · category · explanation" />
            <ContractCard title="Recommendation" fields="Priority · exposed population · communication · actions" />
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">The contracts keep component inputs and outputs consistent as the research modules are integrated.</p>
        </div>

        <aside className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-800">Current integration boundary</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">Prototype, not live telemetry</h2>
          <ul className="mt-4 space-y-3 text-sm leading-5 text-slate-700">
            <li className="flex gap-2.5"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-600" /><span>The API and dashboard currently use generated demo observations and risk assessments.</span></li>
            <li className="flex gap-2.5"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-600" /><span>No deployed sensor mesh or trained contamination-prediction model is connected yet.</span></li>
            <li className="flex gap-2.5"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-600" /><span>Use results for research demonstration and validation planning, not operational water-safety decisions.</span></li>
          </ul>
          <Link to="/" className="mt-5 inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3.5 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-100">
            Open monitoring dashboard <span aria-hidden="true">→</span>
          </Link>
        </aside>
      </section>
    </div>
  )
}

function ContractCard({ title, fields }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-xs leading-5 text-slate-600">{fields}</p>
    </article>
  )
}
