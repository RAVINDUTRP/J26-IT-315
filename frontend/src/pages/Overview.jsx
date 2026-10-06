import { Link } from 'react-router-dom'
import { getNetwork, getRisk, getRecommendations } from '../api'
import { useData, Pill, Loading, Panel, siteName } from '../components/ui.jsx'

export default function Overview() {
  const net = useData(getNetwork)
  const risk = useData(getRisk)
  const recs = useData(getRecommendations)
  if (!net || !risk || !recs) return <Loading />

  const top = recs[0]
  const critical = risk.filter((r) => r.risk_category === 'critical').length
  const anomalies = risk.filter((r) => r.anomaly.flag).length

  return (
    <>
      <header className="page-head">
        <h1>{siteName(top.site_id)} needs action now</h1>
        <p className="lede">
          {critical} site at critical risk in the next {risk[0].horizon_h} hours. {anomalies} unusual pattern flagged. Alerts are still getting through the mesh.
        </p>
      </header>

      <div className="flow">
        <Link to="/sensing" className="flow-step">
          <strong>Sensing</strong>
          <span>3 sites reporting. Ambatale is sampling every 2 minutes because of heavy rain.</span>
        </Link>
        <Link to="/network" className="flow-step">
          <strong>Network</strong>
          <span>{net.pdr_percent}% of packets delivered. Node R4 is failing, traffic already moved to R2 and R5.</span>
        </Link>
        <Link to="/prediction" className="flow-step">
          <strong>Risk forecast</strong>
          <span>Rainfall and rising turbidity drive the Ambatale forecast.</span>
        </Link>
        <Link to="/decision" className="flow-step hot">
          <strong>Response</strong>
          <span>{top.actions[0].action} at {siteName(top.site_id)}.</span>
        </Link>
      </div>

      <Panel title="Sites, most urgent first">
        <table>
          <thead>
            <tr><th>Site</th><th>Risk (6h)</th><th>Unusual pattern</th><th>Link</th><th>First action</th></tr>
          </thead>
          <tbody>
            {recs.map((r) => {
              const a = risk.find((x) => x.site_id === r.site_id)
              return (
                <tr key={r.site_id}>
                  <td><strong>{siteName(r.site_id)}</strong><br /><span className="muted small">{r.population_exposed.toLocaleString()} people served</span></td>
                  <td><Pill level={a.risk_category} /> <span className="muted small">{Math.round(a.risk_score * 100)}%</span></td>
                  <td>{a.anomaly.flag ? 'Pollution pattern' : 'None'}</td>
                  <td><Pill level={r.communication_status} /></td>
                  <td>{r.actions[0].action}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Panel>
    </>
  )
}
