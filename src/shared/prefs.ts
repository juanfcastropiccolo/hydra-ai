// Feature 007: every user preference in one place — types, defaults and pure validators shared by
// main (ProjectStore) and renderer (Config view). No Node/DOM imports.
//
// Validation contract: `validateX(raw, base)` returns a complete section; each field takes the raw
// value when valid, otherwise the field from `base` (defaults on load, the current value on set).
// That is what lets `setPrefs` reject a bad field without resetting the others.
import type { AnalyticsPrefs, AnalyticsRange, CenterView, ModelPricing } from './analytics/types'
import type { KnowPrefs } from './know/types'
import {
  isProjectColor,
  type FileTreePrefs,
  type HydraFile,
  type ImportContextPrefs,
  type ProjectColor
} from './types'

// ---- sections -------------------------------------------------------------------------------

export interface ProfilePrefs {
  name: string
  /** 1–3 chars; empty → derived from name. */
  initials: string
}
export interface AppearancePrefs {
  /** 10–20 px, applied live to every terminal. */
  terminalFontSize: number
  accent: ProjectColor
}
export type SessionEffort = '' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type SessionPermissionMode = '' | 'acceptEdits' | 'auto' | 'plan' | 'bypassPermissions'
export interface SessionPrefs {
  /** '' = CLI default. Passed as `--model`. */
  model: string
  effort: SessionEffort
  permissionMode: SessionPermissionMode
  /** Placeholders: {project} {n} {date}. */
  namePattern: string
  confirmStopWorking: boolean
}

export interface HydraPrefs {
  hiddenSessionIds: string[]
  paneOrder: string[]
  sessionNames: Record<string, string>
  fileTree: FileTreePrefs
  importContext: ImportContextPrefs
  centerView: CenterView
  analytics: AnalyticsPrefs
  know: KnowPrefs
  zoomLevel: number
  profile: ProfilePrefs
  appearance: AppearancePrefs
  sessions: SessionPrefs
}

/** What the renderer may patch: any subset of sections, each a partial. */
export type PrefsPatch = {
  [K in keyof HydraPrefs]?: HydraPrefs[K] extends object
    ? HydraPrefs[K] extends unknown[]
      ? HydraPrefs[K]
      : Partial<HydraPrefs[K]>
    : HydraPrefs[K]
}

export const EFFORTS: SessionEffort[] = ['', 'low', 'medium', 'high', 'xhigh', 'max']
export const PERMISSION_MODES: SessionPermissionMode[] = [
  '',
  'acceptEdits',
  'auto',
  'plan',
  'bypassPermissions'
]
export const FONT_MIN = 10
export const FONT_MAX = 20
export const FILE_TREE_MIN_WIDTH = 200
export const DEFAULT_NAME_PATTERN = '{project}-{n}'

export function defaultPrefs(userName = ''): HydraPrefs {
  const name = prettifyUserName(userName)
  return {
    hiddenSessionIds: [],
    paneOrder: [],
    sessionNames: {},
    fileTree: { open: false, width: 300, collapsed: false },
    importContext: { model: 'haiku' },
    centerView: 'sessions',
    analytics: { range: '7d', pricing: {} },
    know: { autoCards: true, port: 4855 },
    zoomLevel: -1,
    profile: { name, initials: deriveInitials(name) },
    appearance: { terminalFontSize: 13, accent: 'green' },
    sessions: {
      model: '',
      effort: '',
      permissionMode: '',
      namePattern: DEFAULT_NAME_PATTERN,
      confirmStopWorking: true
    }
  }
}

/** A fresh hydra.json (lives here, not in types.ts, to avoid an import cycle at module init). */
export const emptyHydraFile = (userName = ''): HydraFile => ({
  version: 1,
  projects: [],
  ui: defaultPrefs(userName)
})

/** 'juanfcastropiccolo' → 'Juanfcastropiccolo'; 'juan.castro' → 'Juan Castro'. */
export function prettifyUserName(u: string): string {
  return u
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** 'Juan Castro' → 'JC'; 'Juan' → 'JU'; '' → '?'. Always 1–3 chars. */
export function deriveInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  const s =
    words.length === 1
      ? words[0]!.slice(0, 2)
      : words
          .slice(0, 3)
          .map((w) => w.charAt(0))
          .join('')
  return s.toUpperCase()
}

// ---- validators ------------------------------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const strs = (x: unknown): string[] =>
  Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function validRange(v: unknown): AnalyticsRange | null {
  if (v === 'today' || v === '7d' || v === '30d' || v === 'all') return v
  if (isRecord(v) && typeof v.from === 'string' && typeof v.to === 'string')
    if (DATE_RE.test(v.from) && DATE_RE.test(v.to) && v.from <= v.to)
      return { from: v.from, to: v.to }
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

export function validateFileTree(raw: unknown, base: FileTreePrefs): FileTreePrefs {
  const r = isRecord(raw) ? raw : {}
  return {
    open: typeof r.open === 'boolean' ? r.open : base.open,
    width:
      typeof r.width === 'number' && Number.isFinite(r.width) && r.width >= FILE_TREE_MIN_WIDTH
        ? Math.round(r.width)
        : base.width,
    collapsed: typeof r.collapsed === 'boolean' ? r.collapsed : base.collapsed
  }
}
export function validateImportContext(raw: unknown, base: ImportContextPrefs): ImportContextPrefs {
  const r = isRecord(raw) ? raw : {}
  return { model: typeof r.model === 'string' && r.model.trim() ? r.model.trim() : base.model }
}
export function validateCenterView(raw: unknown, base: CenterView): CenterView {
  return raw === 'sessions' || raw === 'analytics' || raw === 'graph' || raw === 'config'
    ? raw
    : base
}
export function validateAnalytics(raw: unknown, base: AnalyticsPrefs): AnalyticsPrefs {
  const r = isRecord(raw) ? raw : {}
  return {
    range: r.range === undefined ? base.range : (validRange(r.range) ?? base.range),
    pricing: r.pricing === undefined ? base.pricing : validPricing(r.pricing)
  }
}
const validPort = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1024 && v <= 65535
export function validateKnow(raw: unknown, base: KnowPrefs): KnowPrefs {
  const r = isRecord(raw) ? raw : {}
  const out: KnowPrefs = {
    autoCards: typeof r.autoCards === 'boolean' ? r.autoCards : base.autoCards,
    port: validPort(r.port) ? r.port : base.port
  }
  const budget = r.maxBudgetUsd === undefined ? base.maxBudgetUsd : r.maxBudgetUsd
  if (typeof budget === 'number' && Number.isFinite(budget) && budget > 0) out.maxBudgetUsd = budget
  return out
}
export function validateZoomLevel(raw: unknown, base: number): number {
  return typeof raw === 'number' && Number.isFinite(raw) && Math.abs(raw) <= 5
    ? Math.round(raw * 2) / 2
    : base
}
export function validateProfile(raw: unknown, base: ProfilePrefs): ProfilePrefs {
  const r = isRecord(raw) ? raw : {}
  const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 60) : base.name
  const rawInitials = typeof r.initials === 'string' ? r.initials.trim() : base.initials
  const initials =
    rawInitials.length >= 1 && rawInitials.length <= 3
      ? rawInitials.toUpperCase()
      : rawInitials === ''
        ? deriveInitials(name)
        : base.initials
  return { name, initials }
}
export function validateAppearance(raw: unknown, base: AppearancePrefs): AppearancePrefs {
  const r = isRecord(raw) ? raw : {}
  return {
    terminalFontSize:
      typeof r.terminalFontSize === 'number' &&
      Number.isFinite(r.terminalFontSize) &&
      r.terminalFontSize >= FONT_MIN &&
      r.terminalFontSize <= FONT_MAX
        ? Math.round(r.terminalFontSize)
        : base.terminalFontSize,
    accent: isProjectColor(r.accent) ? r.accent : base.accent
  }
}
export function validateSessions(raw: unknown, base: SessionPrefs): SessionPrefs {
  const r = isRecord(raw) ? raw : {}
  return {
    model: typeof r.model === 'string' ? r.model.trim().slice(0, 80) : base.model,
    effort: EFFORTS.includes(r.effort as SessionEffort) ? (r.effort as SessionEffort) : base.effort,
    permissionMode: PERMISSION_MODES.includes(r.permissionMode as SessionPermissionMode)
      ? (r.permissionMode as SessionPermissionMode)
      : base.permissionMode,
    namePattern:
      typeof r.namePattern === 'string' && r.namePattern.trim() && r.namePattern.includes('{n}')
        ? r.namePattern.trim().slice(0, 60)
        : base.namePattern,
    confirmStopWorking:
      typeof r.confirmStopWorking === 'boolean' ? r.confirmStopWorking : base.confirmStopWorking
  }
}

/** Full validation of a raw `ui` object against `base` (defaults on load, current on set). */
export function validatePrefs(raw: unknown, base: HydraPrefs): HydraPrefs {
  const r = isRecord(raw) ? raw : {}
  const names: Record<string, string> = {}
  if (isRecord(r.sessionNames))
    for (const [k, v] of Object.entries(r.sessionNames))
      if (typeof v === 'string' && v.trim()) names[k] = v
  return {
    hiddenSessionIds:
      r.hiddenSessionIds === undefined ? base.hiddenSessionIds : strs(r.hiddenSessionIds),
    paneOrder: r.paneOrder === undefined ? base.paneOrder : strs(r.paneOrder),
    sessionNames: r.sessionNames === undefined ? base.sessionNames : names,
    fileTree: validateFileTree(r.fileTree, base.fileTree),
    importContext: validateImportContext(r.importContext, base.importContext),
    centerView: validateCenterView(r.centerView, base.centerView),
    analytics: validateAnalytics(r.analytics, base.analytics),
    know: validateKnow(r.know, base.know),
    zoomLevel: validateZoomLevel(r.zoomLevel, base.zoomLevel),
    profile: validateProfile(r.profile, base.profile),
    appearance: validateAppearance(r.appearance, base.appearance),
    sessions: validateSessions(r.sessions, base.sessions)
  }
}

/** Suggested session name from a pattern. `{n}` is required by validation. */
export function renderNamePattern(
  pattern: string,
  vars: { project: string; n: number; date: string }
): string {
  return pattern
    .replace(/\{project\}/g, vars.project)
    .replace(/\{n\}/g, String(vars.n))
    .replace(/\{date\}/g, vars.date)
}
