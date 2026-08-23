// Feature 006 — E2E: Graph Know view over fake transcripts + a seeded card, fake CLI for MCP/cards.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { expect, seedTranscripts, test } from './fixtures'

const ALPHA = 'a1a1a1a1-0000-4000-8000-000000000001'
const BETA = 'b1b1b1b1-0000-4000-8000-000000000003'

function seed(root: string, userData: string, cwds: { alpha: string; beta: string }): void {
  seedTranscripts(root, [
    {
      projectDir: '-Users-e2e-alpha',
      sessionId: ALPHA,
      cwd: cwds.alpha,
      iso: '2026-08-20T10:00:00Z',
      model: 'claude-opus-5',
      input: 100,
      output: 100,
      title: 'Refactor del watcher',
      text: 'arreglemos el watcher recursivo del file tree'
    },
    {
      projectDir: '-Users-e2e-beta',
      sessionId: BETA,
      cwd: cwds.beta,
      iso: '2026-08-21T12:00:00Z',
      model: 'claude-opus-5',
      input: 50,
      output: 50,
      title: 'Pagos con Stripe',
      text: 'integrar pagos con stripe y webhooks'
    }
  ])
  writeFileSync(
    join(userData, 'know-cards.json'),
    JSON.stringify({
      version: 1,
      cards: {
        [ALPHA]: {
          summary: 'Se arregló el watcher del árbol de archivos.',
          facts: [
            {
              id: `${ALPHA}#1`,
              text: 'Se decidió usar un debounce de 3 s en el watcher',
              kind: 'decision',
              entities: ['watcher', 'src/main/fs/fs-service.ts'],
              ts: 1
            },
            {
              id: `${ALPHA}#2`,
              text: 'Falta cubrir el caso de renombrado',
              kind: 'pendiente',
              entities: ['watcher'],
              ts: 1
            }
          ],
          generatedAt: 1,
          sourceLastTs: Date.parse('2026-08-20T10:00:05Z'),
          model: 'haiku',
          costUsd: 0.02
        }
      }
    })
  )
}

test('E2E-11 (AC-5/7/8): search with facts and snippets, graph, card panel, status/MCP controls, import context', async ({
  page,
  claudeProjects,
  userData,
  projectDir
}) => {
  // Real, non-temp folders as cwd: the importer (004) refuses sources whose folder is gone and
  // Graph Know (FR-10b) excludes sessions that live under system temp dirs.
  void projectDir
  const base = join(homedir(), '.hydra-e2e', `know-${Date.now() % 1_000_000}`)
  const cwds = { alpha: join(base, 'alpha'), beta: join(base, 'beta') }
  mkdirSync(cwds.alpha, { recursive: true })
  mkdirSync(cwds.beta, { recursive: true })
  try {
    seed(claudeProjects, userData, cwds)
    await run(page)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

async function run(page: import('@playwright/test').Page): Promise<void> {
  // a live pane so "Importar contexto" has a target (lastFocusedSessionId)
  await page.getByTestId('add-project').click()
  await page.getByTestId('new-session').first().click()
  await page.getByTestId('session-name-input').fill('pane-x')
  await page.getByTestId('create-session').click()
  const pane = page.locator('[data-testid=pane]').first()
  await expect(pane).toHaveCount(1)
  await pane.locator('.xterm').click()
  await expect(pane).toHaveAttribute('data-focused', 'true')

  await page.getByTestId('nav-graph').click()
  await expect(page.getByTestId('topbar-title')).toHaveText('Graph Know')
  await expect(page.getByTestId('know-status')).toContainText(
    '2 sesiones · 1 fichas · 1 pendientes',
    { timeout: 15_000 }
  )

  // AC-7: facts for the carded session, snippet for the other, empty state
  await page.getByTestId('know-search').fill('watcher')
  const hits = page.locator('[data-testid=know-hit]')
  await expect(hits).toHaveCount(1)
  await expect(hits.first()).toContainText('Refactor del watcher')
  await expect(hits.first()).toContainText('debounce de 3 s')
  await page.getByTestId('know-search').fill('stripe')
  await expect(hits).toHaveCount(1)
  await expect(hits.first()).toContainText('Pagos con Stripe')
  await expect(hits.first()).toContainText('integrar pagos con stripe')
  await page.getByTestId('know-search').fill('zzzz')
  await expect(page.getByTestId('know-empty')).toBeVisible()

  // AC-8: graph renders, session node opens the card panel
  await page.getByTestId('know-search').fill('')
  const nodes = page.locator('[data-testid=graph-node]')
  expect(await nodes.count()).toBeGreaterThanOrEqual(3)
  await page.locator(`[data-testid=graph-node][data-node-id="s:${ALPHA}"]`).click()
  await expect(page.getByTestId('know-card-panel')).toContainText('Se arregló el watcher')
  await page.locator(`[data-testid=graph-node][data-node-id="s:${BETA}"]`).click()
  await expect(page.getByTestId('know-card-panel')).toContainText('todavía no tiene ficha')

  // AC-6 (UI part): connect/disconnect through the fake registry; autoCards pref persists
  await expect(page.getByTestId('know-mcp-state')).toContainText('sin conectar')
  await page.getByTestId('know-mcp-toggle').click()
  await expect(page.getByTestId('know-mcp-state')).toContainText('MCP conectado')
  await page.getByTestId('know-mcp-toggle').click()
  await expect(page.getByTestId('know-mcp-state')).toContainText('sin conectar')
  await page.getByTestId('know-autocards').uncheck()
  await expect
    .poll(() => page.evaluate(() => window.hydra.invoke('know.getPrefs').then((p) => p.autoCards)))
    .toBe(false)

  // AC-3 (UI): generate one card through the fake CLI
  await page.locator(`[data-testid=graph-node][data-node-id="s:${BETA}"]`).click()
  await page.getByTestId('know-generate-one').click()
  await expect(page.getByTestId('know-card-panel')).toContainText('Ficha falsa', {
    timeout: 10_000
  })
  await expect(page.getByTestId('know-status')).toContainText('2 fichas')

  // AC-7: import context from a hit → back to sessions, pasted into the focused pane (004 path)
  await page.getByTestId('know-search').fill('watcher')
  await page.getByTestId('know-import').first().click()
  await expect(page.getByTestId('topbar-title')).toHaveText('Sesiones')
  await expect
    .poll(
      async () => {
        const recs = await page.evaluate(() => window.hydra.invoke('e2e.ptyRecords'))
        return recs
          .flatMap((r) => r.writes)
          .some((w) => w.startsWith('\x1b[200~') && w.includes('Refactor del watcher'))
      },
      { timeout: 15_000 }
    )
    .toBe(true)
}
