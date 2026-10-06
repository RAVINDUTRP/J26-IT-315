import { useState } from 'react'
import { ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { getObservations } from '../api'
import { useData, Loading, Panel, siteName } from '../components/ui.jsx'

const SITES = ['ambatale', 'biyagama', 'hanwella']
const hhmm = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export default function Sensing() {
  const [site, setSite] = useState('ambatale')
  const obs = useData(() => getObservations(site), [site])

  return (
    <>
      <header className="page-head">
        <h1>Sensing</h1>
        <p className="lede">The node measures more often when rain and turbidity rise, and says why.</p>
      </header>
      <div className="tabs" role="tablist">
        {SITES.map((s) => (
          <button key={s} role="tab" aria-selected={s === site} className={s === site ? 'on' : ''} onClick={() => setSite(s)}>{siteName(s)}</button>
        ))}
      </div>
      {!obs ? <Loading /> : <Body obs={obs} />}
    </>
  )
}

function Body({ obs }) {
  const last = obs[obs.length - 1]
  const data = obs.map((o) => ({ t: hhmm(o.timestamp), turbidity: o.readings.turbidity_ntu, rain: o.rainfall_mm_h }))
  const r = last.readings
  return (
    <>
      <div className="tiles">
        <Tile label="Turbidity" value={r.turbidity_ntu} unit="NTU" />
        <Tile label="pH" value={r.ph} />
        <Tile label="Conductivity" value={r.ec_us_cm} unit="uS/cm" />
        <Tile label="Dissolved solids" value={r.tds_ppm} unit="ppm" />
        <Tile label="Water temperature" value={r.temp_c} unit="C" />
        <Tile label="Battery" value={Math.round(last.battery_pct)} unit="%" />
      </div>
      <div className="two">
        <Panel title="Turbidity and rainfall, last 6 hours">
          <div className="chart">
            <ResponsiveContainer>
              <ComposedChart data={data}>
                <CartesianGrid stroke="#d5e0e4" vertical={false} />
                <XAxis dataKey="t" interval={3} tick={{ fontSize: 12 }} />
                <YAxis yAxisId="l" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar yAxisId="r" dataKey="rain" name="Rain (mm/h)" fill="#a9c9d6" />
                <Line yAxisId="l" dataKey="turbidity" name="Turbidity (NTU)" stroke="#a5662a" strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Current sampling decision" note={`Sensor confidence ${Math.round(last.sensor_confidence * 100)}%`}>
          <p className="big">Every {last.sampling.interval_s / 60} min</p>
          <p>Priority: {last.sampling.priority_parameters.map((p) => p.replace('_ntu', '').replace('_us_cm', '').replace('_', ' ')).join(', ')}</p>
          <p>Sending: {last.sampling.transmission_priority} priority</p>
          <h4>Why</h4>
          <ul>{last.sampling.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
        </Panel>
      </div>
    </>
  )
}

function Tile({ label, value, unit }) {
  return (
    <div className="tile">
      <span className="muted small">{label}</span>
      <strong>{value}{unit && <small> {unit}</small>}</strong>
    </div>
  )
}
