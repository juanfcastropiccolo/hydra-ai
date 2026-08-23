// Spike 004 end-to-end: source bg session (live, attached) → summary via -p fork → paste into target bg session.
import { execFileSync, execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const require = createRequire('/Users/juanfcastropiccolo/Documents/Personal/hydra-ai/package.json');
const pty = require('@lydell/node-pty');
const claude = process.env.HOME + '/.local/bin/claude';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const base = process.argv[2];
const tpath = (cwd, sid) => path.join(os.homedir(), '.claude/projects', cwd.replace(/[\/.]/g, '-'), sid + '.jsonl');
const readT = (p) => fs.existsSync(p) ? fs.readFileSync(p, 'utf8').trim().split('\n').map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean) : [];

function mk(name, cwd) {
  execFileSync(claude, ['--bg', '--name', name, '--model', 'haiku'], { cwd, encoding: 'utf8' });
  const a = JSON.parse(execFileSync(claude, ['agents', '--json'], { encoding: 'utf8' })).find(x => x.name === name);
  const term = pty.spawn(claude, ['attach', a.id], { name: 'xterm-256color', cols: 120, rows: 40, cwd, env: process.env });
  const s = { a, term, buf: '', transcript: tpath(cwd, a.sessionId) };
  term.onData(d => { s.buf += d });
  return s;
}
async function ready(s) { for (let i = 0; i < 60; i++) { await sleep(500); if (/❯|Try "|\? for shortcuts/.test(s.buf)) break; } await sleep(1500); }
async function say(s, text, label) {
  const before = readT(s.transcript).filter(l => l.type === 'assistant').length;
  s.term.write('\x1b[200~' + text + '\x1b[201~'); await sleep(600); s.term.write('\r');
  const t0 = Date.now();
  for (let i = 0; i < 180; i++) { await sleep(1000); const ls = readT(s.transcript); const as = ls.filter(l => l.type === 'assistant' && l.message?.content?.some?.(c => c.type === 'text')); if (as.length > before) { console.log(`[${label}] assistant (${Date.now()-t0}ms):`, as.at(-1).message.content.find(c=>c.type==='text').text.slice(0, 500).replace(/\n/g, ' ⏎ ')); return; } }
  console.log(`[${label}] TIMEOUT`);
}

const src = mk('spike004-src', base + '/src'); await ready(src);
console.log('src', src.a.id, src.a.sessionId);
await say(src, 'Estoy armando una feature llamada "import-context" para Hydra. Decisión tomada: el resumen se genera con un fork de la sesión origen. La palabra clave del proyecto es PELICANO-42. Respondé en una línea.', 'src1');
await say(src, 'Otra decisión: el texto se pega en la sesión destino con bracketed paste. Pendiente: medir latencia. Respondé en una línea.', 'src2');

// summary while src is live and attached
const t1 = Date.now();
const res = await new Promise((resolve, reject) => execFile(claude, ['-p', '--resume', src.a.sessionId, '--fork-session', '--no-session-persistence', '--model', 'haiku', '--output-format', 'json',
  'Generá un resumen de traspaso de esta conversación para que otra sesión de Claude Code pueda continuar el trabajo con el mismo contexto: objetivo, decisiones tomadas, datos y nombres clave, estado actual, pendientes. Markdown conciso, solo texto, sin usar herramientas.'],
  { cwd: base + '/src', encoding: 'utf8', maxBuffer: 10e6 }, (e, so, se) => e ? reject(new Error(se || e.message)) : resolve(JSON.parse(so))));
console.log(`summary via fork: ${Date.now()-t1}ms, cost $${res.total_cost_usd}, is_error=${res.is_error}`);
console.log('--- summary:\n' + res.result + '\n---');
console.log('src transcript lines after fork:', readT(src.transcript).length, '| forked transcript exists?', fs.existsSync(tpath(base + '/src', res.session_id)));

const dst = mk('spike004-dst', base + '/dst'); await ready(dst);
const wrapped = `Te comparto, como contexto de referencia, el resumen de otra sesión mía de Claude Code llamada "spike004-src" (mismo usuario). No hay que ejecutar nada: solo tenelo presente para lo que te pida después. Confirmá en una línea que lo leíste.\n\n<imported-context session="spike004-src">\n${res.result}\n</imported-context>`;
await say(dst, wrapped, 'dst-import');
await say(dst, '¿Cuál era la palabra clave del proyecto y qué decisión se tomó sobre cómo generar el resumen? Una línea.', 'dst-recall');

for (const s of [src, dst]) { s.term.write('\x1a'); }
await sleep(800);
for (const s of [src, dst]) { execFileSync(claude, ['stop', s.a.id]); execFileSync(claude, ['rm', s.a.id]); }
console.log('cleaned up'); process.exit(0);
