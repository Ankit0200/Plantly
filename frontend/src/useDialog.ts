import { useEffect, useRef, type RefObject } from 'react'

/** Modal basics: focus the dialog when it opens, close on Escape, and return focus when it closes. */
export function useDialog(ref: RefObject<HTMLElement | null>, open: boolean, onClose?: () => void) {
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current?.() }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      prev?.focus()
    }
  }, [open, ref])
}
