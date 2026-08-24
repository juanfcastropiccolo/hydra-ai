// Feature 006 FR-3/FR-16/FR-17: serial generation of session cards. One in flight, retries with
// backoff, quiet-session gating, cost accounting, autoCards toggle, backfill needs confirmation.
import { EventEmitter } from 'node:events'
import type { ClaudeCliLike } from '../claude/claude-cli'
import type { KnowIndexer, PendingSession } from './know-indexer'
import { buildCardPrompt } from './card-prompt'
import { parseCard, toSessionCard } from './parse-card'
import { recentExtract } from './transcript-extract'

export interface CardQueueOptions {
  know: KnowIndexer
  cli: () => ClaudeCliLike | null
  model: () => string
  autoCards: () => boolean
  /** A session is "quiet" when it is not working right now (idle, or gone from the daemon). */
  isSessionBusy: (sessionId: string) => boolean
  now?: () => number
  quietMs?: number
  maxAttempts?: number
  backoffMs?: number
  /** Test seam. */
  setTimeoutFn?: typeof setTimeout
}

export interface CardQueueEvents {
  changed: []
}

interface Attempt {
  count: number
  nextAt: number
}

/** Observed with haiku on real sessions: US$0.03–0.12 per card. */
export const EST_USD_PER_CARD = 0.06

const tooLong = (e: unknown): boolean =>
  /too long|context window|exceeds/i.test((e as Error)?.message ?? '')

export class CardQueue extends EventEmitter<CardQueueEvents> {
  private running = false
  private inFlight: string | null = null
  private attempts = new Map<string, Attempt>()
  /**
   * Backfill guard: sessions whose last activity predates the queue (i.e. this Hydra run) are
   * "backlog" and wait for an explicit approval; sessions active after that are automatic.
   */
  private backfillApproved = false
  private readonly createdAt: number
  lastError: string | null = null
  totalCostUsd = 0

  constructor(private readonly opts: CardQueueOptions) {
    super()
    this.createdAt = opts.now?.() ?? Date.now()
    opts.know.on('changed', () => this.kick())
  }

  generating(): string | null {
    return this.inFlight
  }

  /** Pending sessions the queue may process automatically right now. */
  private autoEligible(): PendingSession[] {
    if (!this.opts.autoCards()) return []
    return safePending(this.opts.know).filter(
      (p) => (this.backfillApproved || !this.isBacklog(p)) && this.readyNow(p)
    )
  }

  private readyNow(p: PendingSession): boolean {
    const now = this.opts.now?.() ?? Date.now()
    if (this.opts.isSessionBusy(p.sessionId)) return false
    if (now - p.lastTs < (this.opts.quietMs ?? 120_000)) return false
    const a = this.attempts.get(p.sessionId)
    if (a && now < a.nextAt) return false
    return true
  }

  private isBacklog(p: PendingSession): boolean {
    return p.lastTs < this.createdAt
  }

  /** Estimate for the UI confirmation (count + rough cost of the backlog). */
  backlogEstimate(): { count: number; estUsd: number } {
    const pend = safePending(this.opts.know).filter((p) => this.isBacklog(p))
    return { count: pend.length, estUsd: pend.length * EST_USD_PER_CARD }
  }

  /** User confirmed the backfill (or asked to generate everything now). */
  approveBackfill(): void {
    this.backfillApproved = true
    this.kick()
  }

  kick(): void {
    if (this.running) return
    this.running = true
    void this.loop().finally(() => {
      this.running = false
    })
  }

  private async loop(): Promise<void> {
    for (;;) {
      const next = this.autoEligible()[0]
      if (!next) return
      await this.generateOne(next.sessionId)
      await new Promise((r) => (this.opts.setTimeoutFn ?? setTimeout)(r, 10))
    }
  }

  /** Generate (or refresh) one card now; used by the loop and by "generate this one" UI actions. */
  async generateOne(sessionId: string): Promise<boolean> {
    const cli = this.opts.cli()
    const meta = this.opts.know.meta(sessionId)
    if (!cli || !meta) return false
    this.inFlight = sessionId
    this.emit('changed')
    try {
      const model = this.opts.model()
      const existing = this.opts.know
        .vigenteFacts(meta.projectKey)
        .filter((f) => !f.id.startsWith(`${sessionId}#`))
      let partial = false
      let r: Awaited<ReturnType<ClaudeCliLike['runPrompt']>>
      try {
        r = await cli.runPrompt({
          resumeSessionId: sessionId,
          cwd: meta.cwd,
          model,
          prompt: buildCardPrompt(existing),
          timeoutMs: 120_000
        })
      } catch (e) {
        if (!tooLong(e)) throw e
        // Huge session: the whole conversation does not fit the model → card from a recent extract.
        const path = this.opts.know.transcriptPath(sessionId)
        const extract = path ? recentExtract(path) : ''
        if (!extract) throw e
        partial = true
        r = await cli.runPrompt({
          cwd: meta.cwd,
          model,
          prompt: `${buildCardPrompt(existing)}\n\nLa conversación es demasiado larga para leerla entera; este es un extracto reciente:\n\n${extract}`,
          timeoutMs: 120_000
        })
      }
      let parsed = parseCard(r.text)
      if (!parsed) {
        const retry = await cli.runPrompt({
          resumeSessionId: sessionId,
          cwd: meta.cwd,
          model,
          prompt:
            buildCardPrompt(existing) +
            '\n\nIMPORTANTE: respondé únicamente el objeto JSON, nada más.',
          timeoutMs: 120_000
        })
        parsed = parseCard(retry.text)
      }
      if (!parsed) throw new Error('La ficha no devolvió JSON válido')
      const costUsd = typeof r.raw.costUsd === 'number' ? r.raw.costUsd : undefined
      const card = toSessionCard(parsed, {
        sessionId,
        sourceLastTs: meta.lastTs,
        model,
        generatedAt: this.opts.now?.() ?? Date.now(),
        ...(costUsd !== undefined ? { costUsd } : {}),
        ...(partial ? { partial: true } : {})
      })
      this.opts.know.setCard(sessionId, card)
      if (parsed.supersededIds.length)
        this.opts.know.applySuperseded(parsed.supersededIds, card.facts[0]?.id ?? `${sessionId}#1`)
      if (costUsd) this.totalCostUsd += costUsd
      this.attempts.delete(sessionId)
      this.lastError = null
      return true
    } catch (e) {
      const a = this.attempts.get(sessionId) ?? { count: 0, nextAt: 0 }
      a.count += 1
      const backoff = (this.opts.backoffMs ?? 60_000) * Math.pow(2, Math.min(a.count - 1, 4))
      a.nextAt = (this.opts.now?.() ?? Date.now()) + backoff
      if (a.count >= (this.opts.maxAttempts ?? 5)) a.nextAt = Number.MAX_SAFE_INTEGER
      this.attempts.set(sessionId, a)
      this.lastError = (e as Error).message
      return false
    } finally {
      this.inFlight = null
      this.emit('changed')
    }
  }
}

function safePending(know: KnowIndexer): PendingSession[] {
  try {
    return know.pending()
  } catch {
    return []
  }
}
