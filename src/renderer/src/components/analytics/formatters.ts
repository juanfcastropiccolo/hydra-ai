// Feature 005: number/date formatting for the dashboard (es-AR style, compact).

export function fmtTokens(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e9) return trim((n / 1e9).toFixed(2)) + 'B'
  if (abs >= 1e6) return trim((n / 1e6).toFixed(abs >= 1e7 ? 1 : 2)) + 'M'
  if (abs >= 1e3) return trim((n / 1e3).toFixed(abs >= 1e4 ? 0 : 1)) + 'k'
  return String(Math.round(n))
}
const trim = (s: string): string => s.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1')

export function fmtUsd(n: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  if (n >= 1000) return `$${Math.round(n).toLocaleString('en-US')}`
  if (n >= 100) return `$${n.toFixed(0)}`
  if (n >= 1) return `$${n.toFixed(opts.compact ? 1 : 2)}`
  if (n >= 0.01) return `$${n.toFixed(2)}`
  if (n > 0) return '<$0.01'
  return '$0'
}

export function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0m'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rm = m % 60
  if (h < 24) return rm ? `${h}h ${rm}m` : `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('es-AR')
}

export function fmtPct(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${Math.abs(n) >= 100 ? Math.round(n) : n.toFixed(Math.abs(n) < 10 ? 1 : 0)}%`
}

const DOW_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MONTH_ES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic'
]

/** '2026-08-23' → '23 ago' ; with year when different from `now`. */
export function fmtDayKey(key: string, withYear = false): string {
  const [y, m, d] = key.split('-').map(Number)
  const s = `${d} ${MONTH_ES[(m ?? 1) - 1]}`
  return withYear ? `${s} ${y}` : s
}

export function fmtDateTime(ts: number): string {
  if (!ts) return '—'
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getDate()} ${MONTH_ES[d.getMonth()]} ${hh}:${mm}`
}

export const dowLabel = (dow: number): string => DOW_ES[dow] ?? ''
export const hourLabel = (h: number): string => `${String(h).padStart(2, '0')}h`
