import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectStore, validateHydraFile } from './project-store'

let dir = ''
let file = ''
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hydra-store-'))
  file = join(dir, 'nested', 'hydra.json')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const mk = (exists?: (p: string) => boolean): ProjectStore =>
  new ProjectStore({
    filePath: file,
    exists: exists ?? (() => true),
    now: () => '2026-08-23T00:00:00Z',
    uuid: (() => {
      let n = 0
      return () => `id-${++n}`
    })()
  })

describe('ProjectStore', () => {
  it('starts empty when the file does not exist; creates dirs and writes atomically on save', () => {
    const s = mk()
    expect(s.load()).toEqual({
      version: 1,
      projects: [],
      ui: {
        hiddenSessionIds: [],
        paneOrder: [],
        sessionNames: {},
        fileTree: { open: false, width: 300, collapsed: false },
        importContext: { model: 'haiku' },
        centerView: 'sessions',
        analytics: { range: '7d', pricing: {} },
        know: { autoCards: true, port: 4855 },
        zoomLevel: -1,
        profile: { name: '', initials: '?' },
        appearance: { terminalFontSize: 13, accent: 'green' },
        sessions: {
          model: '',
          effort: '',
          permissionMode: '',
          namePattern: '{project}-{n}',
          confirmStopWorking: true
        }
      }
    })
    s.addProject({ path: '/Users/u/foo/' })
    expect(existsSync(file)).toBe(true)
    expect(existsSync(file + '.tmp')).toBe(false)
    expect(JSON.parse(readFileSync(file, 'utf8')).projects[0]).toMatchObject({
      id: 'id-1',
      name: 'foo',
      path: '/Users/u/foo',
      addedAt: '2026-08-23T00:00:00Z'
    })
  })
  it('persists across instances (add, rename, remove, hidden, order)', () => {
    const a = mk()
    a.load()
    const p = a.addProject({ path: '/p/one', name: '  Uno ' })
    expect(p.name).toBe('Uno')
    a.renameProject(p.id, 'Dos')
    a.setHidden('S1', true)
    a.setPaneOrder(['S2', 'S1'])
    a.setSessionName('S1', '  Mi sesión ')
    const b = mk()
    b.load()
    expect(b.listProjects()).toEqual([
      { id: 'id-1', name: 'Dos', path: '/p/one', addedAt: '2026-08-23T00:00:00Z', missing: false }
    ])
    expect(b.hiddenSessionIds()).toEqual(['S1'])
    expect(b.paneOrder()).toEqual(['S2', 'S1'])
    expect(b.sessionNames()).toEqual({ S1: 'Mi sesión' })
    expect(b.fileTree()).toEqual({ open: false, width: 300, collapsed: false })
    expect(b.setFileTree({ open: true, width: 420.4 })).toEqual({
      open: true,
      width: 420,
      collapsed: false
    })
    expect(b.setFileTree({ width: 10 })).toEqual({ open: true, width: 420, collapsed: false }) // below min → keep
    expect(b.setFileTree({ collapsed: true })).toEqual({ open: true, width: 420, collapsed: true })
    expect(mk().load().ui.fileTree).toEqual({ open: true, width: 420, collapsed: true })
    // feature 004: import-context prefs
    expect(b.importContext()).toEqual({ model: 'haiku' })
    expect(b.setImportContext({ model: ' sonnet ' })).toEqual({ model: 'sonnet' })
    expect(b.setImportContext({ model: '' })).toEqual({ model: 'sonnet' }) // empty → keep
    expect(b.setImportContext({})).toEqual({ model: 'sonnet' })
    expect(mk().load().ui.importContext).toEqual({ model: 'sonnet' })
    // feature 005: center view + analytics prefs
    expect(b.centerView()).toBe('sessions')
    expect(b.setCenterView('analytics')).toBe('analytics')
    expect(b.analytics()).toEqual({ range: '7d', pricing: {} })
    expect(b.setAnalytics({ range: '30d' })).toEqual({ range: '30d', pricing: {} })
    expect(b.setAnalytics({ range: { from: '2026-08-01', to: '2026-08-23' } }).range).toEqual({
      from: '2026-08-01',
      to: '2026-08-23'
    })
    expect(b.setAnalytics({ range: { from: '2026-09-01', to: '2026-08-01' } }).range).toEqual({
      from: '2026-08-01',
      to: '2026-08-23'
    }) // inverted → ignored
    expect(
      b.setAnalytics({
        pricing: {
          'claude-x': { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
          bad: { input: -1, output: 5, cacheWrite: 1, cacheRead: 1 }
        }
      }).pricing
    ).toEqual({ 'claude-x': { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 } })
    // feature 006
    expect(b.know()).toEqual({ autoCards: true, port: 4855 })
    expect(b.setKnow({ autoCards: false, port: 5001 })).toEqual({ autoCards: false, port: 5001 })
    expect(b.setKnow({ port: 80 })).toEqual({ autoCards: false, port: 5001 }) // <1024 → keep
    expect(b.setCenterView('graph')).toBe('graph')
    const reloaded = mk().load().ui
    expect(reloaded.centerView).toBe('graph')
    expect(reloaded.know).toEqual({ autoCards: false, port: 5001 })
    b.setZoomLevel(-0.5)
    b.setZoomLevel(99) // ignored
    expect(mk().load().ui.zoomLevel).toBe(-0.5)
    expect(reloaded.analytics.pricing['claude-x']?.output).toBe(5)
    b.setSessionName('S1', '')
    expect(b.sessionNames()).toEqual({})
    b.setHidden('S1', false)
    b.removeProject('id-1')
    const c = mk()
    c.load()
    expect(c.listProjects()).toEqual([])
    expect(c.hiddenSessionIds()).toEqual([])
  })
  it('adding the same path twice returns the existing project', () => {
    const s = mk()
    s.load()
    const a = s.addProject({ path: '/p/x' })
    const b = s.addProject({ path: '/p/x/' })
    expect(b.id).toBe(a.id)
    expect(s.listProjects()).toHaveLength(1)
  })
  it('marks projects whose folder is gone as missing', () => {
    const s = mk((p) => p !== '/p/gone')
    s.load()
    s.addProject({ path: '/p/gone' })
    s.addProject({ path: '/p/here' })
    expect(s.listProjects().map((p) => [p.path, p.missing])).toEqual([
      ['/p/gone', true],
      ['/p/here', false]
    ])
  })
  it('rename validates', () => {
    const s = mk()
    s.load()
    expect(() => s.renameProject('nope', 'x')).toThrow(/not found/)
    const p = s.addProject({ path: '/p/x' })
    expect(() => s.renameProject(p.id, '   ')).toThrow(/empty/)
  })
  it('corrupt file → backup + empty state + loadError', () => {
    const s = mk()
    s.load()
    s.addProject({ path: '/p/x' })
    writeFileSync(file, '{ this is not json')
    const t = mk()
    expect(t.load().projects).toEqual([])
    expect(t.loadError).toMatch(/unreadable/)
    expect(
      readdirSync(join(dir, 'nested')).some((f) => /hydra\.json\.corrupt-\d+\.bak$/.test(f))
    ).toBe(true)
  })
  it('schema mismatch (wrong version) is treated as corrupt', () => {
    const s = mk()
    s.load()
    s.save()
    writeFileSync(file, JSON.stringify({ version: 99, projects: [] }))
    const t = mk()
    t.load()
    expect(t.loadError).toMatch(/schema mismatch/)
  })
})

describe('validateHydraFile', () => {
  it('coerces partial/odd shapes and drops bad projects', () => {
    expect(
      validateHydraFile({
        version: 1,
        projects: [{ id: 'a', name: 'A', path: '/a' }, { id: 1 }, 'x'],
        ui: { hiddenSessionIds: ['s', 3], paneOrder: 'nope' }
      })
    ).toEqual({
      version: 1,
      projects: [{ id: 'a', name: 'A', path: '/a', addedAt: '' }],
      ui: {
        hiddenSessionIds: ['s'],
        paneOrder: [],
        sessionNames: {},
        fileTree: { open: false, width: 300, collapsed: false },
        importContext: { model: 'haiku' },
        centerView: 'sessions',
        analytics: { range: '7d', pricing: {} },
        know: { autoCards: true, port: 4855 },
        zoomLevel: -1,
        profile: { name: '', initials: '?' },
        appearance: { terminalFontSize: 13, accent: 'green' },
        sessions: {
          model: '',
          effort: '',
          permissionMode: '',
          namePattern: '{project}-{n}',
          confirmStopWorking: true
        }
      }
    })
    expect(
      validateHydraFile({
        version: 1,
        projects: [],
        ui: {
          centerView: 'nope',
          analytics: { range: 'weird', pricing: 3 },
          know: { autoCards: 'x', port: -1 }
        }
      })?.ui
    ).toMatchObject({
      centerView: 'sessions',
      analytics: { range: '7d', pricing: {} },
      know: { autoCards: true, port: 4855 }
    })
    expect(
      validateHydraFile({ version: 1, projects: [], ui: { fileTree: { open: 'yes', width: -5 } } })
        ?.ui.fileTree
    ).toEqual({ open: false, width: 300, collapsed: false })
    expect(validateHydraFile({ version: 1, projects: [], ui: {} })?.ui.importContext).toEqual({
      model: 'haiku'
    })
    expect(
      validateHydraFile({ version: 1, projects: [], ui: { importContext: { model: 42 } } })?.ui
        .importContext
    ).toEqual({ model: 'haiku' })
    expect(
      validateHydraFile({ version: 1, projects: [], ui: { importContext: { model: ' opus ' } } })
        ?.ui.importContext
    ).toEqual({ model: 'opus' })
    expect(validateHydraFile({ version: 1 })).toBeNull()
    expect(validateHydraFile([])).toBeNull()
  })
})

describe('project colors', () => {
  it('sets, clears, validates and persists the accent color', () => {
    const a = mk()
    a.load()
    const p = a.addProject({ path: '/p/color' })
    expect(a.setProjectColor(p.id, 'violet').color).toBe('violet')
    expect(mk().load().projects[0]?.color).toBe('violet')
    expect(() => a.setProjectColor(p.id, 'pink' as never)).toThrow(/unknown color/)
    expect(a.setProjectColor(p.id, null).color).toBeUndefined()
    expect(
      validateHydraFile({
        version: 1,
        projects: [{ id: 'x', name: 'X', path: '/x', color: 'nope' }],
        ui: {}
      })?.projects[0]?.color
    ).toBeUndefined()
  })
})

describe('unified prefs (007)', () => {
  it('seeds the profile from the OS user name and validates patches field by field', () => {
    const s = new ProjectStore({ filePath: file, defaultUserName: 'juan.castro' })
    s.load()
    expect(s.prefs().profile).toEqual({ name: 'Juan Castro', initials: 'JC' })
    const next = s.setPrefs({
      appearance: { terminalFontSize: 16, accent: 'nope' as never },
      sessions: {
        model: 'haiku',
        effort: 'low',
        permissionMode: 'weird' as never,
        namePattern: 'sin-n'
      },
      know: { autoCards: false, port: 80, maxBudgetUsd: 0.5 },
      profile: { initials: '' }
    })
    expect(next.appearance).toEqual({ terminalFontSize: 16, accent: 'green' }) // bad accent ignored
    expect(next.sessions).toMatchObject({
      model: 'haiku',
      effort: 'low',
      permissionMode: '',
      namePattern: '{project}-{n}'
    })
    expect(next.know).toEqual({ autoCards: false, port: 4855, maxBudgetUsd: 0.5 }) // bad port ignored
    expect(next.profile).toEqual({ name: 'Juan Castro', initials: 'JC' }) // empty initials → derived
    expect(new ProjectStore({ filePath: file }).load().ui.sessions.effort).toBe('low') // persisted
  })
})
