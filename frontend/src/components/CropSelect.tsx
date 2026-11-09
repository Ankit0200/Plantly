import { useState, useRef, useEffect, useCallback, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { CropRef } from '../types'
import { cropEmoji } from '../cropIcons'

interface Props {
  crops: CropRef[]
  value: string
  onChange: (cropId: string) => void
  placeholder?: string
  allowEmpty?: boolean
}

/** A dropdown that shows crop emoji next to each option. */
export default function CropSelect({ crops, value, onChange, placeholder = '— pick a crop —', allowEmpty = false }: Props) {
  const [open, setOpen] = useState(false)
  const [focusIdx, setFocusIdx] = useState(-1)
  const [pos, setPos] = useState<CSSProperties>({})
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const allOptions = allowEmpty
    ? [{ id: '', name: 'None' }, ...crops]
    : crops

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      // the list lives in a portal, so it is outside `ref` in the DOM
      if (!ref.current?.contains(t) && !listRef.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  /** Pin the list to the trigger on screen: below it, or above when there is more room there. */
  const place = useCallback(() => {
    const t = triggerRef.current
    if (!t) return
    const r = t.getBoundingClientRect()
    const gap = 4, margin = 8, preferred = 250
    const below = window.innerHeight - r.bottom - gap - margin
    const above = r.top - gap - margin
    const up = below < 200 && above > below
    const width = Math.min(Math.max(r.width, 192), window.innerWidth - 2 * margin)
    setPos({
      left: Math.max(margin, Math.min(r.left, window.innerWidth - width - margin)),
      width,
      maxHeight: Math.min(preferred, up ? above : below),
      ...(up ? { bottom: window.innerHeight - r.top + gap } : { top: r.bottom + gap }),
    })
  }, [])

  // Follow the trigger while open: page scroll, scroll inside any container, or a window resize.
  useEffect(() => {
    if (!open) return
    const onMove = (e: Event) => { if (e.target !== listRef.current) place() }
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open, place])

  const openDropdown = useCallback(() => {
    place()
    setOpen(true)
    const currentIdx = allOptions.findIndex(c => c.id === value)
    setFocusIdx(currentIdx >= 0 ? currentIdx : 0)
  }, [allOptions, value, place])

  const select = useCallback((id: string) => {
    onChange(id)
    setOpen(false)
    triggerRef.current?.focus()
  }, [onChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        openDropdown()
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setFocusIdx(i => Math.min(i + 1, allOptions.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setFocusIdx(i => Math.max(i - 1, 0))
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (focusIdx >= 0 && focusIdx < allOptions.length) {
          select(allOptions[focusIdx].id)
        }
        break
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
        break
    }
  }, [open, focusIdx, allOptions, select, openDropdown])

  // Scroll focused option into view
  useEffect(() => {
    if (open && listRef.current && focusIdx >= 0) {
      const items = listRef.current.querySelectorAll('[role="option"]')
      items[focusIdx]?.scrollIntoView({ block: 'nearest' })
    }
  }, [open, focusIdx])

  const current = crops.find(c => c.id === value)
  const listId = `crop-list-${value || 'empty'}`

  return (
    <div className="crop-select" ref={ref} onKeyDown={handleKeyDown}>
      <button
        type="button"
        ref={triggerRef}
        className="crop-select-trigger"
        onClick={() => open ? setOpen(false) : openDropdown()}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
      >
        {current ? (
          <><span className="crop-select-emoji" aria-hidden="true">{cropEmoji(current.id)}</span> {current.name}</>
        ) : (
          <span className="crop-select-placeholder">{placeholder}</span>
        )}
        <span className="crop-select-arrow" aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>
      {open && createPortal(
        // Portaled to <body> so no card or panel with overflow can clip it. React still bubbles its
        // events (keyboard included) up to the wrapper above.
        <div
          id={listId}
          ref={listRef}
          className="crop-select-dropdown"
          style={pos}
          role="listbox"
          aria-label="Select a crop"
        >
          {allOptions.map((c, i) => (
            <button
              key={c.id || '__empty'}
              type="button"
              role="option"
              aria-selected={c.id === value}
              className={`crop-select-option ${c.id === value ? 'active' : ''} ${i === focusIdx ? 'focused' : ''}`}
              onClick={() => select(c.id)}
              onMouseEnter={() => setFocusIdx(i)}
            >
              <span className="crop-select-emoji" aria-hidden="true">{c.id ? cropEmoji(c.id) : '—'}</span> {c.name}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}
