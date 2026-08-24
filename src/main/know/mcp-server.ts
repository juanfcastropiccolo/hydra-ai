// Feature 006 FR-9/FR-11/FR-12: local MCP server (streamable HTTP, loopback only, read-only).
// Stateless: one McpServer+transport per request, as the SDK recommends for HTTP without sessions.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import type { KnowSearchHit, KnowSearchQuery, SessionCard } from '@shared/know/types'

export interface KnowMcpDeps {
  search: (q: KnowSearchQuery) => KnowSearchHit[]
  sessionContext: (
    sessionId: string
  ) => { card: SessionCard | null; title: string; cwd: string } | null
  version: string
}

export type McpState = 'off' | 'serving' | 'port-taken'

const day = (ts: number): string => (ts ? new Date(ts).toISOString().slice(0, 10) : '?')

/** Compact, model-friendly rendering of the hits (FR-7). */
export function renderHits(hits: KnowSearchHit[]): string {
  if (!hits.length)
    return 'Sin resultados. Probá con otros términos (nombres de archivo, temas, comandos).'
  const parts = hits.map((h, i) => {
    const lines = [
      `${i + 1}. [${h.sessionId}] "${h.title}" — ${h.projectLabel} · ${day(h.firstTs)}${h.live ? ' · VIVA' : ''}`
    ]
    for (const f of h.facts) lines.push(`   - (${f.kind}) ${f.text}`)
    for (const r of h.replaced) lines.push(`   - [reemplazado] ${r.text}`)
    if (h.snippet) lines.push(`   > ${h.snippet}`)
    if (h.entities.length) lines.push(`   entidades: ${h.entities.join(', ')}`)
    return lines.join('\n')
  })
  return (
    parts.join('\n') +
    '\n\nPara el detalle completo de una sesión: get_session_context con su id entre corchetes.'
  )
}

export function renderCard(
  ctx: { card: SessionCard | null; title: string; cwd: string },
  sessionId: string
): string {
  if (!ctx.card)
    return `La sesión ${sessionId} ("${ctx.title}") todavía no tiene ficha; solo hay búsqueda léxica sobre su transcript.`
  const c = ctx.card
  const lines = [
    `Sesión ${sessionId} — "${ctx.title}" (${ctx.cwd})`,
    `Resumen: ${c.summary}`,
    'Hechos:',
    ...c.facts.map(
      (f) =>
        `- (${f.kind}${f.supersededBy ? ', reemplazado' : ''}) ${f.text}${f.entities.length ? ` [${f.entities.join(', ')}]` : ''}`
    )
  ]
  return lines.join('\n')
}

export class KnowMcpServer {
  private http: Server | null = null
  state: McpState = 'off'
  /** Actual bound port (differs from the requested one only when 0 = ephemeral, used by E2E). */
  private boundPort: number

  constructor(
    private readonly deps: KnowMcpDeps,
    private readonly requestedPort: number
  ) {
    this.boundPort = requestedPort
  }

  get port(): number {
    return this.boundPort
  }

  private buildServer(): McpServer {
    const server = new McpServer({ name: 'hydra-know', version: this.deps.version })
    server.registerTool(
      'search_past_work',
      {
        description:
          'Busca en el conocimiento indexado de TODO el trabajo pasado del usuario con Claude Code en esta máquina (todas las sesiones y proyectos): decisiones, datos, archivos tocados, estado y pendientes. Usala antes de re-derivar contexto que probablemente ya exista. Devuelve sesiones relevantes con hechos destilados. Si conocés el id de tu propia sesión, pasalo en exclude_session_id para no encontrarte a vos mismo.',
        inputSchema: {
          query: z
            .string()
            .describe('Términos de búsqueda: tema, nombre de archivo, comando, decisión…'),
          project: z
            .string()
            .optional()
            .describe('Limitar a un proyecto (ruta o nombre, opcional)'),
          limit: z
            .number()
            .int()
            .min(1)
            .max(20)
            .optional()
            .describe('Máximo de resultados (default 5)'),
          exclude_session_id: z
            .string()
            .optional()
            .describe('Id de la sesión que consulta, para excluirse')
        }
      },
      async (args) => {
        const q: KnowSearchQuery = { query: args.query }
        if (args.project) q.projectKey = args.project
        if (typeof args.limit === 'number') q.limit = args.limit
        if (args.exclude_session_id) q.excludeSessionId = args.exclude_session_id
        return { content: [{ type: 'text', text: renderHits(this.deps.search(q)) }] }
      }
    )
    server.registerTool(
      'get_session_context',
      {
        description:
          'Devuelve la ficha de conocimiento completa (resumen + hechos) de una sesión pasada, dado el session_id que devolvió search_past_work.',
        inputSchema: { session_id: z.string().describe('Id de la sesión (uuid)') }
      },
      async (args) => {
        const ctx = this.deps.sessionContext(args.session_id)
        const text = ctx
          ? renderCard(ctx, args.session_id)
          : `No existe la sesión ${args.session_id} en el índice.`
        return { content: [{ type: 'text', text }] }
      }
    )
    return server
  }

  async start(): Promise<McpState> {
    if (this.http) return this.state
    const http = createServer((req, res) => void this.handle(req, res))
    this.state = await new Promise<McpState>((resolve) => {
      http.once('error', (e: NodeJS.ErrnoException) =>
        resolve(e.code === 'EADDRINUSE' ? 'port-taken' : 'off')
      )
      http.listen(this.requestedPort, '127.0.0.1', () => resolve('serving'))
    })
    if (this.state === 'serving') {
      this.http = http
      const addr = http.address() as AddressInfo | null
      if (addr?.port) this.boundPort = addr.port
    } else http.close()
    return this.state
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!req.url?.startsWith('/mcp')) {
      res.writeHead(404).end()
      return
    }
    try {
      const server = this.buildServer()
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true
      })
      res.on('close', () => {
        void transport.close()
        void server.close()
      })
      await server.connect(transport)
      await transport.handleRequest(req, res)
    } catch {
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'internal error' },
          id: null
        })
      )
    }
  }

  stop(): void {
    this.http?.close()
    this.http = null
    this.state = 'off'
  }

  get url(): string {
    return `http://127.0.0.1:${this.port}/mcp`
  }
}
