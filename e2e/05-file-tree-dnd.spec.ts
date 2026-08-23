import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { expect, seedGitProject, test } from './fixtures'

async function createSession(page: import('@playwright/test').Page, name: string): Promise<void> {
  await page.getByTestId('new-session').first().click()
  await page.getByTestId('session-name-input').fill(name)
  await page.getByTestId('create-session').click()
  await expect(page.getByTestId('pane').filter({ hasText: name })).toHaveCount(1)
}

test('AC-2/9/12: tree follows focus between projects; drop types the path into the target pane; switching views never re-attaches', async ({
  page,
  projectDir
}) => {
  seedGitProject(projectDir)
  const other = mkdtempSync(join(tmpdir(), 'hydra-e2e-other-'))
  seedGitProject(other)
  try {
    // project A (picker returns projectDir)
    await page.getByTestId('add-project').click()
    await createSession(page, 'pane-a')
    // project B: add via IPC directly (picker is fixed to projectDir)
    await page.evaluate((p) => window.hydra.invoke('projects.add', { path: p }), other)
    await expect(page.getByTestId('project')).toHaveCount(2)
    await page
      .locator(`[data-testid=project][data-project-id]`)
      .nth(1)
      .getByTestId('new-session')
      .click()
    await page.getByTestId('session-name-input').fill('pane-b')
    await page.getByTestId('create-session').click()
    const a = page.getByTestId('pane').filter({ hasText: 'pane-a' })
    const b = page.getByTestId('pane').filter({ hasText: 'pane-b' })
    await expect(b).toHaveCount(1)

    // follow focus
    await a.locator('.xterm').click()
    await page.getByTestId('tab-files').click()
    await expect(page.getByTestId('file-tree-title')).toHaveText(basename(projectDir))
    await b.locator('.xterm').click()
    await expect(page.getByTestId('file-tree-title')).toHaveText(basename(other))
    await a.locator('.xterm').click()
    await expect(page.getByTestId('file-tree-title')).toHaveText(basename(projectDir))

    // drag src/index.ts (of project A) onto pane A → relative; onto pane B → absolute
    await page.locator('[data-testid=tree-row][data-rel="src"] [data-caret]').click()
    const row = page.locator('[data-testid=tree-row][data-rel="src/index.ts"]')
    await expect(row).toBeVisible()
    await row.dragTo(a)
    await expect
      .poll(async () => {
        const recs = await page.evaluate(() => window.hydra.invoke('e2e.ptyRecords'))
        return recs.find((r) => r.args.includes('fake0001'))?.writes.join('')
      })
      .toBe('src/index.ts ')
    await expect(a).toHaveAttribute('data-focused', 'true')
    await row.dragTo(b)
    await expect
      .poll(async () => {
        const recs = await page.evaluate(() => window.hydra.invoke('e2e.ptyRecords'))
        return recs.find((r) => r.args.includes('fake0002'))?.writes.join('')
      })
      .toBe(`${join(projectDir, 'src/index.ts')} `)

    // switching views 5× keeps the same PTYs (no re-attach) and typing still goes to the focused pane
    const before = (await page.evaluate(() => window.hydra.invoke('e2e.ptyRecords'))).map(
      (r) => r.pid
    )
    for (let i = 0; i < 5; i++) {
      await page.getByTestId(i % 2 === 0 ? 'tab-sessions' : 'tab-files').click()
      await page.waitForTimeout(100)
    }
    const after = (await page.evaluate(() => window.hydra.invoke('e2e.ptyRecords'))).map(
      (r) => r.pid
    )
    expect(after).toEqual(before)
    await a.locator('.xterm').click()
    await page.keyboard.type('ok')
    await expect
      .poll(async () => {
        const recs = await page.evaluate(() => window.hydra.invoke('e2e.ptyRecords'))
        return recs.find((r) => r.args.includes('fake0001'))?.writes.join('')
      })
      .toBe('src/index.ts ok')
  } finally {
    rmSync(other, { recursive: true, force: true })
  }
})
