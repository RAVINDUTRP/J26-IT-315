import * as mock from './mockData'

const USE_API = import.meta.env.VITE_USE_API === 'true'
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function get(path, fallback) {
  if (!USE_API) return fallback()
  try {
    const res = await fetch(BASE + path)
    if (!res.ok) throw new Error(res.statusText)
    return await res.json()
  } catch {
    return fallback() // backend down -> keep the demo alive
  }
}

export const getObservations = (id) => get(`/api/c1/observations/${id}`, () => mock.observations(id))
export const getNetwork = () => get('/api/c2/network', mock.network)
export const getRisk = () => get('/api/c3/risk', mock.risk)
export const getRecommendations = () => get('/api/c4/recommendations', mock.recommendations)
