import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GitService } from './git-service'

let root = ''
beforeEach(() => (root = realpathSync(mkdtempSync(join(tmpdir(), 'hydra-git-')))))
afterEach(() => rmSync(root, { recursive: true, force: true }))
const git = (args: string[], cwd = root): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8' })

describe('GitService (integration, real git)', () => {
  it('reports M/U/D/ignored for a temp repo, from a subdir too', async () => {
    git(['init', '-q'])
    git(['config', 'user.email', 'a@b.c'])
    git(['config', 'user.name', 't'])
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src/a.ts'), 'a')
    writeFileSync(join(root, 'old.ts'), 'o')
    writeFileSync(join(root, '.gitignore'), 'dist/\n')
    git(['add', '-A'])
    git(['commit', '-qm', 'init'])
    writeFileSync(join(root, 'src/a.ts'), 'changed')
    rmSync(join(root, 'old.ts'))
    writeFileSync(join(root, 'new.ts'), 'n')
    mkdirSync(join(root, 'dist'))
    writeFileSync(join(root, 'dist/b.js'), '')
    const g = new GitService({ env: process.env })
    const r = await g.status(join(root, 'src'))
    expect(r.root).toBe(root)
    expect(r.statuses).toEqual({
      'src/a.ts': 'modified',
      'old.ts': 'deleted',
      'new.ts': 'untracked',
      'dist/': 'ignored'
    })
  })
  it('folder without git → root null, no error', async () => {
    const g = new GitService({ env: process.env })
    expect(await g.status(root)).toEqual({ root: null, statuses: {} })
  })
  it('git missing from PATH → root null, no throw', async () => {
    const g = new GitService({ env: { PATH: '/nonexistent' } })
    expect(await g.status(root)).toEqual({ root: null, statuses: {} })
  })
})
