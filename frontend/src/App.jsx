import { lazy, Suspense } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { MotionConfig, motion } from 'framer-motion'

const Dashboard = lazy(() => import('./pages/dashboard.jsx'))
const SystemOverview = lazy(() => import('./pages/SystemOverview.jsx'))
const Sensing = lazy(() => import('./pages/Sensing.jsx'))
const Network = lazy(() => import('./pages/Network.jsx'))
const Prediction = lazy(() => import('./pages/Prediction.jsx'))
const Decision = lazy(() => import('./pages/Decision.jsx'))

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: 'dashboard' },
  { to: '/sensing', label: 'Water Quality', icon: 'water' },
  { to: '/sensing?view=adaptive', label: 'Adaptive Sensing', icon: 'activity', badge: 'AI', badgeTone: 'cyan' },
  { to: '/network', label: 'LoRa Mesh Network', icon: 'cpu', badge: '8 Nodes' },
  { to: '/prediction', label: 'AI Prediction', icon: 'brain' },
  { to: '/decision', label: 'Disaster Decision Support', icon: 'shield', badge: '3 Alerts' },
  { to: '/decision?view=alerts', label: 'Alerts', icon: 'bell' },
  { to: '/system', label: 'System Overview', icon: 'database' },
]

export default function App() {
  const location = useLocation()
  const current = `${location.pathname}${location.search}`

  return (
    <MotionConfig reducedMotion="user">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)]">
        <motion.aside
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          className="sticky top-0 flex h-screen min-h-[620px] flex-col gap-8 overflow-y-auto border-r border-[#202a3c] bg-[#080e1d] px-5 py-7 text-[#f5f7fb] max-lg:static max-lg:h-auto max-lg:min-h-0 max-lg:gap-5"
        >
        <Link to="/" className="flex items-center gap-3.5 px-0.5">
          <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-[13px] bg-gradient-to-br from-[#3979ff] to-[#04bfd1] text-white">
            <Icon name="shield" className="size-8" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-[23px] font-bold leading-[1.15] tracking-[-0.5px] text-[#f5f7fb]">AquaShield</span>
            <span className="mt-1.5 whitespace-nowrap font-mono text-[10px] font-bold leading-tight tracking-[2px] text-[#00c8dc]">ADAPTIVE INTEL</span>
          </span>
        </Link>
        <nav aria-label="Main navigation" className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-[7px] lg:flex lg:flex-col">
          {NAV_ITEMS.map((item) => (
            <motion.div
              key={item.to}
              layout
              whileHover={{ x: 2 }}
              whileTap={{ scale: 0.99 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="relative"
            >
              {current === item.to && (
                <motion.span
                  layoutId="sidebar-active-item"
                  transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                  className="absolute inset-0 rounded-[11px] border border-[#3880ff] bg-[#111e39] shadow-[inset_0_0_0_1px_rgb(56_128_255_/_12%)]"
                />
              )}
              <Link
                to={item.to}
                aria-current={current === item.to ? 'page' : undefined}
                className={`relative z-10 flex min-h-[52px] w-full items-center gap-[13px] rounded-[11px] border border-transparent px-3 py-2 text-[15px] font-medium leading-[1.35] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 ${current === item.to ? 'text-[#f7f9ff]' : 'text-[#98a5bb] hover:text-[#e8eef8]'}`}
              >
                <Icon name={item.icon} className={`size-5 shrink-0 ${current === item.to ? 'text-[#00c9dc]' : ''}`} />
                <span className="min-w-0">{item.label}</span>
                {item.badge && (
                  <span className={`ml-auto shrink-0 whitespace-nowrap rounded-md px-2 py-1 font-mono text-[10px] font-semibold leading-tight ${item.badgeTone === 'cyan' ? 'bg-[#0b2634] text-[#00d3df]' : 'bg-[#1c273c] text-[#a8b4c8]'}`}>
                    {item.badge}
                  </span>
                )}
              </Link>
            </motion.div>
          ))}
        </nav>
        <div className="mt-auto rounded-xl border border-[#202c41] bg-[#0d1628] px-3.5 py-3 max-lg:mt-0">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgb(11_200_149_/_12%)]" />
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-[#dbe5f2]">Kelani Basin monitoring</span>
              <span className="mt-0.5 block text-[11px] text-[#8291a8]">AquaShield research workspace</span>
            </span>
          </div>
        </div>
        </motion.aside>
        <main className="min-w-0 max-w-[1180px] px-10 pt-9 pb-[60px] max-[900px]:max-w-none max-[900px]:px-[18px] max-[900px]:pt-6 max-[900px]:pb-12">
          <Suspense fallback={<div className="grid min-h-64 place-items-center text-sm text-slate-400" role="status">Loading page…</div>}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/system" element={<SystemOverview />} />
              <Route path="/sensing" element={<Sensing />} />
              <Route path="/network" element={<Network />} />
              <Route path="/prediction" element={<Prediction />} />
              <Route path="/decision" element={<Decision />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </MotionConfig>
  )
}

function Icon({ name, className = '' }) {
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
  return <svg className={className} {...shared}>{shapes[name]}</svg>
}
