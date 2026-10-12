
import { useState } from 'react'
import { getNetwork } from '../api'
import { useData, Loading, Panel } from '../components/ui.jsx'

const inPath = (path = [], a, b) => {
  const i = path.indexOf(a)
  return i >= 0 && path[i + 1] === b
}

const healthColor = (health = 0) =>
  health > 0.75 ? '#2f7d5c' : health > 0.5 ? '#c58a2c' : '#b1362e'

const roleStyle = (role = '') => {
  const value = role.toLowerCase()

  if (value.includes('gateway')) {
    return { fill: '#e8def8', stroke: '#7351a6', label: 'Gateway' }
  }

  if (value.includes('relay')) {
    return { fill: '#d9edf7', stroke: '#28799b', label: 'Relay' }
  }

  return { fill: '#dcefe4', stroke: '#2f7d5c', label: 'Sensor' }
}

export default function Network() {
  const [failedNode, setFailedNode] = useState('')
  const net = useData(() => getNetwork(failedNode), [failedNode])

  if (!net) return <Loading />

  const byId = Object.fromEntries(net.nodes.map((n) => [n.id, n]))
  const failing = net.nodes.filter((n) => n.predicted_failure >= 0.65)
  const ranked = net.routing?.ranked_paths || []
  
  const failedCount = net.nodes.filter(
  (n) => n.status === 'failed'
).length

const highRiskCount = net.nodes.filter(
  (n) => n.predicted_failure >= 0.65 && n.status !== 'failed'
).length

const healthyCount = net.nodes.filter(
  (n) => n.health > 0.75 && n.status !== 'failed'
).length
  const activePath = net.active_path || []
  const previousPath = net.previous_path || []

  const simulateFailure = () => {
    setFailedNode(failedNode ? '' : 'R4')
  }

  return (
    <>
      <header className="page-head">
        <div className="row-head">
          <div>
            <h1>Resilient LoRa Mesh</h1>
            <p className="lede">
              Self-healing multi-hop communication for water-quality
              telemetry when cellular or public internet infrastructure
              is unavailable.
            </p>
          </div>

          <button className="action-button" onClick={simulateFailure}>
            {failedNode ? 'Restore R4' : 'Simulate R4 failure'}
          </button>
        </div>

        {failing.length > 0 && (
          <p className="alert-line">
            {failing[0].id} has elevated failure risk (
            {Math.round((failing[0].failure_risk || 0) * 100)}%).
            The self-healing layer monitors the node and maintains
            communication through an available path.
          </p>
        )}
      </header>

      <div className="tiles">
        <div className="tile">
          <span className="muted small">Packet delivery ratio</span>
          <strong>{net.pdr_percent}<small> %</small></strong>
        </div>
        <div className="tile">
          <span className="muted small">End-to-end delay</span>
          <strong>{net.latency_ms}<small> ms</small></strong>
        </div>
        <div className="tile">
          <span className="muted small">Recovery time</span>
          <strong>{net.recovery_s}<small> s</small></strong>
        </div>
        <div className="tile">
          <span className="muted small">Energy estimate</span>
          <strong>{net.energy_mwh}<small> mWh</small></strong>
        </div>
        <div className="tile">
          <span className="muted small">Route switches</span>
          <strong>{net.route_switch_count}</strong>
        </div>
      </div>
      <div className="tiles">
  <div className="tile">
    <span className="muted small">Healthy Nodes</span>
    <strong style={{ color: '#2f7d5c' }}>{healthyCount}</strong>
    <span className="muted small">Health above 75%</span>
  </div>

  <div className="tile">
    <span className="muted small">High-Risk Nodes</span>
    <strong style={{ color: '#c58a2c' }}>{highRiskCount}</strong>
    <span className="muted small">Predicted risk ≥ 65%</span>
  </div>

  <div className="tile">
    <span className="muted small">Failed Nodes</span>
    <strong style={{ color: '#b1362e' }}>{failedCount}</strong>
    <span className="muted small">Nodes currently failed</span>
  </div>
</div>

      
<div className="two">
  <Panel
    title="Network Recovery Diagnostics"
    note="Live diagnostics calculated from the current network response."
  >
    <div className="tiles">
      <div className="tile">
        <span className="muted small">Network Status</span>
        <strong
          style={{
            color: failedNodes.length ? '#b1362e' : '#2f7d5c',
            fontSize: '18px',
          }}
        >
          {recoveryStatus}
        </strong>
      </div>

      <div className="tile">
        <span className="muted small">Healthy Nodes</span>
        <strong style={{ color: '#2f7d5c' }}>
          {healthyNodes.length}
        </strong>
      </div>

      <div className="tile">
        <span className="muted small">Failed Nodes</span>
        <strong style={{ color: '#b1362e' }}>
          {failedNodes.length}
        </strong>
      </div>

      <div className="tile">
        <span className="muted small">High-Risk Nodes</span>
        <strong style={{ color: '#c58a2c' }}>
          {riskyNodes.length}
        </strong>
      </div>

      <div className="tile">
        <span className="muted small">Active Route Hops</span>
        <strong>{activeHops}</strong>
      </div>
    </div>

    <div style={{ marginTop: '20px' }}>
      <h3>Recovery Assessment</h3>

      <p className="muted small">
        {failedNodes.length > 0
          ? `Failed nodes: ${failedNodes.map((n) => n.id).join(', ')}. Check whether the active route avoids unavailable nodes.`
          : 'No failed nodes are reported by the current network response.'}
      </p>

      <p className="muted small">
        {pathChanged
          ? 'The active route differs from the previous route.'
          : 'No route change is confirmed by the current path data.'}
      </p>

      <p className="small">
        <strong>Active path:</strong>{' '}
        {activePath.length ? activePath.join(' → ') : 'Not available'}
      </p>

      <p className="small">
        <strong>Previous path:</strong>{' '}
        {previousPath.length
          ? previousPath.join(' → ')
          : 'No previous path available'}
      </p>
    </div>
  </Panel>

  <Panel
    title="Node Risk Assessment"
    note="Nodes requiring attention based on the current response."
  >
    {riskyNodes.length === 0 ? (
      <p className="muted small">
        No high-risk nodes are currently reported.
      </p>
    ) : (
      <table>
        <thead>
          <tr>
            <th>Node</th>
            <th>Risk</th>
            <th>Health</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {riskyNodes.map((n) => (
            <tr key={n.id}>
              <td><strong>{n.id}</strong></td>
              <td>
                {Math.round((n.failure_risk || 0) * 100)}%
              </td>
              <td>{Math.round(n.health * 100)}%</td>
              <td>
                <span className="pill pill-lost">
                  Monitor
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </Panel>
</div>

      <div className="two">
        <Panel
          title="Mesh topology"
          note="Node roles, link availability and communication routes."
        >
          <svg
            viewBox="0 0 540 340"
            role="img"
            aria-label="LoRa mesh topology showing node roles and recovery routes"
            className="mesh"
          >
            {net.links.map(([a, b]) => {
              const A = byId[a]
              const B = byId[b]

              if (!A || !B) return null

              const on = inPath(activePath, a, b)
              const old = inPath(previousPath, a, b)
              const unavailable =
                A.status === 'failed' || B.status === 'failed'

              return (
                <line
                  key={`${a}-${b}`}
                  x1={A.x}
                  y1={A.y}
                  x2={B.x}
                  y2={B.y}
                  stroke={
                    unavailable
                      ? '#d3a5a5'
                      : on
                        ? '#1d6f8b'
                        : old
                          ? '#b1362e'
                          : '#9fb2ba'
                  }
                  strokeWidth={on ? 5 : old ? 2.5 : 1.5}
                  strokeDasharray={on ? undefined : '5 5'}
                  opacity={unavailable ? 0.8 : 1}
                />
              )
            })}

            {net.nodes.map((n) => {
              const role = roleStyle(n.role)
              const failed = n.status === 'failed'
              const highRisk =
                !failed && n.predicted_failure >= 0.65

              return (
                <g key={n.id}>
                  {highRisk && (
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r="25"
                      fill="none"
                      stroke="#c58a2c"
                      strokeWidth="2"
                      strokeDasharray="4 3"
                    />
                  )}

                  <circle
                    cx={n.x}
                    cy={n.y}
                    r="20"
                    fill={failed ? '#fde2e2' : role.fill}
                    stroke={failed ? '#b1362e' : role.stroke}
                    strokeWidth={failed ? 4 : 2.5}
                  />

                  <text
                    x={n.x}
                    y={n.y + 4}
                    textAnchor="middle"
                    fontSize="12"
                    fontWeight="700"
                    fill={failed ? '#b1362e' : '#14313b'}
                  >
                    {n.id}
                  </text>

                  <text
                    x={n.x}
                    y={n.y + 34}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#52666e"
                  >
                    {failed ? 'FAILED' : role.label}
                  </text>
                </g>
              )
            })}
          </svg>

          <div
            className="small"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              marginTop: '12px',
              alignItems: 'center',
            }}
          >
            <span>
              <span style={{ color: '#2f7d5c' }}>●</span> Sensor
            </span>
            <span>
              <span style={{ color: '#28799b' }}>●</span> Relay
            </span>
            <span>
              <span style={{ color: '#7351a6' }}>●</span> Gateway
            </span>
            <span>
              <span style={{ color: '#b1362e' }}>●</span> Failed node
            </span>
            <span>
              <span style={{ color: '#c58a2c' }}>◉</span> High risk
            </span>
          </div>

          <div
            className="small"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '14px',
              marginTop: '10px',
            }}
          >
            <span>
              <span style={{ color: '#1d6f8b' }}>━━</span> Active route
            </span>
            <span>
              <span style={{ color: '#b1362e' }}>┄┄</span> Previous route
            </span>
            <span>
              <span style={{ color: '#9fb2ba' }}>━━</span> Other link
            </span>
          </div>

          <p className="muted small" style={{ marginTop: '14px' }}>
            {failedNode
              ? `Failure detected at ${failedNode}; current communication path: ${activePath.join(' → ')}.`
              : `Current communication path: ${activePath.join(' → ')}`}
          </p>
        </Panel>

        <Panel
          title="Node health"
          note="Health combines RSSI, SNR, battery and congestion."
        >
          <table>
            <thead>
              <tr>
                <th>Node</th>
                <th>Health</th>
                <th>Battery</th>
                <th>RSSI</th>
                <th>SNR</th>
              </tr>
            </thead>
            <tbody>
              {net.nodes.map((n) => (
                <tr key={n.id}>
                  <td>
                    <strong>{n.id}</strong>{' '}
                    <span className="muted small">{n.role}</span>
                  </td>
                  <td>
                    <span className="bar">
                      <i
                        style={{
                          width: `${n.health * 100}%`,
                          background: healthColor(n.health),
                        }}
                      />
                    </span>
                    <span className="small">
                      {' '}{Math.round(n.health * 100)}%
                    </span>
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
        <Panel
          title="Self-Healing Route Recovery"
          note={`Mechanism: ${net.routing?.algorithm || 'Route recovery'}`}
        >
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Path</th>
                <th>Score</th>
                <th>Hops</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r, i) => (
                <tr key={r.path.join('-')}>
                  <td><strong>#{i + 1}</strong></td>
                  <td>{r.path.join(' → ')}</td>
                  <td>{r.score.toFixed(3)}</td>
                  <td>{r.hops}</td>
                  <td>
                    <span
                      className={`pill ${
                        r.available ? 'pill-good' : 'pill-lost'
                      }`}
                    >
                      {r.available ? 'available' : 'failed'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel
          title="Transmission pipeline"
          note="The same C2 pipeline is used by the simulation and API."
        >
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
