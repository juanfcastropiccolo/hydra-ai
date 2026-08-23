/* eslint-disable @typescript-eslint/no-require-imports */
// Integration smoke test (task 3): node-pty must load and work INSIDE Electron's main
// process (its Node ABI), not just under plain Node. Run: `npm run test:electron`.
// Exits 0 on success, 1 on failure/timeout.
const { app } = require('electron')
const pty = require('@lydell/node-pty')

const TIMEOUT_MS = 10_000

app.whenReady().then(() => {
  const timer = setTimeout(() => {
    console.error(`[pty-smoke] FAIL: no "hi" received within ${TIMEOUT_MS}ms`)
    app.exit(1)
  }, TIMEOUT_MS)

  let out = ''
  const term = pty.spawn('/bin/zsh', ['-c', 'echo hi'], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env: process.env
  })
  term.onData((d) => {
    out += d
  })
  term.onExit(({ exitCode }) => {
    clearTimeout(timer)
    const ok = exitCode === 0 && /hi/.test(out)
    console.log(
      `[pty-smoke] ${ok ? 'OK' : 'FAIL'} electron=${process.versions.electron} node=${process.versions.node} ` +
        `arch=${process.arch} exit=${exitCode} out=${JSON.stringify(out.trim())}`
    )
    app.exit(ok ? 0 : 1)
  })
})
