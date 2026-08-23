# Plan: Analytics de uso

Feature ID: 005
Status: planned (aprobado 2026-08-23)
Last updated: 2026-08-23

## Chosen stack

Sin dependencias nuevas. Node (streams + `readline`) para leer JSONL, funciones puras para agregar, SVG propio para gráficos.

| Necesidad | Elección | Por qué |
|---|---|---|
| Leer transcripts | `fs.createReadStream(path, { start: offset })` + `readline` en main; una función pura `reduceTranscriptLine(state, line)` por línea y `finalizeSession(state)` | Streaming (archivos de 15 MB sin cargar en memoria), reanudable desde un offset (FR-12), testeable con fixtures línea a línea |
| Índice y caché | `AnalyticsIndexer` en main: escanea `~/.claude/projects/*/` (+ `<sid>/subagents/*.jsonl`), guarda `analytics-index.json` en el userData de Hydra con `{ version, files: { [path]: { mtimeMs, size, offset, state } } }`; escritura atómica como `hydra.json` | "Persistencia local: archivos JSON" (Constitution); ~cientos de sesiones → decenas de KB. Archivo cambiado: si `size >= prev.size` se retoma desde `offset`, si no se reparsea de cero. `version` distinta → reindexa |
| Al día | `fs.watch(projectsRoot, { recursive: true })` (mismo patrón que `FsService`, un solo watcher), debounce 3 s, re-indexa solo los archivos tocados → `analytics.changed` | FR-13; FSEvents ya probado en 002 |
| Agregados | Funciones puras en `src/shared/analytics/` (`aggregate.ts`, `cost.ts`, `time-buckets.ts`, `temp-paths.ts`); el renderer las aplica sobre `SessionSummary[]` con `useMemo` | Cambiar rango/filtro < 200 ms sin IPC; mismas funciones testeadas en Node |
| Costo | `DEFAULT_PRICING` (USD por millón: input, output, cache write, cache read) por familia de modelo + override `ui.analytics.pricing` en `hydra.json`; `costOf(tokensByModel, pricing)` → `{ usd, unknownModels[] }` | FR-9; sin reindexar al cambiar precios (se calcula en render) |
| Gráficos | `components/analytics/charts/`: `StackedBars` (SVG, tooltip propio), `Heatmap`, `HBars`; paleta categórica fija (`palette.ts`) asignada de forma estable por modelo/proyecto | FR-16; cero deps; estilo uniforme |
| Vista | `AnalyticsView` en el área central; `PaneGrid` sigue montado pero oculto con `visibility:hidden; position:absolute; inset:0` (no `display:none`) | Mantiene dimensiones de xterm → sin re-fit brusco ni re-attach (AC-1, Constitution 2) |
| Navegación | `app-store.centerView: 'sessions' | 'analytics'` persistido en `ui.centerView`; el ítem Analytics del `Sidebar` se habilita | FR-1 |
| Tests | Vitest (parser con fixtures reales saneadas + sintéticas; agregados; costo; indexer en temp dir con caché incremental), Playwright (E2E con `HYDRA_E2E_CLAUDE_PROJECTS` apuntando a un directorio de transcripts falsos) | Constitution |

## Architecture overview

```
Main                                                          Renderer
┌──────────────────────────────────────────────┐              ┌────────────────────────────────────────────┐
│ AnalyticsIndexer                              │              │ Sidebar [Analytics] → store.setCenterView   │
│  scan(): projects/*/ *.jsonl + subagents      │◄─analytics.open───  AnalyticsView                       │
│  for each file: if unchanged → cached state   │──analytics.progress {done,total}──►  ProgressBar        │
│                 else stream from offset →     │──analytics.sessions {sessions[]}──►  store.analytics    │
│                 reduceTranscriptLine()*       │              │   ├ RangePicker · ProjectFilter (prefs)     │
│  save analytics-index.json (atomic)           │              │   ├ useMemo(aggregate(sessions, range,…))   │
│  fs.watch(root) debounce 3 s → reindex Δ      │──analytics.changed {sessions[]}──►  (re-render)         │
│  reindex(): drop cache, scan()                │◄─analytics.reindex──                                    │
│  close(): unwatch                             │◄─analytics.close────                                    │
│ ProjectStore: ui.centerView, ui.analytics     │◄─ui.get/setAnalytics                                    │
│   { range, pricing overrides }                │              │   StatCards · StackedBars · Heatmap ·        │
└──────────────────────────────────────────────┘              │   HBars(projects) · ModelTable · SessionsTable│
                                                              │   click viva → focus(sessionId) + 'sessions'│
                                                              └────────────────────────────────────────────┘
```

**Flujos clave**

- **Abrir Analytics:** `setCenterView('analytics')` → `AnalyticsView` monta → `hydra.analyticsOpen()` → main carga el caché (si existe) y **responde de inmediato** con las sesiones cacheadas; luego escanea: archivos nuevos/cambiados se procesan en serie (un stream por vez, `setImmediate` entre archivos para no bloquear el event loop) emitiendo `analytics.progress` cada archivo y `analytics.sessions` cada ~500 ms o al terminar. Al final arma el `fs.watch`.
- **Parser (puro):** `reduceTranscriptLine(state, line)`: `user` no-meta → `turns++`, captura primer prompt como título de respaldo, `firstTs`/`lastTs`; `assistant` → suma `usage` por `message.model` (input, output, cache_creation, cache_read), cuenta `tool_use` por nombre, `lastTs`; `system/turn_duration` → suma `durationMs`; `ai-title`/`custom-title` → título (custom gana); `cwd`, `gitBranch`, `sessionId` del primer registro que los tenga; líneas que no parsean → `skipped++`. Subagentes: mismo reductor; al finalizar, sus tokens/herramientas se suman al padre (`<sid>/subagents/*.jsonl` → `sid`). **El `sessionId` viene del nombre del archivo** (verificado en 004), no del contenido.
- **`SessionSummary`** (lo que cruza el IPC y se cachea): `{ sessionId, cwd, title, firstTs, lastTs, userTurns, assistantMsgs, durationMs, tokensByModel: Record<model,{input,output,cacheWrite,cacheRead}>, tools: Record<name,count>, gitBranch?, skippedLines, subagents }`.
- **Temporales (FR-10b):** `isTempCwd(cwd)` puro (prefijos `/tmp`, `/private/tmp`, `/var/folders`, `/private/var/folders`, y `$TMPDIR`); el indexer igual los procesa (barato) pero **no los envía** al renderer.
- **Agregados (puros, renderer):** `filterSessions(sessions, {range, projectKey})` (una sesión entra si `lastTs ≥ from && firstTs ≤ to`; sus tokens se atribuyen al día de `firstTs`… no: **por mensaje sería exacto pero caro**; decisión: el parser guarda además `tokensByDay: Record<'YYYY-MM-DD', tokens>` y `turnsByHourDow: number[7][24]` calculados con la hora local al indexar → los gráficos por día y el heatmap son exactos por mensaje sin re-leer). `summarize()` → tarjetas; `byDay()`, `byProject()`, `byModel()`, `heatmap()`; `costOf()`. Período anterior = mismo largo inmediatamente antes.
- **Proyecto de una sesión:** `matchProject(cwd)` de 001 (sidebar) → nombre de Hydra; si no, `shortenPath(cwd)` (`~/Documents/Personal/foo` → `…/Personal/foo`). Clave de agrupación: `projectId` o el `cwd`.
- **"Viva":** `analytics` cruza `sessionId` con `store.sessions` (SessionWatcher) → marca y permite `focus(sessionId)` + `setCenterView('sessions')`.
- **Foco:** al mostrar Analytics, `blur` de cualquier terminal (zona sin terminal, como el árbol); al volver, nada toma el foco solo.
- **Prefs:** `ui.centerView`, `ui.analytics: { range: 'today'|'7d'|'30d'|'all'|{from,to}, pricing?: Record<model, Pricing> }`.

## Data model

Persistido (`hydra.json`, campos opcionales validados):
```ts
ui.centerView?: 'sessions' | 'analytics'                         // default 'sessions'
ui.analytics?: { range: AnalyticsRange; pricing: Record<string, ModelPricing> }  // default { range: '7d', pricing: {} }
interface ModelPricing { input: number; output: number; cacheWrite: number; cacheRead: number }  // USD / 1M tokens
```
Caché (`<userData>/analytics-index.json`, atómico; se puede borrar):
```ts
{ version: 1, files: Record<absPath, { mtimeMs: number; size: number; offset: number; state: TranscriptState }> }
```
Compartido (`src/shared/analytics/types.ts`): `SessionSummary`, `TokenCounts`, `AnalyticsRange`, `ModelPricing`, `AnalyticsProgress { done, total, phase: 'cache'|'scan'|'watch' }`.
IPC: `analytics.open` → `{ sessions: SessionSummary[]; fromCache: boolean }`; `analytics.close`; `analytics.reindex`; `ui.getAnalytics/setAnalytics`; `ui.getCenterView/setCenterView`; eventos `analytics.progress`, `analytics.sessions { sessions }` (lista completa; ~cientos × ~1 KB).

Módulos nuevos: `src/main/analytics/{transcript-reducer.ts, analytics-indexer.ts, index-cache.ts}`, `src/shared/analytics/{types.ts, aggregate.ts, cost.ts, pricing.ts, time-buckets.ts, temp-paths.ts, paths.ts}`, `src/renderer/src/store/analytics-slice.ts`, `src/renderer/src/components/analytics/{AnalyticsView, RangePicker, StatCards, UsageByDay, WhenHeatmap, ProjectBars, ModelTable, SessionsTable, charts/{StackedBars,Heatmap,HBars,Tooltip}, palette.ts}` + CSS modules; cambios en `Sidebar`, `App`, `app-store`, `ipc.ts` (shared + main), `app-context.ts`, `project-store.ts`, `fakes.ts`/E2E.

## External dependencies

- Ninguna librería nueva. Solo `~/.claude/projects` (lectura).

## Trade-offs considered

- **Caché JSON propio (elegido) vs. SQLite vs. sin caché.** 100 MB → 2–5 s de parseo; sin caché cada apertura paga eso (viola FR-15). SQLite daría consultas ad hoc pero agrega binario nativo y la Constitution lo difiere. El JSON con estado por archivo cubre incremental + reanudación.
- **Buckets (día, hora×dow) calculados al indexar (elegido) vs. guardar cada mensaje.** Guardar mensajes multiplica el caché y el IPC; los buckets por sesión son exactos para lo que la spec pide y caben en ~1 KB por sesión. Costo: cambiar de zona horaria requiere reindexar (se acepta; se documenta y "Reindexar" existe).
- **Agregar en renderer (elegido) vs. en main.** Filtros instantáneos y menos IPC; el volumen (cientos de sesiones) lo permite. Si algún día son decenas de miles, se mueve a main sin cambiar la UI.
- **SVG propio (elegido) vs. librería.** Decidido en spec (FR-16). Tres primitivas simples bastan.
- **`visibility:hidden` para la grilla (elegido) vs. desmontar / `display:none`.** Mantiene xterm con dimensiones y evita re-fit; el costo es que la grilla sigue pintando fuera de vista (barato).
- **Lista completa en `analytics.changed` (elegido) vs. deltas.** Simplicidad; cientos de KB como máximo, con debounce 3 s.
- **Precios por familia** (`claude-fable-5`, `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5…`): se matchea por prefijo/alias; desconocidos → "—" (FR-9).

## Risks

1. **Formato del transcript cambia** (ya cambió entre versiones: `session_id` vs `sessionId`, `usage` anidado). Mitigación: reductor tolerante (campos opcionales), `skipped` contado, fixtures de versiones actuales; `version` del caché para reindexar.
2. **Archivos muy grandes y muchas sesiones:** streaming + `setImmediate`; medir en la máquina de Juan (25 MB hydra-ai). Si > 30 s, procesar en un `worker_thread` (misma función pura) — previsto, no implementado.
3. **`fs.watch` recursivo sobre `~/.claude/projects`** genera ráfagas mientras Claude escribe: debounce 3 s + re-indexar solo los paths tocados; nunca más de un escaneo en vuelo.
4. **Zona horaria:** buckets en hora local al indexar (ver trade-off).
5. **Precios desactualizados:** defaults marcados con fecha en `pricing.ts`; "estimado" siempre visible; editables.
6. **Subagentes con `parentUuid`** en otra carpeta: se asume la convención `<sid>/subagents/` observada; si falta, se cuentan como sesión propia con marca.

## Test plan

- **Unit (Vitest):** `reduceTranscriptLine`/`finalizeSession` con fixtures en `test/fixtures/transcripts/` (una sesión real corta saneada + sintéticas: user/assistant con usage, tool_use, turn_duration, ai-title/custom-title, línea rota, línea vacía, subagente); `isTempCwd`; `shortenPath`; `costOf` (precios por defecto, override, desconocido); `filterSessions`, `summarize` (incl. período anterior), `byDay` (días vacíos incluidos, semanas > 60 d), `byProject` (Hydra vs. ruta), `byModel`, `heatmap`; `ProjectStore` (`ui.centerView`, `ui.analytics`); slice `analytics` (rango/filtro/orden).
- **Integración (Vitest, fs real en temp):** `AnalyticsIndexer` sobre un `projects/` de fixture: primer escaneo → N sesiones y progreso; segundo escaneo sin cambios → 0 archivos leídos (espía); apéndice de líneas a un archivo → solo se leen los bytes nuevos y el resumen se actualiza; archivo truncado → reparseo completo; caché corrupto/versión vieja → reconstrucción; `fs.watch` → `changed` en < 10 s tras escribir.
- **E2E (Playwright):** fixture de transcripts falsos (3 proyectos, uno temporal que no debe aparecer, 6 sesiones en fechas conocidas) vía `HYDRA_E2E_CLAUDE_PROJECTS`; E2E-9: abrir Analytics → tarjetas con los totales esperados, 7 columnas en "7 días", heatmap con celdas, barras por proyecto sin el temporal, tabla ordenable; cambiar rango; volver a Sessions → mismos pids de PTY y terminales visibles; E2E-10: sesión viva marcada y clic enfoca el pane.
- **Manual (`docs/qa-005.md`):** primer índice con los transcripts reales de Juan (tiempo, progreso), look & feel (AC-11), al día con una sesión trabajando, editar precios en `hydra.json`.
