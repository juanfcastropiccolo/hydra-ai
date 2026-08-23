# Plan: Workspace de sesiones de Claude Code

Feature ID: 001
Status: planned (aprobado 2026-08-23)
Last updated: 2026-08-23

## Chosen stack

| Capa | Elección | Versión (npm, 2026-08-23) | Por qué |
|---|---|---|---|
| Lenguaje | TypeScript `strict` | 5.x | Constitution |
| Shell de app | **Electron** | 43.x | Constitution / ADR-1. Main = Node; renderer = Chromium fijo |
| Bundler/dev | **electron-vite** | 5.x | HMR para renderer + build de main/preload en un comando; es el estándar actual sobre Forge para apps React |
| UI | **React 19** + CSS Modules (sin framework CSS) | 19.2 | Constitution. Sin Tailwind/shadcn en 001: la UI es 4 componentes; evitamos deps hasta que duela |
| Estado UI | **Zustand** | 5.x | Un store plano (`projects`, `sessions`, `panes`, `focusedPaneId`, `expandedPaneId`); sin boilerplate; fácil de testear fuera de React |
| Terminal | **@xterm/xterm** + `@xterm/addon-fit` + `@xterm/addon-web-links` | 6.0 / 0.11 | Constitution; es el terminal de VS Code |
| PTY | **@lydell/node-pty** (última estable 1.1.x; la 1.2 está en beta, no usar) | 1.1.x | Binarios precompilados darwin-x64 → sin `electron-rebuild` (Constitution, principio 5) |
| Persistencia | JSON en `app.getPath('userData')/hydra.json`, escrito atómicamente | — | Constitution: sin DB |
| Tests | **Vitest** (unit/integration) + **@playwright/test** con `_electron` (E2E) | 4.x / 1.62 | Constitution |
| Lint/format | ESLint (`typescript-eslint`, `react-hooks`) + Prettier | — | Constitution |
| Empaquetado | **electron-builder** → `Hydra.app` + `.dmg`, target `mac x64`, firma ad-hoc | 26.x | Constitution |
| Integración Claude Code | **CLI público** `claude` ≥ 2.1.241 (`--bg`, `--name`, `--settings`, `agents --json`, `attach`, `stop`, `rm`) + **hooks HTTP** | — | ADR-2 / ADR-3 |

Node de desarrollo: 20.x (el instalado); Electron 43 embebe su propio Node, así que el runtime final no depende del Node del usuario.

## Architecture overview

Hydra es una ventana sobre el **daemon de Claude Code**. Nunca es dueña de las sesiones: las crea pidiéndoselo al CLI, las descubre preguntándole al CLI, y las muestra adjuntándose con `claude attach` dentro de una PTY propia. Si Hydra muere, el daemon y las sesiones siguen.

```
┌──────────────────────────────── Renderer (React, sandboxed) ─────────────────────────────┐
│  <Sidebar>            <PaneGrid>                                 <NewSessionDialog>       │
│   projects[]           groups by project → <Pane> × N              name / cwd / cancel·ok │
│   sessions[] + 🟢🔴🟡     ├ <PaneHeader> name·light·⤢·⊟·✕                                  │
│   attention count        └ <XTerm> (@xterm/xterm + fit)                                   │
│                                                                                            │
│  store (zustand): projects, sessions, panes{visible,order}, focusedPaneId, expandedPaneId  │
└──────────────▲──────────────────────────────────────────────────────────┬─────────────────┘
               │ window.hydra.* (contextBridge, tipado en src/shared/ipc.ts) │
┌──────────────┴──────────────────────── Main (Node) ─────────────────────▼─────────────────┐
│  ProjectStore        hydra.json (projects, hidden panes, pane order)                       │
│  ClaudeCli           resolve binary path · spawn `claude --bg --name --settings`           │
│                      · `agents --json` · `stop` · `rm`  (child_process, parse + validate)  │
│  PtyManager          node-pty por pane → `claude attach <id>` · data/resize/kill · scrollback│
│  SessionWatcher      poll `agents --json` cada 2 s + HooksServer → SessionState por sesión │
│  HooksServer         http://127.0.0.1:<port>/hook  (POST desde hooks de Claude Code)       │
│  EnvResolver         PATH real del usuario (login shell) + env vars para los panes         │
└───────────────────────────────────────────┬───────────────────────────────────────────────┘
                                            │ child processes / HTTP
                     ┌──────────────────────▼───────────────────────┐
                     │  claude CLI  ──►  daemon (supervisor)         │
                     │     sesiones bg: `~/.claude/jobs/<id>/`       │
                     │     hooks → POST a HooksServer                │
                     └──────────────────────────────────────────────┘
```

**Flujos clave**

- **Crear sesión (FR-5):** dialog → `ClaudeCli.spawnBackground({cwd, name, settings: hooksJson})` → parsea `backgrounded · <id> · <name>` de stdout (y reconcilia con `agents --json`) → `PtyManager.open(paneId, ['attach', id], {cwd, env})` → renderer monta `<XTerm>` y recibe data por IPC → foco al pane. Presupuesto: <5 s (AC-2b).
- **Descubrir al arrancar (FR-9):** `SessionWatcher` lista `agents --json`, filtra por `cwd` ⊂ proyectos registrados, crea `Session` por cada una. Las de `kind: "background"` (con `id`) son adjuntables → pane; las de `kind: "interactive"` (sin `id`) se muestran en el sidebar con semáforo pero **no adjuntables** (ver Riesgos / ajuste de spec).
- **Semáforo (FR-14):** dos fuentes que convergen en `SessionState = working | waiting | idle | ended`:
  - *Push:* hooks HTTP inyectados por `--settings` a las sesiones creadas por Hydra: `UserPromptSubmit`→working, `Notification(permission_prompt|agent_needs_input|elicitation_*|idle_prompt)`→waiting, `Stop`→idle, `SessionEnd`→ended. Latencia ~ms.
  - *Pull:* `agents --json` cada 2 s, mapeando `status` (`working|busy`→working, `waiting`→waiting, `idle`→idle) y `state`/`pid` (`done|stopped|failed` o sin pid→ended). Cubre sesiones externas y cualquier evento perdido. Si discrepan, gana el más reciente; un hook siempre gana sobre un poll anterior.
  - Renderer: working→🟢, waiting→🔴, idle→🟡, ended→pane en estado "finalizada" (FR-19).
- **Foco (FR-15):** la única fuente de verdad es el `focus`/`blur` del `<textarea>` interno de xterm.js. `<Pane onMouseDown>` llama `term.focus()`; el store se actualiza **desde** el evento `term.textarea.onfocus`, nunca al revés. Teclas → `term.onData` → IPC `pty.write(paneId, data)` solo del pane cuyo término tiene foco. Si el foco del DOM está en el sidebar/dialog, ningún `term` lo tiene → nada se escribe (AC-5).
- **Expandir (FR-16/17):** `expandedPaneId` en el store; el grid renderiza solo ese pane a tamaño completo, los demás quedan **montados pero ocultos** (`display:none` no; usamos `visibility:hidden` + posición fija para que xterm siga procesando data y no pierda scrollback). `ResizeObserver` por pane → `fitAddon.fit()` (debounce 50 ms) → IPC `pty.resize(cols, rows)`. Doble clic en cualquier parte del pane (`onDoubleClick` en el contenedor) → toggle; en el área de terminal se cancela la selección de xterm tras el doble clic (`term.clearSelection()`), conforme a FR-17/AC-10. `Esc` con pane expandido → contraer **solo** si el foco no está en una terminal (si está, `Esc` va a Claude Code — decidido así para no robarle la tecla; el botón ⤢ siempre funciona).
- **Cerrar Hydra (FR-10):** `PtyManager.disposeAll()` mata solo los procesos `claude attach` (clientes), nunca las sesiones; el daemon las mantiene. Reabrir = FR-9.
- **Terminar (FR-7):** `claude stop <id>` + `claude rm <id>`; si la sesión es externa/interactive → no hay `id` → el botón se deshabilita con tooltip (ver ajuste de spec).
- **PATH (FR-21 / principio 5):** al arrancar, `EnvResolver` ejecuta `$SHELL -ilc 'echo $PATH'` (equivalente a `shell-env`) y además busca `~/.local/bin/claude` y `which claude`; si no encuentra → pantalla de error accionable (AC-16). El PATH resuelto se pasa a todos los `child_process` y PTYs.

## Data model

Persistido (`hydra.json`, schema versionado):
```ts
type HydraFile = {
  version: 1;
  projects: Project[];
  ui: { hiddenSessionIds: string[]; paneOrder: string[] };  // por sessionId
};
type Project = { id: string; name: string; path: string; addedAt: string };
```
Runtime (solo memoria, derivado del CLI — nunca persistido, el CLI es la fuente de verdad):
```ts
type Session = {
  sessionId: string;            // uuid; clave primaria
  bgId?: string;                // id corto; solo kind=background → adjuntable
  kind: 'background' | 'interactive';
  name: string; cwd: string; projectId: string | null;
  pid?: number; startedAt: number;
  state: 'working' | 'waiting' | 'idle' | 'ended';
  waitingFor?: string; lastStateAt: number; source: 'hook' | 'poll';
  origin: 'hydra' | 'external';  // hydra = la creó esta app (name matchea prefijo + registro en memoria)
};
type Pane = { sessionId: string; visible: boolean; ptyId?: string };
```
Contratos IPC (en `src/shared/ipc.ts`, tipados en ambos lados): `projects.list/add/remove/rename`, `sessions.list/create/stop/rename`, `pty.open/write/resize/close` + eventos `pty.data`, `pty.exit`, `sessions.changed`, `claude.unavailable`.

## External dependencies

- **Claude Code CLI ≥ 2.1.241** instalado y autenticado por el usuario. Contrato usado: `claude --bg --name <n> --settings <json>` (stdout `backgrounded · <id> · <name>`), `claude agents --json [--all] [--cwd]` (campos `id, sessionId, kind, cwd, pid, name, status, state, waitingFor, startedAt`), `claude attach <id>`, `claude stop <id>`, `claude rm <id>`, `claude daemon status`. Hooks HTTP (`type: "http"`, POST JSON, campos `session_id, cwd, hook_event_name, notification_type`). Todo verificado en esta máquina el 2026-08-23.
- **@lydell/node-pty** prebuilt darwin-x64 (y arm64 para el futuro).
- **macOS 14+**. Sin servicios externos, sin red propia.

## Trade-offs considered

- **Sesiones como `--bg` + `attach` vs. correr `claude` interactivo directo en la PTY.** Elegido `--bg`+`attach`: la sesión vive en el daemon, cerrar Hydra no la mata (FR-10) y reabrir reconecta (FR-9) sin esfuerzo. Rechazado interactivo-en-PTY: verificado que una sesión interactiva *muere con su terminal* salvo que el usuario la mande a background a mano; cumplir FR-10 exigiría interceptar el cierre y ejecutar `/bg` en cada pane — frágil. Costo aceptado: `attach` **siempre renderiza fullscreen** (alternate screen + mouse capture), ver Riesgos.
- **Estado por hooks+poll vs. parsear la salida de la PTY.** Elegido hooks+poll (ADR-3). Rechazado parseo: se rompe con cada cambio del TUI; Herdr lo hace y mantiene heurísticas por agente.
- **Poll cada 2 s vs. 1 s.** Cada `claude agents --json` es un proceso Node (~200-400 ms CPU). Con hooks cubriendo las sesiones de Hydra en ms, 2 s de reconciliación es suficiente y no castiga al i7. Las externas quedan en ≤2-3 s → ajuste de spec (abajo).
- **electron-vite vs. Electron Forge.** Elegido electron-vite por DX (HMR real, config única). Forge rechazado: más ceremonia, plugins de Vite menos maduros. electron-builder para empaquetar es compatible con ambos.
- **Zustand vs. Context/useReducer vs. Redux.** Zustand: store testeable sin React, selectores finos (cada `<Pane>` re-renderiza solo con su sesión). Context rechazado por re-renders de toda la grilla en cada tick de semáforo.
- **Panes ocultos al expandir: desmontar vs. ocultar.** Ocultar (`visibility:hidden`): xterm sigue consumiendo data, no hay que re-hidratar scrollback al contraer, y AC-9 exige ver "la salida acumulada". Desmontar rechazado.
- **Persistir sesiones en `hydra.json`.** Rechazado: duplicaría al daemon y divergiría. Solo persistimos proyectos y preferencias de UI (ocultos, orden).
- **Tauri / Swift.** Ya rechazados en Constitution ADR-1.

## Risks

1. **`attach` fuerza fullscreen dentro de xterm.js.** Confirmado en doc: las sesiones adjuntadas ignoran `tui`/`CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN`. El modo fullscreen está *diseñado* para terminales tipo VS Code (xterm.js) y resuelve el salto de scroll del renderer clásico, pero captura el mouse: la selección de texto la maneja Claude Code (copia vía `pbcopy`), no xterm. Posible fricción con FR-17 (doble clic) y con el arrastre para seleccionar. **Mitigación:** spike como tarea 1 (antes de cualquier UI): adjuntar una sesión real en xterm.js, probar scroll/selección/resize; si la captura de mouse molesta, setear `CLAUDE_CODE_DISABLE_MOUSE=1` en el env del `attach` (la selección vuelve a xterm). Se corrige la Constitution ADR-4 con el resultado.
2. **Sesiones externas no adjuntables.** `claude attach` solo acepta `id` de background; una sesión abierta en iTerm (`kind: interactive`) no lo tiene. Se muestra con semáforo pero no se puede meter en un pane hasta que el usuario la mande a background (`/bg` en esa terminal). → **Ajuste de spec FR-9/AC-19** (abajo).
3. **Latencia del semáforo para externas** depende del poll (2 s + ejecución) → puede rozar 3 s. → **Ajuste de spec FR-14** (abajo).
4. **PATH en `.app`.** Verificado: el Finder no ve `~/.local/bin`. `EnvResolver` es tarea temprana y tiene test de integración empaquetado (AC-17).
5. **Vocabulario de `status` distinto por `kind`** (`idle|busy` en interactive vs `working|waiting|idle` en background, y `state: blocked` con `status: idle` para una bg sin prompt). El mapeo se hace en una función pura con tabla de casos y tests unitarios con fixtures reales capturadas.
6. **Daemon "transient".** Lo levanta el primer `--bg`; puede detener sesiones idle ~1 h (salvo pinneadas). Una sesión dormida reaparece como `ended`/sin pid: el pane lo mostrará como finalizada aunque sea reanudable. En 001 lo aceptamos y mostramos "relanzar"; pinning queda para después.
7. **`--bg` tarda** (arranca daemon la primera vez: ~2-3 s) → AC-2b (<5 s) está justo la primera vez. Mitigación: arrancar el daemon al abrir Hydra (`claude daemon status` / un `--bg --exec true` no: mejor `claude agents --json` que no lo arranca…). Se mide en el spike; si hace falta se relaja AC-2b a "primera sesión <8 s".
8. **Drift de versiones del CLI.** Todo el parseo está aislado en `ClaudeCli` con fixtures; un cambio de formato rompe un test, no la app. Si `agents --json` falla, la UI degrada a "estado desconocido" (gris) sin crashear.
9. **node-pty prebuilt para Electron 43 / x64.** Verificar en tarea de setup que el `.node` carga dentro de Electron (no solo en Node).

## Test plan

- **Unit (Vitest, `src/main` + `src/shared`):** `mapSessionState()` (tabla de casos reales: bg working/waiting/idle-blocked, interactive idle/busy, done/stopped/sin pid); `parseAgentsJson()` con fixtures capturadas; `parseBackgroundedLine()`; `groupSessionsByProject()` (cwd bajo path de proyecto, homónimos); reducer del store (foco exclusivo, expand/collapse, hide/show); `HydraFile` load/save/migración; `EnvResolver` (parseo de PATH). Cobertura ≥80 %.
- **Integración (Vitest, tag `integration`, requiere `claude` local):** `ClaudeCli.spawnBackground` crea una sesión real y `agents --json` la lista con `id`; `stop`+`rm` la elimina; `HooksServer` recibe un POST real al mandar un prompt a una sesión creada con `--settings`; `PtyManager` abre `claude attach` y recibe bytes. Cada test limpia sus sesiones (`rm`).
- **E2E (Playwright + Electron, 3 flujos):** (1) agregar proyecto → nueva sesión (dialog, nombre, crear) → pane visible con título y foco (AC-1, AC-2/2b/2c); (2) foco: clic en B, tipear, verificar que solo la PTY de B recibió (mock de PTY en modo E2E) y el borde está en B (AC-4/5); (3) expandir por botón y por doble clic, `Esc`, resize (AC-9/10/18).
- **Manual documentado (checklist en `docs/qa-001.md`):** AC-3, AC-11, AC-12, AC-15, AC-17 (abrir el `.app` desde Finder en limpio), AC-19.

## Ajustes a la Spec (aprobados con el plan y ya aplicados en spec.md)

- **FR-9 / AC-19 / edge case "sesión externa":** las sesiones externas (`interactive`) se muestran en el sidebar con nombre y semáforo y con la indicación "abierta en terminal externa"; **no** se pueden adjuntar ni terminar desde Hydra hasta que el usuario las mande a background desde su terminal (`/bg`), momento en que pasan a ser adjuntables como cualquier otra. AC-19 pasa a: "…aparece como sesión de foo en el sidebar con su semáforo y la marca de externa; el botón adjuntar está deshabilitado con explicación".
- **FR-14 (latencia):** "<2 s" para sesiones creadas por Hydra (hooks); "<3 s" para sesiones externas (solo poll).
- **FR-16 (`Esc`):** `Esc` contrae el pane expandido solo cuando el foco no está dentro de la terminal (para no robarle la tecla a Claude Code). El botón y el doble clic funcionan siempre.
