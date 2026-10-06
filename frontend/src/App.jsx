import { Routes, Route, NavLink } from 'react-router-dom'
import Overview from './pages/Overview.jsx'
import Sensing from './pages/Sensing.jsx'
import Network from './pages/Network.jsx'
import Prediction from './pages/Prediction.jsx'
import Decision from './pages/Decision.jsx'

const STATIONS = [
  { to: '/sensing', n: 1, label: 'Sensing', sub: 'What the sensors measure, and how often' },
  { to: '/network', n: 2, label: 'Network', sub: 'Whether readings are getting through' },
  { to: '/prediction', n: 3, label: 'Risk forecast', sub: 'What is likely to happen, and why' },
  { to: '/decision', n: 4, label: 'Response', sub: 'What to do first' },
]

export default function App() {
  return (
    <div className="shell">
      <aside className="rail">
        <NavLink to="/" end className="brand">
          <span className="brand-name">AquaShiled</span>
          <span className="brand-sub">Kelani River water watch</span>
        </NavLink>
        <nav aria-label="Pipeline" className="line">
          {STATIONS.map((s) => (
            <NavLink key={s.to} to={s.to} className={({ isActive }) => `station${isActive ? ' active' : ''}`}>
              <span className="dot">{s.n}</span>
              <span>
                <strong>{s.label}</strong>
                <small>{s.sub}</small>
              </span>
            </NavLink>
          ))}
        </nav>
        <p className="rail-foot">Demo data. Not for operational use.</p>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/sensing" element={<Sensing />} />
          <Route path="/network" element={<Network />} />
          <Route path="/prediction" element={<Prediction />} />
          <Route path="/decision" element={<Decision />} />
        </Routes>
      </main>
    </div>
  )
}
