import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { folderStatus, isIgnored, parseGitPorcelain, statusFromCodes } from './porcelain'

const fx = (n: string): Buffer => readFileSync(join(__dirname, '../../../test/fixtures/git', n))

describe('parseGitPorcelain (real capture)', () => {
  it('parses M/D/??/!!/R with spaces in paths', () => {
    const r = parseGitPorcelain(fx('status-mixed.bin'))
    expect(r).toEqual({
      'renombrado.ts': 'renamed',
      'renombrar.ts': 'deleted',
      'src/a.ts': 'modified',
      'viejo.ts': 'deleted',
      'dir con espacio/y con espacio.ts': 'untracked',
      'nuevo.ts': 'untracked',
      'src/nuevo/n.ts': 'untracked',
      'dist/': 'ignored'
    })
  })
  it('clean repo → {}', () => {
    expect(parseGitPorcelain(fx('status-clean.bin'))).toEqual({})
    expect(parseGitPorcelain('')).toEqual({})
  })
  it('added, conflicts, type change', () => {
    expect(parseGitPorcelain('A  new.ts\0UU both.ts\0AA aa.ts\0 T typ.ts\0')).toEqual({
      'new.ts': 'added',
      'both.ts': 'conflict',
      'aa.ts': 'conflict',
      'typ.ts': 'modified'
    })
  })
  it('copy keeps source untouched', () => {
    expect(parseGitPorcelain('C  copy.ts\0orig.ts\0')).toEqual({ 'copy.ts': 'renamed' })
  })
  it('ignores garbage fields', () => {
    expect(parseGitPorcelain('xx\0   \0?? ok.ts\0')).toEqual({ 'ok.ts': 'untracked' })
  })
})

describe('statusFromCodes', () => {
  it('maps unknown to null', () => {
    expect(statusFromCodes(' ', ' ')).toBeNull()
  })
})

describe('folderStatus / isIgnored', () => {
  const st = parseGitPorcelain(fx('status-mixed.bin'))
  it('derives the strongest status among descendants', () => {
    expect(folderStatus('src', st)).toBe('modified')
    expect(folderStatus('src/nuevo', st)).toBe('untracked')
    expect(folderStatus('dir con espacio', st)).toBe('untracked')
    expect(folderStatus('', st)).toBe('deleted')
    expect(folderStatus('nothing', st)).toBeNull()
  })
  it('ignored dirs do not decorate parents, but are themselves ignored', () => {
    expect(folderStatus('dist', st)).toBe('ignored')
    expect(isIgnored('dist', st)).toBe(true)
    expect(isIgnored('dist/bundle.js', st)).toBe(true)
    expect(isIgnored('dist/deep/x.js', st)).toBe(true)
    expect(isIgnored('src/a.ts', st)).toBe(false)
  })
})
