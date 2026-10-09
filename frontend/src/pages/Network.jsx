import { motion } from 'framer-motion'
import { getNetwork } from '../api'
import { useData, Loading, Panel } from '../components/ui.jsx'

const inPath = (path, a, b) => {
  const index = path.indexOf(a)
  return index >= 0 && path[index + 1] === b
}
const nodeColor = (health) => (health > 0.75 ? '#2f7d5c' : health > 0.5 ? '#c58a2c' : '#b1362e')
const enter = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } }

export default function Network() {
  const net = useData(getNetwork)
  if (!net) return <Loading />

  const byId = Object.fromEntries(net.nodes.map((node) => [node.id, node]))
  const failing = net.nodes.filter((node) => node.predicted_failure)
  const metrics = [
    { label: 'Packets delivered', value: net.pdr_percent, unit: '%' },
    { label: 'End-to-end delay', value: net.latency_ms, unit: 'ms' },
    { label: 'Recovery after reroute', value: net.recovery_s, unit: 's' },
  ]

  return (
    <div className="space-y-6 sm:space-y-7">
      <motion.header {...enter} transition={{ duration: 0.3 }} className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Communications · LoRa mesh</p>
        <h1 className="mt-1 font-sans text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Network health</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
          {failing.length ? `${failing[0].id} has a ${Math.round(failing[0].predicted_failure * 100)}% predicted failure likelihood. Traffic has moved to a healthier route.` : 'All monitored mesh links are healthy.'}
        </p>
      </motion.header>

      <section aria-label="Network performance indicators" className="grid gap-3 sm:grid-cols-3">
        {metrics.map((metric, index) => (
          <motion.article key={metric.label} {...enter} transition={{ duration: 0.28, delay: index * 0.05 }} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <p className="text-sm font-medium text-slate-500">{metric.label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{metric.value}<span className="ml-1 text-base font-medium text-slate-500">{metric.unit}</span></p>
          </motion.article>
        ))}
      </section>

      <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <motion.div {...enter} transition={{ duration: 0.3, delay: 0.08 }}>
          <Panel title="Mesh route" note="Solid line shows the active route. Dashed lines show alternate links.">
            <div className="rounded-xl bg-slate-50 p-2 sm:p-3">
              <svg viewBox="0 0 540 340" role="img" aria-label="LoRa mesh topology" className="h-auto w-full">
                {net.links.map(([a, b]) => {
                  const start = byId[a], end = byId[b]
                  const active = inPath(net.active_path, a, b)
                  const previous = inPath(net.previous_path, a, b)
                  return <line key={a + b} x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={active ? '#1d6f8b' : previous ? '#b1362e' : '#9fb2ba'} strokeWidth={active ? 5 : 1.5} strokeDasharray={active ? '' : '5 5'} />
                })}
                {net.nodes.map((node) => (
                  <g key={node.id}>
                    <circle cx={node.x} cy={node.y} r="20" fill="#fff" stroke={nodeColor(node.health)} strokeWidth="3" />
                    <text x={node.x} y={node.y + 5} textAnchor="middle" fontSize="13" fontWeight="600" fill="#14313b">{node.id}</text>
                  </g>
                ))}
              </svg>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">The red dashed path shows the route used before R4 began to degrade.</p>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600">
              <span className="inline-flex items-center gap-2"><span className="h-1 w-6 rounded bg-[#1d6f8b]" />Active route</span>
              <span className="inline-flex items-center gap-2"><span className="h-0.5 w-6 border-t border-dashed border-slate-400" />Alternate link</span>
              <span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-full bg-amber-500" />Degraded node</span>
            </div>
          </Panel>
        </motion.div>

        <motion.div {...enter} transition={{ duration: 0.3, delay: 0.13 }}>
          <Panel title="Node health" note="Battery and signal readings for each mesh node.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[440px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-3">Node</th><th className="px-2 py-3">Health</th><th className="px-2 py-3">Battery</th><th className="px-2 py-3">Signal</th>
                  </tr>
                </thead>
                <tbody>
                  {net.nodes.map((node) => (
                    <tr key={node.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-2 py-3"><strong className="font-semibold text-slate-900">{node.id}</strong><span className="ml-2 text-xs capitalize text-slate-500">{node.role}</span></td>
                      <td className="px-2 py-3">
                        <span className="block h-2 w-20 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${node.id} health ${Math.round(node.health * 100)} percent`}>
                          <span className="block h-full rounded-full" style={{ width: `${node.health * 100}%`, backgroundColor: nodeColor(node.health) }} />
                        </span>
                      </td>
                      <td className="px-2 py-3 text-slate-700">{node.battery}%</td>
                      <td className="px-2 py-3 text-slate-700">{node.rssi} dBm</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </motion.div>
      </section>
    </div>
  )
}
