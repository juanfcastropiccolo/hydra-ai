// Feature 007 FR-10/FR-12: maintenance actions (pure file helpers; Electron dialogs live in ipc.ts).
import { copyFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { validateHydraFile } from './store/project-store'

export interface DataFileInfo {
  name: string
  path: string
  bytes: number
}

export function fileInfo(path: string): DataFileInfo {
  let bytes = 0
  try {
    bytes = statSync(path).size
  } catch {
    /* missing */
  }
  return { name: path.split('/').pop() ?? path, path, bytes }
}

/** Copy the current hydra.json to `dest` (pretty-printed as stored). */
export function exportHydraJson(src: string, dest: string): void {
  if (!existsSync(src)) throw new Error('Todavía no hay un hydra.json que exportar')
  copyFileSync(src, dest)
}

export interface ImportResult {
  backupPath: string
  projects: number
}

/**
 * Validate `src` as a hydra.json; on success back the current file up as `<dest>.bak` and replace it.
 * Throws with a readable reason otherwise (nothing is touched).
 */
export function importHydraJson(src: string, dest: string): ImportResult {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(src, 'utf8'))
  } catch (e) {
    throw new Error(`El archivo no es JSON válido: ${(e as Error).message}`)
  }
  const version = (raw as { version?: unknown })?.version
  if (typeof version === 'number' && version > 1)
    throw new Error(`Versión de hydra.json no soportada (${version}); esta Hydra usa la versión 1`)
  const parsed = validateHydraFile(raw)
  if (!parsed)
    throw new Error(
      'El archivo no tiene la forma de un hydra.json (falta version 1 / projects / ui)'
    )
  const backupPath = `${dest}.bak`
  if (existsSync(dest)) copyFileSync(dest, backupPath)
  writeFileSync(dest, JSON.stringify(parsed, null, 2) + '\n', 'utf8')
  return { backupPath, projects: parsed.projects.length }
}
