import { expect, test } from './fixtures'

async function createSession(page: import('@playwright/test').Page, name: string): Promise<void> {
  await page.getByTestId('new-session').click()
  await page.getByTestId('session-name-input').fill(name)
  await page.getByTestId('create-session').click()
  await expect(page.getByTestId('pane').filter({ hasText: name })).toHaveCount(1)
}

test('AC-9/AC-10/AC-18: expand by button & double-click, collapse by button/dblclick/Esc, resize reaches the PTY', async ({
  page,
  app
}) => {
  await page.getByTestId('add-project').click()
  await createSession(page, 'p1')
  await createSession(page, 'p2')
  await createSession(page, 'p3')
  const grid = page.getByTestId('pane-grid')
  // While expanded the pane's header (its name) lives in the topbar, so resolve p2 by id.
  const p2Id = await page
    .getByTestId('pane')
    .filter({ hasText: 'p2' })
    .getAttribute('data-session-id')
  const p2 = page.locator(`[data-testid=pane][data-session-id="${p2Id}"]`)
  // The expanded pane's header (name + actions) is portaled into the topbar.
  const topbarPane = page.getByTestId('topbar-pane')
  const widthBefore = (await p2.boundingBox())!.width

  // expand by button
  await p2.getByTestId('pane-expand').click()
  await expect(grid).toHaveAttribute('data-expanded', 'true')
  await expect(p2).toHaveAttribute('data-expanded', 'true')
  expect((await p2.boundingBox())!.width).toBeGreaterThan(widthBefore * 1.5)
  // header moved to the topbar: name + actions there, "Sesiones"/Claude status gone, none inside the pane
  await expect(topbarPane.getByTestId('pane-title')).toHaveText('p2')
  await expect(topbarPane.getByTestId('pane-expand')).toBeVisible()
  await expect(page.getByTestId('topbar-title')).toHaveCount(0)
  await expect(page.getByTestId('claude-status')).toHaveCount(0)
  await expect(p2.getByTestId('pane-header')).toHaveCount(0)
  // others stay mounted (3 panes in DOM)
  await expect(page.getByTestId('pane')).toHaveCount(3)
  // collapse by button (in the topbar)
  await topbarPane.getByTestId('pane-expand').click()
  await expect(grid).toHaveAttribute('data-expanded', 'false')
  await expect(page.getByTestId('topbar-title')).toHaveText('Sesiones')
  await expect(page.getByTestId('topbar-pane')).toHaveCount(0)
  await expect(p2.getByTestId('pane-header')).toContainText('p2')

  // expand by double-click on the terminal area (AC-10), no text selected
  await p2.locator('.xterm').dblclick()
  await expect(grid).toHaveAttribute('data-expanded', 'true')
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('')
  // Esc while terminal focused → stays expanded (FR-16)
  await page.keyboard.press('Escape')
  await expect(grid).toHaveAttribute('data-expanded', 'true')
  // blur terminal (click sidebar) then Esc → collapses
  await page.getByTestId('project-name').click()
  await page.keyboard.press('Escape')
  await expect(grid).toHaveAttribute('data-expanded', 'false')
  // dblclick toggles again
  await p2.locator('.xterm').dblclick()
  await expect(grid).toHaveAttribute('data-expanded', 'true')
  // dblclick on the topbar header (portal → still bubbles to the pane) collapses too
  await topbarPane.getByTestId('pane-header').dblclick()
  await expect(grid).toHaveAttribute('data-expanded', 'false')

  // resize window → PTY receives a new size (AC-18)
  const before = await page.evaluate(() => window.hydra.invoke('e2e.ptyRecords'))
  const win = await app.browserWindow(page)
  await win.evaluate((w) => w.setSize(1000, 700))
  await expect
    .poll(async () => {
      const after = await page.evaluate(() => window.hydra.invoke('e2e.ptyRecords'))
      return after.map((r) => r.resizes.length).reduce((a, b) => a + b, 0)
    })
    .toBeGreaterThan(before.map((r) => r.resizes.length).reduce((a, b) => a + b, 0))
  const after = await page.evaluate(() => window.hydra.invoke('e2e.ptyRecords'))
  for (const r of after) {
    const last = r.resizes[r.resizes.length - 1]!
    expect(last.cols).toBeGreaterThan(10)
    expect(last.rows).toBeGreaterThan(3)
  }
})

test('AC-13: hide keeps the session in the sidebar; clicking it shows the pane again', async ({
  page
}) => {
  await page.getByTestId('add-project').click()
  await createSession(page, 'p1')
  await page.getByTestId('pane-hide').click()
  await expect(page.getByTestId('pane')).toHaveCount(0)
  await expect(page.getByTestId('session-item')).toContainText('oculta')
  await page.getByTestId('session-item').click()
  await expect(page.getByTestId('pane')).toHaveCount(1)
  await expect(page.getByTestId('pane')).toHaveAttribute('data-focused', 'true')
})

test('008 AC-1..4: split view — pick B from the expanded header; dblclick, ◫ on B and hiding A leave it', async ({
  page
}) => {
  await page.getByTestId('add-project').click()
  await createSession(page, 'p1')
  await createSession(page, 'p2')
  await createSession(page, 'p3')
  const grid = page.getByTestId('pane-grid')
  const idOf = (name: string): Promise<string | null> =>
    page.getByTestId('pane').filter({ hasText: name }).getAttribute('data-session-id')
  const p2 = page.locator(`[data-testid=pane][data-session-id="${await idOf('p2')}"]`)
  const p3Id = await idOf('p3')
  const p3 = page.locator(`[data-testid=pane][data-session-id="${p3Id}"]`)
  const topA = page.getByTestId('topbar-pane')
  const topB = page.getByTestId('topbar-pane-b')
  const pickP3 = async (): Promise<void> => {
    await topA.getByTestId('pane-split').click()
    await page.getByTestId('split-menu').locator(`[data-session-id="${p3Id}"]`).click()
  }
  const cell = (await p2.boundingBox())!

  // AC-1: expand p2, ◫ → pick p3 → two halves (full height), both headers in the topbar, all panes mounted
  await p2.getByTestId('pane-expand').click()
  const full = (await p2.boundingBox())!
  await expect(topB).toHaveCount(0)
  await pickP3()
  await expect(grid).toHaveAttribute('data-split', 'true')
  await expect(p2).toHaveAttribute('data-split', 'true')
  await expect(p3).toHaveAttribute('data-split', 'true')
  const a = (await p2.boundingBox())!
  const b = (await p3.boundingBox())!
  expect(Math.abs(a.width - full.width / 2)).toBeLessThan(10)
  expect(Math.abs(a.width - b.width)).toBeLessThan(8)
  expect(a.height).toBeGreaterThan(cell.height * 1.2) // grid rows are 420px; split is full height
  expect(b.x).toBeGreaterThan(a.x + a.width - 8) // side by side
  await expect(topA.getByTestId('pane-title')).toHaveText('p2')
  await expect(topB.getByTestId('pane-title')).toHaveText('p3')
  await expect(page.getByTestId('pane')).toHaveCount(3)

  // AC-2: dblclick on B → grid
  await p3.locator('.xterm').dblclick()
  await expect(grid).toHaveAttribute('data-expanded', 'false')
  await expect(grid).toHaveAttribute('data-split', 'false')

  // AC-3: ◫ on B → A stays expanded alone
  await p2.getByTestId('pane-expand').click()
  await pickP3()
  await topB.getByTestId('pane-split').click()
  await expect(grid).toHaveAttribute('data-expanded', 'true')
  await expect(grid).toHaveAttribute('data-split', 'false')
  await expect(p2).toHaveAttribute('data-expanded', 'true')
  await expect(topB).toHaveCount(0)

  // AC-4: hide A → B is promoted to the expanded pane
  await pickP3()
  await topA.getByTestId('pane-hide').click()
  await expect(grid).toHaveAttribute('data-split', 'false')
  await expect(p3).toHaveAttribute('data-expanded', 'true')
  await expect(topA.getByTestId('pane-title')).toHaveText('p3')
})
