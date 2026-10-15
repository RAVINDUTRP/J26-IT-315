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

export const siteName = (id) => ({ ambatale: 'Ambatale intake', biyagama: 'Biyagama' }[id] || id)

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

export function TopicHeader({
  kicker,
  status,
  statusTone = 'emerald',
  title,
  description,
  metricLabel,
  metricValue,
  actionLabel,
  onAction,
  footer,
  children,
}) {
  const tone = {
    emerald: { badge: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500', action: 'from-teal-600 to-cyan-600' },
    blue: { badge: 'bg-sky-100 text-sky-800', dot: 'bg-sky-500', action: 'from-blue-600 to-cyan-600' },
    violet: { badge: 'bg-violet-100 text-violet-800', dot: 'bg-violet-500', action: 'from-violet-600 to-blue-600' },
    rose: { badge: 'bg-rose-100 text-rose-800', dot: 'bg-rose-500', action: 'from-rose-600 to-orange-500' },
    amber: { badge: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500', action: 'from-amber-500 to-orange-500' },
  }[statusTone]

  return (
    <header className="relative overflow-hidden rounded-[28px] border border-slate-200/90 bg-gradient-to-br from-white via-slate-50/80 to-cyan-50/40 p-5 shadow-[0_12px_35px_-18px_rgba(15,23,42,0.28)] sm:p-7">
      <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-8rem] right-1/3 size-64 rounded-full bg-blue-500/10 blur-3xl" />
      <div className="relative grid gap-7 xl:grid-cols-[minmax(0,1fr)_minmax(330px,0.82fr)] xl:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-[0.12em] ${tone.badge}`}>
              <span className={`size-2 rounded-full ${tone.dot}`} />
              {kicker}
            </span>
            {status && <span className="text-xs font-semibold text-slate-400">·</span>}
            {status && <span className="text-xs font-semibold text-slate-500">{status}</span>}
          </div>
          <h1 className="mt-4 max-w-3xl font-serif text-4xl leading-[1.02] tracking-tight text-slate-950 sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600 sm:text-lg">{description}</p>
        </div>

        <div className="grid gap-3">
          {metricLabel && (
            <div className="flex min-h-[92px] items-center justify-between rounded-full border border-slate-200/90 bg-white/95 px-6 py-4 shadow-[0_8px_24px_-14px_rgba(15,23,42,0.32)]">
              <span className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">{metricLabel}</span>
              <strong className="font-serif text-3xl text-slate-900">{metricValue}</strong>
            </div>
          )}
          {actionLabel && (
            <div role={onAction ? 'button' : undefined} tabIndex={onAction ? 0 : undefined} onClick={onAction} onKeyDown={(event) => event.key === 'Enter' && onAction?.()} className={`flex min-h-[68px] items-center justify-between rounded-full bg-gradient-to-r ${tone.action} px-7 text-left text-base font-bold text-white shadow-[0_12px_24px_-12px_rgba(8,145,178,0.7)] transition ${onAction ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_16px_28px_-12px_rgba(8,145,178,0.8)]' : ''}`}>
              <span className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full bg-white/20">↗</span>{actionLabel}</span>
              <span className="text-2xl font-normal" aria-hidden="true">→</span>
            </div>
          )}
          {children}
        </div>
      </div>
      {footer && <div className="relative mt-7 flex flex-wrap items-center gap-3 border-t border-slate-200/80 pt-5 text-sm text-slate-600">{footer}</div>}
    </header>
  )
}

export const urgencyText = { now: 'Do now', within_1h: 'Within 1 hour', within_6h: 'Within 6 hours', monitor: 'Keep watching' }
