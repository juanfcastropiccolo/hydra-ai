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
  /** Fake ~/.claude/projects for analytics specs (empty for the rest). */
  claudeProjects: string
  /** Extra env for the launched app (override per spec with test.use). */
  launchEnv: Record<string, string>
}

/** Launches the built app in E2E mode with fake CLI/PTY and a temp user-data dir. */
export const test = base.extend<HydraFixture>({
  launchEnv: [{}, { option: true }],
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
  // eslint-disable-next-line no-empty-pattern
  claudeProjects: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'hydra-e2e-claude-'))
    await use(dir)
    rmSync(dir, { recursive: true, force: true })
  },
  app: async ({ userData, projectDir, claudeProjects, launchEnv }, use) => {
    const app = await electron.launch({
      args: [join(process.cwd(), 'out/main/index.js')],
      env: {
        ...process.env,
        TZ: 'UTC', // deterministic day/hour buckets in analytics specs
        HYDRA_E2E: '1',
        HYDRA_USER_DATA: userData,
        HYDRA_E2E_PICK_FOLDER: projectDir,
        HYDRA_E2E_CLAUDE_PROJECTS: claudeProjects,
        ...launchEnv
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

// ---- feature 005: fake transcripts ----------------------------------------------------------

export interface FakeSessionSpec {
  projectDir: string
  sessionId: string
  cwd: string
  iso: string
  model: string
  input: number
  output: number
  title?: string
  turns?: number
}

/** Write one minimal transcript per spec under `root` (mirrors ~/.claude/projects layout). */
export function seedTranscripts(root: string, specs: FakeSessionSpec[]): void {
  for (const f of specs) {
    const dir = join(root, f.projectDir)
    mkdirSync(dir, { recursive: true })
    const base = {
      cwd: f.cwd,
      sessionId: f.sessionId,
      version: '2.1.241',
      isSidechain: false,
      userType: 'external'
    }
    const lines: string[] = []
    if (f.title)
      lines.push(JSON.stringify({ type: 'ai-title', aiTitle: f.title, sessionId: f.sessionId }))
    const turns = f.turns ?? 1
    for (let i = 0; i < turns; i++) {
      const ts = new Date(Date.parse(f.iso) + i * 60_000).toISOString()
      lines.push(
        JSON.stringify({
          ...base,
          type: 'user',
          uuid: `u${i}`,
          parentUuid: null,
          timestamp: ts,
          message: { role: 'user', content: `pregunta ${i}` }
        })
      )
      lines.push(
        JSON.stringify({
          ...base,
          type: 'assistant',
          uuid: `a${i}`,
          parentUuid: null,
          timestamp: new Date(Date.parse(ts) + 5000).toISOString(),
          message: {
            id: `msg_${f.sessionId.slice(0, 4)}_${i}`,
            model: f.model,
            role: 'assistant',
            content: [{ type: 'text', text: 'ok' }],
            usage: {
              input_tokens: f.input / turns,
              output_tokens: f.output / turns,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0
            }
          }
        })
      )
      lines.push(
        JSON.stringify({
          ...base,
          type: 'system',
          subtype: 'turn_duration',
          durationMs: 60000,
          timestamp: ts,
          uuid: `d${i}`,
          parentUuid: null
        })
      )
    }
    writeFileSync(join(dir, `${f.sessionId}.jsonl`), lines.join('\n') + '\n')
  }
}
