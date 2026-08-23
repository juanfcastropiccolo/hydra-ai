# Tasks: Workspace de sesiones de Claude Code

Feature ID: 001
Status: in_progress (task 0 completado 2026-08-23)
Last updated: 2026-08-23

Convenciones: un task ≈ un commit (Conventional Commits). "done when" es verificable. Los tests van **en el mismo task** que el código que prueban (TDD donde aplica: unit primero en `shared`/`main`). Ningún task se marca `[x]` con tests rojos.

## Fase 0 — Spike de riesgo (antes de cualquier UI)

- [x] **0.** Spike: ✅ GO (2026-08-23, ver docs/spike-001-attach.md) — `claude attach` dentro de xterm.js en Electron — done when: un script mínimo (`spikes/attach-xterm/`, fuera de `src/`, desechable) abre una ventana Electron con un xterm, spawnea `claude --bg --name spike` + `claude attach <id>` vía node-pty y se verifica a mano: (a) el TUI se dibuja sin basura, (b) el scroll con rueda funciona, (c) arrastrar selecciona texto (con o sin `CLAUDE_CODE_DISABLE_MOUSE=1` — anotar cuál), (d) resize de ventana redibuja bien, (e) `Ctrl+Z`/`←` desadjunta sin matar la sesión, (f) tiempo desde `--bg` hasta prompt visible (primera vez y segunda). Resultado escrito en `docs/spike-001-attach.md` con la decisión sobre `DISABLE_MOUSE` y el ADR-4 de la Constitution actualizado. Si (a) o (b) fallan sin solución → **parar y volver al plan**.

## Fase 1 — Setup

- [x] **1.** Inicializar proyecto electron-vite + React + TS strict — done when: `npm run dev` abre una ventana vacía "Hydra"; `npm run build` genera `out/`; `tsc --noEmit` pasa; estructura `src/main`, `src/preload`, `src/renderer`, `src/shared` creada.
- [x] **2.** Configurar ESLint + Prettier + Vitest + scripts — done when: `npm run lint`, `npm run format:check`, `npm test` pasan en el esqueleto (0 tests), con `vitest` configurado para `src/main` y `src/shared` (entorno node) y cobertura habilitada.
- [x] **3.** Integrar `@lydell/node-pty` y verificar carga en Electron — done when: un test de integración abre una PTY con `/bin/zsh -c 'echo hi'` **dentro del proceso main de Electron** (no solo Node) y recibe `hi`; documentado en README cómo se resuelve el binario prebuilt x64.
- [ ] **4.** Configurar electron-builder (mac x64, ad-hoc) + script `npm run package` — done when: genera `release/Hydra.app` que abre desde Finder y muestra la ventana vacía; `.dmg` opcional en este task.

## Fase 2 — Capa main: contrato con Claude Code (TDD)

- [ ] **5.** `src/shared/types.ts` + `src/shared/ipc.ts`: tipos `Project`, `Session`, `SessionState`, `Pane`, `HydraFile` y el contrato IPC tipado (canales + payloads) — done when: compila y es importado por main y renderer sin `any`.
- [ ] **6.** `EnvResolver`: resolver PATH del login shell (**`-lc`, no `-ilc`**: el interactivo hizo timeout en el spike; timeout 3 s) + localizar `claude` — done when: unit tests del parseo de PATH y de la búsqueda (`~/.local/bin/claude`, `which`, PATH resuelto); test de integración devuelve la ruta real de `claude` en esta máquina; si no se encuentra, devuelve un error tipado con mensaje accionable (base de AC-16).
- [ ] **7.** `ClaudeCli.listSessions()`: ejecutar `claude agents --json` y parsear/validar — done when: fixtures reales capturadas en `test/fixtures/agents-*.json` (bg working, bg waiting+waitingFor, bg idle/blocked sin prompt, interactive idle/busy, done, sin pid, salida vacía, JSON inválido) y unit tests de `parseAgentsJson()` para todas; un error de parseo nunca lanza: devuelve `{ sessions: [], error }`.
- [ ] **8.** `mapSessionState()`: tabla `status/state/pid/kind` → `working | waiting | idle | ended` — done when: unit tests cubren toda la tabla de casos del plan (incl. `state: blocked` + `status: idle` → `idle`, `waiting` → `waiting`, `busy` → `working`, sin pid → `ended`) y un caso desconocido → `idle` con warning.
- [ ] **9.** `ClaudeCli.spawnBackground({cwd, name, settingsJson})` + `parseBackgroundedLine()` — done when: unit test del parseo de `backgrounded · <id> · <name>`; test de integración crea una sesión real en un dir temporal, la encuentra en `listSessions()` con `id` y `kind: background`, y la limpia con `stop`+`rm` (también implementados acá, `ClaudeCli.stop/remove`).
- [ ] **10.** `HooksServer`: HTTP en `127.0.0.1:<puerto libre>` que recibe POST y emite eventos tipados `{sessionId, event, notificationType?}`; `buildHookSettings(port)` genera el JSON para `--settings` (Notification con matcher, UserPromptSubmit, Stop, SessionEnd; timeout 2 s) — done when: unit tests del parseo de payloads reales de hooks (fixtures) y del JSON generado; test de integración: sesión creada con esos settings + `claude` recibe un prompt por `attach` automatizado **o** (si es más simple) se dispara un hook manualmente con `curl` y el server emite el evento correcto.
- [ ] **11.** `SessionWatcher`: combina poll (`listSessions` cada 2 s, configurable) + eventos de `HooksServer` → mantiene `Map<sessionId, Session>` y emite `sessions.changed` con diffs; asigna `projectId` por `cwd` (`groupSessionsByProject`, homónimos por ruta) y `origin: hydra|external` — done when: unit tests con reloj falso: hook gana sobre poll anterior, poll detecta sesión nueva/desaparecida (→ `ended`), sesión de cwd no registrado se ignora, cwd anidado se asigna al proyecto más específico.
- [ ] **12.** `PtyManager`: `open(paneId, {cmd: claude attach <id>, cwd, env})`, `write`, `resize`, `close`, `disposeAll`; eventos `data`/`exit`; buffer de scrollback por pane (últimos N KB) para re-hidratar al re-mostrar — done when: unit tests de ciclo de vida con PTY falsa inyectada; integración: abre `claude attach` de una sesión real y recibe bytes; `disposeAll()` mata el cliente y `listSessions()` sigue mostrando la sesión viva (AC-12 a nivel main).
- [ ] **13.** `ProjectStore`: `hydra.json` (load/save atómico, `version: 1`, validación, migración trivial) + `add/remove/rename` — done when: unit tests con fs temporal: persistencia, archivo corrupto → backup + estado vacío, path inexistente marcado `missing: true`.
- [ ] **14.** Wiring IPC en main + preload (`contextBridge` → `window.hydra`) para todos los canales de `ipc.ts`; arranque: `EnvResolver` → si falla, evento `claude.unavailable` — done when: desde DevTools del renderer, `window.hydra.projects.list()` y `window.hydra.sessions.list()` devuelven datos reales; un `claude` inexistente (PATH vacío forzado por env `HYDRA_FAKE_NO_CLAUDE=1`) produce el evento.

## Fase 3 — Renderer

- [ ] **15.** Store Zustand (`projects`, `sessions`, `panes`, `focusedPaneId`, `expandedPaneId`, `claudeUnavailable`) + acciones puras; suscripción a eventos IPC — done when: unit tests (sin React) de: foco exclusivo, expand/collapse toggle, hide/show, aplicar `sessions.changed` (nuevas, actualizadas, ended), `Esc` solo contrae si `focusedPaneId == null`.
- [ ] **16.** Layout base (`App`: sidebar izquierda fija + área central con scroll) + pantalla de error `ClaudeUnavailable` (AC-16) + placeholders deshabilitados Sessions/Analytics/Graph Know/Config + bloque de usuario abajo — done when: se ve el esqueleto del diseño (`hydra-diseño.png`) con datos mock; con `HYDRA_FAKE_NO_CLAUDE=1` muestra el error accionable y "Nueva sesión" deshabilitado.
- [ ] **17.** `Sidebar`: lista de proyectos (colapsables) con sesiones (nombre + semáforo + marca "externa"), contador rojo de atención por proyecto, botones Agregar/Quitar proyecto (diálogo nativo de carpeta vía IPC), renombrar — done when: AC-1 manual (agregar, persistir tras reinicio), contador refleja sesiones `waiting`, proyecto con `missing: true` muestra aviso y deshabilita "Nueva sesión".
- [ ] **18.** `NewSessionDialog`: nombre pre-rellenado `<proyecto>-<n>` editable, carpeta solo lectura, Cancelar/Crear, `Enter`/`Esc`, Crear deshabilitado con nombre vacío → IPC `sessions.create` → pane nuevo con foco — done when: AC-2, AC-2b (<5 s medido tras el spike), AC-2c se cumplen a mano contra Claude real.
- [ ] **19.** `XTermView`: monta `@xterm/xterm` + fit + web-links; `onData` → `pty.write`; `pty.data` → `term.write`; `ResizeObserver` + debounce 50 ms → `fit()` + `pty.resize`; re-hidrata scrollback al montar; **foco**: `onMouseDown` → `term.focus()`; `term.textarea` `focus`/`blur` → store (`focusedPaneId`); borde verde se deriva del store — done when: AC-4 y AC-5 a mano; test unit del hook de foco (el store solo cambia por eventos del textarea); AC-18 a mano.
- [ ] **20.** `Pane` + `PaneHeader` (nombre editable, semáforo, ⤢, ⊟, ✕ con confirmación si `working`; externas: ⤢/✕ deshabilitados con tooltip) + `PaneGrid` (grupos por proyecto, 2 columnas, scroll vertical; pane expandido ocupa todo, los demás `visibility:hidden`; doble clic en cualquier parte → toggle + `clearSelection()`; `Esc` global cuando ningún term tiene foco) — done when: AC-9, AC-10, AC-13, AC-14, AC-7 (contador), FR-11/16/17 a mano; `hidden` persiste en `hydra.json`.
- [ ] **21.** Estado "finalizada" del pane (FR-19/AC-15): al recibir `ended`/`pty.exit`, overlay con última salida legible + botones Cerrar / Relanzar (nueva sesión mismo proyecto) — done when: matar el proceso desde iTerm (`claude stop <id>`) → overlay en <5 s; la app sigue operativa.
- [ ] **22.** Reconexión al arrancar (FR-9/AC-11/AC-12): al iniciar, `SessionWatcher` descubre sesiones bg de proyectos registrados → panes visibles (salvo `hiddenSessionIds`) y se adjuntan automáticamente; externas solo en sidebar con marca — done when: crear 2 sesiones, cerrar Hydra, verificar con `claude agents --json` que viven, reabrir → ambas en grilla con semáforo correcto y se puede seguir escribiendo; AC-19 a mano.

## Fase 4 — Testing E2E y empaquetado

- [ ] **23.** Playwright + Electron: harness con modo `HYDRA_E2E=1` (PTY y `ClaudeCli` falsos inyectados en main, deterministas) — done when: un test abre la app y ve el sidebar vacío.
- [ ] **24.** E2E-1: agregar proyecto (ruta temporal inyectada) → Nueva sesión → diálogo (nombre, carpeta, Cancelar no crea) → Crear → pane con título y borde verde (AC-1, AC-2/2b/2c).
- [ ] **25.** E2E-2: dos panes; clic en B + tipeo → solo la PTY falsa de B recibe y solo B tiene borde; clic en sidebar + tipeo → ninguna recibe (AC-4, AC-5).
- [ ] **26.** E2E-3: expandir por botón y por doble clic, contraer por botón/doble clic/`Esc` (sin foco en term), resize de ventana → `pty.resize` recibido con cols/rows nuevos (AC-9, AC-10, AC-18).
- [ ] **27.** Empaquetar `Hydra.app` final x64 y checklist manual `docs/qa-001.md` (AC-3, AC-11, AC-12, AC-15, AC-17 desde Finder en limpio, AC-19, AC-8b) — done when: checklist completo con fecha y resultado por AC; cualquier fallo abre un task de fix antes de cerrar la feature.

## Fase 5 — Cierre

- [ ] **28.** README del repo (qué es Hydra, requisitos, `npm run dev/test/package`, estructura), `CLAUDE.md` del proyecto (convenciones para sesiones futuras), actualizar `status.json` → `complete` y `.sdd/README.md` — done when: una sesión nueva de Claude Code en el repo entiende el proyecto leyendo solo README + CLAUDE.md.

## Traceability

| Task | FR | AC |
|------|----|----|
| 0 | FR-12, FR-18 (riesgo) | — |
| 1-4 | FR-21 | AC-17 (parcial) |
| 5 | — (contratos) | — |
| 6 | FR-20, FR-21 | AC-16, AC-17 |
| 7, 8 | FR-14, FR-9 | AC-6/7/8/8b |
| 9 | FR-5, FR-7 | AC-2b, AC-14 |
| 10, 11 | FR-4, FR-14, FR-9 | AC-6/7/8/8b, AC-19 |
| 12 | FR-10, FR-12, FR-18 | AC-12, AC-18 |
| 13 | FR-1/2/3 | AC-1 |
| 14 | FR-20 | AC-16 |
| 15 | FR-15/16/17, FR-8 | AC-4/5/9/10/13 |
| 16 | FR-20, FR-21 | AC-16 |
| 17 | FR-1/2/3/4, FR-6 | AC-1, AC-7 |
| 18 | FR-5, FR-6 | AC-2/2b/2c, AC-3 |
| 19 | FR-12, FR-15, FR-18 | AC-4/5/18 |
| 20 | FR-7/8/11/13/16/17 | AC-7/9/10/13/14 |
| 21 | FR-19 | AC-15 |
| 22 | FR-9, FR-10 | AC-11/12/19 |
| 23-26 | — | AC-1/2/4/5/9/10/18 (automatizados) |
| 27 | FR-21 | AC-3/8b/11/12/15/17/19 (manual) |
| 28 | — | — |
