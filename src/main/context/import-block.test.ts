import { describe, expect, it } from 'vitest'
import { buildHandoffPrompt, HANDOFF_SECTIONS } from './handoff-prompt'
import { buildImportBlock, trimSummary, TRIM_MARK } from './import-block'

describe('buildHandoffPrompt', () => {
  it('names every section, asks for the conversation language and forbids tools', () => {
    const p = buildHandoffPrompt()
    for (const s of HANDOFF_SECTIONS) expect(p).toContain(`## ${s}`)
    expect(p).toMatch(/idioma predominante de la conversación/)
    expect(p).toMatch(/no uses herramientas/i)
    expect(p).not.toContain('\r')
  })
})

const section = (title: string, lines: number, width = 60): string =>
  `## ${title}\n` +
  Array.from({ length: lines }, (_, i) => `- ${title} ${i} ${'x'.repeat(width)}`).join('\n') +
  '\n'

describe('trimSummary', () => {
  it('leaves short text untouched (normalising CRLF)', () => {
    expect(trimSummary('hola\r\nmundo', 100)).toEqual({ text: 'hola\nmundo', truncated: false })
  })

  it('keeps priority sections first when it has to cut', () => {
    const text =
      '# Resumen\n' +
      section('Objetivo', 3) +
      section('Decisiones tomadas', 3) +
      section('Datos y nombres clave', 40) + // big, low priority
      section('Estado actual', 3) +
      section('Pendientes', 3)
    const max = 1400
    const r = trimSummary(text, max)
    expect(r.truncated).toBe(true)
    expect(r.text.length).toBeLessThanOrEqual(max)
    expect(r.text.endsWith(TRIM_MARK)).toBe(true)
    expect(r.text).toContain('## Objetivo')
    expect(r.text).toContain('## Decisiones tomadas')
    expect(r.text).toContain('## Estado actual')
    expect(r.text).toContain('## Pendientes')
    expect(r.text.indexOf('## Pendientes')).toBeLessThan(
      r.text.indexOf('## Datos y nombres clave') === -1
        ? Infinity
        : r.text.indexOf('## Datos y nombres clave')
    )
  })

  it('recognises numbered/accented headings', () => {
    const text =
      section('1. Objetivo', 2) +
      section('2. Decisiones Tomadas', 2) +
      section('3. Datos y Nombres Clave', 30) +
      section('5. Pendientes', 2)
    const r = trimSummary(text, 700)
    expect(r.truncated).toBe(true)
    expect(r.text).toContain('## 5. Pendientes')
    expect(r.text.length).toBeLessThanOrEqual(700)
  })

  it('cuts plain text at a line boundary when there are no known headings', () => {
    const text = Array.from({ length: 50 }, (_, i) => `línea ${i} ${'y'.repeat(30)}`).join('\n')
    const r = trimSummary(text, 500)
    expect(r.truncated).toBe(true)
    expect(r.text.length).toBeLessThanOrEqual(500)
    expect(r.text).toMatch(/y\n\n\[… resumen recortado/)
  })
})

describe('buildImportBlock', () => {
  it('writes the intro in the first person, names session and project, and delimits the summary', () => {
    const out = buildImportBlock({
      sourceName: 'investigación "bug"',
      projectName: 'hydra-ai',
      text: '## Objetivo\nArreglar X\r\n',
      truncated: false
    })
    expect(out).toMatch(
      /^Te comparto, como contexto de referencia, el resumen de otra sesión mía de Claude Code llamada "investigación 'bug'" \(proyecto "hydra-ai"\)\./
    )
    expect(out).toContain('No hay que ejecutar nada')
    expect(out).toContain(
      '<imported-context session="investigación \'bug\'" project="hydra-ai">\n## Objetivo\nArreglar X\n</imported-context>'
    )
    expect(out).not.toContain('\r')
    expect(out).not.toContain('(Resumen recortado')
  })

  it('omits the project when unknown and flags truncation', () => {
    const out = buildImportBlock({ sourceName: 'a', projectName: null, text: 't', truncated: true })
    expect(out).toContain('llamada "a". No hay')
    expect(out).toContain('(Resumen recortado por tamaño.)')
    expect(out).toContain('<imported-context session="a">\nt\n</imported-context>')
  })
})
