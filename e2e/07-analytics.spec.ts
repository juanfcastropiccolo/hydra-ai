// Feature 005 — E2E-9/10: analytics dashboard over fake transcripts (TZ=UTC, pinned clock).
import { expect, seedTranscripts, test } from './fixtures'

const NOW = '2026-08-23T15:00:00Z' // a Sunday
test.use({ launchEnv: { HYDRA_E2E_NOW: NOW } })

function seed(root: string, liveSessionId?: string): void {
  seedTranscripts(root, [
    {
      projectDir: '-Users-e2e-alpha',
      sessionId: 'a1a1a1a1-0000-4000-8000-000000000001',
      cwd: '/Users/e2e/alpha',
      iso: '2026-08-23T10:00:00Z',
      model: 'claude-opus-5',
      input: 100,
      output: 100,
      title: 'Alpha hoy'
    },
    {
      projectDir: '-Users-e2e-alpha',
      sessionId: 'a2a2a2a2-0000-4000-8000-000000000002',
      cwd: '/Users/e2e/alpha',
      iso: '2026-08-22T09:00:00Z',
      model: 'claude-haiku-4-5-20251001',
      input: 1000,
      output: 1000,
      title: 'Alpha ayer',
      turns: 2
    },
    {
      projectDir: '-Users-e2e-beta',
      sessionId: 'b1b1b1b1-0000-4000-8000-000000000003',
      cwd: '/Users/e2e/beta',
      iso: '2026-08-20T12:00:00Z',
      model: 'claude-opus-5',
      input: 500,
      output: 500,
      title: 'Beta'
    },
    {
      projectDir: '-private-tmp-x',
      sessionId: 'ffffffff-0000-4000-8000-000000000009',
      cwd: '/private/tmp/x',
      iso: '2026-08-23T11:00:00Z',
      model: 'claude-opus-5',
      input: 1_000_000,
      output: 0,
      title: 'TEMPORAL'
    },
    ...(liveSessionId
      ? [
          {
            projectDir: '-Users-e2e-alpha',
            sessionId: liveSessionId,
            cwd: '/Users/e2e/alpha',
            iso: '2026-08-23T14:00:00Z',
            model: 'claude-opus-5',
            input: 10,
            output: 10,
            title: 'Viva'
          }
        ]
      : [])
  ])
}

test('E2E-9 (AC-1/3/4/5/6/7/10): dashboard renders totals, charts, projects (no temp), sortable table; view round-trip keeps terminals', async ({
  page,
  claudeProjects
}) => {
  seed(claudeProjects)
  // a session pane to verify the round-trip
  await page.getByTestId('add-project').click()
  await page.getByTestId('new-session').first().click()
  await page.getByTestId('session-name-input').fill('pane-x')
  await page.getByTestId('create-session').click()
  await expect(page.locator('[data-testid=pane]')).toHaveCount(1)

  await page.getByTestId('nav-analytics').click()
  await expect(page.getByTestId('topbar-title')).toHaveText('Analytics')
  await expect(page.getByTestId('stat-cards')).toBeVisible()
  await expect(page.getByTestId('range-7d')).toHaveAttribute('aria-pressed', 'true')

  // AC-3: totals for 7d — 200 + 2000 + 1000 tokens, 3 sessions, 4 turns (temp excluded)
  await expect(page.getByTestId('stat-tokens-value')).toHaveText('3.2k')
  await expect(page.getByTestId('stat-sessions-value')).toHaveText('3')
  await expect(page.getByTestId('stat-turns-value')).toHaveText('4')

  // AC-4: 7 day columns (one hit target per day), stacked by model; cost toggle relabels
  await expect(page.locator('[data-testid=usage-chart] rect[fill="transparent"]')).toHaveCount(7)
  await page.getByTestId('metric-cost').click()
  await expect(page.locator('[data-testid=usage-by-day]')).toContainText('costo estimado')
  await page.getByTestId('metric-tokens').click()

  // AC-5: heatmap has 168 cells and marks Sunday 10h (row Dom, first session)
  await expect(page.locator('[data-testid=heatmap] rect[data-value]')).toHaveCount(168)
  expect(await page.locator('[data-testid=heatmap] rect[data-value="1"]').count()).toBeGreaterThan(
    0
  )

  // AC-6: projects without the temp one, ordered by usage; click filters
  const bars = page.locator('[data-testid=project-bars] [data-testid=hbar-row]')
  await expect(bars).toHaveCount(2)
  await expect(bars.nth(0)).toContainText('e2e/alpha')
  await expect(bars.nth(1)).toContainText('e2e/beta')
  await expect(page.locator('[data-testid=by-project]')).not.toContainText('tmp/x')
  await bars.nth(1).click()
  await expect(page.getByTestId('stat-sessions-value')).toHaveText('1')
  await expect(page.getByTestId('project-filter-chip')).toContainText('e2e/beta')
  await page.getByTestId('project-filter-chip').click()
  await expect(page.getByTestId('stat-sessions-value')).toHaveText('3')

  // AC-7: table sorted by tokens puts "Alpha ayer" (2k) first; temp session absent
  await expect(page.locator('[data-testid=session-row]')).toHaveCount(3)
  await expect(page.locator('[data-testid=sessions-table]')).not.toContainText('TEMPORAL')
  await page.getByTestId('th-tokens').click()
  await expect(page.locator('[data-testid=session-row]').first()).toContainText('Alpha ayer')

  // AC-3: custom range 20–22 ago → 2 sessions
  await page.getByTestId('range-custom').click()
  await page.getByTestId('range-from').fill('2026-08-20')
  await page.getByTestId('range-to').fill('2026-08-22')
  await expect(page.getByTestId('stat-sessions-value')).toHaveText('2')

  // AC-1: back to sessions — same PTY, terminal visible, prefs persisted
  const pidsBefore = await page.evaluate(() =>
    window.hydra.invoke('e2e.ptyRecords').then((r) => r.map((x) => x.pid))
  )
  await page.getByTestId('nav-sessions').click()
  await expect(page.getByTestId('topbar-title')).toHaveText('Sesiones')
  await expect(page.locator('[data-testid=pane] .xterm')).toBeVisible()
  const pidsAfter = await page.evaluate(() =>
    window.hydra.invoke('e2e.ptyRecords').then((r) => r.map((x) => x.pid))
  )
  expect(pidsAfter).toEqual(pidsBefore)
})

test('E2E-10 (AC-7/9): a live session is marked and clicking it focuses the pane; new data refreshes while open', async ({
  page,
  claudeProjects
}) => {
  await page.getByTestId('add-project').click()
  await page.getByTestId('new-session').first().click()
  await page.getByTestId('session-name-input').fill('pane-live')
  await page.getByTestId('create-session').click()
  await expect(page.locator('[data-testid=pane]')).toHaveCount(1)
  const liveId = '00000000-0000-0000-0000-000000000001' // FakeClaudeCli's first sessionId
  seed(claudeProjects, liveId)

  await page.getByTestId('nav-analytics').click()
  const liveRow = page.locator(`[data-testid=session-row][data-session-id="${liveId}"]`)
  await expect(liveRow).toHaveAttribute('data-live', 'true')
  await liveRow.click()
  await expect(page.getByTestId('topbar-title')).toHaveText('Sesiones')
  await expect(page.locator('[data-testid=pane]').first()).toHaveAttribute('data-focused', 'true')

  // watcher refresh: appending a transcript while open updates the totals without reopening
  await page.getByTestId('nav-analytics').click()
  await expect(page.getByTestId('stat-sessions-value')).toHaveText('4')
  seedTranscripts(claudeProjects, [
    {
      projectDir: '-Users-e2e-beta',
      sessionId: 'c1c1c1c1-0000-4000-8000-000000000004',
      cwd: '/Users/e2e/beta',
      iso: '2026-08-23T14:30:00Z',
      model: 'claude-opus-5',
      input: 50,
      output: 50,
      title: 'Nueva en vivo'
    }
  ])
  await expect(page.getByTestId('stat-sessions-value')).toHaveText('5', { timeout: 10_000 })
  await expect(page.locator('[data-testid=sessions-table]')).toContainText('Nueva en vivo')
})
