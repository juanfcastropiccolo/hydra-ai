// Pure path helpers shared by main and renderer (feature 002: drag a file into a terminal).
// No Node imports: runs in the renderer too. POSIX-only (macOS).

function normalise(p: string): string {
  const parts: string[] = []
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return '/' + parts.join('/')
}

/**
 * Path to type into a shell running in `baseDir`: relative if `absPath` is inside baseDir
 * (or equals it → '.'), absolute otherwise. Both inputs must be absolute. Pass `realpath`
 * to resolve symlinked prefixes (/var → /private/var on macOS) consistently on both sides.
 */
export function relativeForShell(
  absPath: string,
  baseDir: string,
  realpath: (p: string) => string = (p) => p
): string {
  const a = normalise(safe(realpath, absPath))
  const b = normalise(safe(realpath, baseDir))
  if (a === b) return '.'
  const prefix = b === '/' ? '/' : b + '/'
  return a.startsWith(prefix) ? a.slice(prefix.length) : a
}

function safe(fn: (p: string) => string, p: string): string {
  try {
    return fn(p)
  } catch {
    return p
  }
}

/** Single-quote for POSIX shells only when needed; escapes embedded single quotes. */
export function quoteForShell(s: string): string {
  if (s === '') return "''"
  if (/^[A-Za-z0-9_./@:+,=%^-]+$/.test(s)) return s
  return "'" + s.replace(/'/g, `'\\''`) + "'"
}

/** Text to type into a terminal for a dropped path: quoted, relative to the session cwd, plus a space. */
export function droppedPathText(
  absPath: string,
  sessionCwd: string,
  realpath?: (p: string) => string
): string {
  return quoteForShell(relativeForShell(absPath, sessionCwd, realpath)) + ' '
}
