# Hydra AI — Constitution

Estado: APROBADA (2026-08-23)
Última actualización: 2026-08-23 (ADR-4 corregida, ADR-5/6 añadidas al aprobar plan 001)

## Purpose

Hydra AI es una aplicación de escritorio para macOS que permite a un desarrollador **abrir, observar y operar varias sesiones de Claude Code a la vez en una sola pantalla**, organizadas por proyecto. Reemplaza el malabar de tener N pestañas de terminal por un workspace visual: un panel lateral con proyectos y sus sesiones, una grilla de terminales vivas con indicador de estado, y herramientas de contexto (árbol de archivos del proyecto, analíticas de uso, grafo de conocimiento) alrededor de esas terminales.

Hydra es una **capa de orquestación y visualización sobre el CLI de Claude Code**. No reimplementa al agente: lo lanza, lo observa y le habla.

Hoy es una herramienta personal de su autor; está diseñada para poder distribuirse a otros desarrolladores Mac más adelante sin reescribirla.

## Core principles

1. **El CLI de Claude Code es la fuente de verdad.** Estados, sesiones, permisos, auth y modelos los decide Claude Code; Hydra los lee y los muestra. *Por qué:* cada cosa que reimplementamos se rompe con la próxima versión del CLI; cada cosa que delegamos se mantiene sola.
2. **La terminal es real, no una imitación.** Cada pane es una PTY genuina corriendo el CLI; nunca un chat renderizado que "parece" Claude. *Por qué:* el usuario debe poder hacer en Hydra exactamente lo que haría en iTerm, sin sorpresas ni features faltantes.
3. **Nunca escribir en la terminal equivocada.** El foco visual (borde) y el foco real de teclado son siempre la misma cosa; si hay duda, no hay foco. *Por qué:* mandar un prompt o un "y" de permiso al pane incorrecto es el peor fallo posible de esta app.
4. **El estado de cada sesión debe ser observable de un vistazo.** Todo pane muestra su semáforo, todo proyecto muestra cuántas sesiones piden atención. *Por qué:* el valor de Hydra es no tener que ir pane por pane a ver quién está bloqueado.
5. **Funciona como `.app` desde el Finder, sin terminal previa.** No se asume PATH de shell, ni `nvm`, ni variables de entorno del usuario. *Por qué:* es el fallo #1 de las apps de escritorio que envuelven CLIs; lo pagamos una vez, al principio.
6. **Robusta ante sesiones que mueren.** Cerrar Hydra no mata las sesiones; reabrirla las reconecta. Un pane roto no tira la app. *Por qué:* las sesiones son trabajo en curso valioso; la app es solo una ventana sobre ellas.
7. **Una feature por vez, completa y probada.** Cada feature SDD se termina (spec → plan → tasks → código con tests) antes de empezar la siguiente. *Por qué:* es un proyecto de una persona; el trabajo a medias es deuda.

## Tech stack

(Solo lo load-bearing. El detalle vive en cada `plan.md`.)

- **Lenguaje:** TypeScript en modo `strict`, en todos los procesos.
- **Runtime de app:** Electron (proceso main en Node; renderer con React). Target **macOS 14+, x64** primero; arm64/universal cuando haya hardware para probarlo.
- **Terminal:** xterm.js en el renderer; PTYs reales vía `node-pty` (distribución con binarios precompilados) en el proceso main.
- **Integración con Claude Code:** exclusivamente a través de su CLI público (`claude --bg`, `claude agents --json`, `claude attach`, `claude logs/stop/rm`) y de su sistema de hooks. Nunca leer estructuras internas no documentadas salvo los transcripts `.jsonl` de `~/.claude/projects/` para analíticas.
- **Persistencia local:** archivos JSON en el directorio de datos de la app (proyectos, layout). Sin base de datos hasta que una feature lo justifique.
- **Build/empaquetado:** `electron-builder` → `Hydra.app` + `.dmg`. Firma ad-hoc por ahora; notarización queda como feature futura.
- **Infra:** ninguna. Todo local. Sin backend, sin telemetría, sin red salvo la que haga el propio CLI de Claude.

## Code style

- **Formato:** Prettier con configuración por defecto. Sin debates de estilo en PRs.
- **Lint:** ESLint con `typescript-eslint` recommended + `react-hooks`. Sin `any` explícito salvo en bordes con librerías sin tipos, y siempre comentado.
- **Idioma:** código, identificadores, commits y comentarios en **inglés**. Specs, plan, tasks, README y docs de usuario en **español**.
- **Nombres:** `camelCase` para variables/funciones, `PascalCase` para componentes y tipos, `kebab-case` para archivos. Un componente React por archivo.
- **Organización:** separación estricta por proceso de Electron: `src/main/` (Node: PTY, CLI bridge, hooks server, FS), `src/renderer/` (React: UI), `src/shared/` (tipos e IPC contracts usados por ambos). Todo lo que cruza procesos pasa por un contrato tipado en `shared/`.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`). Un task de SDD ≈ un commit.

## Testing strategy

- **Unit:** toda lógica pura en `main` y `shared` — parseo de `claude agents --json`, mapeo de estados a semáforo, resolución de PATH, agrupado de sesiones por proyecto, parseo de transcripts. Runner: Vitest.
- **Integración:** el puente con el CLI de Claude Code contra el binario real instalado (spawn, listar, attach, stop). Se marcan como `integration` y requieren `claude` presente; se pueden saltar en CI.
- **E2E:** solo los flujos críticos de UI, con Playwright para Electron: (1) crear proyecto y spawnear sesión, (2) foco y borde siguen al clic y al teclado, (3) expandir/contraer un pane. No snapshot tests.
- **Cobertura objetivo:** 80% en `src/main` y `src/shared`; el renderer no tiene objetivo numérico, se cubre vía E2E.
- **Regla:** ninguna feature se marca `complete` con un test rojo o con un acceptance criterion sin test o verificación manual documentada.

## Boundaries — what this project does NOT do

- **No soporta Windows ni Linux.** Solo macOS. No se introducen abstracciones de plataforma "por si acaso".
- **No gestiona sesiones remotas.** Ni SSH, ni contenedores, ni sesiones cloud de Claude. Solo procesos locales en esta máquina.
- **No reimplementa Claude Code.** No hay chat propio contra la API, no hay lógica de permisos, modelos ni auth en Hydra. Si el CLI no lo expone, Hydra no lo hace.
- **No es un multiplexor genérico de terminales.** Hydra abre shells de Claude Code; no compite con iTerm/tmux para correr `vim` o `htop`.
- **No maneja git worktrees ni branches en el MVP.** Queda explícitamente abierto como feature futura (no excluido), pero ninguna feature inicial depende de ello.
- **No tiene backend ni cuenta de usuario.** Todo es local al usuario y a la máquina.

## Decision log

| Fecha | Decisión | Razón | Features afectadas |
|------|----------|-------|--------------------|
| 2026-08-23 | Electron + TS + React + xterm.js + node-pty, descartando Tauri y Swift nativo | `node-pty` es el PTY de VS Code (18M desc/mes) vs. plugin Tauri inmaduro (45k totales); UI web resuelve file tree, charts y grafos; Swift obligaba a construir todo desde cero. Costo de RAM/bundle irrelevante para herramienta de dev. | todas |
| 2026-08-23 | Sin tmux: se usa el daemon nativo de Claude Code (`--bg`, `agents --json`, `attach`, hooks) | Claude Code 2.1.2xx ya trae supervisor, persistencia, reconexión y estado por sesión. Reimplementarlo con tmux duplica riesgo. | todas |
| 2026-08-23 | Estado de sesión vía hooks HTTP (push) + `agents --json` (reconciliación), nunca inferido del stream de la PTY | Inferir del texto es frágil ante cambios del TUI; el CLI ya reporta `working/waiting/idle` y `waitingFor`. | semáforo |
| 2026-08-23 | ~~Panes lanzan el CLI con `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1`~~ **Reemplazada:** los panes corren `claude attach`, que renderiza siempre en modo fullscreen (ignora esa variable). Se acepta fullscreen; si la captura de mouse molesta, `CLAUDE_CODE_DISABLE_MOUSE=1` en el env del attach. Se valida en el spike inicial de 001. | Verificado en doc oficial al planificar 001: attach fuerza fullscreen; el modo está diseñado para terminales tipo xterm.js y corrige el salto de scroll del renderer clásico. | terminal panes |
| 2026-08-23 | Sesiones de Hydra = `claude --bg --name` + `claude attach` en PTY propia; nunca `claude` interactivo directo en la PTY | Una sesión interactiva muere con su terminal; la background vive en el daemon → FR-10/FR-9 gratis. | 001 |
| 2026-08-23 | Hydra no persiste sesiones, solo proyectos y preferencias de UI | El CLI (`agents --json`) es la fuente de verdad; duplicarla diverge. | 001 |
