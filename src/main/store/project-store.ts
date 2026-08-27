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
import {
  isProjectColor,
  type FileTreePrefs,
  type HydraFile,
  type ImportContextPrefs,
  type Project,
  type ProjectColor
} from '@shared/types'
import type { AnalyticsPrefs, CenterView } from '@shared/analytics/types'
import type { KnowPrefs } from '@shared/know/types'
import {
  defaultPrefs,
  emptyHydraFile,
  FILE_TREE_MIN_WIDTH,
  validatePrefs,
  validPricing,
  validRange,
  type HydraPrefs,
  type PrefsPatch
} from '@shared/prefs'

export interface ProjectStoreDeps {
  filePath: string
  exists?: (p: string) => boolean
  now?: () => string
  uuid?: () => string
  /** OS user name, used to seed the profile the first time (007). */
  defaultUserName?: string
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Pure: validate/coerce an unknown JSON value into a HydraFile, or null if unusable. */
export function validateHydraFile(v: unknown, userName = ''): HydraFile | null {
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
      addedAt: typeof p.addedAt === 'string' ? p.addedAt : '',
      ...(isProjectColor(p.color) ? { color: p.color } : {})
    })
  }
  return { version: 1, projects, ui: validatePrefs(v.ui, defaultPrefs(userName)) }
}

export class ProjectStore {
  private data: HydraFile = emptyHydraFile()
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
      this.data = { version: 1, projects: [], ui: defaultPrefs(this.deps.defaultUserName ?? '') }
      return this.snapshot()
    }
    let raw = ''
    try {
      raw = readFileSync(p, 'utf8')
      const parsed = validateHydraFile(JSON.parse(raw), this.deps.defaultUserName ?? '')
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
      this.data = emptyHydraFile(this.deps.defaultUserName ?? '')
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

  setProjectColor(id: string, color: ProjectColor | null): Project {
    const p = this.data.projects.find((x) => x.id === id)
    if (!p) throw new Error(`project ${id} not found`)
    if (color === null) delete p.color
    else if (isProjectColor(color)) p.color = color
    else throw new Error(`unknown color ${String(color)}`)
    this.save()
    return { ...p, missing: !this.exists(p.path) }
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

  sessionNames(): Record<string, string> {
    return { ...this.data.ui.sessionNames }
  }

  setSessionName(sessionId: string, name: string | null): void {
    const trimmed = name?.trim()
    if (trimmed) this.data.ui.sessionNames[sessionId] = trimmed
    else delete this.data.ui.sessionNames[sessionId]
    this.save()
  }

  fileTree(): FileTreePrefs {
    return { ...this.data.ui.fileTree }
  }

  setFileTree(patch: Partial<FileTreePrefs>): FileTreePrefs {
    const next = { ...this.data.ui.fileTree, ...patch }
    if (!Number.isFinite(next.width) || next.width < FILE_TREE_MIN_WIDTH)
      next.width = this.data.ui.fileTree.width
    this.data.ui.fileTree = {
      open: Boolean(next.open),
      width: Math.round(next.width),
      collapsed: Boolean(next.collapsed)
    }
    this.save()
    return this.fileTree()
  }

  importContext(): ImportContextPrefs {
    return { ...this.data.ui.importContext }
  }

  /** Feature 004: `model` is trimmed; empty/non-string values keep the current one. */
  setImportContext(patch: Partial<ImportContextPrefs>): ImportContextPrefs {
    const model =
      typeof patch.model === 'string' && patch.model.trim()
        ? patch.model.trim()
        : this.data.ui.importContext.model
    this.data.ui.importContext = { model }
    this.save()
    return this.importContext()
  }

  // ---- feature 005 ----
  centerView(): CenterView {
    return this.data.ui.centerView
  }
  setCenterView(view: CenterView): CenterView {
    this.data.ui.centerView = view === 'analytics' || view === 'graph' ? view : 'sessions'
    this.save()
    return this.centerView()
  }
  analytics(): AnalyticsPrefs {
    return { range: this.data.ui.analytics.range, pricing: { ...this.data.ui.analytics.pricing } }
  }
  /** Invalid range/pricing entries are ignored; `pricing` replaces the whole override map. */
  setAnalytics(patch: Partial<AnalyticsPrefs>): AnalyticsPrefs {
    const next = this.analytics()
    if (patch.range !== undefined) next.range = validRange(patch.range) ?? next.range
    if (patch.pricing !== undefined) next.pricing = validPricing(patch.pricing)
    this.data.ui.analytics = next
    this.save()
    return this.analytics()
  }

  know(): KnowPrefs {
    return { ...this.data.ui.know }
  }
  setKnow(patch: Partial<KnowPrefs>): KnowPrefs {
    const next = { ...this.data.ui.know }
    if (typeof patch.autoCards === 'boolean') next.autoCards = patch.autoCards
    if (
      typeof patch.port === 'number' &&
      Number.isInteger(patch.port) &&
      patch.port >= 1024 &&
      patch.port <= 65535
    )
      next.port = patch.port
    this.data.ui.know = next
    this.save()
    return this.know()
  }

  zoomLevel(): number {
    return this.data.ui.zoomLevel
  }
  setZoomLevel(level: number): void {
    if (!Number.isFinite(level) || Math.abs(level) > 5) return
    this.data.ui.zoomLevel = Math.round(level * 2) / 2
    this.save()
  }

  // ---- feature 007: unified prefs ----
  prefs(): HydraPrefs {
    return structuredClone(this.data.ui)
  }
  /** Validates each patched field against the current value (bad fields are ignored, not reset). */
  setPrefs(patch: PrefsPatch): HydraPrefs {
    this.data.ui = validatePrefs(patch, this.data.ui)
    this.save()
    return this.prefs()
  }

  paneOrder(): string[] {
    return [...this.data.ui.paneOrder]
  }

  setPaneOrder(order: string[]): void {
    this.data.ui.paneOrder = [...order]
    this.save()
  }
}
