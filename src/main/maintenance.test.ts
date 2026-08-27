import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { exportHydraJson, fileInfo, importHydraJson } from './maintenance'

let dir = ''
beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'hydra-maint-'))))
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('maintenance file helpers', () => {
  it('export copies, import validates + backs up + replaces', () => {
    const current = join(dir, 'hydra.json')
    writeFileSync(
      current,
      JSON.stringify({
        version: 1,
        projects: [{ id: 'a', name: 'A', path: '/a' }],
        ui: { know: { port: 5000 } }
      })
    )
    const out = join(dir, 'export.json')
    exportHydraJson(current, out)
    expect(JSON.parse(readFileSync(out, 'utf8')).projects).toHaveLength(1)

    const incoming = join(dir, 'in.json')
    writeFileSync(
      incoming,
      JSON.stringify({
        version: 1,
        projects: [
          { id: 'b', name: 'B', path: '/b' },
          { id: 'c', name: 'C', path: '/c' }
        ],
        ui: { zoomLevel: 1 }
      })
    )
    const r = importHydraJson(incoming, current)
    expect(r).toEqual({ backupPath: `${current}.bak`, projects: 2 })
    expect(JSON.parse(readFileSync(`${current}.bak`, 'utf8')).ui.know.port).toBe(5000)
    const now = JSON.parse(readFileSync(current, 'utf8'))
    expect(now.projects.map((p: { id: string }) => p.id)).toEqual(['b', 'c'])
    expect(now.ui.zoomLevel).toBe(1)
    expect(now.ui.know.port).toBe(4855) // normalised with defaults
    expect(fileInfo(current).bytes).toBeGreaterThan(0)
    expect(fileInfo(join(dir, 'nope')).bytes).toBe(0)
  })
  it('rejects invalid JSON, wrong shape and future versions without touching the current file', () => {
    const current = join(dir, 'hydra.json')
    writeFileSync(current, '{"version":1,"projects":[],"ui":{}}')
    const bad = join(dir, 'bad.json')
    writeFileSync(bad, '{not json')
    expect(() => importHydraJson(bad, current)).toThrow(/JSON válido/)
    writeFileSync(bad, JSON.stringify({ hello: 1 }))
    expect(() => importHydraJson(bad, current)).toThrow(/forma de un hydra.json/)
    writeFileSync(bad, JSON.stringify({ version: 2, projects: [], ui: {} }))
    expect(() => importHydraJson(bad, current)).toThrow(/no soportada \(2\)/)
    expect(existsSync(`${current}.bak`)).toBe(false)
    expect(() => exportHydraJson(join(dir, 'missing.json'), join(dir, 'x'))).toThrow(/exportar/)
  })
})
