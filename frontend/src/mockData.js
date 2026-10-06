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

export function network(failedNode = '') {
  const nodes = [
    { id: 'S1', role: 'sensor', health: 0.91, battery: 78, rssi: -82, snr: 7.5, congestion: 0.12, failure_risk: 0.09, x: 60, y: 90 },
    { id: 'S2', role: 'sensor', health: 0.88, battery: 71, rssi: -88, snr: 6.0, congestion: 0.18, failure_risk: 0.10, x: 60, y: 250 },
    { id: 'R1', role: 'relay', health: 0.84, battery: 69, rssi: -91, snr: 5.1, congestion: 0.28, failure_risk: 0.25, x: 190, y: 40 },
    { id: 'R2', role: 'relay', health: 0.93, battery: 88, rssi: -79, snr: 8.4, congestion: 0.12, failure_risk: 0.08, x: 190, y: 170 },
    { id: 'R3', role: 'relay', health: 0.86, battery: 74, rssi: -90, snr: 5.5, congestion: 0.22, failure_risk: 0.16, x: 190, y: 295 },
    { id: 'R4', role: 'relay', health: failedNode === 'R4' ? 0.08 : 0.38, battery: failedNode === 'R4' ? 5 : 19, rssi: failedNode === 'R4' ? -115 : -108, snr: failedNode === 'R4' ? -7 : -2, congestion: failedNode === 'R4' ? 0.95 : 0.72, failure_risk: 0.99, x: 340, y: 110, predicted_failure: 0.99 },
    { id: 'R5', role: 'relay', health: 0.90, battery: 83, rssi: -81, snr: 7.9, congestion: 0.16, failure_risk: 0.09, x: 340, y: 250 },
    { id: 'GW', role: 'gateway', health: 0.97, battery: 100, rssi: -70, snr: 10.0, congestion: 0.05, failure_risk: 0.03, x: 480, y: 170 },
  ]
  const links = [['S1','R1'],['S1','R2'],['S2','R2'],['S2','R3'],['R1','R4'],['R2','R4'],['R2','R5'],['R3','R5'],['R4','GW'],['R5','GW']]
  const activePath = failedNode === 'R4' ? ['S1', 'R2', 'R5', 'GW'] : ['S1', 'R2', 'R5', 'GW']
  return {
    nodes,
    links,
    active_path: activePath,
    previous_path: ['S1', 'R1', 'R4', 'GW'],
    routing: {
      algorithm: 'Adaptive Multi-Hop Routing',
      switched: Boolean(failedNode),
      active_score: failedNode ? 0.31 : 0.88,
      selected_score: 0.88,
      ranked_paths: [
        { path: ['S1','R2','R5','GW'], score: 0.88, hops: 3, available: true },
        { path: ['S1','R2','R4','GW'], score: failedNode ? 0 : 0.31, hops: 3, available: !failedNode },
        { path: ['S1','R1','R4','GW'], score: failedNode ? 0 : 0.26, hops: 3, available: !failedNode },
      ],
    },
    pdr_percent: failedNode ? 98.0 : 97.4,
    latency_ms: failedNode ? 905 : 840,
    recovery_s: failedNode ? 0.8 : 2.1,
    energy_mwh: failedNode ? 19.4 : 18.6,
    route_switch_count: failedNode ? 4 : 3,
    failed_node: failedNode || null,
  }
}

export function c2Metrics() {
  return { pdr_percent: 97.8, latency_ms: 865, recovery_ms: 512, energy_mwh: 18.9, route_switch_rate: 0.95 }
}

export function packetDemo() {
  return {
    sequence: 42,
    plain_bytes: 19,
    protected_bytes: 27,
    recovered: { node_id: 1, sequence: 42, ph: 7.12, turbidity_ntu: 28.4, tds_ppm: 132, temperature_c: 28.4, battery_pct: 87 },
    pipeline: ['sensor reading', 'compact binary encoding', 'rolling-key XOR protection', 'multi-hop LoRa transmission', 'gateway authentication/decryption', 'binary decode'],
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
