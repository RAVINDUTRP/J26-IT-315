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
  return <span className={`pill pill-${level}`}>{children ?? level}</span>
}

export function Loading() {
  return <p className="muted">Loading...</p>
}

export function Panel({ title, note, children, className = '' }) {
  return (
    <section className={`panel ${className}`}>
      {title && <h3>{title}</h3>}
      {note && <p className="muted small">{note}</p>}
      {children}
    </section>
  )
}

export const urgencyText = { now: 'Do now', within_1h: 'Within 1 hour', within_6h: 'Within 6 hours', monitor: 'Keep watching' }
