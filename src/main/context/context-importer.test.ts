import { describe, expect, it, vi } from 'vitest'
import type { ClaudeCliLike, SummarizeOptions, SummarizeResult } from '../claude/claude-cli'
import type { Session } from '@shared/types'
import { ContextImporter, ImportCancelledError } from './context-importer'

const session = (over: Partial<Session> = {}): Session => ({
  sessionId: 'src-1',
  bgId: 'abc',
  kind: 'background',
  name: 'investigacion',
  cwd: '/p/one',
  projectId: 'proj',
  startedAt: 1,
  state: 'working',
  lastStateAt: 1,
  source: 'poll',
  origin: 'hydra',
  ...over
})

function fakeCli(impl: (o: SummarizeOptions) => Promise<SummarizeResult>): ClaudeCliLike {
  return { summarizeSession: vi.fn(impl) } as unknown as ClaudeCliLike
}

function mk(over: Partial<ConstructorParameters<typeof ContextImporter>[0]> = {}): {
  imp: ContextImporter
  cli: ClaudeCliLike
} {
  const cli = fakeCli(async () => ({ text: '## Objetivo\nX', raw: { ok: true, text: 'x' } }))
  const imp = new ContextImporter({
    cli: () => cli,
    getSession: (id) => (id === 'src-1' ? session() : undefined),
    getProject: (id) =>
      id === 'proj' ? { id, name: 'Uno', path: '/p/one', addedAt: '' } : undefined,
    prefs: () => ({ model: 'haiku' }),
    fileExists: () => true,
    ...over
  })
  return { imp, cli }
}

describe('ContextImporter', () => {
  it('summarises the source with the configured model and wraps the block with session + project names', async () => {
    const { imp, cli } = mk()
    const r = await imp.summarize({ importId: 'i1', sourceSessionId: 'src-1' })
    expect(cli.summarizeSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'src-1', cwd: '/p/one', model: 'haiku' })
    )
    expect((cli.summarizeSession as ReturnType<typeof vi.fn>).mock.calls[0]?.[0].prompt).toMatch(
      /## Objetivo/
    )
    expect(r.model).toBe('haiku')
    expect(r.truncated).toBe(false)
    expect(r.text).toMatch(/llamada "investigacion" \(proyecto "Uno"\)/)
    expect(r.text).toContain(
      '<imported-context session="investigacion" project="Uno">\n## Objetivo\nX\n</imported-context>'
    )
    expect(imp.inflightCount).toBe(0)
  })

  it('fails clearly when the source is gone or its folder disappeared', async () => {
    const { imp } = mk()
    await expect(imp.summarize({ importId: 'i', sourceSessionId: 'nope' })).rejects.toThrow(
      'La sesión origen ya no existe'
    )
    const { imp: imp2 } = mk({ fileExists: () => false })
    await expect(imp2.summarize({ importId: 'i', sourceSessionId: 'src-1' })).rejects.toThrow(
      /carpeta de la sesión origen ya no existe: \/p\/one/
    )
  })

  it('cancel aborts the CLI call and rejects with ImportCancelledError', async () => {
    const cli = fakeCli(
      (o) =>
        new Promise((_, reject) =>
          o.signal?.addEventListener('abort', () => {
            const e = new Error('aborted')
            e.name = 'AbortError'
            reject(e)
          })
        )
    )
    const { imp } = mk({ cli: () => cli })
    const p = imp.summarize({ importId: 'i1', sourceSessionId: 'src-1' })
    expect(imp.inflightCount).toBe(1)
    imp.cancel('i1')
    imp.cancel('unknown') // no-op
    await expect(p).rejects.toBeInstanceOf(ImportCancelledError)
    expect(imp.inflightCount).toBe(0)
  })

  it('trims long summaries and flags it', async () => {
    const long = '## Objetivo\n' + 'a'.repeat(500) + '\n## Pendientes\n' + 'b'.repeat(500)
    const cli = fakeCli(async () => ({ text: long, raw: { ok: true, text: long } }))
    const { imp } = mk({ cli: () => cli, maxChars: 300 })
    const r = await imp.summarize({ importId: 'i', sourceSessionId: 'src-1' })
    expect(r.truncated).toBe(true)
    expect(r.text).toContain('(Resumen recortado por tamaño.)')
    expect(r.text).toContain('[… resumen recortado por Hydra')
  })

  it('propagates CLI errors as-is (readable message) and clears inflight', async () => {
    const cli = fakeCli(async () => {
      throw new Error(
        'No se pudo resumir la sesión (claude -p exit 1): bad model. Revisá la preferencia'
      )
    })
    const { imp } = mk({ cli: () => cli })
    await expect(imp.summarize({ importId: 'i', sourceSessionId: 'src-1' })).rejects.toThrow(
      /Revisá la preferencia/
    )
    expect(imp.inflightCount).toBe(0)
  })

  it('omits the project when the session is outside every project; dispose aborts all', async () => {
    const cli = fakeCli(
      (o) =>
        new Promise((_, reject) =>
          o.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('x'), { name: 'AbortError' }))
          )
        )
    )
    const { imp } = mk({ cli: () => cli, getSession: () => session({ projectId: null }) })
    const p = imp.summarize({ importId: 'i', sourceSessionId: 'src-1' })
    imp.dispose()
    await expect(p).rejects.toBeInstanceOf(ImportCancelledError)
    const { imp: imp2 } = mk({ getSession: () => session({ projectId: null }) })
    const r = await imp2.summarize({ importId: 'j', sourceSessionId: 'src-1' })
    expect(r.text).toContain('llamada "investigacion". No hay')
  })
})
