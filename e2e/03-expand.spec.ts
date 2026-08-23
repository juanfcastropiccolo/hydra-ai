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
  const p2 = page.getByTestId('pane').filter({ hasText: 'p2' })
  const widthBefore = (await p2.boundingBox())!.width

  // expand by button
  await p2.getByTestId('pane-expand').click()
  await expect(grid).toHaveAttribute('data-expanded', 'true')
  await expect(p2).toHaveAttribute('data-expanded', 'true')
  expect((await p2.boundingBox())!.width).toBeGreaterThan(widthBefore * 1.5)
  // others stay mounted (3 panes in DOM)
  await expect(page.getByTestId('pane')).toHaveCount(3)
  // collapse by button
  await p2.getByTestId('pane-expand').click()
  await expect(grid).toHaveAttribute('data-expanded', 'false')

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
  await p2.getByTestId('pane-header').dblclick()
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
