import { useEffect, useId, useRef, useState } from 'react'

export type RealismOptionId =
  | 'b0-inhomogeneity'
  | 'b1-inhomogeneity'
  | 'intravoxel-dephasing'

const REALISM_OPTIONS: ReadonlyArray<{
  id: RealismOptionId
  label: string
}> = [
  { id: 'b0-inhomogeneity', label: 'B0 inhomogeneity' },
  { id: 'b1-inhomogeneity', label: 'B1 inhomogeneity' },
  { id: 'intravoxel-dephasing', label: 'Intravoxel dephasing' },
]

interface RealismMenuProps {
  enabledOptions: ReadonlyArray<RealismOptionId>
  onToggle: (option: RealismOptionId) => void
}

function RealismMenu({ enabledOptions, onToggle }: RealismMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()

  useEffect(() => {
    if (!open) return

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () =>
      document.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [open])

  return (
    <div className="realism-menu" ref={rootRef}>
      <button
        className="realism-trigger"
        type="button"
        aria-label={`${enabledOptions.length} of ${REALISM_OPTIONS.length} realism options enabled`}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false)
        }}
      >
        <span>
          Realism ({enabledOptions.length}/{REALISM_OPTIONS.length})
        </span>
        <span className="select-chevron" aria-hidden="true" />
      </button>

      {open && (
        <div
          className="realism-options"
          id={listboxId}
          role="listbox"
          aria-multiselectable="true"
        >
          {REALISM_OPTIONS.map((option) => {
            const enabled = enabledOptions.includes(option.id)
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={enabled}
                onClick={() => onToggle(option.id)}
              >
                <span
                  className={`realism-checkbox${enabled ? ' checked' : ''}`}
                  aria-hidden="true"
                />
                <span>{option.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default RealismMenu
