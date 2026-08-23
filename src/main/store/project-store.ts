// ProjectStore: hydra.json — the only thing Hydra persists (projects + UI prefs). Atomic writes,
// validation, corrupt-file backup. Sessions are NEVER stored here (the CLI is the source of truth).
import { randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  copyFileSync
} from 'node:fs'
import { basename, dirname } from 'node:path'
import { EMPTY_HYDRA_FILE, type HydraFile, type Project } from '@shared/types'

export interface ProjectStoreDeps {
  filePath: string
  exists?: (p: string) => boolean
  now?: () => string
  uuid?: () => string
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Pure: validate/coerce an unknown JSON value into a HydraFile, or null if unusable. */
export function validateHydraFile(v: unknown): HydraFile | null {
  if (!isRecord(v) || v.version !== 1 || !Array.isArray(v.projects)) return null
  const projects: Project[] = []
  for (const p of v.projects) {
    if (!isRecord(p)) continue
    if (typeof p.id !== 'string' || typeof p.path !== 'string' || typeof p.name !== 'string')
      continue
    projects.push({
      id: p.id,
      name: p.name,
      path: p.path,
      addedAt: typeof p.addedAt === 'string' ? p.addedAt : ''
    })
  }
  const ui = isRecord(v.ui) ? v.ui : {}
  const strs = (x: unknown): string[] =>
    Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []
  return {
    version: 1,
    projects,
    ui: { hiddenSessionIds: strs(ui.hiddenSessionIds), paneOrder: strs(ui.paneOrder) }
  }
}

export class ProjectStore {
  private data: HydraFile = structuredClone(EMPTY_HYDRA_FILE)
  private readonly exists: (p: string) => boolean
  private readonly now: () => string
  private readonly uuid: () => string
  /** Set when the file existed but was unreadable; a backup copy was written next to it. */
  loadError: string | null = null

  constructor(private readonly deps: ProjectStoreDeps) {
    this.exists = deps.exists ?? existsSync
    this.now = deps.now ?? (() => new Date().toISOString())
    this.uuid = deps.uuid ?? randomUUID
  }

  get filePath(): string {
    return this.deps.filePath
  }

  load(): HydraFile {
    const p = this.deps.filePath
    if (!existsSync(p)) {
      this.data = structuredClone(EMPTY_HYDRA_FILE)
      return this.snapshot()
    }
    let raw = ''
    try {
      raw = readFileSync(p, 'utf8')
      const parsed = validateHydraFile(JSON.parse(raw))
      if (!parsed) throw new Error('schema mismatch')
      this.data = parsed
      this.loadError = null
    } catch (e) {
      const backup = `${p}.corrupt-${Date.now()}.bak`
      try {
        copyFileSync(p, backup)
      } catch {
        /* best effort */
      }
      this.loadError = `hydra.json unreadable (${(e as Error).message}); backed up to ${basename(backup)} and started empty`
      this.data = structuredClone(EMPTY_HYDRA_FILE)
    }
    return this.snapshot()
  }

  save(): void {
    const p = this.deps.filePath
    mkdirSync(dirname(p), { recursive: true })
    const tmp = `${p}.tmp`
    writeFileSync(tmp, JSON.stringify(this.data, null, 2) + '\n', 'utf8')
    renameSync(tmp, p) // atomic on POSIX
  }

  snapshot(): HydraFile {
    return structuredClone(this.data)
  }

  /** Projects with `missing` computed live (folder gone → true). */
  listProjects(): Project[] {
    return this.data.projects.map((p) => ({ ...p, missing: !this.exists(p.path) }))
  }

  getProject(id: string): Project | undefined {
    return this.listProjects().find((p) => p.id === id)
  }

  addProject(input: { path: string; name?: string }): Project {
    const path = input.path.replace(/[\\/]+$/, '')
    const dup = this.data.projects.find((p) => p.path === path)
    if (dup) return { ...dup, missing: !this.exists(dup.path) }
    const project: Project = {
      id: this.uuid(),
      name: input.name?.trim() || basename(path) || path,
      path,
      addedAt: this.now()
    }
    this.data.projects.push(project)
    this.save()
    return { ...project, missing: !this.exists(path) }
  }

  removeProject(id: string): void {
    const before = this.data.projects.length
    this.data.projects = this.data.projects.filter((p) => p.id !== id)
    if (this.data.projects.length !== before) this.save()
  }

  renameProject(id: string, name: string): Project {
    const p = this.data.projects.find((x) => x.id === id)
    if (!p) throw new Error(`project ${id} not found`)
    const trimmed = name.trim()
    if (!trimmed) throw new Error('name cannot be empty')
    p.name = trimmed
    this.save()
    return { ...p, missing: !this.exists(p.path) }
  }

  hiddenSessionIds(): string[] {
    return [...this.data.ui.hiddenSessionIds]
  }

  setHidden(sessionId: string, hidden: boolean): void {
    const set = new Set(this.data.ui.hiddenSessionIds)
    if (hidden) set.add(sessionId)
    else set.delete(sessionId)
    this.data.ui.hiddenSessionIds = [...set]
    this.save()
  }

  paneOrder(): string[] {
    return [...this.data.ui.paneOrder]
  }

  setPaneOrder(order: string[]): void {
    this.data.ui.paneOrder = [...order]
    this.save()
  }
}
