# Tasks: Importar contexto de otra sesión

Feature ID: 004
Status: tasked (borrador — pendiente de aprobación)
Last updated: 2026-08-23

Convenciones: un task ≈ un commit (Conventional Commits), tests en el mismo task que el código (unit primero en `shared`/`main`). Ningún task se marca `[x]` con tests rojos. Los AC de 001 y 002 (unit + E2E existentes) deben seguir verdes en cada task. Base: `docs/spike-004-context.md`.

## Fase 1 — Contratos y lógica pura (shared/main)

- [ ] **1.** Tipos + contrato IPC de 004 en `src/shared/`: `ImportContextPrefs { model: string }` + `DEFAULT_IMPORT_CONTEXT_PREFS = { model: 'haiku' }`, `HydraFile.ui.importContext`; canales `context.summarize`, `context.cancel`, `ui.getImportContext`, `ui.setImportContext`; `ProjectStore` normaliza/valida el campo (string no vacío → default) con `importContext()`/`setImportContext()` — done when: compila en main y renderer; unit tests de `ProjectStore` (ausente → default; `model: ''`/no string → default; `model: 'sonnet'` persiste y se relee).
- [ ] **2.** `src/main/context/print-json.ts`: `parsePrintJson(stdout): PrintJsonResult` para `claude -p --output-format json` (`{ type, subtype, is_error, result, session_id, total_cost_usd, duration_ms }`; tolera ruido antes/después del JSON; `is_error` o `result` vacío → `{ ok:false, message }`) — done when: unit tests con fixtures en `src/main/context/fixtures/` capturadas del CLI real (ok, `is_error`, JSON inválido, `result` vacío, ruido previo).
- [ ] **3.** `src/main/context/handoff-prompt.ts` + `import-block.ts`: `buildHandoffPrompt()` (texto fijo: secciones objetivo / decisiones y porqué / datos y nombres clave / estado actual / pendientes; "en el idioma predominante de la conversación"; "solo texto, sin herramientas"), `trimSummary(text, max = 8000)` (sin recorte bajo el tope; recorta conservando objetivo/decisiones/estado/pendientes + marca "[… recortado por Hydra …]"), `buildImportBlock({ sourceName, projectName, text, truncated })` (intro en primera persona + `<imported-context session= project=>…</imported-context>`; nunca contiene `\r`) — done when: unit tests de las tres funciones (incluye texto > tope con y sin encabezados reconocibles, nombres con comillas/acentos).
- [ ] **4.** `ClaudeCli.summarizeSession({ sessionId, cwd, model, prompt, signal?, timeoutMs = 90_000 })`: `Runner` gana `signal?` (se pasa a `execFile`); comando `-p --resume <sid> --fork-session --no-session-persistence --model <m> --output-format json <prompt>` con `cwd`; mapea `parsePrintJson` a `{ text, raw }` o lanza `ClaudeCliError` legible (incluye stderr recortado; abort → `name: 'AbortError'`); `ClaudeCliLike` y `FakeClaudeCli` lo implementan (el fake: texto fijo, retardo `HYDRA_E2E_SUMMARY_DELAY_MS`, respeta `signal`) — done when: unit tests con runner espía (args y `cwd` exactos, `signal` propagado, error de exit, error de `is_error`); `claude-cli.integration.test.ts` (marcado `integration`): sesión `-p --session-id` creada por el test con un dato plantado → el resumen lo contiene, **no aparece ningún `.jsonl` nuevo** y el de la origen no cambia de tamaño; cancelación a los 500 ms → rechaza en < 2 s sin hijo vivo.
- [ ] **5.** `src/main/context/context-importer.ts`: `ContextImporter({ cli, watcher, store })` con `summarize({ importId, sourceSessionId })` (origen inexistente o sin `sessionId` → error "la sesión ya no existe / no es accesible"; `cwd` inexistente → error claro; prefs.model; prompt; cli; trim; bloque; devuelve `{ text, truncated, model, durationMs }`), `cancel(importId)` (AbortController por importId; idempotente), `dispose()` aborta todo — done when: unit tests con CLI falso y watcher falso (flujo ok, origen ausente, cancelación, recorte marcado, error del CLI propagado con mensaje, modelo inválido menciona la preferencia).
- [ ] **6.** Wiring en main: `AppContext` crea `ContextImporter`; `ipc.ts` registra `context.summarize/cancel` y `ui.getImportContext/setImportContext`; `dispose` cancela importaciones en vuelo — done when: `npm run typecheck && npm run lint` verdes; probe manual en dev (`hydra.invoke('context.summarize', …)` desde devtools contra una sesión real devuelve texto).

## Fase 2 — Renderer

- [ ] **7.** Slice `importContext` del store (`dialogTargetId`, `byTarget`; acciones `openDialog/closeDialog/startImport/markReady/markBlocked/markDone/markError/cancelImport/retryPaste/clear`) + `canImportInto(session, { ptyId, ended, running })` puro en `src/renderer/src/lib/` con tooltip de causa — done when: unit tests del slice (una importación por destino; transiciones running→ready→done/blocked/error; cancel limpia; retryPaste vuelve a `ready`) y de `canImportInto` (idle+pty → ok; working/waiting/ended/sin pty/importando → causa correcta).
- [ ] **8.** `ImportContextDialog` (+ css, patrón `NewSessionDialog`): lista de sesiones del store menos la destino y las sin `sessionId`, agrupadas por proyecto (o "Fuera de proyectos"), cada una con semáforo, nombre, marca "externa"; filtro por nombre/proyecto con autofoco; "Se resumirá con: *haiku*" (de `ui.getImportContext`); `Esc` cancela, `Enter`/doble clic confirma; estado vacío "No hay otras sesiones activas" — done when: con datos mock en dev se ve y navega; unit test del selector/agrupado puro (`groupImportCandidates`).
- [ ] **9.** `Pane`: botón **⇩ Importar contexto** en el encabezado (habilitado por `canImportInto`, tooltip con causa; `data-testid="pane-import"`); overlay de progreso "Resumiendo el contexto de *X*…" con spinner y **Cancelar**; al `ready` un `useEffect` evalúa la guarda: `idle` + `ptyId` → `hydra.write(ptyId, '\x1b[200~' + text + '\x1b[201~')` (sin `\r`), `controller.focus()`, toast verde "Contexto de *X* listo para enviar — revisalo y pulsá Enter", `markDone`; si no → `blocked` con aviso persistente **Copiar** / **Reintentar pegado**; `error` → aviso rojo con causa + **Reintentar** / cerrar — done when: AC-1, AC-4 (a mano forzando working con una sesión real), AC-5, AC-7 verificables en dev entre dos sesiones de este repo.
- [ ] **10.** Integración de datos en el renderer: `hydra-client.ts` (`summarizeContext`, `cancelImport`, `getImportContext`), `App` monta el diálogo según `dialogTargetId`, `startImport` invoca y resuelve a `markReady`/`markError` (cancelación no es error), el estado sobrevive a ocultar/mostrar el pane (se pega al re-mostrarlo si sigue idle) — done when: AC-2 (origen intacta: `claude agents` y el transcript de la origen no cambian), AC-3, AC-6 a mano.

## Fase 3 — Tests y cierre

- [ ] **11.** Integración PTY (marcada `integration`, `src/main/context/paste.integration.test.ts`): sesión `--bg` + `attach` en PTY real; escribir bloque bracketed-paste multilínea sin `\r` → el transcript **no** gana mensaje de usuario; luego `\r` → aparece un único mensaje íntegro; limpia con `stop`/`rm` (réplica del spike; ≈ US$0.01) — done when: verde con `claude` real.
- [ ] **12.** E2E-6 (`e2e/06-import-context.spec.ts`): dos sesiones A y B; botón habilitado en B (idle) y deshabilitado con tooltip en una sesión `working` (`e2e.setStatus`); diálogo desde B lista A (no B), agrupada, filtro, "haiku"; confirmar → overlay con Cancelar; al resolver, `e2e.ptyRecords` de B tiene **una** escritura que empieza con `ESC[200~`, contiene intro + resumen falso, termina con `ESC[201~` y **no** contiene `\r`; toast verde; B con foco — done when: verde.
- [ ] **13.** E2E-7/8 (mismo spec): con `HYDRA_E2E_SUMMARY_DELAY_MS` alto, B pasa a `working` durante la espera → sin escritura, aviso con Copiar/Reintentar; B vuelve a idle + Reintentar → escritura; cancelar durante la espera → sin escritura y botón habilitado; importar con B oculta y mostrarla → se pega — done when: verde; los E2E 01–05 siguen verdes.
- [ ] **14.** QA manual `docs/qa-004.md` (AC-1/2/5/6/8 con sesiones reales de este repo, origen larga: tiempo/costo observados, `.app` empaquetada con OAuth, modelo inválido en `hydra.json`) + empaquetar `Hydra.app` 0.3.0 — done when: checklist completo por Juan; fallos → tasks de fix.
- [ ] **15.** Cierre: README (sección "Importar contexto"), CLAUDE.md (módulo `context/`, regla: nunca escribir `\r` al pegar; bracketed paste; `-p` solo vía `ClaudeCli`), `.sdd/README.md` (004 complete; 007 hereda `ui.importContext.model` y `--max-budget-usd`), `status.json` → `complete`, tag `v0.3.0` — done when: hecho y pusheado.

## Traceability

| Task | FR | AC |
|------|----|----|
| 1 | FR-7, FR-15 | AC-8 |
| 2 | FR-5, FR-14 | AC-6 |
| 3 | FR-5, FR-9, FR-11 | AC-1 |
| 4 | FR-5, FR-6, FR-7, FR-8, FR-14 | AC-1, AC-2, AC-6, AC-7 |
| 5 | FR-5–FR-9, FR-14 | AC-1, AC-2, AC-6, AC-7, AC-8 |
| 6 | FR-5, FR-7 | — |
| 7 | FR-1, FR-8, FR-12, FR-14 | AC-4, AC-7 |
| 8 | FR-2, FR-3, FR-4, FR-7 | AC-3, AC-8 |
| 9 | FR-1, FR-8, FR-10–FR-14, FR-16 | AC-1, AC-4, AC-5, AC-7, AC-9 |
| 10 | FR-6, FR-10, FR-14 | AC-2, AC-3, AC-6 |
| 11 | FR-10 | AC-1, AC-5 |
| 12–13 | — | AC-1/3/4/7/9 (automatizados) |
| 14 | — | AC-2/5/6/8 + manuales |
| 15 | — | — |
