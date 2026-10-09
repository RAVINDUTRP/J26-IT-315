import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { siteName } from './ui.jsx'

const SITES = ['ambatale', 'biyagama']

export default function StationDropdown({ site, onChange, labelId = 'monitoring-station-label' }) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(Math.max(0, SITES.indexOf(site)))
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const optionRefs = useRef([])
  const selectedIndex = Math.max(0, SITES.indexOf(site))

  useEffect(() => {
    if (!open) return undefined
    const closeOnOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [open])

  useEffect(() => {
    if (open) optionRefs.current[activeIndex]?.focus()
  }, [open, activeIndex])

  const openAt = (index = selectedIndex) => {
    setActiveIndex(index)
    setOpen(true)
  }
  const move = (index) => setActiveIndex((index + SITES.length) % SITES.length)
  const choose = (id) => {
    onChange(id)
    setOpen(false)
    triggerRef.current?.focus()
  }
  const onTriggerKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      openAt(selectedIndex)
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      setOpen((current) => !current)
      setActiveIndex(selectedIndex)
    }
  }
  const onOptionKeyDown = (event, index) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      move(index + 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      move(index - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActiveIndex(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActiveIndex(SITES.length - 1)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className="relative w-full max-w-72">
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-labelledby={labelId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="monitoring-station-options"
        onClick={() => open ? setOpen(false) : openAt()}
        onKeyDown={onTriggerKeyDown}
        className={`flex w-full items-center justify-between gap-4 rounded-xl border bg-white px-3.5 py-2 text-left text-base font-semibold text-slate-900 shadow-sm transition sm:text-lg ${open ? 'border-teal-600 ring-4 ring-teal-600/10' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'} focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/15`}
      >
        <span>{siteName(site)}</span>
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={`size-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.14, ease: 'easeOut' }}
          className="absolute left-0 top-[calc(100%+8px)] z-30 w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_12px_32px_rgba(15,23,42,0.16)]"
        >
          <div id="monitoring-station-options" role="listbox" aria-labelledby={labelId}>
            {SITES.map((id, index) => {
              const selected = site === id
              const active = activeIndex === index
              return (
                <button
                  key={id}
                  ref={(element) => { optionRefs.current[index] = element }}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  tabIndex={active ? 0 : -1}
                  onFocus={() => setActiveIndex(index)}
                  onClick={() => choose(id)}
                  onKeyDown={(event) => onOptionKeyDown(event, index)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${selected ? 'bg-teal-50 text-teal-900' : 'text-slate-700 hover:bg-slate-50'} ${active ? 'outline-none ring-2 ring-inset ring-teal-600/25' : ''}`}
                >
                  <span>{siteName(id)}</span>
                  {selected && <span className="grid size-5 place-items-center rounded-full bg-teal-600 text-white"><svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-3.5"><path d="m3.5 8 3 3 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>}
                </button>
              )
            })}
          </div>
        </motion.div>
      )}
    </div>
  )
}
