import styles from './FileIcon.module.css'
import { iconFor } from './icon-map'

export function FileIcon({
  name,
  kind,
  open,
  symlinkKind
}: {
  name: string
  kind: 'dir' | 'file' | 'symlink' | 'other'
  open?: boolean
  symlinkKind?: 'dir' | 'file'
}): React.JSX.Element {
  const spec = iconFor(name, kind, { open, symlinkKind })
  if (spec.folder) {
    return (
      <span className={styles.folder} data-testid="file-icon" data-folder={spec.folder} aria-hidden>
        <svg viewBox="0 0 16 13">
          <path
            d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3.2l1.6 1.6h6.2A1.5 1.5 0 0 1 15 4.1v7.4a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 11.5z"
            fill={spec.color}
            opacity={open ? 0.75 : 1}
          />
          {open && (
            <path d="M2 5h12l-1.2 6.2a1 1 0 0 1-1 .8H3.2a1 1 0 0 1-1-.8z" fill={spec.color} />
          )}
        </svg>
      </span>
    )
  }
  return (
    <span
      className={styles.badge}
      style={{ background: spec.color }}
      data-testid="file-icon"
      data-glyph={spec.glyph}
      aria-hidden
    >
      {spec.glyph}
    </span>
  )
}
