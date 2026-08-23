# Hydra AI — guía para sesiones de Claude Code en este repo

Proyecto gestionado con **Spec-Driven Development**. Antes de tocar código, leé `.sdd/constitution.md` y el `spec.md`/`plan.md`/`tasks.md` de la feature activa (`.sdd/README.md` tiene el índice). No se implementa nada que no tenga spec aprobada.

## Qué es

App de escritorio macOS (Electron + React + xterm.js + node-pty) que muestra y opera varias sesiones de **Claude Code** a la vez. Es una capa sobre el CLI `claude` y su daemon: `claude --bg` crea sesiones, `claude agents --json` las lista, `claude attach <id>` las muestra dentro de una PTY propia. **El CLI es la fuente de verdad**; Hydra no persiste sesiones, solo proyectos y prefs de UI (`hydra.json`).

## Comandos

- `npm run dev` — app con HMR · `npm test` — unit+integración (Vitest; los `*.integration.test.ts` usan el `claude` real y crean/borran sesiones) · `npm run test:e2e` — Playwright sobre `out/` con CLI y PTY falsos (`HYDRA_E2E=1`) · `npm run test:electron` — node-pty dentro de Electron · `npm run typecheck && npm run lint && npm run format:check` · `npm run package` → `release/Hydra.app` + `.dmg`.
- Node ≥ 22 (`.nvmrc`). Si Electron no descargó su binario: `node node_modules/electron/install.js`.

## Mapa

- `src/main/` — `app-context.ts` (wiring), `claude/` (wrapper del CLI + parseo con fixtures), `sessions/` (SessionWatcher: poll + hooks → estado), `hooks/` (HTTP server para hooks de Claude Code), `pty/` (PtyManager), `store/` (hydra.json), `env/` (PATH real: las apps del Finder no heredan el PATH del shell), `testing/` (fakes E2E).
- `src/renderer/src/` — `store/app-store.ts` (zustand; invariantes de foco/expandir), `components/` (Sidebar, ProjectList, NewSessionDialog, PaneGrid, Pane, XTermView).
- `src/shared/` — tipos e `ipc.ts` (contrato tipado; todo lo que cruza procesos pasa por ahí).

## Reglas que muerden

- **Foco:** el borde verde se pinta desde el `focus/blur` del textarea de xterm, nunca al revés. No toques eso sin leer el principio 3 de la Constitution.
- **Selectores de zustand** deben devolver primitivas o referencias estables (un `filter` dentro del selector = bucle infinito).
- **PaneGrid** mantiene el mismo árbol DOM en modo grilla y expandido (solo cambian clases) para no remontar xterm.
- `claude attach` siempre renderiza fullscreen; está bien (spike 001). No setear `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN`.
- `EnvResolver` usa `$SHELL -lc` (no `-ilc`: colgó 5 s en la máquina del autor).
- Commits: Conventional Commits; un task de SDD ≈ un commit. Código/commits en inglés, docs en español.
