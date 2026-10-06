import { useState } from 'react'
import { getNetwork } from '../api'
import { useData, Loading, Panel } from '../components/ui.jsx'

const inPath = (path, a, b) => {
  const i = path.indexOf(a)
  return i >= 0 && path[i + 1] === b
}

const color = (h) => (h > 0.75 ? '#2f7d5c' : h > 0.5 ? '#c58a2c' : '#b1362e')

export default function Network() {
  const [failedNode, setFailedNode] = useState('')
  const net = useData(() => getNetwork(failedNode), [failedNode])

  if (!net) return <Loading />

  const byId = Object.fromEntries(net.nodes.map((n) => [n.id, n]))
  const failing = net.nodes.filter((n) => n.predicted_failure >= 0.65)
  const ranked = net.routing?.ranked_paths || []

  const simulateFailure = () => setFailedNode(failedNode ? '' : 'R4')

  return (
    <>
      <header className="page-head">
        <div className="row-head">
          <div>
            <h1>Resilient LoRa Mesh</h1>
            <p className="lede">
              Self-healing multi-hop communication for water-quality telemetry when cellular or public internet infrastructure is unavailable.</p>
          </div>
          <button className="action-button" onClick={simulateFailure}>
            {failedNode ? 'Restore R4' : 'Simulate R4 failure'}
          </button>
        </div>
        {failing.length ? (
  <p className="alert-line">
  {failing[0].id} has elevated failure risk ({Math.round(failing[0].failure_risk * 100)}%).
  The self-healing layer monitors the node and maintains communication through an available path.
</p>
        ) : null}
      </header>

      <div className="tiles">
        <div className="tile"><span className="muted small">Packet delivery ratio</span><strong>{net.pdr_percent}<small> %</small></strong></div>
        <div className="tile"><span className="muted small">End-to-end delay</span><strong>{net.latency_ms}<small> ms</small></strong></div>
        <div className="tile"><span className="muted small">Recovery time</span><strong>{net.recovery_s}<small> s</small></strong></div>
        <div className="tile"><span className="muted small">Energy estimate</span><strong>{net.energy_mwh}<small> mWh</small></strong></div>
        <div className="tile"><span className="muted small">Route switches</span><strong>{net.route_switch_count}</strong></div>
      </div>

      <div className="two">
        <Panel title="Mesh topology" note="Blue = active route. Red dashed = previous route.">
          <svg viewBox="0 0 540 340" role="img" aria-label="LoRa mesh topology" className="mesh">
            {net.links.map(([a, b]) => {
              const A = byId[a], B = byId[b]
              if (!A || !B) return null
              const on = inPath(net.active_path, a, b)
              const old = inPath(net.previous_path, a, b)
              const unavailable = A.status === 'failed' || B.status === 'failed'
              return (
                <line
                  key={a + b}
                  x1={A.x} y1={A.y} x2={B.x} y2={B.y}
                  stroke={on ? '#1d6f8b' : old ? '#b1362e' : unavailable ? '#d3dadd' : '#9fb2ba'}
                  strokeWidth={on ? 5 : 1.5}
                  strokeDasharray={on ? '' : '5 5'}
                />
              )
            })}
            {net.nodes.map((n) => (
              <g key={n.id}>
                <circle cx={n.x} cy={n.y} r="20" fill="#fff" stroke={color(n.health)} strokeWidth="3" />
                <text x={n.x} y={n.y + 5} textAnchor="middle" fontSize="13" fontWeight="600" fill="#14313b">{n.id}</text>
              </g>
            ))}
          </svg>
          <p className="muted small">
  {failedNode
    ? `Failure detected at ${failedNode}; communication recovered through ${net.active_path.join(' → ')}.`
    : `Current communication path: ${net.active_path.join(' → ')}`
  }
</p>
        </Panel>

        <Panel title="Node health" note="Health combines RSSI, SNR, battery and congestion.">
          <table>
            <thead><tr><th>Node</th><th>Health</th><th>Battery</th><th>RSSI</th><th>SNR</th></tr></thead>
            <tbody>
              {net.nodes.map((n) => (
                <tr key={n.id}>
                  <td><strong>{n.id}</strong> <span className="muted small">{n.role}</span></td>
                  <td>
                    <span className="bar"><i style={{ width: `${n.health * 100}%`, background: color(n.health) }} /></span>
                    <span className="small"> {Math.round(n.health * 100)}%</span>
                  </td>
                  <td>{n.battery}%</td>
                  <td>{n.rssi} dBm</td>
                  <td>{n.snr} dB</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <div className="two">
       <Panel title="Self-Healing Route Recovery" note={`Mechanism: ${net.routing.algorithm}`}>
          <table>
           <thead><tr><th>Rank</th><th>Path</th><th>Score</th><th>Hops</th><th>Status</th></tr></thead>
            <tbody>
              {ranked.map((r, i) => (
                <tr key={r.path.join('-')}>
                  <td><strong>#{i + 1}</strong></td>
                  <td>{r.path.join(' → ')}</td>
                  <td>{r.score.toFixed(3)}</td>
                  <td>{r.hops}</td>
                  <td><span className={`pill ${r.available ? 'pill-good' : 'pill-lost'}`}>{r.available ? 'available' : 'failed'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Transmission pipeline" note="The same C2 pipeline is used by the simulation and API.">
          <div className="pipeline">
            <span>Water-quality reading</span>
            <b>↓</b>
            <span>Compact binary packet</span>
            <b>↓</b>
            <span>Rolling-key XOR + integrity tag</span>
            <b>↓</b>
            <span>Multi-hop LoRa mesh</span>
            <b>↓</b>
            <span>Gateway decrypt + decode</span>
          </div>
        </Panel>
      </div>
    </>
  )
}
