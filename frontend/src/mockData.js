// Built-in demo data (mirrors backend/app/mock_data.py). Replace by real component output later.
export const SITES = {
  ambatale: { id: 'ambatale', name: 'Ambatale intake', population: 420000 },
  biyagama: { id: 'biyagama', name: 'Biyagama', population: 180000 },
  hanwella: { id: 'hanwella', name: 'Hanwella', population: 60000 },
}
const BASE = { ambatale: 1.0, biyagama: 0.6, hanwella: 0.3 }

export function observations(siteId, n = 24) {
  const k = BASE[siteId]
  const now = Date.now()
  return Array.from({ length: n }, (_, i) => {
    const rain = Math.max(0, 2 + k * 18 * Math.exp(-((i - 16) ** 2) / 30))
    const wet = rain > 8
    return {
      site_id: siteId,
      timestamp: new Date(now - (n - i) * 15 * 60000).toISOString(),
      readings: {
        ph: +(7.1 - 0.015 * rain).toFixed(2),
        turbidity_ntu: +(18 + 9 * rain * k).toFixed(1),
        ec_us_cm: Math.round(210 + 6 * rain * k),
        tds_ppm: Math.round(130 + 4 * rain * k),
        temp_c: 28.4,
      },
      rainfall_mm_h: +rain.toFixed(1),
      battery_pct: +(82 - i * 0.2).toFixed(1),
      sensor_confidence: 0.93,
      sampling: {
        priority_parameters: ['turbidity_ntu', 'ec_us_cm'],
        interval_s: wet ? 120 : 900,
        transmission_priority: wet ? 'high' : 'normal',
        reasons: [`Rainfall ${rain.toFixed(1)} mm/h`, wet ? 'Turbidity rising' : 'Conditions stable'],
      },
    }
  })
}

export function network() {
  return {
    nodes: [
      { id: 'S1', role: 'sensor', health: 0.91, battery: 78, rssi: -82, snr: 7.5, x: 60, y: 90 },
      { id: 'S2', role: 'sensor', health: 0.88, battery: 71, rssi: -88, snr: 6.0, x: 60, y: 250 },
      { id: 'R1', role: 'relay', health: 0.84, battery: 69, rssi: -91, snr: 5.1, x: 190, y: 40 },
      { id: 'R2', role: 'relay', health: 0.93, battery: 88, rssi: -79, snr: 8.4, x: 190, y: 170 },
      { id: 'R3', role: 'relay', health: 0.86, battery: 74, rssi: -90, snr: 5.5, x: 190, y: 295 },
      { id: 'R4', role: 'relay', health: 0.38, battery: 19, rssi: -108, snr: -2.0, x: 340, y: 110, predicted_failure: 0.82 },
      { id: 'R5', role: 'relay', health: 0.9, battery: 83, rssi: -81, snr: 7.9, x: 340, y: 250 },
      { id: 'GW', role: 'gateway', health: 0.97, battery: 100, rssi: -70, snr: 10.0, x: 480, y: 170 },
    ],
    links: [['S1','R1'],['S1','R2'],['S2','R2'],['S2','R3'],['R1','R4'],['R2','R4'],['R2','R5'],['R3','R5'],['R4','GW'],['R5','GW']],
    active_path: ['S1', 'R2', 'R5', 'GW'],
    previous_path: ['S1', 'R1', 'R4', 'GW'],
    pdr_percent: 97.4, latency_ms: 840, recovery_s: 2.1,
  }
}

export function risk() {
  const spec = { ambatale: [0.84, 'critical', 0.81, true], biyagama: [0.55, 'moderate', 0.74, false], hanwella: [0.18, 'low', 0.88, false] }
  return Object.entries(spec).map(([id, [score, cat, conf, anom]]) => ({
    site_id: id, horizon_h: 6, risk_score: score, risk_category: cat, confidence: conf,
    explanation: [
      { feature: 'Accumulated rainfall (6h)', contribution: +(0.31 * score).toFixed(3) },
      { feature: 'Rainfall increase rate', contribution: +(0.22 * score).toFixed(3) },
      { feature: 'Turbidity change rate', contribution: +(0.17 * score).toFixed(3) },
      { feature: 'Historical contamination trend', contribution: +(0.09 * score).toFixed(3) },
      { feature: 'pH (recent change)', contribution: -0.04 },
    ],
    anomaly: { flag: anom, kind: anom ? 'pollution_pattern' : 'none', score: anom ? 0.77 : 0.08 },
  }))
}

export function recommendations() {
  return [
    { site_id: 'ambatale', rank: 1, priority_score: 0.95, population_exposed: 420000, communication_status: 'degraded',
      actions: [
        { action: 'Temporarily halt water intake', urgency: 'now', rationale: 'Critical risk at the main Colombo intake within 6 hours.' },
        { action: 'Issue public-health alert', urgency: 'within_1h', rationale: 'Largest exposed population in the network.' },
        { action: 'Dispatch inspection team', urgency: 'within_1h', rationale: 'Anomaly suggests a pollution pattern, not a sensor fault.' },
      ],
      factors: [{ name: 'Contamination risk', weight: 0.52 }, { name: 'Population exposed', weight: 0.28 }, { name: 'Communication status', weight: 0.12 }, { name: 'Resource availability', weight: 0.08 }] },
    { site_id: 'biyagama', rank: 2, priority_score: 0.35, population_exposed: 180000, communication_status: 'good',
      actions: [
        { action: 'Increase monitoring frequency', urgency: 'within_6h', rationale: 'Moderate risk, rainfall still increasing.' },
        { action: 'Prepare alternative source', urgency: 'within_6h', rationale: 'Risk may rise if rain continues.' },
      ],
      factors: [{ name: 'Contamination risk', weight: 0.44 }, { name: 'Population exposed', weight: 0.31 }, { name: 'Communication status', weight: 0.05 }, { name: 'Resource availability', weight: 0.2 }] },
    { site_id: 'hanwella', rank: 3, priority_score: 0.1, population_exposed: 60000, communication_status: 'good',
      actions: [{ action: 'Continue routine monitoring', urgency: 'monitor', rationale: 'Low risk and stable readings.' }],
      factors: [{ name: 'Contamination risk', weight: 0.4 }, { name: 'Population exposed', weight: 0.2 }, { name: 'Communication status', weight: 0.05 }, { name: 'Resource availability', weight: 0.35 }] },
  ]
}
