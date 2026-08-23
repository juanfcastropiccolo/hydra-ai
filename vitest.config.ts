import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

// Unit + integration tests for the Node side (main, preload, shared).
// Renderer is covered by Playwright E2E (see plan 001 / test plan).
export default defineConfig({
  resolve: { alias: { '@shared': resolve('src/shared') } },
  test: {
    environment: 'node',
    include: [
      'src/{main,preload,shared}/**/*.test.ts',
      'src/renderer/src/store/**/*.test.ts',
      'src/renderer/src/components/file-tree/*.test.ts',
      'test/**/*.test.ts'
    ],
    exclude: [
      '**/node_modules/**',
      'out/**',
      'release/**',
      'spikes/**',
      'e2e/**',
      'playwright-report/**'
    ],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/main/**', 'src/shared/**', 'src/renderer/src/store/**'],
      exclude: ['src/main/index.ts', '**/*.test.ts', '**/*.d.ts'],
      reporter: ['text', 'html']
    }
  }
})
