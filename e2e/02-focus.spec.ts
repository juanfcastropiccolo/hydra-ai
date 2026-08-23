import { expect, test } from './fixtures'

async function createSession(page: import('@playwright/test').Page, name: string): Promise<void> {
  await page.getByTestId('new-session').click()
  await page.getByTestId('session-name-input').fill(name)
  await page.getByTestId('create-session').click()
  await expect(page.getByTestId('pane').filter({ hasText: name })).toHaveCount(1)
}

test('AC-4/AC-5: typing goes only to the focused pane; no pane focused → nothing receives keys', async ({
  page
}) => {
  await page.getByTestId('add-project').click()
  await createSession(page, 'pane-a')
  await createSession(page, 'pane-b')
  const a = page.getByTestId('pane').filter({ hasText: 'pane-a' })
  const b = page.getByTestId('pane').filter({ hasText: 'pane-b' })
  await expect(a.locator('.xterm-rows')).toContainText('fake tui')
  await expect(b.locator('.xterm-rows')).toContainText('fake tui')

  // click B, type
  await b.locator('.xterm').click()
  await expect(b).toHaveAttribute('data-focused', 'true')
  await expect(a).toHaveAttribute('data-focused', 'false')
  await page.keyboard.type('hola')
  await expect
    .poll(async () => {
      const recs = await page.evaluate(() => window.hydra.invoke('e2e.ptyRecords'))
      const byArg = Object.fromEntries(recs.map((r) => [r.args.join(' '), r.writes.join('')]))
      return byArg
    })
    .toMatchObject({ 'attach fake0002': 'hola' })
  const recsAfter = await page.evaluate(() => window.hydra.invoke('e2e.ptyRecords'))
  expect(recsAfter.find((r) => r.args.includes('fake0001'))?.writes.join('')).toBe('')

  // click the sidebar (non-terminal) → no pane focused → typing reaches nobody
  await page.getByTestId('project-name').click()
  await expect(b).toHaveAttribute('data-focused', 'false')
  await page.keyboard.type('xyz')
  await page.waitForTimeout(200)
  const recsFinal = await page.evaluate(() => window.hydra.invoke('e2e.ptyRecords'))
  expect(recsFinal.map((r) => r.writes.join(''))).toEqual(['', 'hola'])
})

test('AC-7: status light turns red and project badge counts when a session waits for input', async ({
  page
}) => {
  await page.getByTestId('add-project').click()
  await createSession(page, 'pane-a')
  await page.evaluate(() =>
    window.hydra.invoke('e2e.setStatus', {
      bgId: 'fake0001',
      status: 'waiting',
      waitingFor: 'permission prompt'
    })
  )
  await expect(page.getByTestId('pane').getByTestId('status-light')).toHaveAttribute(
    'data-state',
    'waiting'
  )
  await expect(page.getByTestId('attention-badge')).toHaveText('1')
  await page.evaluate(() =>
    window.hydra.invoke('e2e.setStatus', { bgId: 'fake0001', status: 'working' })
  )
  await expect(page.getByTestId('pane').getByTestId('status-light')).toHaveAttribute(
    'data-state',
    'working'
  )
  await expect(page.getByTestId('attention-badge')).toHaveCount(0)
})
