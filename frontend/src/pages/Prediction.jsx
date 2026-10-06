import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts'
import { getRisk } from '../api'
import { useData, Pill, Loading, Panel, siteName } from '../components/ui.jsx'

export default function Prediction() {
  const risk = useData(getRisk)
  if (!risk) return <Loading />
  return (
    <>
      <header className="page-head">
        <h1>Risk forecast</h1>
        <p className="lede">Expected contamination risk over the next {risk[0].horizon_h} hours, with the factors behind each score. Factors describe the model, not proven causes.</p>
      </header>
      <div className="stack">
        {risk.map((r) => (
          <Panel key={r.site_id}>
            <div className="row-head">
              <h3>{siteName(r.site_id)}</h3>
              <Pill level={r.risk_category} />
              {r.anomaly.flag && <Pill level="critical">Unusual pattern</Pill>}
            </div>
            <div className="two tight">
              <div>
                <p className="big">{Math.round(r.risk_score * 100)}%</p>
                <p className="muted small">risk score, model confidence {Math.round(r.confidence * 100)}%</p>
                <span className="bar tall"><i style={{ width: `${r.risk_score * 100}%` }} /></span>
                <p className="small">{r.anomaly.flag ? 'Readings match a pollution pattern, not a sensor fault.' : 'No unusual readings.'}</p>
              </div>
              <div className="chart short">
                <ResponsiveContainer>
                  <BarChart data={r.explanation} layout="vertical" margin={{ left: 40, right: 16 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="feature" width={190} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Bar dataKey="contribution" name="Effect on risk" radius={3}>
                      {r.explanation.map((e) => <Cell key={e.feature} fill={e.contribution >= 0 ? '#b1362e' : '#1d6f8b'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </>
  )
}
