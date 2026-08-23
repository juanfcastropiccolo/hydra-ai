// Feature 005: date helpers for the dashboard. Pure; local time of the running process.

/** 'YYYY-MM-DD' of a timestamp in local time. */
export function dayKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Start of the local day for a 'YYYY-MM-DD' key, as ms epoch. */
export function dayStart(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getTime()
}

export function addDays(key: string, n: number): string {
  const t = dayStart(key)
  const d = new Date(t)
  d.setDate(d.getDate() + n)
  return dayKey(d.getTime())
}

/** Every day key from `from` to `to`, inclusive. */
export function dayRange(from: string, to: string): string[] {
  const out: string[] = []
  let k = from
  let guard = 0
  while (k <= to && guard++ < 20_000) {
    out.push(k)
    k = addDays(k, 1)
  }
  return out
}

/** Monday-based ISO week start key for a day key. */
export function weekStart(key: string): string {
  const d = new Date(dayStart(key))
  const dow = (d.getDay() + 6) % 7 // Mon=0
  return addDays(key, -dow)
}
