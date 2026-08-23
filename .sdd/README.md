# Hydra AI — SDD index

Proyecto gestionado con Spec-Driven Development. Ver `constitution.md` para los principios.

## Features

- [001 — Workspace de sesiones de Claude Code](features/001-session-workspace/) — **complete (100%)** · v0.1.0 · QA manual 2026-08-23

- [002 — Árbol de archivos del proyecto](features/002-file-tree/) — **complete (100%)** · v0.2.0 · pendiente menor: ⌘⇧E en .app

## Backlog (aún sin spec, en orden tentativo)

- 002-fix — ⌘⇧E no alterna la vista en la `.app` empaquetada (sí en dev/E2E). Investigar captura de teclas en producción.
- ~~003 — Chat box por pane~~ (descartada el 2026-08-23 por decisión de Juan; el número no se reutiliza).
- 004 — Importar contexto de otra sesión: botón en el pane → ventana con los nombres de las sesiones activas → elegir una → se importa su contexto compactado a la sesión actual. (Pedido 2026-08-23.)
- 005 — Analytics de uso (a partir de los transcripts locales).
- 006 — Graph Know (grafo de conocimiento entre proyectos/sesiones).
- 007 — Config.
