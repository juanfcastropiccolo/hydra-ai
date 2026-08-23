import { defineConfig } from '@playwright/test'

// E2E against the BUILT app (out/). Run: npm run test:e2e  (builds first).
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' }
})
