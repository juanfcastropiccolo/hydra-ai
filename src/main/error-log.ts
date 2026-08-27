// Feature 007 FR-10: in-memory ring of recent main-process errors, shown in Config › Mantenimiento.
export interface LoggedError {
  ts: number
  source: string
  message: string
}

export class ErrorLog {
  private items: LoggedError[] = []
  constructor(
    private readonly max = 50,
    private readonly now: () => number = Date.now
  ) {}

  push(source: string, message: string | Error): void {
    const text = message instanceof Error ? message.message : String(message)
    if (!text.trim()) return
    this.items.push({ ts: this.now(), source, message: text.slice(0, 1000) })
    if (this.items.length > this.max) this.items.splice(0, this.items.length - this.max)
  }

  /** Newest first. */
  list(): LoggedError[] {
    return [...this.items].reverse()
  }

  clear(): void {
    this.items = []
  }
}
