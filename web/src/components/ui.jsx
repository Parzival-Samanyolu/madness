import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { XIcon } from './Icons'

// Closes when you click outside or press Escape.
export function useDismiss(open, onClose) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    // clicks inside another dialog opened on top of this one (e.g. "Are you sure?") don't count as outside
    const onTop = (t) => { const d = t.closest?.('[role="dialog"]'); return d && !ref.current?.contains(d) && d !== ref.current }
    const down = (e) => { if (ref.current && !ref.current.contains(e.target) && !onTop(e.target)) onClose() }
    const key = (e) => {
      if (e.key !== 'Escape') return
      // a dialog only closes on Escape when it is the topmost one; menus always close
      const dialogs = document.querySelectorAll('[role="dialog"]')
      if (!ref.current?.matches('[role="dialog"]') || dialogs[dialogs.length - 1] === ref.current) onClose()
    }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [open, onClose])
  return ref
}

// A button that opens a small menu. `children` is a function: (close) => menu items.
export function Dropdown({ button, children, align = 'left', up = false, className = '', menuClass = 'w-56' }) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  const ref = useDismiss(open, close)
  return (
    <div ref={ref} className={`relative ${className}`}>
      {button({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div role="menu" className={`menu fade-up absolute z-40 ${menuClass} ${align === 'right' ? 'right-0' : 'left-0'} ${up ? 'bottom-full mb-2' : 'top-full mt-1.5'}`}>
          {children(close)}
        </div>
      )}
    </div>
  )
}

export function Modal({ open, onClose, title, children, className = 'max-w-md' }) {
  const ref = useDismiss(open, onClose)
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'var(--c-overlay)' }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title}
           className={`fade-up w-full overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl ${className}`}>
        {title && (
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Close"><XIcon /></button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function Confirm({ open, title, body, action = 'Delete', onConfirm, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="px-5 py-4 text-sm text-ink-2">{body}</div>
      <div className="flex justify-end gap-2 px-5 pb-5">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger" onClick={() => { onConfirm(); onClose() }}>{action}</button>
      </div>
    </Modal>
  )
}

export function Alert({ children }) {
  return <p role="alert" className="rounded-xl bg-danger-bg px-3.5 py-2.5 text-sm text-danger">{children}</p>
}
