// Spike: throwaway. Opens one xterm, creates a bg Claude session, attaches to it through node-pty.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const pty = require('@lydell/node-pty');

const t0 = Date.now();
const log = (...a) => console.log(`[spike +${((Date.now() - t0) / 1000).toFixed(2)}s]`, ...a);

// --- EnvResolver (minimal): GUI apps don't inherit the shell PATH ---
function resolveEnv() {
  let shellPath = '';
  try {
    shellPath = execFileSync(process.env.SHELL || '/bin/zsh', ['-ilc', 'echo -n "$PATH"'], { encoding: 'utf8', timeout: 5000 });
  } catch (e) { log('login shell PATH failed:', e.message); }
  const PATH = [shellPath, path.join(os.homedir(), '.local/bin'), process.env.PATH].filter(Boolean).join(':');
  return { ...process.env, PATH, TERM: 'xterm-256color', COLORTERM: 'truecolor', LANG: process.env.LANG || 'en_US.UTF-8' };
}
function findClaude(env) {
  const candidates = [path.join(os.homedir(), '.local/bin/claude'), ...env.PATH.split(':').map(d => path.join(d, 'claude'))];
  return candidates.find(p => { try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; } });
}

const env = resolveEnv();
const claude = findClaude(env);
log('claude binary:', claude);
const cwd = path.join(os.tmpdir(), 'hydra-spike-cwd'); fs.mkdirSync(cwd, { recursive: true });

let win, term = null, bgId = null;

function createWindow() {
  win = new BrowserWindow({ width: 1100, height: 750, title: 'Hydra spike — claude attach in xterm.js',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false } });
  win.loadFile('index.html');
}

ipcMain.handle('spawn', async (_e, { cols, rows, disableMouse }) => {
  const tSpawn = Date.now();
  // 1) create background session (no prompt)
  const out = execFileSync(claude, ['--bg', '--name', `spike-${Date.now() % 10000}`], { cwd, env, encoding: 'utf8', timeout: 30000 });
  const m = out.match(/backgrounded\s+·\s+([0-9a-f]+)\s+·/);
  bgId = m ? m[1] : null;
  log(`--bg done in ${Date.now() - tSpawn}ms → id=${bgId}`, '\n', out.trim());
  if (!bgId) return { error: 'could not parse id', out };
  // 2) attach inside our PTY
  const attachEnv = { ...env };
  if (disableMouse) attachEnv.CLAUDE_CODE_DISABLE_MOUSE = '1';
  term = pty.spawn(claude, ['attach', bgId], { name: 'xterm-256color', cols, rows, cwd, env: attachEnv });
  let first = true;
  term.onData(d => { if (first) { first = false; log(`first bytes from attach after ${Date.now() - tSpawn}ms`); } win.webContents.send('data', d); });
  term.onExit(({ exitCode }) => { log('attach exited', exitCode); win.webContents.send('exit', exitCode); });
  return { bgId, disableMouse };
});
ipcMain.on('write', (_e, d) => term && term.write(d));
ipcMain.on('resize', (_e, { cols, rows }) => { if (term) { term.resize(cols, rows); log(`resize → ${cols}x${rows}`); } });
ipcMain.handle('detach', () => { if (term) { term.kill(); term = null; } return true; });
ipcMain.handle('list', () => { try { return JSON.parse(execFileSync(claude, ['agents', '--json', '--cwd', cwd], { env, encoding: 'utf8' })); } catch (e) { return { error: e.message }; } });
ipcMain.handle('cleanup', () => {
  const ids = [];
  try { for (const s of JSON.parse(execFileSync(claude, ['agents', '--json', '--all', '--cwd', cwd], { env, encoding: 'utf8' }))) if (s.id) ids.push(s.id); } catch {}
  for (const id of ids) { try { execFileSync(claude, ['stop', id], { env }); } catch {} try { execFileSync(claude, ['rm', id], { env }); } catch {} }
  return ids;
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (term) term.kill(); app.quit(); });
