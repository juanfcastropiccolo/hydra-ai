// Feature 005 FR-10b: sessions that live under a system temp dir are test runs, not work.
// Pure; no Node imports so the renderer can use it too.

const TEMP_PREFIXES = ['/tmp', '/private/tmp', '/var/folders', '/private/var/folders']

const norm = (p: string): string => p.replace(/\/+$/, '')

/** True when `cwd` is, or is inside, a temp dir (the fixed macOS ones plus an optional $TMPDIR). */
export function isTempCwd(cwd: string, tmpdir?: string | null): boolean {
  const c = norm(cwd)
  const prefixes = [...TEMP_PREFIXES]
  if (tmpdir) prefixes.push(norm(tmpdir), norm(tmpdir).replace(/^\/private/, ''))
  return prefixes.some((t) => t && (c === t || c.startsWith(t + '/')))
}
