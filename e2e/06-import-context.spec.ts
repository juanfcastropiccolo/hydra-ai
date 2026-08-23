// Feature 004 — E2E-6/7/8 with the fake CLI (canned summary) and fake PTYs (recorded writes).
import { expect, test } from './fixtures'

type Page = import('@playwright/test').Page
const BP_START = '\x1b[200~'
const BP_END = '\x1b[201~'

async function createSession(page: Page, name: string): Promise<void> {
  await page.getByTestId('new-session').first().click()
  await page.getByTestId('session-name-input').fill(name)
  await page.getByTestId('create-session').click()
  await expect(page.getByTestId('pane').filter({ hasText: name })).toHaveCount(1)
}
async function setup(
  page: Page
): Promise<{ a: ReturnType<Page['getByTestId']>; b: ReturnType<Page['getByTestId']> }> {
  await page.getByTestId('add-project').click()
  await createSession(page, 'pane-a') // fake0001
  await createSession(page, 'pane-b') // fake0002
  // by session id: B's toast mentions A's name, so hasText would match both
  const a = page.locator('[data-testid=pane][data-session-id$="000000000001"]')
  const b = page.locator('[data-testid=pane][data-session-id$="000000000002"]')
  await expect(b.getByTestId('status-light')).toHaveAttribute('data-state', 'idle')
  return { a, b }
}
const writesOf = (page: Page, bgId: string): Promise<string[]> =>
  page.evaluate(
    (id) =>
      window.hydra
        .invoke('e2e.ptyRecords')
        .then((r) => r.find((x) => x.args.includes(id))?.writes ?? []),
    bgId
  )
const setStatus = (page: Page, bgId: string, status: string): Promise<void> =>
  page.evaluate((p) => window.hydra.invoke('e2e.setStatus', p), { bgId, status })

test('E2E-6 (AC-1/3/4/9): button state, dialog, summary pasted as one bracketed block without Enter', async ({
  page
}) => {
  const { a, b } = await setup(page)

  // FR-1: enabled when idle; disabled with a reason when working
  await expect(b.getByTestId('pane-import')).toBeEnabled()
  await setStatus(page, 'fake0001', 'working')
  await expect(a.getByTestId('status-light')).toHaveAttribute('data-state', 'working')
  await expect(a.getByTestId('pane-import')).toBeDisabled()
  await expect(a.getByTestId('pane-import')).toHaveAttribute('title', /trabajando/)
  await setStatus(page, 'fake0001', 'idle')
  await expect(a.getByTestId('pane-import')).toBeEnabled()

  // FR-2/3/7: dialog lists A (not B), grouped, shows the model; filter works
  await b.getByTestId('pane-import').click()
  const dialog = page.getByTestId('import-context-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('import-candidate')).toHaveCount(1)
  await expect(dialog.getByTestId('import-candidate')).toContainText('pane-a')
  await expect(dialog.getByTestId('import-model')).toContainText('haiku')
  await dialog.getByTestId('import-filter').fill('zzz')
  await expect(dialog.getByTestId('import-empty')).toBeVisible()
  await dialog.getByTestId('import-filter').fill('')
  await dialog.getByTestId('import-confirm').click()
  await expect(dialog).toHaveCount(0)

  // FR-10/11/13: the bracketed block is written twice (the second paste makes Claude Code expand
  // the "[Pasted text]" placeholder; the CLI submits one copy), no \r, toast, focus on B
  await expect.poll(async () => (await writesOf(page, 'fake0002')).length).toBe(2)
  const [w, w2] = await writesOf(page, 'fake0002')
  expect(w2).toBe(w)
  expect(w?.startsWith(BP_START)).toBe(true)
  expect(w?.endsWith(BP_END)).toBe(true)
  expect(w).toContain('Te comparto, como contexto de referencia')
  expect(w).toContain('llamada "pane-a"')
  expect(w).toContain('<imported-context session="pane-a"')
  expect(w).toContain('PELICANO-42')
  expect(w).not.toContain('\r')
  await expect(b.getByTestId('pane-toast')).toContainText('Contexto de pane-a listo para enviar')
  await expect(b).toHaveAttribute('data-focused', 'true')
  // A untouched, other panes unaffected
  expect(await writesOf(page, 'fake0001')).toEqual([])
  await expect(a).toHaveAttribute('data-focused', 'false')
  await expect(b.getByTestId('pane-toast')).toHaveCount(0, { timeout: 5000 })
  await expect(b.getByTestId('pane-import')).toBeEnabled()
})

test.describe('slow summary', () => {
  test.use({ launchEnv: { HYDRA_E2E_SUMMARY_DELAY_MS: '3000' } })

  test('E2E-7 (AC-4/7): target busy when the text arrives → blocked banner, copy/retry; cancel leaves nothing', async ({
    page
  }) => {
    const { b } = await setup(page)
    await b.getByTestId('pane-import').click()
    await page.getByTestId('import-confirm').click()
    await expect(b.getByTestId('import-progress')).toContainText('Resumiendo el contexto de pane-a')
    await expect(b.getByTestId('pane-import')).toBeDisabled()
    await setStatus(page, 'fake0002', 'working')
    await expect(b.getByTestId('status-light')).toHaveAttribute('data-state', 'working')
    await expect(b.getByTestId('import-blocked')).toBeVisible({ timeout: 10_000 })
    expect(await writesOf(page, 'fake0002')).toEqual([])
    // back to idle + retry → pasted
    await setStatus(page, 'fake0002', 'idle')
    await expect(b.getByTestId('status-light')).toHaveAttribute('data-state', 'idle')
    await b.getByTestId('import-retry-paste').click()
    await expect.poll(async () => (await writesOf(page, 'fake0002')).length).toBe(2)
    expect((await writesOf(page, 'fake0002'))[0]).toContain(BP_START)
    await expect(b.getByTestId('pane-toast')).toContainText('listo para enviar')

    // E2E-8: cancel during the wait → no new write, button enabled again
    await expect(b.getByTestId('pane-import')).toBeEnabled({ timeout: 5000 })
    await b.getByTestId('pane-import').click()
    await page.getByTestId('import-confirm').click()
    await expect(b.getByTestId('import-progress')).toBeVisible()
    await b.getByTestId('import-cancel-progress').click()
    await expect(b.getByTestId('import-progress')).toHaveCount(0)
    await expect(b.getByTestId('pane-import')).toBeEnabled()
    await page.waitForTimeout(3500)
    expect((await writesOf(page, 'fake0002')).length).toBe(2)
  })

  test('E2E-8b: importing into a hidden pane pastes when it is shown again', async ({ page }) => {
    const { b } = await setup(page)
    await b.getByTestId('pane-import').click()
    await page.getByTestId('import-confirm').click()
    await expect(b.getByTestId('import-progress')).toBeVisible()
    await b.getByTestId('pane-hide').click()
    await expect(b).toHaveCount(0)
    await page.waitForTimeout(3500) // summary resolves while hidden
    await page.getByTestId('session-item').filter({ hasText: 'pane-b' }).click()
    const b2 = page.locator('[data-testid=pane][data-session-id$="000000000002"]')
    await expect(b2).toHaveCount(1)
    // the re-shown pane gets a new fake PTY; the paste lands there
    await expect
      .poll(async () => {
        const recs = await page.evaluate(() => window.hydra.invoke('e2e.ptyRecords'))
        return recs.filter((r) => r.args.includes('fake0002')).flatMap((r) => r.writes).length
      })
      .toBe(2)
    await expect(b2.getByTestId('pane-toast')).toContainText('listo para enviar')
  })
})
