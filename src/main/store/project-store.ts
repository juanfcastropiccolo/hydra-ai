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
  DEFAULT_FILE_TREE_PREFS,
  DEFAULT_IMPORT_CONTEXT_PREFS,
  EMPTY_HYDRA_FILE,
  FILE_TREE_MIN_WIDTH,
  type FileTreePrefs,
  type HydraFile,
  type ImportContextPrefs,
  type Project
} from '@shared/types'
import {
  DEFAULT_ANALYTICS_PREFS,
  type AnalyticsPrefs,
  type AnalyticsRange,
  type CenterView,
  type ModelPricing
} from '@shared/analytics/types'
import { DEFAULT_KNOW_PREFS, type KnowPrefs } from '@shared/know/types'

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
  const names: Record<string, string> = {}
  if (isRecord(ui.sessionNames)) {
    for (const [k, val] of Object.entries(ui.sessionNames)) {
      if (typeof val === 'string' && val.trim()) names[k] = val
    }
  }
  const ft = isRecord(ui.fileTree) ? ui.fileTree : {}
  const fileTree: FileTreePrefs = {
    open: typeof ft.open === 'boolean' ? ft.open : DEFAULT_FILE_TREE_PREFS.open,
    width:
      typeof ft.width === 'number' && Number.isFinite(ft.width) && ft.width >= FILE_TREE_MIN_WIDTH
        ? Math.round(ft.width)
        : DEFAULT_FILE_TREE_PREFS.width,
    collapsed: typeof ft.collapsed === 'boolean' ? ft.collapsed : DEFAULT_FILE_TREE_PREFS.collapsed
  }
  const ic = isRecord(ui.importContext) ? ui.importContext : {}
  const importContext: ImportContextPrefs = {
    model:
      typeof ic.model === 'string' && ic.model.trim()
        ? ic.model.trim()
        : DEFAULT_IMPORT_CONTEXT_PREFS.model
  }
  const centerView: CenterView =
    ui.centerView === 'analytics' || ui.centerView === 'graph' ? ui.centerView : 'sessions'
  const an = isRecord(ui.analytics) ? ui.analytics : {}
  const analytics: AnalyticsPrefs = {
    range: validRange(an.range) ?? DEFAULT_ANALYTICS_PREFS.range,
    pricing: validPricing(an.pricing)
  }
  const kn = isRecord(ui.know) ? ui.know : {}
  const know: KnowPrefs = {
    autoCards: typeof kn.autoCards === 'boolean' ? kn.autoCards : DEFAULT_KNOW_PREFS.autoCards,
    port:
      typeof kn.port === 'number' &&
      Number.isInteger(kn.port) &&
      kn.port >= 1024 &&
      kn.port <= 65535
        ? kn.port
        : DEFAULT_KNOW_PREFS.port
  }
  return {
    version: 1,
    projects,
    ui: {
      hiddenSessionIds: strs(ui.hiddenSessionIds),
      paneOrder: strs(ui.paneOrder),
      sessionNames: names,
      fileTree,
      importContext,
      centerView,
      analytics,
      know
    }
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export function validRange(v: unknown): AnalyticsRange | null {
  if (v === 'today' || v === '7d' || v === '30d' || v === 'all') return v
  if (isRecord(v) && typeof v.from === 'string' && typeof v.to === 'string') {
    if (DATE_RE.test(v.from) && DATE_RE.test(v.to) && v.from <= v.to)
      return { from: v.from, to: v.to }
  }
  return null
}
const nonNeg = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0
export function validPricing(v: unknown): Record<string, ModelPricing> {
  const out: Record<string, ModelPricing> = {}
  if (!isRecord(v)) return out
  for (const [model, p] of Object.entries(v)) {
    if (!model.trim() || !isRecord(p)) continue
    if (nonNeg(p.input) && nonNeg(p.output) && nonNeg(p.cacheWrite) && nonNeg(p.cacheRead))
      out[model] = {
        input: p.input,
        output: p.output,
        cacheWrite: p.cacheWrite,
        cacheRead: p.cacheRead
      }
  }
  return out
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

  paneOrder(): string[] {
    return [...this.data.ui.paneOrder]
  }

  setPaneOrder(order: string[]): void {
    this.data.ui.paneOrder = [...order]
    this.save()
  }
}
