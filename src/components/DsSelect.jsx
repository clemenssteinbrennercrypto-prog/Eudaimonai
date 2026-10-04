import { useEffect, useId, useRef, useState } from 'react'

// A pop-up button in the app's own material. The native <select> menu in the
// WebView fell back to a serif system font and a grey sheet that matched
// nothing else, so visible pickers use this instead. It follows the macOS
// pop-up button: the current value with a chevron, a glass menu with a check
// on the selected item, arrow keys, Home/End, Enter/Space to pick, Escape
// or a click outside to close.
export default function DsSelect({ value, options, onChange, label, prefix, placeholder = '—', className = '', describedBy }) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef(null)
  const buttonRef = useRef(null)
  const listId = useId()
  const selectedIndex = options.findIndex(option => option.value === value)
  const selected = options[selectedIndex]

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const openMenu = () => {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
    setOpen(true)
  }
  const choose = index => {
    const option = options[index]
    if (!option || option.disabled) return
    setOpen(false)
    buttonRef.current?.focus()
    if (option.value !== value) onChange(option.value)
  }
  const step = (from, delta) => {
    for (let i = 1; i <= options.length; i += 1) {
      const next = (from + delta * i + options.length) % options.length
      if (!options[next].disabled) return next
    }
    return from
  }
  const onKeyDown = event => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault()
        openMenu()
      }
      return
    }
    if (event.key === 'Escape' || event.key === 'Tab') { setOpen(false); return }
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex(index => step(index, 1)) }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex(index => step(index, -1)) }
    if (event.key === 'Home') { event.preventDefault(); setActiveIndex(step(-1, 1)) }
    if (event.key === 'End') { event.preventDefault(); setActiveIndex(step(options.length, -1)) }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(activeIndex) }
  }

  return (
    <div ref={rootRef} className={`ds-select${open ? ' is-open' : ''} ${className}`.trim()}>
      <button
        ref={buttonRef}
        type="button"
        className="ds-select-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={label}
        aria-describedby={describedBy}
        aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
      >
        {prefix && <span className="ds-select-prefix">{prefix}</span>}
        <span className={`ds-select-value${selected ? '' : ' is-placeholder'}`}>{selected?.label ?? placeholder}</span>
        <svg className="ds-icon ds-select-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 6.5 8 10l3.5-3.5" /></svg>
      </button>
      {open && (
        <ul id={listId} className="ds-select-menu" role="listbox" aria-label={label}>
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={option.value === value}
              aria-disabled={option.disabled || undefined}
              className={`${index === activeIndex ? 'is-active' : ''}${option.disabled ? ' is-disabled' : ''}`}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={event => event.preventDefault()}
              onClick={() => choose(index)}
            >
              <svg className="ds-icon ds-select-check" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 4.5" /></svg>
              <span>{option.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
