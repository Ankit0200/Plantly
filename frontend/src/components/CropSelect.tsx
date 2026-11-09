import { useState, useRef, useEffect, useCallback } from 'react'
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
  const [flip, setFlip] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const allOptions = allowEmpty
    ? [{ id: '', name: 'None' }, ...crops]
    : crops

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const openDropdown = useCallback(() => {
    // Check if we need to flip upward
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      setFlip(spaceBelow < 260)
    }
    setOpen(true)
    const currentIdx = allOptions.findIndex(c => c.id === value)
    setFocusIdx(currentIdx >= 0 ? currentIdx : 0)
  }, [allOptions, value])

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
      {open && (
        <div
          id={listId}
          ref={listRef}
          className={`crop-select-dropdown ${flip ? 'flip' : ''}`}
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
        </div>
      )}
    </div>
  )
}
