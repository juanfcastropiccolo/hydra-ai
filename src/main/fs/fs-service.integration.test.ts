import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  chmodSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FsService, type WatchEvent } from './fs-service'

let root = ''
let svc: FsService
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'hydra-fs-')))
  svc = new FsService(150)
})
afterEach(() => {
  svc.dispose()
  rmSync(root, { recursive: true, force: true })
})

describe('FsService.list (integration)', () => {
  it('lists a fixture tree: hides .git, detects symlinks, folders first', async () => {
    mkdirSync(join(root, '.git'))
    mkdirSync(join(root, 'src'))
    mkdirSync(join(root, 'node_modules'))
    writeFileSync(join(root, 'src/index.ts'), '')
    writeFileSync(join(root, 'README.md'), '')
    writeFileSync(join(root, '.gitignore'), '')
    symlinkSync(join(root, 'src'), join(root, 'link-src'))
    symlinkSync(join(root, 'nope'), join(root, 'dangling'))
    const e = await svc.list(root)
    expect(e.map((x) => x.name)).toEqual([
      'link-src',
      'node_modules',
      'src',
      '.gitignore',
      'dangling',
      'README.md'
    ])
    expect(e.find((x) => x.name === 'link-src')).toEqual({
      name: 'link-src',
      kind: 'symlink',
      symlinkKind: 'dir'
    })
    expect(e.find((x) => x.name === 'dangling')).toEqual({ name: 'dangling', kind: 'symlink' })
  })
  it('listRecursive skips node_modules/.git and given dirs, bounded', async () => {
    mkdirSync(join(root, 'node_modules/x'), { recursive: true })
    mkdirSync(join(root, 'dist'))
    mkdirSync(join(root, 'src/deep'), { recursive: true })
    writeFileSync(join(root, 'node_modules/x/i.js'), '')
    writeFileSync(join(root, 'dist/b.js'), '')
    writeFileSync(join(root, 'src/deep/a.ts'), '')
    const all = await svc.listRecursive(root, { skipDirs: new Set(['dist/']) })
    expect(all.sort()).toEqual(['src/', 'src/deep/', 'src/deep/a.ts'])
    expect(await svc.listRecursive(root, { limit: 1 })).toHaveLength(1)
  })
  it('an unreadable directory rejects clearly (caller shows the error)', async () => {
    const d = join(root, 'locked')
    mkdirSync(d)
    chmodSync(d, 0o000)
    await expect(svc.list(d)).rejects.toThrow(/EACCES|EPERM/)
    chmodSync(d, 0o755)
  })
})

describe('FsService.watch (integration, FSEvents)', () => {
  const collect = (): {
    events: WatchEvent[]
    waitFor: (n: number, ms: number) => Promise<void>
  } => {
    const events: WatchEvent[] = []
    svc.on('changed', (e) => events.push(e))
    return {
      events,
      waitFor: async (n, ms) => {
        const t0 = Date.now()
        while (events.length < n && Date.now() - t0 < ms)
          await new Promise((r) => setTimeout(r, 25))
      }
    }
  }
  it('reports create, rename and delete as parent-dir changes', async () => {
    mkdirSync(join(root, 'src'))
    svc.watch(root)
    await new Promise((r) => setTimeout(r, 200)) // let FSEvents settle
    const c = collect()
    writeFileSync(join(root, 'src/a.ts'), 'x')
    await c.waitFor(1, 3000)
    expect(c.events.length).toBeGreaterThanOrEqual(1)
    const dirs = c.events.flatMap((e) => (e.all ? ['ALL'] : e.dirs))
    expect(dirs.some((d) => d === join(root, 'src') || d === 'ALL')).toBe(true)
    c.events.length = 0
    renameSync(join(root, 'src/a.ts'), join(root, 'b.ts'))
    await c.waitFor(1, 3000)
    expect(c.events.length).toBeGreaterThanOrEqual(1)
    c.events.length = 0
    rmSync(join(root, 'b.ts'))
    await c.waitFor(1, 3000)
    expect(c.events.length).toBeGreaterThanOrEqual(1)
  }, 15_000)
  it('coalesces a burst of 2000 files into few events, consistent within 2 s', async () => {
    mkdirSync(join(root, 'many'))
    svc.watch(root)
    await new Promise((r) => setTimeout(r, 200))
    const c = collect()
    const t0 = Date.now()
    for (let i = 0; i < 2000; i++) writeFileSync(join(root, 'many', `f${i}.txt`), '')
    await new Promise((r) => setTimeout(r, 2000))
    expect(c.events.length).toBeGreaterThanOrEqual(1)
    expect(c.events.length).toBeLessThanOrEqual(8)
    const last = c.events[c.events.length - 1]!
    expect(last.all || last.dirs.includes(join(root, 'many'))).toBe(true)
    const listed = await svc.list(join(root, 'many'))
    expect(listed).toHaveLength(2000)
    expect(Date.now() - t0).toBeLessThan(6000)
  }, 20_000)
  it('unwatch stops events; dispose clears all', async () => {
    svc.watch(root)
    expect(svc.watching()).toEqual([root])
    svc.unwatch(root)
    expect(svc.watching()).toEqual([])
    svc.watch(root)
    svc.dispose()
    expect(svc.watching()).toEqual([])
  })
})
