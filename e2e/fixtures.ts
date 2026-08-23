import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  _electron as electron,
  test as base,
  type ElectronApplication,
  type Page
} from '@playwright/test'

export interface HydraFixture {
  app: ElectronApplication
  page: Page
  userData: string
  projectDir: string
}

/** Launches the built app in E2E mode with fake CLI/PTY and a temp user-data dir. */
export const test = base.extend<HydraFixture>({
  // eslint-disable-next-line no-empty-pattern
  userData: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'hydra-e2e-ud-'))
    await use(dir)
    rmSync(dir, { recursive: true, force: true })
  },
  // eslint-disable-next-line no-empty-pattern
  projectDir: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'hydra-e2e-proj-'))
    await use(dir)
    rmSync(dir, { recursive: true, force: true })
  },
  app: async ({ userData, projectDir }, use) => {
    const app = await electron.launch({
      args: [join(process.cwd(), 'out/main/index.js')],
      env: {
        ...process.env,
        HYDRA_E2E: '1',
        HYDRA_USER_DATA: userData,
        HYDRA_E2E_PICK_FOLDER: projectDir
      }
    })
    await use(app)
    await app.close()
  },
  page: async ({ app }, use) => {
    const page = await app.firstWindow()
    await page.waitForSelector('[data-testid=sidebar]')
    await use(page)
  }
})
export { expect } from '@playwright/test'

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

/** Turn `dir` into a small git repo with known statuses (M / U / ignored). */
export function seedGitProject(dir: string): void {
  const git = (args: string[]): void => {
    execFileSync('git', args, { cwd: dir, stdio: 'ignore' })
  }
  mkdirSync(join(dir, 'src'), { recursive: true })
  mkdirSync(join(dir, 'dist'), { recursive: true })
  writeFileSync(join(dir, 'src/index.ts'), 'export const a = 1\n')
  writeFileSync(join(dir, 'README.md'), '# demo\n')
  writeFileSync(join(dir, '.gitignore'), 'dist/\n')
  writeFileSync(join(dir, 'dist/bundle.js'), '')
  git(['init', '-q'])
  git(['config', 'user.email', 'e2e@hydra'])
  git(['config', 'user.name', 'e2e'])
  git(['add', '-A'])
  git(['commit', '-qm', 'init'])
  writeFileSync(join(dir, 'src/index.ts'), 'export const a = 2\n') // M
  writeFileSync(join(dir, 'nuevo.ts'), '') // U
}
