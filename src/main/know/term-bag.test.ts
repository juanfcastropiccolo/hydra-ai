import { describe, expect, it } from 'vitest'
import { addToBag, capBag, tokenize } from './term-bag'

describe('tokenize', () => {
  it('handles mixed Spanish/English, accents and stopwords', () => {
    expect(tokenize('El watcher de la sesión no funciona en producción and the fix')).toEqual([
      'watcher',
      'sesion',
      'funciona',
      'produccion',
      'fix'
    ])
  })
  it('keeps paths whole and split, and splits identifiers', () => {
    const t = tokenize(
      'editamos src/main/pty/pty-manager.ts y la clase PtyManager con snake_case_x'
    )
    expect(t).toContain('src/main/pty/pty-manager.ts')
    expect(t).toContain('pty')
    expect(t).toContain('manager')
    expect(t).toContain('editamos')
    expect(t).toContain('snake')
    expect(t).toContain('case')
    expect(t).not.toContain('y')
    const d = tokenize('hydra.json roto')
    expect(d).toContain('hydra.json')
    expect(d).toContain('hydra')
    expect(d).toContain('json')
  })
  it('drops bare numbers, shorts and huge tokens', () => {
    expect(tokenize('42 a x ' + 'z'.repeat(80))).toEqual([])
  })
})

describe('bags', () => {
  it('accumulates with weight and caps by frequency', () => {
    const bag = {}
    addToBag(bag, 'auth login auth', 1)
    addToBag(bag, 'auth', 2)
    expect(bag).toEqual({ auth: 4, login: 1 })
    const big: Record<string, number> = {}
    for (let i = 0; i < 100; i++) big[`term${String(i).padStart(3, '0')}`] = i
    const capped = capBag(big, 10)
    expect(Object.keys(capped)).toHaveLength(10)
    expect(capped['term099']).toBe(99)
    expect(capped['term000']).toBeUndefined()
  })
})
