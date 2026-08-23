import { writeFileSync, mkdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { expect, seedGitProject, test } from './fixtures'

async function createSession(page: import('@playwright/test').Page, name: string): Promise<void> {
  await page.getByTestId('new-session').click()
  await page.getByTestId('session-name-input').fill(name)
  await page.getByTestId('create-session').click()
  await expect(page.getByTestId('pane').filter({ hasText: name })).toHaveCount(1)
}

test('AC-1/3/4: files tab shows the focused project tree with icons, git badges, ignored dimmed, .git hidden', async ({
  page,
  projectDir
}) => {
  seedGitProject(projectDir)
  await page.getByTestId('add-project').click()
  await createSession(page, 's1')

  await page.getByTestId('tab-files').click()
  await expect(page.getByTestId('sidebar')).toHaveAttribute('data-view', 'files')
  await expect(page.getByTestId('file-tree-title')).toHaveText(basename(projectDir))
  await expect(page.getByTestId('file-tree-path')).toHaveText(projectDir)
  const rows = page.getByTestId('tree-row')
  await expect(rows.first()).toBeVisible()
  const rels = await rows.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset['rel']))
  // folders first (dist, src), then files; .git hidden
  expect(rels).toEqual(['dist', 'src', '.gitignore', 'nuevo.ts', 'README.md'])
  const row = (rel: string): import('@playwright/test').Locator =>
    page.locator(`[data-testid=tree-row][data-rel="${rel}"]`)
  await expect(row('dist')).toHaveAttribute('data-status', 'ignored')
  await expect(row('src')).toHaveAttribute('data-status', 'modified')
  await expect(row('nuevo.ts')).toHaveAttribute('data-status', 'untracked')
  await expect(row('README.md')).toHaveAttribute('data-status', '')
  // icons
  await expect(
    page.locator('[data-testid=tree-row][data-rel="README.md"] [data-testid=file-icon]')
  ).toHaveAttribute('data-glyph', 'MD')
  await expect(
    page.locator('[data-testid=tree-row][data-rel="src"] [data-testid=file-icon]')
  ).toHaveAttribute('data-folder', 'src')

  // lazy expand src → index.ts modified
  await page.locator('[data-testid=tree-row][data-rel="src"] [data-caret]').click()
  await expect(page.locator('[data-testid=tree-row][data-rel="src/index.ts"]')).toHaveAttribute(
    'data-status',
    'modified'
  )

  // back to sessions view and again (⌘⇧E via app menu) — prefs persist in-store
  await page.getByTestId('tab-sessions').click()
  await expect(page.getByTestId('sidebar')).toHaveAttribute('data-view', 'sessions')
})

test('AC-5/10: live updates highlight new files; filter is a flat match list', async ({
  page,
  projectDir
}) => {
  seedGitProject(projectDir)
  await page.getByTestId('add-project').click()
  await createSession(page, 's1')
  await page.getByTestId('tab-files').click()
  await page.locator('[data-testid=tree-row][data-rel="src"] [data-caret]').click()
  await expect(page.locator('[data-testid=tree-row][data-rel="src/index.ts"]')).toBeVisible()

  // create from outside
  mkdirSync(join(projectDir, 'src/nuevo'))
  writeFileSync(join(projectDir, 'src/nuevo/archivo.ts'), '')
  const t0 = Date.now()
  await expect(page.locator('[data-testid=tree-row][data-rel="src/nuevo"]')).toBeVisible({
    timeout: 3000
  })
  expect(Date.now() - t0).toBeLessThan(2500)
  // src stays expanded, new row highlighted
  await expect(page.locator('[data-testid=tree-row][data-rel="src/index.ts"]')).toBeVisible()
  const cls = await page
    .locator('[data-testid=tree-row][data-rel="src/nuevo"]')
    .getAttribute('class')
  expect(cls).toMatch(/highlight/)

  // filter
  await page.getByTestId('file-tree-filter').fill('index')
  await expect
    .poll(async () =>
      page
        .getByTestId('tree-row')
        .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset['rel']))
    )
    .toEqual(['src/index.ts'])
  await page.getByTestId('file-tree-filter').fill('')
  await expect(page.locator('[data-testid=tree-row][data-rel="src/index.ts"]')).toBeVisible()
  // collapse all
  await page.getByTestId('file-tree-collapse-all').click()
  await expect(page.locator('[data-testid=tree-row][data-rel="src/index.ts"]')).toHaveCount(0)
})

test('AC-11: keyboard navigation; Esc hands focus back to the last pane', async ({
  page,
  projectDir
}) => {
  seedGitProject(projectDir)
  await page.getByTestId('add-project').click()
  await createSession(page, 's1')
  const pane = page.getByTestId('pane')
  await pane.locator('.xterm').click()
  await expect(pane).toHaveAttribute('data-focused', 'true')
  await page.getByTestId('tab-files').click()
  await page.getByTestId('file-tree-body').focus()
  await expect(pane).toHaveAttribute('data-focused', 'false')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('[data-testid=tree-row][data-selected=true]')).toHaveAttribute(
    'data-rel',
    'src'
  )
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-testid=tree-row][data-rel="src/index.ts"]')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(pane).toHaveAttribute('data-focused', 'true')
})
