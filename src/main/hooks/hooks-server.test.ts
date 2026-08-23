import { afterEach, describe, expect, it } from 'vitest'
import type { HookEvent } from './hook-events'
import { HooksServer } from './hooks-server'

let server: HooksServer
afterEach(async () => server?.stop())

async function post(port: number, body: unknown, raw = false): Promise<number> {
  const r = await fetch(`http://127.0.0.1:${port}/hook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body)
  })
  return r.status
}

describe('HooksServer', () => {
  it('listens on a random loopback port and emits parsed events for POST /hook', async () => {
    server = new HooksServer()
    const port = await server.start()
    expect(port).toBeGreaterThan(0)
    const got = new Promise<HookEvent>((res) => server.once('event', res))
    const status = await post(port, {
      session_id: 's1',
      hook_event_name: 'Notification',
      notification_type: 'permission_prompt',
      cwd: '/p'
    })
    expect(status).toBe(200)
    expect(await got).toMatchObject({
      sessionId: 's1',
      event: 'Notification',
      notificationType: 'permission_prompt',
      cwd: '/p'
    })
  })
  it('answers 200 but emits "rejected" for invalid JSON or unknown payloads; 404 elsewhere', async () => {
    server = new HooksServer()
    const port = await server.start()
    const rejected: string[] = []
    server.on('rejected', (r) => rejected.push(r.reason))
    expect(await post(port, '{not json', true)).toBe(200)
    expect(await post(port, { hello: 'world' })).toBe(200)
    expect((await fetch(`http://127.0.0.1:${port}/other`)).status).toBe(404)
    await new Promise((r) => setTimeout(r, 20))
    expect(rejected).toEqual(['invalid json', 'unrecognised payload'])
  })
  it('stop() closes the port', async () => {
    server = new HooksServer()
    const port = await server.start()
    await server.stop()
    await expect(
      fetch(`http://127.0.0.1:${port}/hook`, { method: 'POST', body: '{}' })
    ).rejects.toThrow()
  })
})
