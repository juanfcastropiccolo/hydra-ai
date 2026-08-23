import { describe, expect, it } from 'vitest'
import {
  buildHookSettings,
  buildHookSettingsJson,
  hookEventToState,
  parseHookPayload
} from './hook-events'

// Payloads per docs: common fields + Notification extras.
const base = {
  session_id: 'abc-123',
  cwd: '/Users/u/p',
  permission_mode: 'default',
  transcript_path: '/t.jsonl'
}

describe('parseHookPayload', () => {
  it('parses UserPromptSubmit / Stop / SessionEnd / SessionStart', () => {
    for (const ev of ['UserPromptSubmit', 'Stop', 'SessionEnd', 'SessionStart'] as const) {
      expect(parseHookPayload({ ...base, hook_event_name: ev }, 42)).toEqual({
        sessionId: 'abc-123',
        cwd: '/Users/u/p',
        event: ev,
        receivedAt: 42
      })
    }
  })
  it('parses Notification with its type', () => {
    const ev = parseHookPayload({
      ...base,
      hook_event_name: 'Notification',
      notification_type: 'permission_prompt',
      message: 'Claude wants to run: Bash'
    })
    expect(ev).toMatchObject({ event: 'Notification', notificationType: 'permission_prompt' })
  })
  it('rejects unknown events, missing session_id, non-objects', () => {
    expect(parseHookPayload({ ...base, hook_event_name: 'PreToolUse' })).toBeNull()
    expect(parseHookPayload({ hook_event_name: 'Stop' })).toBeNull()
    expect(parseHookPayload('nope')).toBeNull()
    expect(parseHookPayload(null)).toBeNull()
  })
})

describe('hookEventToState', () => {
  it.each([
    [{ event: 'UserPromptSubmit' }, 'working'],
    [{ event: 'Stop' }, 'idle'],
    [{ event: 'SessionEnd' }, 'ended'],
    [{ event: 'SessionStart' }, null],
    [{ event: 'Notification', notificationType: 'permission_prompt' }, 'waiting'],
    [{ event: 'Notification', notificationType: 'agent_needs_input' }, 'waiting'],
    [{ event: 'Notification', notificationType: 'idle_prompt' }, 'waiting'],
    [{ event: 'Notification', notificationType: 'elicitation_dialog' }, 'waiting'],
    [{ event: 'Notification', notificationType: 'auth_success' }, null],
    [{ event: 'Notification', notificationType: 'agent_completed' }, null],
    [{ event: 'Notification' }, null]
  ] as const)('%o → %s', (ev, expected) => {
    expect(hookEventToState(ev)).toBe(expected)
  })
})

describe('buildHookSettings', () => {
  it('targets loopback URL with the given port and covers all state-bearing events', () => {
    const s = buildHookSettings(4321) as {
      hooks: Record<
        string,
        Array<{ matcher: string; hooks: Array<{ type: string; url: string; timeout: number }> }>
      >
    }
    expect(Object.keys(s.hooks).sort()).toEqual([
      'Notification',
      'SessionEnd',
      'SessionStart',
      'Stop',
      'UserPromptSubmit'
    ])
    for (const entries of Object.values(s.hooks)) {
      for (const e of entries)
        for (const h of e.hooks) {
          expect(h).toEqual({ type: 'http', url: 'http://127.0.0.1:4321/hook', timeout: 2 })
        }
    }
    expect(s.hooks.Notification?.[0]?.matcher).toBe(
      'permission_prompt|idle_prompt|agent_needs_input|elicitation_dialog|elicitation_url_dialog'
    )
  })
  it('serialises to a single-line JSON usable as a CLI argument', () => {
    const j = buildHookSettingsJson(1)
    expect(j).not.toContain('\n')
    expect(JSON.parse(j)).toEqual(buildHookSettings(1))
  })
})
