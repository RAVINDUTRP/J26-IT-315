import { getNetwork } from '../api'
import { useData, Loading, Panel } from '../components/ui.jsx'

const inPath = (path, a, b) => {
  const i = path.indexOf(a)
  return i >= 0 && path[i + 1] === b
}
const color = (h) => (h > 0.75 ? '#2f7d5c' : h > 0.5 ? '#c58a2c' : '#b1362e')

export default function Network() {
  const net = useData(getNetwork)
  if (!net) return <Loading />
  const byId = Object.fromEntries(net.nodes.map((n) => [n.id, n]))
  const failing = net.nodes.filter((n) => n.predicted_failure)

  return (
    <>
      <header className="page-head">
        <h1>Network</h1>
        <p className="lede">
          {failing.length ? `${failing[0].id} is predicted to fail (${Math.round(failing[0].predicted_failure * 100)}% likely). Traffic already moved to a healthier route.` : 'All links healthy.'}
        </p>
      </header>
      <div className="tiles">
        <div className="tile"><span className="muted small">Packets delivered</span><strong>{net.pdr_percent}<small> %</small></strong></div>
        <div className="tile"><span className="muted small">End-to-end delay</span><strong>{net.latency_ms}<small> ms</small></strong></div>
        <div className="tile"><span className="muted small">Recovery after reroute</span><strong>{net.recovery_s}<small> s</small></strong></div>
      </div>
      <div className="two">
        <Panel title="Mesh route" note="Thick line is the route in use. Dashed lines are spare links.">
          <svg viewBox="0 0 540 340" role="img" aria-label="LoRa mesh topology" className="mesh">
            {net.links.map(([a, b]) => {
              const A = byId[a], B = byId[b]
              const on = inPath(net.active_path, a, b)
              const old = inPath(net.previous_path, a, b)
              return <line key={a + b} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={on ? '#1d6f8b' : old ? '#b1362e' : '#9fb2ba'} strokeWidth={on ? 5 : 1.5} strokeDasharray={on ? '' : '5 5'} />
            })}
            {net.nodes.map((n) => (
              <g key={n.id}>
                <circle cx={n.x} cy={n.y} r="20" fill="#fff" stroke={color(n.health)} strokeWidth="3" />
                <text x={n.x} y={n.y + 5} textAnchor="middle" fontSize="13" fontWeight="600" fill="#14313b">{n.id}</text>
              </g>
            ))}
          </svg>
          <p className="muted small">Red dashed line: the route that was used before R4 started to degrade.</p>
        </Panel>
        <Panel title="Node health">
          <table>
            <thead><tr><th>Node</th><th>Health</th><th>Battery</th><th>Signal</th></tr></thead>
            <tbody>
              {net.nodes.map((n) => (
                <tr key={n.id}>
                  <td><strong>{n.id}</strong> <span className="muted small">{n.role}</span></td>
                  <td><span className="bar"><i style={{ width: `${n.health * 100}%`, background: color(n.health) }} /></span></td>
                  <td>{n.battery}%</td>
                  <td>{n.rssi} dBm</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </>
  )
}
