# Hydra AI — guía para sesiones de Claude Code en este repo

Proyecto gestionado con **Spec-Driven Development**. Antes de tocar código, leé `.sdd/constitution.md` y el `spec.md`/`plan.md`/`tasks.md` de la feature activa (`.sdd/README.md` tiene el índice). No se implementa nada que no tenga spec aprobada.

## Qué es

App de escritorio macOS (Electron + React + xterm.js + node-pty) que muestra y opera varias sesiones de **Claude Code** a la vez. Es una capa sobre el CLI `claude` y su daemon: `claude --bg` crea sesiones, `claude agents --json` las lista, `claude attach <id>` las muestra dentro de una PTY propia. **El CLI es la fuente de verdad**; Hydra no persiste sesiones, solo proyectos y prefs de UI (`hydra.json`).

## Comandos

- `npm run dev` — app con HMR · `npm test` — unit+integración (Vitest; los `*.integration.test.ts` usan el `claude` real y crean/borran sesiones) · `npm run test:e2e` — Playwright sobre `out/` con CLI y PTY falsos (`HYDRA_E2E=1`) · `npm run test:electron` — node-pty dentro de Electron · `npm run typecheck && npm run lint && npm run format:check` · `npm run package` → `release/Hydra.app` + `.dmg`.
- Node ≥ 22 (`.nvmrc`). Si Electron no descargó su binario: `node node_modules/electron/install.js`.

## Mapa

- `src/main/` — `app-context.ts` (wiring), `claude/` (wrapper del CLI + parseo con fixtures), `sessions/` (SessionWatcher: poll + hooks → estado), `hooks/` (HTTP server para hooks de Claude Code), `pty/` (PtyManager), `store/` (hydra.json), `env/` (PATH real: las apps del Finder no heredan el PATH del shell), `fs/` (FsService: listado lazy + `fs.watch` recursivo; FsActions: abrir/Finder/editor/menú), `git/` (porcelain parser + GitService), `analytics/` (005: `AnalyticsIndexer` — índice incremental por offset con caché versionado en userData; `transcript-reducer` puro: usage deduplicado por `message.id`, turnos humanos ≠ tool_result, buckets día/hora en hora local), `context/` (feature 004: `ContextImporter` → `ClaudeCli.summarizeSession` vía `claude -p --resume --fork-session --no-session-persistence`; `parsePrintJson` con fixtures en `test/fixtures/claude/`; `buildHandoffPrompt`/`trimSummary`/`buildImportBlock`), `app-menu.ts` (menú nativo, ⌘⇧E), `testing/` (fakes E2E).
- `src/renderer/src/` — `store/app-store.ts` (zustand; invariantes de foco/expandir), `store/file-tree-slice.ts` (árbol: follow-focus, expandidos por proyecto), `store/import-context-slice.ts` (004), `store/analytics-slice.ts` + `components/analytics/` (005: agregados puros de `@shared/analytics` con useMemo; gráficos SVG propios, paleta validada), `lib/import-flow.ts` + `lib/can-import.ts` (004), `components/` (Sidebar con solapa Sesiones/Archivos, ProjectList, NewSessionDialog, ImportContextDialog, PaneGrid, Pane, XTermView, `file-tree/`).
- `src/shared/` — tipos e `ipc.ts` (contrato tipado; todo lo que cruza procesos pasa por ahí).

## Reglas que muerden

- **Foco:** el borde verde se pinta desde el `focus/blur` del textarea de xterm, nunca al revés. No toques eso sin leer el principio 3 de la Constitution.
- **Selectores de zustand** deben devolver primitivas o referencias estables (un `filter` dentro del selector = bucle infinito).
- **PaneGrid** mantiene el mismo árbol DOM en modo grilla y expandido (solo cambian clases) para no remontar xterm.
- `claude attach` siempre renderiza fullscreen; está bien (spike 001). No setear `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN`.
- `EnvResolver` usa `$SHELL -lc` (no `-ilc`: colgó 5 s en la máquina del autor).
- **File tree:** un solo `fs.watch` por raíz; los eventos bajo `.git/**` se descartan (si no, `git status` realimenta el watcher). `GitService` devuelve la raíz en la forma de ruta del caller (symlinks `/var` vs `/private/var`). Estado git via CLI, nunca librerías.
- **Analytics (005):** el reductor de transcripts es puro y tolerante (líneas rotas → `skippedLines`); el `usage` se repite por bloque de una misma respuesta → deduplicar por `message.id`; `state: "done"`+pid vivo = idle. Sesiones bajo `/tmp`/`/var/folders` no se muestran (FR-10b). La grilla queda montada con `visibility:hidden` al cambiar de vista (no desmontar xterm). El reloj del dashboard viene de main (`HYDRA_E2E_NOW` lo fija en E2E).
- **Importar contexto (004):** el texto se pega con **bracketed paste** (`@shared/paste`) **dos veces** (la segunda hace que Claude Code expanda el `[Pasted text #N +M lines]`; el CLI envía una sola copia — verificado en `paste.integration.test.ts`) y **nunca** se escribe `\r` — enviar es siempre el Enter del usuario. Solo se pega si la sesión destino sigue `idle` (guarda evaluada en `Pane`, donde vive el `ptyId`). `claude -p` solo se invoca desde `ClaudeCli`; el encuadre del bloque va en primera persona del usuario (un wrapper imperativo fue rechazado como prompt injection en el spike). `agents --json` devuelve `state: "done"` con `pid` vivo tras cada turno: eso es idle, no finalizada.
- Commits: Conventional Commits; un task de SDD ≈ un commit. Código/commits en inglés, docs en español.
