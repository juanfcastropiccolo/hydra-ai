import { describe, expect, it } from 'vitest'
import { iconFor } from './icon-map'

describe('iconFor', () => {
  it.each([
    ['src', 'dir', 'src'],
    ['tests', 'dir', 'test'],
    ['docs', 'dir', 'docs'],
    ['node_modules', 'dir', 'node_modules'],
    ['.sdd', 'dir', 'config'],
    ['dist', 'dir', 'build'],
    ['resources', 'dir', 'assets'],
    ['whatever', 'dir', 'generic']
  ] as const)('folder %s → %s variant', (name, kind, variant) => {
    expect(iconFor(name, kind).folder).toBe(variant)
  })
  it('folder glyph reflects open state; symlink to dir is a folder', () => {
    expect(iconFor('src', 'dir', { open: true }).glyph).toBe('▾')
    expect(iconFor('src', 'dir').glyph).toBe('▸')
    expect(iconFor('link', 'symlink', { symlinkKind: 'dir' }).folder).toBe('generic')
  })
  it.each([
    ['index.ts', 'TS'],
    ['App.tsx', 'TSX'],
    ['main.js', 'JS'],
    ['data.json', '{}'],
    ['README.md', 'MD'],
    ['readme', 'MD'],
    ['style.css', '#'],
    ['index.html', '<>'],
    ['ci.yml', 'Y'],
    ['run.sh', '$'],
    ['script.py', 'PY'],
    ['lib.rs', 'RS'],
    ['main.go', 'GO'],
    ['logo.png', '▣'],
    ['icon.svg', 'SVG'],
    ['package.json', 'npm'],
    ['tsconfig.json', 'TS'],
    ['.gitignore', 'git'],
    ['.env.local', 'env'],
    ['CLAUDE.md', 'AI'],
    ['foo.test.ts', 'TS✓'],
    ['types.d.ts', 'd.ts'],
    ['Dockerfile', 'dk'],
    ['LICENSE', '§'],
    ['unknown.xyz', '·'],
    ['noext', '·']
  ])('file %s → glyph %s', (name, glyph) => {
    expect(iconFor(name, 'file').glyph).toBe(glyph)
  })
  it('every icon has a color', () => {
    for (const n of ['a.ts', 'b.js', 'c.md', 'd.png', 'e.xyz'])
      expect(iconFor(n, 'file').color).toMatch(/^#/)
  })
})
