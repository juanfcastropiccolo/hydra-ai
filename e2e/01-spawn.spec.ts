import { basename } from 'node:path'
import { expect, test } from './fixtures'

test('harness boots: empty sidebar, Claude available (fake)', async ({ page }) => {
  await expect(page.getByTestId('project-list')).toContainText('Ningún proyecto')
  await expect(page.getByTestId('claude-status')).toContainText('0.0.0-e2e')
})

test('AC-1/AC-2/2b/2c: add project → new session dialog → cancel → create → pane with title and focus', async ({
  page,
  projectDir
}) => {
  await page.getByTestId('add-project').click()
  await expect(page.getByTestId('project-name')).toHaveText(basename(projectDir))

  // open dialog: name pre-filled, folder shown, cancel creates nothing
  await page.getByTestId('new-session').click()
  const dialog = page.getByTestId('new-session-dialog')
  await expect(dialog).toBeVisible()
  await expect(page.getByTestId('session-name-input')).toHaveValue(/.+-1$/)
  await expect(page.getByTestId('session-cwd')).toHaveText(projectDir)
  await page.getByTestId('cancel-session').click()
  await expect(dialog).toBeHidden()
  await expect(page.getByTestId('pane')).toHaveCount(0)

  // empty name disables create (AC-2c)
  await page.getByTestId('new-session').click()
  await page.getByTestId('session-name-input').fill('')
  await expect(page.getByTestId('create-session')).toBeDisabled()

  // create with a custom name (AC-2b)
  await page.getByTestId('session-name-input').fill('refactor-auth')
  await page.getByTestId('create-session').click()
  await expect(dialog).toBeHidden()
  const pane = page.getByTestId('pane')
  await expect(pane).toHaveCount(1)
  await expect(pane.getByTestId('pane-header')).toContainText('refactor-auth')
  await expect(pane).toHaveAttribute('data-focused', 'true')
  await expect(pane.locator('.xterm-rows')).toContainText('fake tui')
  await expect(page.getByTestId('session-item')).toHaveCount(1)
  await expect(page.getByTestId('session-item')).toContainText('refactor-auth')
})

test('FR-6: rename a session from the pane header (pencil), persisted by Hydra', async ({
  page
}) => {
  await page.getByTestId('add-project').click()
  await page.getByTestId('new-session').click()
  await page.getByTestId('create-session').click()
  await expect(page.getByTestId('pane')).toHaveCount(1)
  await page.getByTestId('pane-rename').click()
  await page.getByTestId('pane-rename-input').fill('auth-refactor')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('pane-title')).toHaveText('auth-refactor')
  await expect(page.getByTestId('session-item')).toContainText('auth-refactor')
})
