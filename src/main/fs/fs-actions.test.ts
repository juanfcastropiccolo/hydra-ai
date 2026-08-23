import { describe, expect, it } from 'vitest'
import { buildContextMenuTemplate, resolveEditor } from './fs-actions'

describe('resolveEditor', () => {
  it('prefers `code` on PATH', () => {
    const r = resolveEditor({
      env: { PATH: '/a:/b', VISUAL: 'vim' },
      isExecutable: (p) => p === '/b/code'
    })
    expect(r).toEqual({ kind: 'code', command: '/b/code', args: ['--goto'] })
  })
  it('falls back to the VS Code app bundle binary', () => {
    const r = resolveEditor({
      env: { PATH: '/x' },
      isExecutable: (p) => p.includes('Visual Studio Code.app')
    })
    expect(r.kind).toBe('code')
  })
  it('uses $VISUAL/$EDITOR only if it is not a terminal editor', () => {
    expect(
      resolveEditor({ env: { PATH: '', VISUAL: 'subl -w' }, isExecutable: () => false })
    ).toEqual({ kind: 'env', command: 'subl', args: ['-w'] })
    expect(
      resolveEditor({ env: { PATH: '', EDITOR: 'vim' }, isExecutable: () => false }).kind
    ).toBe('default')
    expect(
      resolveEditor({ env: { PATH: '', EDITOR: '/usr/bin/nvim' }, isExecutable: () => false }).kind
    ).toBe('default')
    expect(
      resolveEditor({ env: { PATH: '', EDITOR: 'emacs -nw' }, isExecutable: () => false }).kind
    ).toBe('default')
  })
  it('default when nothing is configured', () => {
    expect(resolveEditor({ env: {}, isExecutable: () => false })).toEqual({ kind: 'default' })
  })
})

describe('buildContextMenuTemplate', () => {
  it('file: open, reveal, copy abs/rel, editor; no terminal-here', () => {
    const t = buildContextMenuTemplate({ isDir: false, hasEditor: true })
    expect(t.filter((i) => i.action).map((i) => i.action)).toEqual([
      'open',
      'reveal',
      'copyAbs',
      'copyRel',
      'openEditor'
    ])
  })
  it('dir: adds "Abrir terminal acá"; editor label reflects availability', () => {
    const t = buildContextMenuTemplate({ isDir: true, hasEditor: false })
    expect(t.map((i) => i.action).filter(Boolean)).toContain('terminalHere')
    expect(t.find((i) => i.action === 'openEditor')?.label).toMatch(/por defecto/)
  })
})
