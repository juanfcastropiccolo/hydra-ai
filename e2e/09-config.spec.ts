// Feature 007 — E2E: Config view over fake CLI/PTY.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, seedTranscripts, test } from './fixtures'

test('E2E-13 (AC-1/2/3/4/5/8/9/10): navigate, instant save, pending bar, live font, session flags, clear cards, validation', async ({
  page,
  claudeProjects,
  userData
}) => {
  // Seed transcripts + one card BEFORE anything touches the knowledge layer (it loads cards once).
  seedTranscripts(claudeProjects, [
    {
      projectDir: '-Users-e2e-alpha',
      sessionId: 'a1a1a1a1-0000-4000-8000-000000000001',
      cwd: '/Users/e2e/alpha',
      iso: '2026-08-20T10:00:00Z',
      model: 'claude-opus-5',
      input: 10,
      output: 10,
      title: 'Alpha'
    }
  ])
  writeFileSync(
    join(userData, 'know-cards.json'),
    JSON.stringify({
      version: 1,
      cards: {
        'a1a1a1a1-0000-4000-8000-000000000001': {
          summary: 's',
          facts: [],
          generatedAt: 1,
          sourceLastTs: 1,
          model: 'haiku'
        }
      }
    })
  )
  // a live pane to check "no re-attach" and live font size
  await page.getByTestId('add-project').click()
  await page.getByTestId('new-session').first().click()
  await page.getByTestId('session-name-input').fill('pane-x')
  await page.getByTestId('create-session').click()
  const pane = page.locator('[data-testid=pane]').first()
  await expect(pane).toHaveCount(1)
  const host = pane.locator('[data-font-size]')
  await expect(host).toHaveAttribute('data-font-size', '13')

  // AC-1: open by nav and by ⌘,
  await page.getByTestId('nav-config').click()
  await expect(page.getByTestId('topbar-title')).toHaveText('Config')
  await expect(page.getByTestId('config-nav-profile')).toHaveAttribute('aria-current', 'page')
  await page.getByTestId('nav-sessions').click()
  await expect(page.getByTestId('topbar-title')).toHaveText('Sesiones')
  await page.keyboard.press('Meta+,')
  await expect(page.getByTestId('topbar-title')).toHaveText('Config')

  // AC-3: profile pending bar → discard, then save → sidebar avatar changes
  await page.getByTestId('profile-name').fill('Zoe Ramírez')
  await expect(page.getByTestId('pending-bar')).toBeVisible()
  await page.getByTestId('pending-discard').click()
  await expect(page.getByTestId('pending-bar')).toHaveCount(0)
  await page.getByTestId('profile-name').fill('Zoe Ramírez')
  await page.getByTestId('profile-initials').fill('')
  await page.getByTestId('pending-save').click()
  await expect(page.getByTestId('pending-bar')).toHaveCount(0)
  await expect(page.locator('[data-testid=sidebar]')).toContainText('Zoe Ramírez')
  await expect(page.locator('[data-testid=sidebar]')).toContainText('ZR')
  // AC-9: initials too long → inline error
  await page.getByTestId('profile-initials').fill('ABCD')
  await expect(page.getByTestId('config-section-profile')).toContainText('Máximo 3 caracteres')
  await page.getByTestId('pending-discard').click()

  // AC-4: font size slider applies live without re-attach
  const pidsBefore = await page.evaluate(() =>
    window.hydra.invoke('e2e.ptyRecords').then((r) => r.map((x) => x.pid))
  )
  await page.getByTestId('config-nav-appearance').click()
  await page.getByTestId('appearance-font').fill('16')
  await expect(page.getByTestId('saved-toast')).toBeVisible()
  await expect(host).toHaveAttribute('data-font-size', '16')
  await page.getByTestId('appearance-accent-violet').click()
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
      )
    )
    .toBe('#9085e9')
  const pidsAfter = await page.evaluate(() =>
    window.hydra.invoke('e2e.ptyRecords').then((r) => r.map((x) => x.pid))
  )
  expect(pidsAfter).toEqual(pidsBefore)

  // AC-2: instant toggle persists in hydra.json
  await page.getByTestId('config-nav-context').click()
  await page.getByTestId('context-autocards').click()
  await expect
    .poll(() => page.evaluate(() => window.hydra.invoke('prefs.get').then((p) => p.know.autoCards)))
    .toBe(false)
  // AC-9: bad port rejected inline
  await page.getByTestId('context-port').fill('80')
  await expect(page.getByTestId('config-section-context')).toContainText(
    'Puerto entre 1024 y 65535'
  )
  await page.getByTestId('pending-discard').click()

  // AC-5: session flags reach the fake CLI on the next spawn
  await page.getByTestId('config-nav-sessions').click()
  await page.getByTestId('sessions-model').selectOption('haiku')
  await page.getByTestId('pending-save').click()
  await expect(page.getByTestId('pending-bar')).toHaveCount(0)
  await page.getByTestId('sessions-effort').selectOption('low')
  await page.getByTestId('nav-sessions').click()
  await page.getByTestId('new-session').first().click()
  await page.getByTestId('session-name-input').fill('pane-y')
  await page.getByTestId('create-session').click()
  await expect(page.locator('[data-testid=pane]')).toHaveCount(2)
  const spawns = await page.evaluate(() => window.hydra.invoke('e2e.spawns'))
  expect(spawns.at(-1)).toMatchObject({ name: 'pane-y', model: 'haiku', effort: 'low' })
  expect(spawns[0]).not.toHaveProperty('model')

  // AC-8: maintenance shows CLI info and clears cards
  await page.getByTestId('nav-graph').click()
  await expect(page.getByTestId('know-status')).toContainText('1 fichas', { timeout: 15_000 })
  await page.getByTestId('nav-config').click()
  await page.getByTestId('config-nav-maintenance').click()
  await expect(page.getByTestId('maint-cli-version')).toContainText('0.0.0-e2e')
  page.once('dialog', (d) => void d.accept())
  await page.getByTestId('maint-clear-cards').click()
  await expect(page.getByTestId('maint-msg')).toContainText('Borrar fichas ✓')
  await page.getByTestId('nav-graph').click()
  await expect(page.getByTestId('know-status')).toContainText('0 fichas')

  // AC-10: back to sessions, terminals intact
  await page.getByTestId('nav-sessions').click()
  await expect(page.locator('[data-testid=pane] .xterm').first()).toBeVisible()
  const pidsEnd = await page.evaluate(() =>
    window.hydra.invoke('e2e.ptyRecords').then((r) => r.map((x) => x.pid))
  )
  expect(pidsEnd.slice(0, pidsBefore.length)).toEqual(pidsBefore)
})
