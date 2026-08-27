# Plan: Config — preferencias de Hydra

Feature ID: 007
Status: planned (borrador — pendiente de aprobación)
Last updated: 2026-08-26

## Chosen stack

Sin dependencias nuevas. React + CSS modules (como toda la app), `ProjectStore` como única fuente de preferencias, IPC tipado.

| Necesidad | Elección | Por qué |
|---|---|---|
| Modelo de prefs | `hydra.json → ui` gana `profile`, `appearance`, `sessions`; `know` gana `maxBudgetUsd`; todo con defaults y validación en `ProjectStore.normalize` (mismo patrón que 002/005/006) | Una sola fuente de verdad; claves opcionales → sin migración |
| IPC | **Unificado:** `prefs.get` → `HydraPrefs` (todo `ui`), `prefs.set({ section, patch })` → validado por sección, broadcast `prefs.changed` con el objeto completo | Reemplaza la proliferación de `ui.getX/setX` (los existentes quedan como alias hasta el cierre); el renderer tiene un `prefs-slice` espejo |
| Guardado | Controles instantáneos llaman `prefs.set` directo; campos de texto/número usan un hook `usePendingSection(section)` con `draft`/`dirty`/`save`/`discard` y la barra flotante | FR-3; Discord-like |
| Apariencia en vivo | Acento: `document.documentElement.style.setProperty('--accent' / '--accent-dim')` desde `App` al cambiar prefs (tabla color→{accent, dim}); fuente: `XTermView` lee `appearance.terminalFontSize` del slice → `term.options.fontSize` + `fit()` | FR-6/FR-14 sin re-attach (xterm soporta cambiar opciones en vivo) |
| Sesiones | `ClaudeCli.spawnBackground` gana `model?`, `effort?`, `permissionMode?` → `--model/--effort/--permission-mode`; `AppContext.createSession` lee `ui.sessions`; `suggestSessionName` usa `namePattern` (`{project}`, `{n}`, `{date}`) | FR-7 |
| MCP puerto | `prefs.set(know.port)` → `AppContext.restartMcp()`: para el server, arranca en el nuevo puerto (si falla → revierte y devuelve error), y si estaba registrado hace `mcpAdd` con la URL nueva | FR-13 |
| Mantenimiento | `src/main/maintenance.ts`: `info()` (ruta/versión CLI, userData, tamaños, versiones), `redetectCli()`, `openDataDir()` (`shell.showItemInFolder`), `exportHydraJson()` (`dialog.showSaveDialog`), `importHydraJson()` (`dialog.showOpenDialog` → `validateHydraFile` → `hydra.json.bak` → reemplazo → `store.load()` → broadcast `projects.changed` + `prefs.changed`), `clearCards()`, `clearAnalyticsCache()`, `reindex()` | FR-10/FR-12 |
| Log de errores | `src/main/error-log.ts`: ring buffer (50) `{ ts, source, message }`; se alimenta desde los puntos que hoy hacen `console.error` (hooks, watcher `pollError`, importer, `CardQueue.lastError`, MCP) y desde `process.on('uncaughtException')` | FR-10 "errores recientes" |
| Atajo ⌘, | Menú de app "Preferencias… ⌘," (rol estándar) → evento `ui.openConfig`; además handler capture en `App` (como ⌘B) | FR-1 |
| UI | `components/config/`: `ConfigView` (nav + contenido), `sections/{Profile,Appearance,Sessions,ContextAI,Analytics,Maintenance}`, controles `Toggle`, `Select`, `NumberField`, `TextField`, `PricingTable`, `PendingBar`, `SavedToast`; CSS module con tokens; responsive (< 900 px → pestañas) | FR-2 |
| Tests | Vitest (store por sección, CLI args, `namePattern`, error-log, prefs-slice, `accentVars`), integración (import/export de `hydra.json` en temp; restart MCP en puerto efímero), Playwright (E2E-12: navegación, toggle persistido, barra de cambios, fuente en vivo, flags de sesión en el fake CLI, borrar fichas) | Constitution |

## Architecture overview

```
Renderer                                                   Main
┌────────────────────────────────────────┐                 ┌──────────────────────────────────────┐
│ Sidebar [Config] / ⌘, → centerView     │                 │ ProjectStore.ui (prefs, validación)   │
│ ConfigView                              │◄─prefs.get─────│ prefs.set(section, patch) → save     │
│  ├ Nav (6 categorías, 3 grupos)         │──prefs.set────►│   → broadcast prefs.changed          │
│  ├ Section (controles + ayuda)          │◄─prefs.changed─│   → side effects: restartMcp, etc.   │
│  │   instantáneos → prefs.set           │                 │ Maintenance: info/redetect/export/    │
│  │   texto → usePendingSection + Bar    │──maint.*──────►│   import/clear*/reindex/openDataDir  │
│  └ Maintenance (info, acciones, errores)│◄─maint.errors──│ ErrorLog (ring 50) ← hooks/cli/cards │
│ prefs-slice (espejo) → App aplica       │                 │ ClaudeCli.spawnBackground(+flags)    │
│   --accent, avatar, font a XTermView    │                 │ AppMenu: Preferencias… ⌘,            │
└────────────────────────────────────────┘                 └──────────────────────────────────────┘
```

## Data model

```ts
ui.profile?:    { name: string; initials: string }                          // default: nombre de usuario del SO, iniciales derivadas
ui.appearance?: { terminalFontSize: number /*10–20, 13*/; accent: ProjectColor /*'green'*/ }   // zoomLevel ya existe
ui.sessions?:   { model: string /*''=default CLI*/; effort: ''|'low'|'medium'|'high'|'xhigh'|'max'; permissionMode: ''|'acceptEdits'|'auto'|'plan'|'bypassPermissions'; namePattern: string /*'{project}-{n}'*/; confirmStopWorking: boolean /*true*/ }
ui.know:        + maxBudgetUsd?: number
```
`HydraPrefs = HydraFile['ui']` (tipo compartido). IPC: `prefs.get`, `prefs.set`, evento `prefs.changed`; `maint.info/redetectCli/openDataDir/exportHydraJson/importHydraJson/clearCards/clearAnalyticsCache/reindex/errors`; evento `ui.openConfig`. Módulos: `src/main/{maintenance.ts, error-log.ts}`, `src/shared/prefs.ts` (defaults + validadores por sección, reutilizados por el store), `src/renderer/src/store/prefs-slice.ts`, `src/renderer/src/components/config/**`.

## Trade-offs considered

- **IPC unificado (elegido) vs. seguir agregando `ui.getX/setX`.** Seis secciones × get/set sería ruido; un `prefs.set(section, patch)` validado por sección es más simple y el slice espejo evita N suscripciones. Los canales viejos se eliminan en el cierre (tests E2E existentes usan `know.getPrefs`, se adaptan).
- **Guardado instantáneo + barra para texto (elegido) vs. todo con "Guardar".** Discord-like y menos fricción; la barra evita guardar precios a medio tipear.
- **Acento por CSS vars (elegido) vs. temas completos.** Cambia `--accent/--accent-dim` y lo que ya los usa; los gráficos no (decisión de spec).
- **Import de `hydra.json` completo (elegido).** Es backup/restore; se valida con el mismo `validateHydraFile` y se hace `.bak`.
- **Error log en memoria (elegido) vs. archivo.** 50 entradas alcanzan para diagnóstico en sesión; persistir logs es otra feature.

## Risks

1. **Cambiar fuente/acento en vivo sobre xterm:** `term.options.fontSize` + `fit()` está soportado; verificar que no re-adjunta (E2E con pids).
2. **`--permission-mode bypassPermissions`:** peligroso; advertencia + confirmación (spec). No se pasa `--dangerously-skip-permissions`.
3. **Import de `hydra.json` mientras hay sesiones vivas:** el store se recarga, el watcher re-indexa proyectos (`refreshProjectIndex`), los panes siguen (las sesiones no dependen del archivo).
4. **Restart del MCP con el puerto tomado:** se revierte la pref y se informa (AC-7).
5. **Nombre de usuario por defecto:** `os.userInfo().username` puede ser feo ("juanfcastropiccolo"); se capitaliza y el usuario lo cambia en Perfil.

## Test plan

- **Unit:** validadores por sección (`src/shared/prefs.ts`) con valores válidos/inválidos/faltantes; `ProjectStore.setPrefs` persiste y rechaza; `ClaudeCli.spawnBackground` con flags (args exactos, sin flags cuando vacío); `suggestSessionName` con `namePattern`; `ErrorLog` (ring, orden, copia); `prefs-slice`; `accentVars(color)`; `deriveInitials`.
- **Integración:** `Maintenance.exportHydraJson/importHydraJson` en temp (válido, inválido, versión futura, `.bak`); `AppContext.restartMcp` en puertos efímeros (ok y tomado → revierte).
- **E2E (`e2e/09-config.spec.ts`):** abrir Config (ítem y ⌘,) → 6 categorías; toggle fichas automáticas → `prefs.get` lo refleja; Perfil: tipear → barra → Descartar/Guardar → avatar del sidebar cambia; Apariencia: fuente 16 → `.xterm` refleja el tamaño y los pids de PTY no cambian; Sesiones: modelo haiku + effort low → crear sesión → el fake CLI registra `--model haiku --effort low`; Mantenimiento: Borrar fichas con confirm → Graph Know 0 fichas; validación de puerto 80 e iniciales largas; volver a Sessions sin re-attach.
- **Manual (`docs/qa-007.md`):** look Discord (AC-2), acento en toda la app, exportar/importar real, cambio de puerto con MCP conectado (`claude mcp get`), `bypassPermissions` con advertencia.
