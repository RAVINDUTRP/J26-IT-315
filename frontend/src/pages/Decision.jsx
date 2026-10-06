import { getRecommendations } from '../api'
import { useData, Pill, Loading, Panel, siteName, urgencyText } from '../components/ui.jsx'

export default function Decision() {
  const recs = useData(getRecommendations)
  if (!recs) return <Loading />
  return (
    <>
      <header className="page-head">
        <h1>Response</h1>
        <p className="lede">Sites ranked by how soon they need action, with the reason for each step.</p>
      </header>
      <div className="stack">
        {recs.map((r) => (
          <Panel key={r.site_id} className={r.rank === 1 ? 'first' : ''}>
            <div className="row-head">
              <span className="rank">{r.rank}</span>
              <h3>{siteName(r.site_id)}</h3>
              <span className="muted small">{r.population_exposed.toLocaleString()} people served</span>
              <Pill level={r.communication_status}>{`Link ${r.communication_status}`}</Pill>
            </div>
            <div className="two tight">
              <ol className="actions">
                {r.actions.map((a) => (
                  <li key={a.action}>
                    <strong>{a.action}</strong>
                    <span className={`when when-${a.urgency}`}>{urgencyText[a.urgency]}</span>
                    <p className="muted small">{a.rationale}</p>
                  </li>
                ))}
              </ol>
              <div>
                <h4>What drove the ranking</h4>
                {r.factors.length === 0 && <p className="muted small">Factor weights appear here once Component 4 provides them.</p>}
                {r.factors.map((f) => (
                  <div key={f.name} className="factor">
                    <span>{f.name}</span>
                    <span className="bar"><i style={{ width: `${f.weight * 100 * 1.6}%` }} /></span>
                    <span className="small">{Math.round(f.weight * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </>
  )
}
