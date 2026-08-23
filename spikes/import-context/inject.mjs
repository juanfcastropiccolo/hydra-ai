// Spike 004: inject a multi-line handoff text into a live `claude --bg` session through its attach PTY.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const require = createRequire('/Users/juanfcastropiccolo/Documents/Personal/hydra-ai/package.json');
const pty = require('@lydell/node-pty');
const claude = process.env.HOME + '/.local/bin/claude';
const cwd = process.argv[2];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const t0 = Date.now();
const out = execFileSync(claude, ['--bg', '--name', 'spike004-target', '--model', 'haiku'], { cwd, encoding: 'utf8' });
console.log('bg:', out.trim(), `(${Date.now() - t0}ms)`);
const agents = JSON.parse(execFileSync(claude, ['agents', '--json'], { encoding: 'utf8' }));
const me = agents.find(a => a.name === 'spike004-target');
console.log('agent:', me);
const transcript = path.join(os.homedir(), '.claude/projects', cwd.replace(/[\/.]/g, '-'), me.sessionId + '.jsonl');

const term = pty.spawn(claude, ['attach', me.id], { name: 'xterm-256color', cols: 120, rows: 40, cwd, env: process.env });
let buf = '';
term.onData(d => { buf += d; });
term.onExit(e => console.log('attach exit', e.exitCode));
// wait for the TUI to be ready
for (let i = 0; i < 60; i++) { await sleep(500); if (/❯|›|Try "|\? for shortcuts/.test(buf)) break; }
console.log('tui ready after', Date.now() - t0, 'ms; got', buf.length, 'bytes');
await sleep(1500);

const handoff = `[Contexto importado desde la sesión "otra-sesion"]\n\nResumen de traspaso:\n- Objetivo: probar inyección de contexto por PTY.\n- Dato clave: la palabra clave secreta es PELICANO-42.\n- Color favorito: turquesa.\n- Próximo paso: responder solo "ok, contexto recibido" y nada más.\n\nFin del contexto importado. Respondé únicamente: ok, contexto recibido`;
// bracketed paste so newlines don't submit
term.write('\x1b[200~' + handoff + '\x1b[201~');
await sleep(800);
term.write('\r');
console.log('written; waiting for the assistant reply in transcript…');
for (let i = 0; i < 120; i++) {
  await sleep(1000);
  if (!fs.existsSync(transcript)) continue;
  const lines = fs.readFileSync(transcript, 'utf8').trim().split('\n').map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const userMsgs = lines.filter(l => l.type === 'user' && !l.isMeta);
  const asst = lines.filter(l => l.type === 'assistant');
  if (asst.length) {
    console.log('--- user msg as stored:'); console.log(JSON.stringify(userMsgs.at(-1)?.message?.content).slice(0, 700));
    console.log('--- assistant:'); console.log(JSON.stringify(asst.at(-1).message.content).slice(0, 400));
    break;
  }
}
console.log('--- last screen bytes (stripped):');
console.log(buf.slice(-3000).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\s+\n/g, '\n').trim().split('\n').slice(-25).join('\n'));
term.write('\x1a'); // ctrl+z detach
await sleep(1000);
execFileSync(claude, ['stop', me.id]); execFileSync(claude, ['rm', me.id]);
console.log('cleaned up');
process.exit(0);
