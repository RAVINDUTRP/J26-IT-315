import { Routes, Route, Link, useLocation } from 'react-router-dom'
import Overview from './pages/Overview.jsx'
import Sensing from './pages/Sensing.jsx'
import Network from './pages/Network.jsx'
import Prediction from './pages/Prediction.jsx'
import Decision from './pages/Decision.jsx'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: 'dashboard' },
  { to: '/sensing', label: 'Water Quality', icon: 'water' },
  { to: '/sensing?view=adaptive', label: 'Adaptive Sensing', icon: 'activity', badge: 'AI', badgeTone: 'cyan' },
  { to: '/network', label: 'LoRa Mesh Network', icon: 'cpu', badge: '8 Nodes' },
  { to: '/prediction', label: 'AI Prediction', icon: 'brain' },
  { to: '/decision', label: 'Disaster Decision Support', icon: 'shield', badge: '3 Alerts' },
  { to: '/decision?view=alerts', label: 'Alerts', icon: 'bell' },
  { to: '/?view=system', label: 'System Overview', icon: 'database' },
]

export default function App() {
  const location = useLocation()
  const current = `${location.pathname}${location.search}`

  return (
    <div className="shell">
      <aside className="rail">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true"><Icon name="shield" /></span>
          <span className="brand-copy">
            <span className="brand-name">AquaShield</span>
            <span className="brand-sub">ADAPTIVE INTEL</span>
          </span>
        </Link>
        <nav aria-label="Main navigation" className="nav-list">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              aria-current={current === item.to ? 'page' : undefined}
              className={`nav-item${current === item.to ? ' active' : ''}`}
            >
              <Icon name={item.icon} />
              <span className="nav-label">{item.label}</span>
              {item.badge && <span className={`nav-badge${item.badgeTone ? ` ${item.badgeTone}` : ''}`}>{item.badge}</span>}
            </Link>
          ))}
        </nav>
        <div className="rail-foot"><span className="status-dot" />Demo system online</div>
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

function Icon({ name }) {
  const shared = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
  const shapes = {
    dashboard: <><rect x="3.5" y="3.5" width="17" height="17" rx="2" /><path d="M3.5 9h17M9 9v11.5" /></>,
    water: <path d="M12 3.5c-2 3.1-6.2 7.4-6.2 11.2a6.2 6.2 0 0 0 12.4 0C18.2 10.9 14 6.6 12 3.5Z" />,
    activity: <path d="M2.5 12h4l3-8 5 16 3.2-8h3.8" />,
    cpu: <><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2.5v3M15 2.5v3M9 18v3.5m6-3.5v3.5M2.5 9h3M2.5 15h3M18 9h3.5m-3.5 6h3.5M9.5 9.5h5v5h-5z" /></>,
    brain: <><path d="M12 5.2a3.5 3.5 0 0 0-6.7 1.4A3.7 3.7 0 0 0 4.7 13a3.6 3.6 0 0 0 3 5.9 3.4 3.4 0 0 0 4.3 1.6V5.2Z" /><path d="M12 5.2a3.5 3.5 0 0 1 6.7 1.4A3.7 3.7 0 0 1 19.3 13a3.6 3.6 0 0 1-3 5.9 3.4 3.4 0 0 1-4.3 1.6M8 9.5c1.6 0 2.4 1 2.4 2.5M7.6 15.5c1.5 0 2.4-.8 2.8-2M16 9.5c-1.6 0-2.4 1-2.4 2.5m2.8 3.5c-1.5 0-2.4-.8-2.8-2" /></>,
    shield: <><path d="M12 3 19 6v5.3c0 4.7-2.9 7.8-7 9.7-4.1-1.9-7-5-7-9.7V6l7-3Z" /><path d="M12 8v4.5m0 3h.01" /></>,
    bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 12h4" /></>,
    database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" /></>,
  }
  return <svg className="nav-icon" {...shared}>{shapes[name]}</svg>
}
