# Hydra AI

Aplicación de escritorio para macOS que permite **abrir, observar y operar varias sesiones de Claude Code a la vez en una sola pantalla**, organizadas por proyecto. Es una capa de orquestación y visualización sobre el CLI de Claude Code: lo lanza, lo observa y le habla; no lo reimplementa.

El proyecto se desarrolla con Spec-Driven Development: ver [`.sdd/`](.sdd/) (Constitution, specs, planes y tasks).

## Requisitos

- macOS 14+ (Intel x64 por ahora)
- Node ≥ 22.12 (`.nvmrc`); con Node 20 el postinstall de Electron no descarga el binario
- [Claude Code CLI](https://code.claude.com) ≥ 2.1.241 instalado y autenticado

## Desarrollo

```bash
npm install          # instala deps; el postinstall garantiza el binario de Electron
npm run dev          # Electron + Vite con HMR
npm test             # unit/integración (Vitest, src/main + src/shared)
npm run test:electron  # smoke: node-pty cargando dentro de Electron
npm run test:e2e     # Playwright + Electron sobre out/ con CLI/PTY falsos (HYDRA_E2E=1)
npm run typecheck && npm run lint && npm run format:check
npm run package      # → release/Hydra.app (+ .dmg), x64, firma ad-hoc
```

## Terminal real: node-pty dentro de Electron

Hydra usa [`@lydell/node-pty`](https://www.npmjs.com/package/@lydell/node-pty), una distribución de `node-pty` con **binarios precompilados por plataforma** (`@lydell/node-pty-darwin-x64`, `-darwin-arm64`, …) publicados como paquetes opcionales. Por eso:

- No hay `electron-rebuild` ni toolchain de C++ en el `npm install`.
- El módulo es N-API, así que el mismo `pty.node` sirve para el Node del sistema y para el Node embebido en Electron (verificado con `npm run test:electron`, que corre `test/electron/pty-smoke.cjs` dentro del proceso main de Electron).
- `electron-vite` deja `@lydell/node-pty` como dependencia externa del bundle de main (se resuelve desde `node_modules` en runtime).
- `electron-builder` lo saca del `asar` (`asarUnpack: node_modules/@lydell/node-pty*/**`) porque el `.node` y el `spawn-helper` tienen que existir como archivos reales en disco.

Si en el futuro se agrega arm64, alcanza con empaquetar `--arm64`/`--universal`: el paquete opcional correspondiente se instala solo.

## Cómo funciona (feature 001)

- **Sidebar** con proyectos (carpetas) y sus sesiones, semáforo 🟢 trabajando / 🔴 esperando tu acción / 🟡 ocioso, y contador rojo por proyecto.
- **＋** en un proyecto → diálogo (nombre, carpeta, Cancelar/Crear) → `claude --bg --name …` en esa carpeta, con hooks HTTP inyectados vía `--settings` para el semáforo en tiempo real.
- Cada pane es una **PTY real** corriendo `claude attach <id>` dentro de xterm.js. Clic = foco (borde verde, teclas solo ahí). Doble clic o ⤢ = expandir; `Esc` contrae cuando la terminal no tiene el foco. ⊟ oculta sin terminar; ✕ termina.
- Cerrar Hydra **no** mata sesiones: viven en el daemon de Claude Code; al reabrir se reconectan. Sesiones abiertas a mano en otra terminal aparecen como "externa" (solo lectura) hasta que las mandes a background con `/bg`.
- **Árbol de archivos (feature 002):** la barra izquierda tiene una solapa a mitad de altura con dos vistas: _Sesiones_ y _Archivos_ (⌘⇧E alterna). _Archivos_ muestra el árbol del proyecto del pane con foco, estilo editor: iconos por tipo, estado git (M/U/D, punto en carpetas, ignorados atenuados), actualización en vivo, filtro, teclado. Doble clic abre con la app por defecto; clic derecho: Finder, copiar rutas, editor, "Abrir terminal acá". Arrastrar un archivo a un pane escribe su ruta en esa sesión.
- **Importar contexto (feature 004):** ⇩ en el encabezado de un pane en reposo → elegís otra sesión activa (de cualquier proyecto) → Hydra le pide al propio Claude Code un resumen de traspaso de esa conversación (`claude -p --resume --fork-session --no-session-persistence`, modelo `haiku` por defecto, configurable en `hydra.json → ui.importContext.model`) y lo **pega en el prompt del pane sin enviarlo**, con una introducción en tu voz: lo revisás, editás y mandás con Enter. La sesión origen no se toca. Si el pane dejó de estar en reposo mientras se generaba, no se pega: aparece un aviso con Copiar / Reintentar pegado.
- **Analytics (feature 005):** el ítem _Analytics_ del sidebar muestra un dashboard sobre **todos** los transcripts locales de Claude Code (`~/.claude/projects`, solo lectura; se excluyen carpetas temporales): tokens y costo estimado (precios editables en `hydra.json → ui.analytics.pricing`), sesiones, turnos y tiempo trabajando con comparación al período anterior; uso por día apilado por modelo; mapa de calor hora × día; desglose por proyecto (los de Hydra destacados) y por modelo; tabla de sesiones ordenable (clic en una viva → va al pane). Índice incremental con caché (`analytics-index.json` en userData): el primer escaneo muestra progreso; después es instantáneo y se mantiene al día solo.
- QA manual y desvíos: `docs/qa-001.md`, `docs/qa-002.md`, `docs/qa-004.md`, `docs/qa-005.md`. Spikes técnicos: `docs/spike-001-attach.md`, `docs/spike-004-context.md`.

## Estructura

```
src/main/       proceso main (Node): PTY, puente con el CLI de Claude, hooks server, persistencia
src/preload/    contextBridge → window.hydra
src/renderer/   UI React
src/shared/     tipos y contratos IPC compartidos entre procesos
test/           tests que no viven junto al código (smoke de Electron, fixtures)
spikes/         experimentos desechables (fuera del build y del lint)
docs/           decisiones, resultados de spikes, checklists de QA
.sdd/           artefactos de Spec-Driven Development
```
