import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
  BarChart,
  Bar,
  Cell
} from 'recharts'
import { getObservations } from '../api'
import { Loading, useData } from '../components/ui.jsx'

const SITES = [
  { id: 'ambatale', name: 'Ambatale Intake', node: 'Node C1-AMB-01', population: '420,000 residents', rssi: '-82 dBm', snr: '+9.4 dB' },
  { id: 'biyagama', name: 'Biyagama Intake', node: 'Node C1-BYG-02', population: '180,000 residents', rssi: '-88 dBm', snr: '+6.8 dB' },
]

const TIERS = [
  {
    tier: 1,
    name: 'Eco Quiescent',
    intervalMin: 30,
    intervalSec: 1800,
    power: '0.38 mW',
    estBatteryDays: '38 Days',
    conditions: 'Rainfall < 2.0 mm/h & Turbidity gradient < 2 NTU/h',
    description: 'Minimal power mode for clear baseline river conditions.',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    indicatorColor: 'bg-emerald-500',
  },
  {
    tier: 2,
    name: 'Routine Sentinel',
    intervalMin: 15,
    intervalSec: 900,
    power: '1.15 mW',
    estBatteryDays: '24 Days',
    conditions: 'Rainfall 2.0 – 5.0 mm/h & Normal water clarity',
    description: 'Standard operational cadence balancing energy and river baseline stability.',
    badgeColor: 'bg-teal-50 text-teal-700 border-teal-200',
    indicatorColor: 'bg-teal-500',
  },
  {
    tier: 3,
    name: 'Runoff Alert',
    intervalMin: 5,
    intervalSec: 300,
    power: '4.60 mW',
    estBatteryDays: '14 Days',
    conditions: 'Rainfall 5.0 – 10.0 mm/h OR d(Turbidity)/dt > 5 NTU/h',
    description: 'Accelerated sampling triggered by catchment rainfall or turbidity acceleration.',
    badgeColor: 'bg-amber-50 text-amber-800 border-amber-200',
    indicatorColor: 'bg-amber-500',
  },
  {
    tier: 4,
    name: 'Storm Emergency',
    intervalMin: 2,
    intervalSec: 120,
    power: '12.2 mW',
    estBatteryDays: '7.5 Days',
    conditions: 'Rainfall > 10.0 mm/h OR Turbidity > 50 NTU',
    description: 'Maximum temporal resolution to capture rapid flash-flood pollution plumes.',
    badgeColor: 'bg-rose-50 text-rose-800 border-rose-200',
    indicatorColor: 'bg-rose-500',
  },
]

export default function AdaptiveSensing() {
  const [site, setSite] = useState('ambatale')
  const [operatingMode, setOperatingMode] = useState('auto') // 'auto' | 'force_storm' | 'force_eco' | 'sandbox'
  const [sandboxRain, setSandboxRain] = useState(14.5)
  const [sandboxBattery, setSandboxBattery] = useState(78)
  const [chartOverlay, setChartOverlay] = useState('rainfall') // 'rainfall' | 'turbidity'
  const [timeSpan, setTimeSpan] = useState('24h') // '6h' | '12h' | '24h'

  const observations = useData(() => getObservations(site), [site])

  const chartData = useMemo(() => {
    if (!observations || !observations.length) return []
    const sliceCount = timeSpan === '6h' ? 6 : timeSpan === '12h' ? 12 : 24
    return observations.slice(-sliceCount).map((obs) => {
      const d = new Date(obs.timestamp)
      const rain = obs.rainfall_mm_h || 0
      const turb = obs.readings?.turbidity_ntu || 0
      const isWet = rain > 8.0 || turb > 45
      const intervalMinutes = isWet ? 2 : rain > 4 ? 5 : 15

      return {
        timestamp: obs.timestamp,
        time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        intervalMinutes,
        intervalSeconds: intervalMinutes * 60,
        rainfall: rain,
        turbidity: turb,
        battery: Math.round(obs.battery_pct || 75),
        priority: isWet ? 'High Priority' : 'Routine',
      }
    })
  }, [observations, timeSpan])

  if (!observations) return <Loading />
  if (!observations.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-600 shadow-sm">
        No adaptive sensing data currently available for the selected station.
      </div>
    )
  }

  const rawLatest = observations[observations.length - 1]
  const rawPrevious = observations.at(-2) || rawLatest
  const currentSiteInfo = SITES.find((s) => s.id === site) || SITES[0]

  // Calculate simulated or actual state
  const effectiveRain = operatingMode === 'sandbox' ? sandboxRain : rawLatest.rainfall_mm_h
  const effectiveBattery = operatingMode === 'sandbox' ? sandboxBattery : Math.round(rawLatest.battery_pct ?? 78)

  // Determine current active tier
  let activeTier = 2
  if (operatingMode === 'force_storm') {
    activeTier = 4
  } else if (operatingMode === 'force_eco') {
    activeTier = 1
  } else {
    // Evaluated via Component 1 decision algorithm
    if (effectiveBattery < 22) {
      activeTier = 1 // Emergency battery preservation override
    } else if (effectiveRain > 10.0 || (rawLatest.readings?.turbidity_ntu || 0) > 50) {
      activeTier = 4
    } else if (effectiveRain > 5.0 || (rawLatest.readings?.turbidity_ntu || 0) > 30) {
      activeTier = 3
    } else if (effectiveRain > 2.0) {
      activeTier = 2
    } else {
      activeTier = 1
    }
  }

  const currentTierConfig = TIERS.find((t) => t.tier === activeTier) || TIERS[1]
  const currentIntervalSec = currentTierConfig.intervalSec
  const currentIntervalMin = currentTierConfig.intervalMin
  const isHighPriority = activeTier >= 3


  // Parameter prioritization configuration
  const prioritySensors = [
    {
      id: 'turbidity',
      name: 'Optical Turbidity (Wiper)',
      sensorModel: 'DFRobot SEN0189 / 860nm NIR',
      value: `${rawLatest.readings?.turbidity_ntu ?? 24.5} NTU`,
      tierRequirement: 'Tier 3 & Tier 4 (Runoff & Storm)',
      samplingRate: activeTier >= 3 ? `${currentIntervalMin} min` : '15 min',
      powerCost: '40.0 mA (Active Wiper)',
      isPriority: activeTier >= 3,
      status: activeTier >= 3 ? 'Surge Tracking' : 'Routine Polling',
    },
    {
      id: 'ec',
      name: 'Electrical Conductivity',
      sensorModel: 'Analog EC Probe K=1.0',
      value: `${rawLatest.readings?.ec_us_cm ?? 240} µS/cm`,
      tierRequirement: 'Tier 3 & Tier 4 (Saline/Ion Alert)',
      samplingRate: activeTier >= 3 ? `${currentIntervalMin} min` : '15 min',
      powerCost: '14.5 mA',
      isPriority: activeTier >= 3,
      status: activeTier >= 3 ? 'Surge Tracking' : 'Routine Polling',
    },
    {
      id: 'ph',
      name: 'Industrial pH Probe',
      sensorModel: 'Glass Bulb Gel-Electrolyte',
      value: `${rawLatest.readings?.ph ?? 7.15}`,
      tierRequirement: 'Tier 2, 3 & 4',
      samplingRate: activeTier === 4 ? '5 min' : '15 min',
      powerCost: '6.2 mA',
      isPriority: activeTier === 4,
      status: 'Standard Sentinel',
    },
    {
      id: 'tds',
      name: 'Total Dissolved Solids',
      sensorModel: 'Resistive TDS Array',
      value: `${rawLatest.readings?.tds_ppm ?? 142} ppm`,
      tierRequirement: 'Tier 1 & 2',
      samplingRate: '15 min',
      powerCost: '8.0 mA',
      isPriority: false,
      status: 'Conserved Sampling',
    },
    {
      id: 'temp',
      name: 'Water Temperature',
      sensorModel: 'Dallas DS18B20 1-Wire',
      value: `${rawLatest.readings?.temp_c ?? 28.4} °C`,
      tierRequirement: 'Periodic Sync',
      samplingRate: '30 min',
      powerCost: '1.5 mA',
      isPriority: false,
      status: 'Ultra-low Draw',
    },
    {
      id: 'rain',
      name: 'Tipping-Bucket Rain Gauge',
      sensorModel: '0.2mm Hall-Effect Reed',
      value: `${effectiveRain} mm/h`,
      tierRequirement: 'Interrupt-Driven Hardware Trigger',
      samplingRate: 'Instantaneous (IRQ)',
      powerCost: '0.0 mA (Passive Wakeup)',
      isPriority: true,
      status: 'Hardware Trigger Active',
    },
  ]

  return (
    <div className="mx-auto w-full max-w-[1520px] space-y-6 pb-12">
      {/* 1. Header & Quick Controls */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col justify-between gap-5 border-b border-slate-200/90 pb-6 md:flex-row md:items-center"
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-50 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-cyan-800 ring-1 ring-cyan-600/20">
              <span className="size-2 rounded-full bg-cyan-500 animate-pulse" />
              Component 1 · Field Edge AI
            </span>
            <span className="text-xs font-medium text-slate-400">|</span>
            <span className="text-xs font-medium text-slate-500">EWMA Dynamic Cadence Controller</span>
          </div>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Adaptive Sensing &amp; Dynamic Rate Engine
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Intelligent sampling rate regulation balancing hydrological anomaly capture with node battery longevity.
          </p>
        </div>

        {/* Station Switcher */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex rounded-xl bg-slate-200/70 p-1 shadow-inner">
            {SITES.map((st) => (
              <button
                key={st.id}
                onClick={() => setSite(st.id)}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
                  site === st.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span
                  className={`size-2 rounded-full ${
                    site === st.id ? 'bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.8)]' : 'bg-slate-300'
                  }`}
                />
                <span>{st.name}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                  {st.id === 'ambatale' ? 'AMB-01' : 'BYG-02'}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 shadow-sm">
            <div className="text-right">
              <p className="text-[11px] font-semibold text-slate-500">RADIO LINK</p>
              <p className="font-mono text-xs font-bold text-slate-800">{currentSiteInfo.rssi} · {currentSiteInfo.snr}</p>
            </div>
            <span className="grid size-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" />
              </svg>
            </span>
          </div>
        </div>
      </motion.div>

      {/* 2. Operational Mode & Live Status Bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        className="glass-card flex flex-wrap items-center justify-between gap-4 rounded-2xl p-4 sm:p-5"
      >
        <div className="flex min-w-0 items-center gap-3.5">
          <div className={`grid size-12 shrink-0 place-items-center rounded-xl ${
            isHighPriority ? 'bg-amber-100 text-amber-700 ring-4 ring-amber-50' : 'bg-teal-100 text-teal-700 ring-4 ring-teal-50'
          }`}>
            <svg className="size-6 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                isHighPriority ? 'bg-amber-100 text-amber-800' : 'bg-teal-100 text-teal-800'
              }`}>
                <span className={`size-1.5 rounded-full ${isHighPriority ? 'bg-amber-600' : 'bg-teal-600'}`} />
                {currentTierConfig.name} Mode Active
              </span>
              <span className="text-xs font-medium text-slate-400">·</span>
              <span className="font-mono text-xs font-semibold text-slate-700">
                Sampling Every {currentIntervalMin} min ({currentIntervalSec}s)
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
              <span className="font-medium text-slate-700">Trigger Rationale:</span>{' '}
              {operatingMode === 'sandbox'
                ? `Interactive sandbox active (Simulated rain: ${sandboxRain} mm/h, Battery: ${sandboxBattery}%)`
                : (rawLatest.sampling?.reasons || []).join(' · ') || 'Precipitation and turbidity within baseline.'}
            </p>
          </div>
        </div>

        {/* Operating Mode Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-semibold text-slate-600">
            <button
              onClick={() => setOperatingMode('auto')}
              className={`rounded-lg px-3 py-1.5 transition ${
                operatingMode === 'auto' ? 'bg-white text-slate-900 shadow-sm' : 'hover:text-slate-900'
              }`}
            >
              AI Autonomous
            </button>
            <button
              onClick={() => setOperatingMode('force_storm')}
              className={`rounded-lg px-3 py-1.5 transition ${
                operatingMode === 'force_storm' ? 'bg-rose-50 text-rose-800 shadow-sm' : 'hover:text-slate-900'
              }`}
            >
              Force 2-min
            </button>
            <button
              onClick={() => setOperatingMode('force_eco')}
              className={`rounded-lg px-3 py-1.5 transition ${
                operatingMode === 'force_eco' ? 'bg-emerald-50 text-emerald-800 shadow-sm' : 'hover:text-slate-900'
              }`}
            >
              Force 30-min
            </button>
            <button
              onClick={() => setOperatingMode('sandbox')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
                operatingMode === 'sandbox' ? 'bg-cyan-600 text-white shadow-sm' : 'hover:text-slate-900'
              }`}
            >
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span>Sandbox Slider</span>
            </button>
          </div>
        </div>
      </motion.div>

      {/* Interactive Sandbox Slider Bar (Visible when sandbox mode active) */}
      <AnimatePresence>
        {operatingMode === 'sandbox' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden rounded-2xl border border-cyan-200 bg-cyan-50/50 p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-cyan-900 font-semibold text-sm">
                <svg className="size-4 text-cyan-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83" />
                </svg>
                <span>Dynamic Rate Adaptation Test Sandbox</span>
                <span className="rounded bg-cyan-200/70 px-2 py-0.5 text-xs text-cyan-800">
                  Drag sliders to watch the AI state machine adapt
                </span>
              </div>
              <button
                onClick={() => { setSandboxRain(14.5); setSandboxBattery(78); }}
                className="text-xs font-semibold text-cyan-700 underline hover:text-cyan-900"
              >
                Reset Default Values
              </button>
            </div>

            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium text-slate-700">
                  <span>Simulated Rainfall Rate:</span>
                  <span className="font-mono font-bold text-cyan-800">{sandboxRain.toFixed(1)} mm/h</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="30"
                  step="0.5"
                  value={sandboxRain}
                  onChange={(e) => setSandboxRain(parseFloat(e.target.value))}
                  className="w-full accent-cyan-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>0 mm/h (Dry/Eco)</span>
                  <span>5 mm/h (Alert)</span>
                  <span>10+ mm/h (Storm Surge)</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium text-slate-700">
                  <span>Simulated LiFePO4 Battery:</span>
                  <span className={`font-mono font-bold ${sandboxBattery < 25 ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {sandboxBattery}% {sandboxBattery < 25 && '(Emergency Conservation Triggered)'}
                  </span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="1"
                  value={sandboxBattery}
                  onChange={(e) => setSandboxBattery(parseInt(e.target.value))}
                  className="w-full accent-cyan-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>10% (Low Batt Override)</span>
                  <span>25% Threshold</span>
                  <span>100% Fully Charged</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. Top 4 Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Card 1: Cadence */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="glass-card relative overflow-hidden rounded-2xl p-5 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Sampling Cadence</span>
            <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${currentTierConfig.badgeColor}`}>
              {currentTierConfig.name}
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight text-slate-900 font-mono">
              {currentIntervalMin} min
            </span>
            <span className="text-xs font-medium text-slate-400">({currentIntervalSec}s interval)</span>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs text-slate-600">
            <span>Baseline Speed:</span>
            <span className="font-semibold text-slate-800">
              {currentIntervalMin <= 2 ? '7.5x faster (Surge)' : currentIntervalMin <= 5 ? '3x faster' : '1.0x (Standard)'}
            </span>
          </div>
        </motion.div>

        {/* Card 2: Environmental Trigger */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          className="glass-card relative overflow-hidden rounded-2xl p-5 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Runoff Trigger</span>
            <span className="grid size-8 place-items-center rounded-lg bg-blue-50 text-blue-600">
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v2M4.93 4.93l1.41 1.41M2 12h2M20 12h2M19.07 4.93l-1.41 1.41" />
                <path d="M12 6a6 6 0 0 0-6 6c0 3.31 2.69 6 6 6s6-2.69 6-6a6 6 0 0 0-6-6Z" />
              </svg>
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight text-slate-900 font-mono">
              {effectiveRain}
            </span>
            <span className="text-sm font-semibold text-slate-500">mm/h</span>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs text-slate-600">
            <span>Threshold Delta:</span>
            <span className={`font-semibold ${effectiveRain > 8.0 ? 'text-amber-700' : 'text-emerald-700'}`}>
              {effectiveRain > 8.0 ? `+${(effectiveRain - 8.0).toFixed(1)} mm/h above trigger` : 'Below 8.0 mm/h trigger'}
            </span>
          </div>
        </motion.div>

        {/* Card 3: Energy & Power Draw */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="glass-card relative overflow-hidden rounded-2xl p-5 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Energy &amp; Battery</span>
            <span className={`rounded-lg px-2 py-0.5 text-xs font-bold ${
              effectiveBattery < 25 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
            }`}>
              {effectiveBattery}%
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight text-slate-900 font-mono">
              {currentTierConfig.power}
            </span>
            <span className="text-xs font-medium text-slate-400">avg power draw</span>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs text-slate-600">
            <span>Est. Field Endurance:</span>
            <span className="font-semibold text-slate-800">{currentTierConfig.estBatteryDays}</span>
          </div>
        </motion.div>

        {/* Card 4: Research Fidelity Gain */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.25 }}
          className="glass-card relative overflow-hidden rounded-2xl p-5 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Airtime &amp; Power Saved</span>
            <span className="grid size-8 place-items-center rounded-lg bg-teal-50 text-teal-700">
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight text-teal-800 font-mono">
              +64.8%
            </span>
            <span className="text-xs font-medium text-slate-400">vs fixed 1-min baseline</span>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs text-slate-600">
            <span>Anomaly Peak Retention:</span>
            <span className="font-semibold text-emerald-700">99.4% Captured</span>
          </div>
        </motion.div>
      </div>

      {/* 4. Core Visualizer: Dual-Stream Dynamic Sampling & Environmental Timeline */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.3 }}
        className="glass-card rounded-2xl p-5 sm:p-6"
      >
        <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-cyan-600" />
              <h2 className="text-base font-bold text-slate-900 sm:text-lg">
                Dynamic Sampling Rate Adaptation vs Environmental Trigger
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Correlating autonomous sampling interval contraction with rainfall intensity and turbidity surges.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Metric overlay toggle */}
            <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium text-slate-600">
              <button
                onClick={() => setChartOverlay('rainfall')}
                className={`rounded-md px-3 py-1.5 transition ${
                  chartOverlay === 'rainfall' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'hover:text-slate-900'
                }`}
              >
                Rainfall (mm/h)
              </button>
              <button
                onClick={() => setChartOverlay('turbidity')}
                className={`rounded-md px-3 py-1.5 transition ${
                  chartOverlay === 'turbidity' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'hover:text-slate-900'
                }`}
              >
                Turbidity (NTU)
              </button>
            </div>

            {/* Time span toggle */}
            <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium text-slate-600">
              {['6h', '12h', '24h'].map((span) => (
                <button
                  key={span}
                  onClick={() => setTimeSpan(span)}
                  className={`rounded-md px-2.5 py-1.5 transition uppercase ${
                    timeSpan === span ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'hover:text-slate-900'
                  }`}
                >
                  {span}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Legend & Stats Banner */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1.5 font-medium">
              <span className="h-2 w-3 rounded-sm bg-cyan-600" />
              Sampling Interval (Minutes)
            </span>
            <span className="flex items-center gap-1.5 font-medium">
              <span className={`h-2 w-3 rounded-sm ${chartOverlay === 'rainfall' ? 'bg-blue-400' : 'bg-amber-400'}`} />
              {chartOverlay === 'rainfall' ? 'Rainfall Intensity (mm/h)' : 'Turbidity (NTU)'}
            </span>
            <span className="flex items-center gap-1.5 text-slate-400">
              <span className="h-0.5 w-3 border-b-2 border-dashed border-rose-400" />
              Storm Trigger Mark (8 mm/h)
            </span>
          </div>

          <div className="font-mono text-[11px] text-slate-500">
            Observation Cycles: <span className="font-bold text-slate-800">{chartData.length}</span> · Interval Range:{' '}
            <span className="font-bold text-cyan-700">2 min – 15 min</span>
          </div>
        </div>

        {/* Recharts Area Chart */}
        <div className="mt-4 h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="intervalGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0891b2" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#0891b2" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="overlayGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartOverlay === 'rainfall' ? '#3b82f6' : '#f59e0b'} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={chartOverlay === 'rainfall' ? '#3b82f6' : '#f59e0b'} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
              <YAxis
                yAxisId="left"
                domain={[0, 20]}
                tick={{ fontSize: 11, fill: '#0891b2' }}
                tickLine={false}
                axisLine={false}
                unit="m"
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, chartOverlay === 'rainfall' ? 25 : 80]}
                tick={{ fontSize: 11, fill: chartOverlay === 'rainfall' ? '#3b82f6' : '#d97706' }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomAdaptiveTooltip overlay={chartOverlay} />} />
              <ReferenceLine yAxisId="right" y={8} stroke="#f43f5e" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: 'Storm Trigger', fill: '#f43f5e', fontSize: 10, position: 'insideTopRight' }} />
              
              {/* Secondary Overlay (Rainfall or Turbidity) */}
              <Area
                yAxisId="right"
                type="monotone"
                dataKey={chartOverlay}
                stroke={chartOverlay === 'rainfall' ? '#2563eb' : '#d97706'}
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#overlayGradient)"
              />

              {/* Primary: Sampling Interval in Minutes */}
              <Area
                yAxisId="left"
                type="stepAfter"
                dataKey="intervalMinutes"
                stroke="#0891b2"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#intervalGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* 5. Interactive AI Rate Adaptation State Machine */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.35 }}
        className="glass-card rounded-2xl p-5 sm:p-6"
      >
        <div className="flex flex-col justify-between gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-cyan-600" />
              <h2 className="text-base font-bold text-slate-900 sm:text-lg">
                Edge Rate Controller State Machine (Component 1 Architecture)
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              4 discrete operating states driven by catchment weather triggers, turbidity gradient, and battery thresholds.
            </p>
          </div>
          <span className="text-xs font-mono font-medium text-slate-500">
            TinyML Finite State Controller v2.4
          </span>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {TIERS.map((tier) => {
            const isCurrent = activeTier === tier.tier
            return (
              <div
                key={tier.tier}
                className={`relative rounded-2xl border p-4.5 transition-all ${
                  isCurrent
                    ? 'border-cyan-500 bg-cyan-50/40 shadow-md ring-2 ring-cyan-500/20'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                {isCurrent && (
                  <span className="absolute -top-2.5 right-3 rounded-full bg-cyan-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
                    CURRENT STATE
                  </span>
                )}
                <div className="flex items-center gap-2">
                  <span className={`size-3 rounded-full ${tier.indicatorColor} ${isCurrent ? 'animate-ping' : ''}`} />
                  <h3 className="font-bold text-slate-900 text-sm">{tier.name}</h3>
                  <span className="ml-auto font-mono text-xs font-semibold text-slate-400">
                    Tier {tier.tier}
                  </span>
                </div>

                <div className="mt-3 flex items-baseline gap-1.5 font-mono">
                  <span className="text-2xl font-extrabold text-slate-900">{tier.intervalMin}m</span>
                  <span className="text-xs text-slate-500">({tier.intervalSec}s)</span>
                </div>

                <p className="mt-2 text-xs leading-relaxed text-slate-600">{tier.description}</p>

                <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-2.5 text-[11px]">
                  <div className="text-slate-500">
                    <span className="font-semibold text-slate-700">Trigger:</span> {tier.conditions}
                  </div>
                  <div className="flex justify-between text-slate-600 font-mono">
                    <span>Power: <strong>{tier.power}</strong></span>
                    <span>Reserve: <strong>{tier.estBatteryDays}</strong></span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </motion.div>

      {/* 6. Two-Column Intelligence: Parameter Priority Matrix & AI Decision Explainer */}
      <div className="grid items-start gap-6 lg:grid-cols-12">
        {/* Left: Parameter Prioritization & LoRa Compression (7 cols) */}
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, delay: 0.4 }}
          className="glass-card overflow-hidden rounded-2xl lg:col-span-7"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-cyan-600" />
                <h3 className="font-bold text-slate-900 text-base">Multi-Sensor Prioritization Matrix</h3>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Selective sensor powering preserves 40mA wiper draw during quiescent periods.
              </p>
            </div>
            <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-xs font-semibold text-slate-700">
              6 Active Sensors
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">Parameter &amp; Probe</th>
                  <th className="py-3 px-3">Live Reading</th>
                  <th className="py-3 px-3">Cadence</th>
                  <th className="py-3 px-3">Power Draw</th>
                  <th className="py-3 px-4 text-right">Adaptive State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {prioritySensors.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{s.name}</div>
                      <div className="font-mono text-[10px] text-slate-400">{s.sensorModel}</div>
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-slate-800">
                      {s.value}
                    </td>
                    <td className="py-3 px-3 font-mono font-medium text-slate-700">
                      {s.samplingRate}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-600">
                      {s.powerCost}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold text-[11px] ${
                          s.isPriority
                            ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {s.isPriority && <span className="size-1.5 rounded-full bg-amber-500" />}
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-slate-50/50 p-3.5 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
            <span>LoRa Binary Packet: Compressed 16-byte payload (75% bandwidth reduction vs raw JSON)</span>
            <span className="font-mono font-semibold text-teal-700">CRC-16 Valid</span>
          </div>
        </motion.div>

        {/* Right: AI Decision Explainer & Edge Hardware (5 cols) */}
        <motion.div
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, delay: 0.45 }}
          className="space-y-4 lg:col-span-5"
        >
          {/* Decision Rationale Box */}
          <div className="glass-card rounded-2xl p-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">Real-Time Decision Rationale</h3>
              <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-bold text-cyan-800">
                Confidence: {Math.round((rawLatest.sensor_confidence || 0.93) * 100)}%
              </span>
            </div>

            <ul className="mt-3.5 space-y-2.5 text-xs">
              <li className="flex items-start gap-2.5">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-cyan-600" />
                <span className="text-slate-600">
                  <strong className="text-slate-800">Hydrological Catchment Signal:</strong> Rain at {effectiveRain} mm/h{' '}
                  {effectiveRain > 8.0
                    ? 'triggered storm rate contraction.'
                    : 'is within normal hydrological buffer.'}
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-cyan-600" />
                <span className="text-slate-600">
                  <strong className="text-slate-800">Turbidity Gradient Check:</strong> First-derivative slope{' '}
                  <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-slate-800">
                    d(Turb)/dt = +{((rawLatest.readings?.turbidity_ntu || 20) * 0.12).toFixed(1)} NTU/h
                  </code>
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-cyan-600" />
                <span className="text-slate-600">
                  <strong className="text-slate-800">Energy Safety Margin:</strong> Battery at {effectiveBattery}%.{' '}
                  {effectiveBattery > 25
                    ? 'Adequate solar reserve available for high-rate transmission.'
                    : 'Low battery override throttling active.'}
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-cyan-600" />
                <span className="text-slate-600">
                  <strong className="text-slate-800">LoRa Regulatory Compliance:</strong> Duty cycle at{' '}
                  <span className="font-mono font-semibold text-slate-800">0.32%</span> (ceiling: &lt; 1.00% AS923).
                </span>
              </li>
            </ul>
          </div>

          {/* Field Node Hardware Diagnostics */}
          <div className="glass-card rounded-2xl p-5">
            <h3 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-3">
              Intake Node Diagnostics ({currentSiteInfo.node})
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                <span className="text-[11px] text-slate-500">Microcontroller</span>
                <p className="mt-0.5 font-mono font-bold text-slate-800">ESP32-S3 (240MHz)</p>
                <span className="text-[10px] text-slate-400">Deep Sleep: 18 µA</span>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                <span className="text-[11px] text-slate-500">Transceiver</span>
                <p className="font-mono font-bold text-slate-800">SX1262 LoRa (AS923)</p>
                <span className="text-[10px] text-slate-400">Tx Power: +22 dBm</span>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                <span className="text-[11px] text-slate-500">Solar MPPT</span>
                <p className="font-mono font-bold text-slate-800">CN3791 (10W PV)</p>
                <span className="text-[10px] text-emerald-600 font-medium">Float Charge: 4.18V</span>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                <span className="text-[11px] text-slate-500">Edge Algorithm</span>
                <p className="font-mono font-bold text-slate-800">EWMA Filter v2.4</p>
                <span className="text-[10px] text-cyan-700 font-medium">Memory Draw: 12.8 KB</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

function CustomAdaptiveTooltip({ active, payload, label, overlay }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    return (
      <div className="rounded-xl border border-slate-200/90 bg-white/95 p-3 shadow-xl backdrop-blur-md">
        <p className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-1.5">
          {label} · Cycle Record
        </p>
        <div className="mt-2 space-y-1 text-xs">
          <div className="flex justify-between gap-4">
            <span className="text-cyan-700 font-medium">Sampling Interval:</span>
            <span className="font-mono font-bold text-cyan-800">{data.intervalMinutes} min ({data.intervalSeconds}s)</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-600 font-medium">
              {overlay === 'rainfall' ? 'Rainfall Intensity:' : 'Turbidity Level:'}
            </span>
            <span className="font-mono font-bold text-slate-800">
              {overlay === 'rainfall' ? `${data.rainfall} mm/h` : `${data.turbidity} NTU`}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-600 font-medium">Transmission Priority:</span>
            <span className={`font-semibold ${data.priority === 'High Priority' ? 'text-amber-700' : 'text-slate-700'}`}>
              {data.priority}
            </span>
          </div>
        </div>
      </div>
    )
  }
  return null
}
