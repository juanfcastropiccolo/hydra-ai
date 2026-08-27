# Tasks: Config — preferencias de Hydra

Feature ID: 007
Status: tasked (aprobado 2026-08-26)
Last updated: 2026-08-26

Convenciones: un task ≈ un commit (Conventional Commits), tests en el mismo task que el código. Ningún task se marca `[x]` con tests rojos. Los AC de 001–006 (unit + E2E) siguen verdes en cada task.

## Fase 1 — Modelo de prefs e IPC (shared/main)

- [ ] **1.** `src/shared/prefs.ts`: tipos `ProfilePrefs`, `AppearancePrefs`, `SessionPrefs`, `HydraPrefs` (= `HydraFile['ui']`), defaults (`profile` desde el nombre del SO, `deriveInitials`), validadores puros por sección (`validateProfile/Appearance/Sessions/Know/Analytics`) reutilizados por `ProjectStore.normalize`; `know.maxBudgetUsd`; `ProjectStore.prefs()` / `setPrefs(section, patch)` — done when: unit tests de cada validador (válido/inválido/faltante, rangos, `bypassPermissions` aceptado pero marcado) y del store (persistencia, rechazo); tests de 001–006 verdes.
- [ ] **2.** IPC unificado: `prefs.get`, `prefs.set({section, patch})` (side effects: `know.port` → `restartMcp`, `know.autoCards` → `queue.kick`), evento `prefs.changed`; `hydra-client` (`getPrefs/setPrefs/onPrefsChanged`) y `prefs-slice` espejo en el renderer; `initHydraClient` carga prefs al boot — done when: unit del slice; probe: cambiar `know.autoCards` por `prefs.set` se refleja en Graph Know y en `hydra.json`.
- [ ] **3.** `AppContext.restartMcp(port)`: para el server, arranca en el puerto nuevo, revierte y devuelve error si está tomado, re-registra si estaba conectado — done when: integración en puertos efímeros (ok; tomado → revierte; registrado → `mcpAdd` llamado con la URL nueva, con CLI falso).
- [ ] **4.** Sesiones: `ClaudeCli.spawnBackground` gana `model/effort/permissionMode` (flags solo si no vacíos); `createSession` lee `ui.sessions`; `suggestSessionName` con `namePattern` (`{project}`, `{n}`, `{date}`); `confirmStopWorking` expuesto al renderer — done when: unit de args y de `namePattern`; `FakeClaudeCli` registra las opciones para E2E.
- [ ] **5.** `src/main/error-log.ts` (ring de 50, `push(source, message)`, `list()`), conectado a hooks server, `watcher.pollError`, `ContextImporter`, `CardQueue`, MCP y `uncaughtException`; IPC `maint.errors` — done when: unit del ring; probe: un error de ficha aparece en `maint.errors`.
- [ ] **6.** `src/main/maintenance.ts` + IPC `maint.info/redetectCli/openDataDir/exportHydraJson/importHydraJson/clearCards/clearAnalyticsCache/reindex` (diálogos nativos de Electron para export/import; import valida, hace `hydra.json.bak`, recarga el store y re-broadcast proyectos/prefs) — done when: integración en temp de export/import (válido, inválido, versión futura, `.bak`), `clearCards`/`clearAnalyticsCache` borran y las capas se reconstruyen.
- [ ] **7.** Menú de app "Preferencias… ⌘," → evento `ui.openConfig`; `App` lo maneja (también capture ⌘,) → `centerView: 'config'`; Sidebar habilita **Config** — done when: E2E 01–08 verdes; probe del atajo.

## Fase 2 — UI

- [ ] **8.** Controles base `components/config/controls/` (`Toggle`, `Select`, `NumberField`, `TextField`, `SavedToast`, `PendingBar`, hook `usePendingSection`) + `ConfigView` con nav de 6 categorías en 3 grupos (íconos, activo, responsive a pestañas) y layout Discord-like — done when: con datos mock en dev se ve y navega; unit de `usePendingSection` (dirty/save/discard).
- [ ] **9.** Secciones **Perfil** (nombre/iniciales con preview; avatar del Sidebar lee prefs) y **Apariencia** (fuente de terminal en vivo vía `XTermView`, zoom por defecto, acento aplicado por `App` a `--accent/--accent-dim`) — done when: AC-3 y AC-4 a mano (cambia sin re-attach).
- [ ] **10.** Secciones **Sesiones** (modelo/esfuerzo/permisos con advertencia roja + confirmación en `bypassPermissions`, patrón de nombre con preview, confirmar al terminar) y **Contexto e IA** (modelo económico, fichas automáticas, presupuesto por ficha, puerto MCP con reinicio, estado, Conectar/Desconectar, rango por defecto) — done when: AC-5 y AC-7 a mano (`claude mcp get` muestra la URL nueva).
- [ ] **11.** Secciones **Analytics** (`PricingTable`: editar/agregar/quitar/restaurar defaults con fecha del snapshot; rango por defecto) y **Mantenimiento** (info CLI, carpeta de datos + tamaños + Abrir en Finder, Reindexar, Borrar fichas/caché con confirmación, Exportar/Importar, errores recientes con Copiar, Acerca de) — done when: AC-6 y AC-8 a mano.
- [ ] **12.** "Restaurar valores por defecto" por categoría (confirmación) + validaciones inline (puerto, iniciales, rangos) + pulido visual Discord-like (espaciados, hover, focus rings, transiciones) — done when: AC-9 a mano; revisión de capturas.

## Fase 3 — Tests y cierre

- [ ] **13.** E2E `e2e/09-config.spec.ts`: abrir por ítem y ⌘,; toggle persiste; Perfil barra Guardar/Descartar → avatar; fuente 16 px → `.xterm` refleja y mismos pids; Sesiones haiku+low → fake CLI recibe flags; Borrar fichas con confirm → Graph Know 0 fichas; puerto 80 e iniciales largas rechazados; volver a Sessions sin re-attach — done when: verde; 01–08 verdes.
- [ ] **14.** Retirar canales viejos (`ui.getFileTree/setFileTree`, `ui.getImportContext/…`, `ui.getAnalytics/…`, `ui.getCenterView/…`, `know.getPrefs/setPrefs`) a favor de `prefs.*`; adaptar E2E existentes — done when: typecheck/lint/E2E verdes; `ipc.ts` sin duplicados.
- [ ] **15.** QA manual `docs/qa-007.md` (look Discord, acento en toda la app, export/import real, puerto MCP con `claude mcp get`, `bypassPermissions`) + empaquetar `Hydra.app` 0.6.0 — done when: checklist completo por Juan.
- [ ] **16.** Cierre: README (sección Config), CLAUDE.md (`prefs.*`, `maintenance`, `error-log`), `.sdd/README.md`, `status.json` → complete, tag `v0.6.0` — done when: hecho y pusheado.

## Traceability

| Task | FR | AC |
|------|----|----|
| 1–2 | FR-3, FR-5–FR-9, FR-14 | AC-2, AC-10 |
| 3 | FR-8, FR-13 | AC-7 |
| 4 | FR-7 | AC-5 |
| 5–6 | FR-10, FR-12 | AC-8 |
| 7 | FR-1 | AC-1 |
| 8 | FR-2, FR-3, FR-4 | AC-1, AC-3 |
| 9 | FR-5, FR-6, FR-14 | AC-3, AC-4 |
| 10 | FR-7, FR-8, FR-13 | AC-5, AC-7 |
| 11 | FR-9, FR-10 | AC-6, AC-8 |
| 12 | FR-3, FR-11 | AC-9 |
| 13–14 | — | AC-1/2/3/4/5/8/9/10 (automatizados) |
| 15 | — | AC-2 (look), AC-6, AC-7 + manuales |
| 16 | — | — |
