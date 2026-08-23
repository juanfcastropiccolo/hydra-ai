// Pure helpers for Claude Code hook payloads (see https://code.claude.com/docs/en/hooks).
// Hydra injects HTTP hooks into the sessions it spawns; Claude Code POSTs JSON here.
import type { SessionState } from '@shared/types'

export const HOOK_EVENTS = [
  'UserPromptSubmit',
  'Notification',
  'Stop',
  'SessionEnd',
  'SessionStart'
] as const
export type HookEventName = (typeof HOOK_EVENTS)[number]

/** Notification types that mean "blocked on the user" → 🔴. */
export const WAITING_NOTIFICATIONS = [
  'permission_prompt',
  'idle_prompt',
  'agent_needs_input',
  'elicitation_dialog',
  'elicitation_url_dialog'
] as const

export interface HookEvent {
  sessionId: string
  cwd?: string
  event: HookEventName
  notificationType?: string
  receivedAt: number
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Validate a raw hook body. Returns null for anything we don't understand (never throws). */
export function parseHookPayload(body: unknown, now = Date.now()): HookEvent | null {
  if (!isRecord(body)) return null
  const { session_id, hook_event_name, cwd, notification_type } = body
  if (typeof session_id !== 'string' || !session_id) return null
  if (typeof hook_event_name !== 'string') return null
  if (!(HOOK_EVENTS as readonly string[]).includes(hook_event_name)) return null
  const ev: HookEvent = {
    sessionId: session_id,
    event: hook_event_name as HookEventName,
    receivedAt: now
  }
  if (typeof cwd === 'string') ev.cwd = cwd
  if (typeof notification_type === 'string') ev.notificationType = notification_type
  return ev
}

/**
 * Map a hook event to a traffic-light state, or null when the event carries no state change
 * (e.g. SessionStart, or a Notification type we don't treat as blocking such as auth_success).
 */
export function hookEventToState(
  ev: Pick<HookEvent, 'event' | 'notificationType'>
): SessionState | null {
  switch (ev.event) {
    case 'UserPromptSubmit':
      return 'working'
    case 'Stop':
      return 'idle'
    case 'SessionEnd':
      return 'ended'
    case 'SessionStart':
      return null
    case 'Notification':
      return ev.notificationType &&
        (WAITING_NOTIFICATIONS as readonly string[]).includes(ev.notificationType)
        ? 'waiting'
        : null
  }
}

/** The `--settings` JSON Hydra passes to every session it spawns. Hooks MERGE with the user's own. */
export function buildHookSettings(port: number, host = '127.0.0.1'): Record<string, unknown> {
  const url = `http://${host}:${port}/hook`
  const http = { type: 'http', url, timeout: 2 }
  const entry = (matcher: string): unknown => ({ matcher, hooks: [http] })
  return {
    hooks: {
      UserPromptSubmit: [entry('*')],
      Stop: [entry('*')],
      SessionEnd: [entry('*')],
      SessionStart: [entry('*')],
      Notification: [entry(WAITING_NOTIFICATIONS.join('|'))]
    }
  }
}

export function buildHookSettingsJson(port: number, host?: string): string {
  return JSON.stringify(buildHookSettings(port, host))
}
