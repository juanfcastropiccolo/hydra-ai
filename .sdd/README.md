# Hydra AI — SDD index

Proyecto gestionado con Spec-Driven Development. Ver `constitution.md` para los principios.

## Features

- [001 — Workspace de sesiones de Claude Code](features/001-session-workspace/) — **complete (100%)** · v0.1.0 · QA manual 2026-08-23

- [002 — Árbol de archivos del proyecto](features/002-file-tree/) — **complete (100%)** · v0.2.0 · pendiente menor: ⌘⇧E en .app
- [004 — Importar contexto de otra sesión](features/004-import-context/) — **complete (100%)** · v0.3.0 · QA 2026-08-23 · spike: `docs/spike-004-context.md` · spike: `docs/spike-004-context.md`

## Backlog (aún sin spec, en orden tentativo)

- 002-fix — ⌘⇧E no alterna la vista en la `.app` empaquetada (sí en dev/E2E). Investigar captura de teclas en producción.
- ~~003 — Chat box por pane~~ (descartada el 2026-08-23 por decisión de Juan; el número no se reutiliza).
- 007 — Config (hereda: `ui.importContext.model` y, si se quiere, `--max-budget-usd` para el resumen de 004).
