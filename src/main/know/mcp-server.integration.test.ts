// Integration (006): the MCP server answers the streamable-HTTP JSON-RPC flow end to end.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { KnowSearchHit } from '@shared/know/types'
import { KnowMcpServer, renderHits, switchMcpPort } from './mcp-server'

const hit = (over: Partial<KnowSearchHit> = {}): KnowSearchHit => ({
  sessionId: 'aaaa-1',
  title: 'Sesión auth',
  cwd: '/p/x',
  projectLabel: 'Proy',
  firstTs: Date.parse('2026-08-20T10:00:00Z'),
  lastTs: Date.parse('2026-08-20T11:00:00Z'),
  score: 1,
  facts: [{ id: 'aaaa-1#1', text: 'Se decidió usar JWT', kind: 'decision' }],
  replaced: [],
  entities: ['jwt'],
  ...over
})

let server: KnowMcpServer
let lastQuery: unknown = null
const PORT = 45999

beforeAll(async () => {
  server = new KnowMcpServer(
    {
      search: (q) => {
        lastQuery = q
        return q.query === 'nada' ? [] : [hit()]
      },
      sessionContext: (id) =>
        id === 'aaaa-1'
          ? {
              title: 'Sesión auth',
              cwd: '/p/x',
              card: {
                summary: 'Trabajo de auth',
                facts: [
                  {
                    id: 'aaaa-1#1',
                    text: 'Se decidió usar JWT',
                    kind: 'decision',
                    entities: ['jwt'],
                    ts: 1
                  }
                ],
                generatedAt: 1,
                sourceLastTs: 1,
                model: 'haiku'
              }
            }
          : null,
      version: '0.5.0-test'
    },
    PORT
  )
  expect(await server.start()).toBe('serving')
})
afterAll(() => server.stop())

let msgId = 0
async function rpc(
  method: string,
  params: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const res = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++msgId, method, params })
  })
  const text = await res.text()
  const json =
    text.startsWith('event:') || text.includes('\ndata:') ? text.split('data:')[1]!.trim() : text
  return JSON.parse(json) as Record<string, unknown>
}

describe('KnowMcpServer (integration)', () => {
  it('initialize → tools/list → tools/call search_past_work with compact output', async () => {
    const init = await rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '0' }
    })
    expect((init.result as { serverInfo: { name: string } }).serverInfo.name).toBe('hydra-know')

    const list = await rpc('tools/list')
    const tools = (list.result as { tools: Array<{ name: string }> }).tools.map((t) => t.name)
    expect(tools.sort()).toEqual(['get_session_context', 'search_past_work'])

    const call = await rpc('tools/call', {
      name: 'search_past_work',
      arguments: { query: 'auth jwt', limit: 3, exclude_session_id: 'me-123' }
    })
    const content = (call.result as { content: Array<{ type: string; text: string }> }).content
    expect(content[0]!.type).toBe('text')
    expect(content[0]!.text).toContain('[aaaa-1] "Sesión auth"')
    expect(content[0]!.text).toContain('Se decidió usar JWT')
    expect(content[0]!.text.length).toBeLessThan(4200)
    expect(lastQuery).toMatchObject({ query: 'auth jwt', limit: 3, excludeSessionId: 'me-123' })

    const empty = await rpc('tools/call', {
      name: 'search_past_work',
      arguments: { query: 'nada' }
    })
    expect((empty.result as { content: Array<{ text: string }> }).content[0]!.text).toContain(
      'Sin resultados'
    )

    const card = await rpc('tools/call', {
      name: 'get_session_context',
      arguments: { session_id: 'aaaa-1' }
    })
    expect((card.result as { content: Array<{ text: string }> }).content[0]!.text).toContain(
      'Resumen: Trabajo de auth'
    )
    const miss = await rpc('tools/call', {
      name: 'get_session_context',
      arguments: { session_id: 'zzz' }
    })
    expect((miss.result as { content: Array<{ text: string }> }).content[0]!.text).toContain(
      'No existe'
    )
  })

  it('second bind on the same port reports port-taken; non-mcp paths 404', async () => {
    const other = new KnowMcpServer(
      { search: () => [], sessionContext: () => null, version: 'x' },
      PORT
    )
    expect(await other.start()).toBe('port-taken')
    other.stop()
    const res = await fetch(`http://127.0.0.1:${PORT}/otra`)
    expect(res.status).toBe(404)
  })

  it('renderHits stays compact and lists replaced facts', () => {
    const text = renderHits([hit({ replaced: [{ id: 'x', text: 'antes cookies' }] })])
    expect(text).toContain('[reemplazado] antes cookies')
  })
})

describe('switchMcpPort (007)', () => {
  it('moves to a free port; a taken port keeps the old server alive on its port', async () => {
    const deps = { search: () => [], sessionContext: () => null, version: 'x' }
    const a = new KnowMcpServer(deps, 0)
    expect(await a.start()).toBe('serving')
    const oldPort = a.port
    const moved = await switchMcpPort(a, 0)
    expect(moved).not.toBeNull()
    expect(moved!.port).not.toBe(oldPort)
    expect(moved!.state).toBe('serving')
    // now try to move onto the port the main test server holds (PORT) → taken
    const back = await switchMcpPort(moved!, PORT)
    expect(back).toBeNull()
    expect(moved!.state).toBe('serving') // restarted on its previous port
    moved!.stop()
  })
})
