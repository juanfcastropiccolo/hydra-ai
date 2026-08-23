/** Clean tick values 0..max (≤ count+1 ticks). */
export function niceTicks(max: number, count: number): number[] {
  if (max <= 0) return [0]
  const raw = max / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag
  const out: number[] = []
  for (let v = 0; v <= max + 1e-9; v += step) out.push(+v.toFixed(10))
  return out
}
