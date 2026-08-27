// Feature 007: the building blocks of the Config view (Discord-like: label + description on the
// left, control on the right). Instant controls call `onChange` directly; text/number fields work
// with usePending and the PendingBar.
import type { ReactNode } from 'react'
import styles from './config.module.css'

export function Section({
  title,
  description,
  children,
  actions
}: {
  title: string
  description?: string
  children: ReactNode
  actions?: ReactNode
}): React.JSX.Element {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <div>
          <h2 className={styles.sectionTitle}>{title}</h2>
          {description && <p className={styles.sectionDesc}>{description}</p>}
        </div>
        {actions}
      </div>
      <div className={styles.rows}>{children}</div>
    </section>
  )
}

export function Row({
  label,
  hint,
  children,
  error,
  testId
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
  error?: string | null
  testId?: string
}): React.JSX.Element {
  return (
    <div className={styles.row} data-testid={testId}>
      <div className={styles.rowText}>
        <div className={styles.rowLabel}>{label}</div>
        {hint && <div className={styles.rowHint}>{hint}</div>}
        {error && (
          <div className={styles.rowError} role="alert">
            {error}
          </div>
        )}
      </div>
      <div className={styles.rowControl}>{children}</div>
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  testId,
  disabled
}: {
  checked: boolean
  onChange: (v: boolean) => void
  testId?: string
  disabled?: boolean
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`${styles.toggle} ${checked ? styles.toggleOn : ''}`}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      data-testid={testId}
    >
      <span className={styles.toggleKnob} />
    </button>
  )
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  testId
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (v: T) => void
  testId?: string
}): React.JSX.Element {
  return (
    <select
      className={styles.select}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      data-testid={testId}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function TextField({
  value,
  onChange,
  onEnter,
  placeholder,
  testId,
  mono,
  width
}: {
  value: string
  onChange: (v: string) => void
  onEnter?: () => void
  placeholder?: string
  testId?: string
  mono?: boolean
  width?: number
}): React.JSX.Element {
  return (
    <input
      className={`${styles.input} ${mono ? styles.mono : ''}`}
      style={width ? { width } : undefined}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onEnter?.()
      }}
      data-testid={testId}
    />
  )
}

export function NumberField({
  value,
  onChange,
  onEnter,
  min,
  max,
  step,
  testId,
  suffix
}: {
  value: number | ''
  onChange: (v: number | '') => void
  onEnter?: () => void
  min?: number
  max?: number
  step?: number
  testId?: string
  suffix?: string
}): React.JSX.Element {
  return (
    <span className={styles.numberWrap}>
      <input
        className={`${styles.input} ${styles.number}`}
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter?.()
        }}
        data-testid={testId}
      />
      {suffix && <span className={styles.suffix}>{suffix}</span>}
    </span>
  )
}

export function Slider({
  value,
  min,
  max,
  onChange,
  testId,
  format
}: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  testId?: string
  format?: (v: number) => string
}): React.JSX.Element {
  return (
    <span className={styles.sliderWrap}>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={styles.slider}
        data-testid={testId}
      />
      <span className={styles.sliderValue}>{format ? format(value) : value}</span>
    </span>
  )
}

export function Swatches<T extends string>({
  value,
  options,
  onChange,
  testId
}: {
  value: T
  options: Array<{ value: T; color: string; label: string }>
  onChange: (v: T) => void
  testId?: string
}): React.JSX.Element {
  return (
    <span className={styles.swatches} role="radiogroup" data-testid={testId}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.label}
          className={`${styles.swatch} ${value === o.value ? styles.swatchActive : ''}`}
          style={{ background: o.color }}
          onClick={() => onChange(o.value)}
          data-testid={testId ? `${testId}-${o.value}` : undefined}
        />
      ))}
    </span>
  )
}

export function PendingBar({
  dirty,
  saving,
  onSave,
  onDiscard,
  error
}: {
  dirty: boolean
  saving: boolean
  onSave: () => void
  onDiscard: () => void
  error?: string | null
}): React.JSX.Element | null {
  if (!dirty && !error) return null
  return (
    <div className={styles.pendingBar} role="status" data-testid="pending-bar">
      <span>{error ? `No se pudo guardar: ${error}` : 'Cuidado — tenés cambios sin guardar'}</span>
      <span className={styles.pendingActions}>
        <button
          type="button"
          className={styles.ghost}
          onClick={onDiscard}
          disabled={saving}
          data-testid="pending-discard"
        >
          Descartar
        </button>
        <button
          type="button"
          className={styles.primary}
          onClick={onSave}
          disabled={saving}
          data-testid="pending-save"
        >
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </span>
    </div>
  )
}

export function SavedToast({ visible }: { visible: boolean }): React.JSX.Element | null {
  if (!visible) return null
  return (
    <div className={styles.savedToast} role="status" data-testid="saved-toast">
      ✓ Guardado
    </div>
  )
}

export function DangerButton({
  children,
  onClick,
  testId
}: {
  children: ReactNode
  onClick: () => void
  testId?: string
}): React.JSX.Element {
  return (
    <button type="button" className={styles.danger} onClick={onClick} data-testid={testId}>
      {children}
    </button>
  )
}
