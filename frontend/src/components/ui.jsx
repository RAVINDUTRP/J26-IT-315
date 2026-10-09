import { useEffect, useState } from 'react'

export function useData(loader, deps = []) {
  const [data, setData] = useState(null)
  useEffect(() => {
    let live = true
    setData(null)
    loader().then((d) => live && setData(d))
    return () => { live = false }
  }, deps)
  return data
}

export const siteName = (id) => ({ ambatale: 'Ambatale intake', biyagama: 'Biyagama', hanwella: 'Hanwella' }[id] || id)

export function Pill({ level, children }) {
  const tone = {
    low: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    good: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    moderate: 'bg-amber-50 text-amber-800 ring-amber-200',
    degraded: 'bg-amber-50 text-amber-800 ring-amber-200',
    high: 'bg-orange-50 text-orange-800 ring-orange-200',
    critical: 'bg-rose-50 text-rose-800 ring-rose-200',
    lost: 'bg-rose-50 text-rose-800 ring-rose-200',
  }[level] || 'bg-slate-100 text-slate-700 ring-slate-200'
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ring-inset ${tone}`}>{children ?? level}</span>
}

export function Loading() {
  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-label="Loading page">
      <span className="sr-only">Loading…</span>
      <div className="h-10 w-56 animate-pulse rounded-lg bg-slate-200" />
      <div className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-white" />
      <div className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white" />
    </div>
  )
}

export function Panel({ title, note, children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      {(title || note) && (
        <div className="mb-4">
          {title && <h2 className="text-lg font-semibold text-slate-900">{title}</h2>}
          {note && <p className="mt-1 text-sm text-slate-500">{note}</p>}
        </div>
      )}
      {children}
    </section>
  )
}

export const urgencyText = { now: 'Do now', within_1h: 'Within 1 hour', within_6h: 'Within 6 hours', monitor: 'Keep watching' }
