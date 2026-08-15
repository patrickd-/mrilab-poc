import { useEffect, useId, useRef, useState } from 'react'

interface DarkSelectProps<T extends string> {
  value: T
  options: ReadonlyArray<{ id: T; label: string }>
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
}

function DarkSelect<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className = '',
}: DarkSelectProps<T>) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()
  const selectedOption = options.find((option) => option.id === value)

  useEffect(() => {
    if (!open) return

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
    }
  }, [open])

  return (
    <div className={`dark-select ${className}`.trim()} ref={rootRef}>
      <button
        className="dark-select-trigger"
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false)
        }}
      >
        <span>{selectedOption?.label}</span>
        <span className="select-chevron" aria-hidden="true" />
      </button>

      {open && (
        <div className="dark-select-options" id={listboxId} role="listbox">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={option.id === value}
              onClick={() => {
                onChange(option.id)
                setOpen(false)
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default DarkSelect
