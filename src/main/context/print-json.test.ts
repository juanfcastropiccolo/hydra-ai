import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parsePrintJson } from './print-json'

const fx = (name: string): string =>
  readFileSync(join(__dirname, '../../../test/fixtures/claude', name), 'utf8')

describe('parsePrintJson', () => {
  it('parses a successful result (fixture captured from claude 2.1.241)', () => {
    const r = parsePrintJson(fx('print-json-ok.json'))
    expect(r).toMatchObject({
      ok: true,
      text: 'listo',
      sessionId: '4bc51516-3f83-41cb-8e09-43ef4705b8f8',
      durationMs: 3086
    })
    expect(r.ok && r.costUsd).toBeGreaterThan(0)
  })

  it('reports is_error with the CLI message (bad model fixture)', () => {
    const r = parsePrintJson(fx('print-json-bad-model.json'), fx('print-json-bad-model.stderr.txt'))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.kind).toBe('is_error')
    expect(r.message).toMatch(/selected model \(no-such-model-xyz\)/)
  })

  it('falls back to stderr when stdout is empty (bad session fixture)', () => {
    const r = parsePrintJson(
      fx('print-json-bad-session.json'),
      fx('print-json-bad-session.stderr.txt')
    )
    expect(r).toEqual({
      ok: false,
      kind: 'invalid',
      message: 'No conversation found with session ID: 00000000-0000-0000-0000-000000000000'
    })
  })

  it('tolerates noise before and after the JSON object', () => {
    const r = parsePrintJson(
      'Starting background service…\n' +
        JSON.stringify({ type: 'result', is_error: false, result: 'hola {x}' }) +
        '\n[warn] something\n'
    )
    expect(r).toEqual({ ok: true, text: 'hola {x}' })
  })

  it('flags an empty result', () => {
    expect(parsePrintJson('{"is_error":false,"result":"   "}')).toEqual({
      ok: false,
      kind: 'empty',
      message: 'El resumen llegó vacío'
    })
  })

  it('flags unparseable stdout and uses its first line as the message', () => {
    const r = parsePrintJson('not json at all\nsecond line')
    expect(r).toEqual({ ok: false, kind: 'invalid', message: 'not json at all' })
    expect(parsePrintJson('')).toMatchObject({ ok: false, kind: 'invalid' })
  })

  it('is_error without text uses stderr', () => {
    expect(parsePrintJson('{"is_error":true}', 'boom\nmore')).toEqual({
      ok: false,
      kind: 'is_error',
      message: 'boom'
    })
  })
})
