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
