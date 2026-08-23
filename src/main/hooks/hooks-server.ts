// Local HTTP endpoint for Claude Code HTTP hooks. Loopback only, random free port.
// Emits typed HookEvents; always answers 200 fast so hooks never slow Claude down.
import { EventEmitter } from 'node:events'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { parseHookPayload, type HookEvent } from './hook-events'

const MAX_BODY = 256 * 1024

export interface HooksServerEvents {
  event: [HookEvent]
  rejected: [{ reason: string }]
}

export class HooksServer extends EventEmitter<HooksServerEvents> {
  private server: Server | null = null
  private _port = 0

  constructor(private readonly host = '127.0.0.1') {
    super()
  }

  get port(): number {
    return this._port
  }

  async start(port = 0): Promise<number> {
    if (this.server) return this._port
    const server = createServer((req, res) => this.handle(req, res))
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, this.host, () => resolve())
    })
    const addr = server.address()
    this._port = typeof addr === 'object' && addr ? addr.port : port
    this.server = server
    return this._port
  }

  async stop(): Promise<void> {
    const s = this.server
    this.server = null
    if (!s) return
    await new Promise<void>((resolve) => s.close(() => resolve()))
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    if (req.method !== 'POST' || req.url !== '/hook') {
      res.statusCode = 404
      res.end()
      return
    }
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY) {
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      // Respond immediately; Claude Code treats any 2xx + empty body as success.
      res.statusCode = 200
      res.end()
      let body: unknown
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null')
      } catch {
        this.emit('rejected', { reason: 'invalid json' })
        return
      }
      const ev = parseHookPayload(body)
      if (ev) this.emit('event', ev)
      else this.emit('rejected', { reason: 'unrecognised payload' })
    })
  }
}
