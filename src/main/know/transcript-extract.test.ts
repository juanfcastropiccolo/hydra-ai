import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { recentExtract } from './transcript-extract'

const FX = join(__dirname, '../../../test/fixtures/transcripts/projects')

describe('recentExtract', () => {
  it('keeps human/assistant text and tool names, most recent first-fitting, with a dropped-turns marker', () => {
    const full = recentExtract(
      join(FX, '-Users-dev-work-demo/bbbbbbbb-0000-4000-8000-000000000002.jsonl')
    )
    expect(full).toMatch(/USUARIO: Primera pregunta/)
    expect(full).toMatch(/ASISTENTE: respuesta/)
    expect(full).toMatch(/\[Read\]/)
    expect(full).not.toMatch(/omitidos/)
    const tail = recentExtract(
      join(FX, '-Users-dev-work-demo/bbbbbbbb-0000-4000-8000-000000000002.jsonl'),
      80
    )
    expect(tail).toMatch(/turnos anteriores omitidos/)
    expect(tail.length).toBeLessThan(200)
    expect(recentExtract('/nope/none.jsonl')).toBe('')
  })
})
