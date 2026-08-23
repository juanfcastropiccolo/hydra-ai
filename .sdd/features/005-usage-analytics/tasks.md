# Tasks: Analytics de uso

Feature ID: 005
Status: tasked (aprobado 2026-08-23)
Last updated: 2026-08-23

Convenciones: un task ≈ un commit (Conventional Commits), tests en el mismo task que el código (unit primero en `shared`/`main`). Ningún task se marca `[x]` con tests rojos. Los AC de 001/002/004 (unit + E2E) deben seguir verdes en cada task.

## Fase 1 — Tipos, reductor y agregados (shared/main, puro)

- [ ] **1.** Tipos y prefs: `src/shared/analytics/types.ts` (`SessionSummary`, `TokenCounts`, `AnalyticsRange`, `ModelPricing`, `AnalyticsProgress`), `HydraFile.ui.centerView` + `ui.analytics { range, pricing }` con defaults y validación en `ProjectStore` (`centerView()/setCenterView()`, `analytics()/setAnalytics()`), contrato IPC (`analytics.open/close/reindex`, `ui.get/setAnalytics`, `ui.get/setCenterView`; eventos `analytics.progress`, `analytics.sessions`) — done when: compila; unit tests de `ProjectStore` (defaults, valores inválidos → default, override de precios persiste).
- [ ] **2.** `src/shared/analytics/temp-paths.ts` (`isTempCwd`, incl. `$TMPDIR` inyectable) y `paths.ts` (`shortenPath`, `projectKeyFor(cwd, projects)` reutilizando `matchProject` de 001) — done when: unit tests (`/tmp`, `/private/tmp`, `/var/folders/...`, `/private/var/folders`, cwd normal, `~` abreviado).
- [ ] **3.** Fixtures: `test/fixtures/transcripts/` — una sesión real corta **saneada** (rutas y textos reemplazados; estructura intacta: user/assistant con `usage`, `tool_use`, `turn_duration`, `ai-title`, `attachment`, `queue-operation`) + sintéticas (custom-title, línea rota, línea vacía, usage sin cache fields, subagente en `<sid>/subagents/agent-x.jsonl`, sesión sin asistente) — done when: fixtures en repo con README de procedencia; sin datos personales.
- [ ] **4.** `src/main/analytics/transcript-reducer.ts`: `emptyState()`, `reduceTranscriptLine(state, line, { tz? })`, `finalizeSession(state, { sessionId, subagents[] })` → `SessionSummary` (tokens por modelo, turnos, msgs, `durationMs`, títulos con prioridad custom > ai > primer prompt, `firstTs/lastTs`, `tools`, `gitBranch`, `skippedLines`, `tokensByDay`, `turnsByHourDow` en hora local) — done when: unit tests sobre las fixtures (valores exactos contados a mano para la saneada), línea rota → `skipped`, subagente suma al padre, estado serializable (round-trip JSON).
- [ ] **5.** `src/shared/analytics/{cost.ts, pricing.ts}`: `DEFAULT_PRICING` (familias fable/opus/sonnet/haiku, con fecha), `resolvePricing(model, overrides)` por alias/prefijo, `costOf(tokensByModel, pricing)` → `{ usd, unknownModels }` — done when: unit tests (cada familia, override, desconocido → "—", cache write/read distintos).
- [ ] **6.** `src/shared/analytics/{time-buckets.ts, aggregate.ts}`: `rangeBounds(range, now)` (+ período anterior), `filterSessions`, `summarize` (tarjetas + delta), `byDay` (días vacíos; semanas > 60 d), `byProject`, `byModel`, `heatmap`, `sortSessions` — done when: unit tests con un set sintético de 8 sesiones (rangos, proyectos Hydra vs. ruta, días vacíos, semanas, deltas, orden por columna).

## Fase 2 — Indexer (main)

- [ ] **7.** `src/main/analytics/index-cache.ts` (load/save atómico de `analytics-index.json`, `version`, descarte si corrupto) + `analytics-indexer.ts`: `open()` (caché → emite sesiones; `scan()` en serie con `setImmediate`, stream desde `offset`, progreso, `sessions` cada 500 ms; filtra temporales al emitir), `close()`, `reindex()`, `fs.watch` recursivo + debounce 3 s → re-scan de paths tocados; `projectsRoot` inyectable (`HYDRA_E2E_CLAUDE_PROJECTS` / default `~/.claude/projects`) — done when: integración en temp: primer escaneo N sesiones + progreso; segundo sin cambios no lee bytes; apéndice → solo bytes nuevos y resumen actualizado; truncado → reparseo; caché corrupto/versión vieja → reconstrucción; `changed` < 10 s tras escribir; temporal excluido.
- [ ] **8.** Wiring: `AppContext` crea el indexer (perezoso), `ipc.ts` registra `analytics.*` y `ui.*`, `broadcast` de `progress/sessions`, `dispose` cierra watcher; medir en la máquina de Juan el primer índice real (objetivo < 30 s) — done when: probe desde devtools/driver: `analytics.open` devuelve sesiones reales; tiempo anotado en el plan (riesgo 2).

## Fase 3 — Renderer

- [ ] **9.** Store: `app-store.centerView` + `setCenterView` (persistido; al pasar a analytics → `blur`), slice `analytics` (`sessions`, `progress`, `range`, `projectKey`, `metric: 'tokens'|'cost'`, `heatMetric`, `sort`, `fromCache`) con selectores estables — done when: unit tests del slice y del `centerView`.
- [ ] **10.** Sidebar habilita **Analytics** (activo/inactivo), `App` renderiza `AnalyticsView` o la grilla (`PaneGrid` montado, `visibility:hidden` cuando no está activo), barra superior con título "Analytics"; `hydra-client` (`analyticsOpen/Close/Reindex`, `onAnalyticsProgress/Sessions`, `get/setAnalytics`, `get/setCenterView`) — done when: AC-1 a mano (ida y vuelta sin re-attach; terminales con tamaño correcto; foco no queda en ninguna terminal).
- [ ] **11.** Primitivas de gráficos `components/analytics/charts/` (`StackedBars`, `HBars`, `Heatmap`, `Tooltip`, `palette.ts` con asignación estable de colores) + `formatters.ts` (tokens abreviados `1.2M`, USD, duraciones) — done when: unit tests de `palette`/formatters; en dev con datos mock se ven limpias (tooltips, ejes mínimos, días vacíos).
- [ ] **12.** `AnalyticsView`: `RangePicker` (Hoy/7d/30d/Todo/personalizado, persiste), `ProjectFilter`, `StatCards` (tokens con hover in/out/caché, costo "estimado", sesiones, turnos, tiempo; delta), `UsageByDay` (toggle tokens/costo), `WhenHeatmap` (toggle turnos/tokens), `ProjectBars` (clic filtra; Hydra destacado), `ModelTable`, aviso de modelos sin precio, `ProgressBar`, estados vacío/cargando, botón Reindexar — done when: AC-3/4/5/6/8/10 a mano con los transcripts reales; < 200 ms al cambiar rango (medido con `performance.now` en dev).
- [ ] **13.** `SessionsTable`: columnas (título, proyecto, inicio, duración, turnos, in/out/caché, costo, modelo, viva), orden por columna, virtualización simple si > 300 filas, clic en viva → `focus` + Sessions — done when: AC-7 a mano.
- [ ] **14.** Pulido visual (AC-11 / FR-16): tipografía y espaciado, tarjetas con profundidad, transiciones al cambiar rango, paleta consistente entre gráficos y tabla, estado vacío diseñado, responsive al ancho de la ventana — done when: revisión de capturas (claro/ancho/estrecho) y OK visual de Juan.

## Fase 4 — Tests y cierre

- [ ] **15.** E2E fixture `e2e/fixtures-analytics.ts`: directorio de transcripts falsos (3 proyectos + 1 temporal, 6 sesiones con fechas fijas, una con subagente) generado desde las fixtures de test; `HYDRA_E2E_CLAUDE_PROJECTS`; E2E-9 (`e2e/07-analytics.spec.ts`): abrir Analytics → tarjetas con totales esperados, 7 columnas en 7d (con `now` fijo vía `HYDRA_E2E_NOW`), heatmap, proyectos sin el temporal, tabla ordenable, rango personalizado; volver a Sessions → mismos pids y terminales visibles — done when: verde.
- [ ] **16.** E2E-10: sesión falsa viva aparece marcada; clic → vuelve a Sessions con el pane enfocado; `analytics.changed` al agregar líneas al fixture en caliente → tarjetas se actualizan — done when: verde; 01–06 siguen verdes.
- [ ] **17.** QA manual `docs/qa-005.md` (primer índice real: tiempo/progreso; look AC-11; al día con sesión trabajando; precios en `hydra.json`) + empaquetar `Hydra.app` 0.4.0 — done when: checklist completo por Juan; fallos → tasks de fix.
- [ ] **18.** Cierre: README (sección Analytics), CLAUDE.md (módulos `analytics/`, reglas: reductor puro, caché versionado, temporales, `visibility:hidden` de la grilla), `.sdd/README.md`, `status.json` → complete, tag `v0.4.0` — done when: hecho y pusheado.

## Traceability

| Task | FR | AC |
|------|----|----|
| 1 | FR-1, FR-2, FR-9 | AC-1, AC-8 |
| 2 | FR-6, FR-10b | AC-6 |
| 3–4 | FR-11, FR-14 | AC-10 |
| 5 | FR-9 | AC-8 |
| 6 | FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8 | AC-3, AC-4, AC-5, AC-6, AC-7 |
| 7 | FR-10, FR-12, FR-13, FR-14, FR-15 | AC-2, AC-9, AC-10 |
| 8 | FR-12, FR-15 | AC-2 |
| 9–10 | FR-1 | AC-1 |
| 11–12 | FR-2–FR-7, FR-9, FR-12, FR-16, FR-17 | AC-3, AC-4, AC-5, AC-6, AC-8 |
| 13 | FR-8 | AC-7 |
| 14 | FR-16, FR-17 | AC-11 |
| 15–16 | — | AC-1/3/4/5/6/7/9 (automatizados) |
| 17 | — | AC-2, AC-9, AC-11 + manuales |
| 18 | — | — |
