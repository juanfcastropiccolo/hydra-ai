# Plan: Importar contexto de otra sesión

Feature ID: 004
Status: complete (2026-08-23)
Last updated: 2026-08-23
Base empírica: `docs/spike-004-context.md` (GO).

## Chosen stack

Sin dependencias nuevas. Todo sobre lo que ya existe (001/002) + dos flags del CLI verificados en el spike:

| Necesidad | Elección | Por qué |
|---|---|---|
| Generar el resumen | `claude -p --resume <sessionId> --fork-session --no-session-persistence --model <pref> --output-format json "<prompt de traspaso>"` ejecutado con `cwd` = cwd de la sesión origen, desde `ClaudeCli` (main) | Verificado: lee toda la conversación, no modifica la origen, no deja transcript ni sesión fantasma, funciona con la origen viva y adjunta; usa la auth/modelos del usuario (Constitution 1, "no reimplementar"). 8–14 s con haiku en conversaciones cortas |
| Cancelación / tope | `execFile` con `signal` (AbortController) + `timeout: 90_000`; el `Runner` inyectable gana `signal?` | FR-8; matar el hijo libera el modelo y el costo |
| Lista de orígenes | el `Session[]` que el renderer ya tiene en el store (SessionWatcher), filtrando la destino y las que no tengan `sessionId` | FR-2/FR-3/FR-4; ninguna fuente nueva |
| Pegar en la destino | `hydra.write(ptyId, ESC[200~ + texto + ESC[201~)` **sin** `\r` (bracketed paste) desde el renderer, reutilizando el camino de 002 FR-15 | Verificado: llega como un único mensaje multilínea; Claude Code lo muestra como pegado; el usuario edita/envía (FR-10) |
| Guarda "destino idle" | `session.state === 'idle'` del store al habilitar el botón y **otra vez** justo antes de escribir | FR-1/FR-12, Constitution 3 |
| Preferencia de modelo | `hydra.json → ui.importContext: { model: string }` (default `'haiku'`), IPC `ui.getImportContext/setImportContext` | FR-7; 007 Config le pone UI |
| Progreso / avisos / diálogo | componentes React propios: `ImportContextDialog` (mismo patrón que `NewSessionDialog`), overlay de progreso y aviso en `Pane` (estilo del toast de 002) | FR-8/13/14 |
| Tests | Vitest unit (funciones puras + wrappers con runner falso), Vitest integración contra `claude` real (marcada, costo ≈ US$0.05), Playwright E2E con `FakeClaudeCli.summarizeSession` | Constitution |

## Architecture overview

```
Renderer                                                        Main
┌──────────────────────────────────────────────┐                ┌───────────────────────────────────────────┐
│ Pane (destino, idle) ── [⇩ Importar] ────────┼─► store.openImportDialog(targetId)                         │
│ <ImportContextDialog>                        │                │                                           │
│   sessions (store) − destino, agrupadas,     │                │                                           │
│   filtro, "modelo: haiku" ◄──────────────────┼─ui.getImportContext                                        │
│   Enter/dblclick → store.startImport(t, s)   │──context.summarize {importId, sourceSessionId}──►          │
│ store.importContext[t] = {running, source}   │                │ ContextImporter                           │
│   Pane muestra overlay "Resumiendo X…" [✕]   │──context.cancel {importId}──►   abort()                    │
│                                              │                │   ├ watcher.get(source) → cwd, name        │
│                                              │                │   ├ prefs.model                            │
│                                              │                │   ├ buildHandoffPrompt()                   │
│                                              │                │   ├ cli.summarizeSession({...signal})      │
│                                              │                │   │   └ claude -p --resume --fork-session  │
│                                              │                │   │     --no-session-persistence --model   │
│                                              │                │   │     --output-format json  (cwd=src)    │
│                                              │                │   ├ parsePrintJson() · trimSummary()       │
│                                              │◄── {text, truncated, model} ──┤ buildImportBlock()          │
│ store.importContext[t] = {ready, text}       │                └───────────────────────────────────────────┘
│   Pane effect: if session.idle && ptyId →    │
│     hydra.write(ptyId, BP(text)); focus;     │
│     toast verde; state=done                  │
│   else → aviso "Copiar | Reintentar pegado"  │
│   error → aviso rojo "Reintentar"            │
└──────────────────────────────────────────────┘
```

**Flujos clave**

- **Habilitar el botón** (FR-1): `canImportInto(session, pane)` puro: `state === 'idle' && !ended && ptyId && !importRunning`. Tooltip con la causa cuando está deshabilitado.
- **Diálogo** (FR-2/3): `ImportContextDialog` lee `sessions` del store, excluye `targetSessionId`, excluye las que no tengan `sessionId` (no se puede `--resume`), agrupa por proyecto (nombre del proyecto o "fuera de proyectos"), filtro por nombre/proyecto, muestra semáforo + "externa". Pide `ui.getImportContext` al abrir para mostrar el modelo. `Esc` cancela, `Enter`/doble clic confirma.
- **Generación** (FR-5/6/7/8): `store.startImport(target, source)` genera `importId` (`crypto.randomUUID()`), marca `importContext[target] = {phase:'running', importId, sourceName}` y hace `hydra.invoke('context.summarize', {importId, sourceSessionId})`. En main, `ContextImporter.summarize()`:
  1. `watcher.get(sourceSessionId)` → si no existe → error "la sesión ya no existe"; toma `cwd` y `name`.
  2. `prompt = buildHandoffPrompt()` (texto fijo en español que pide el resumen **en el idioma predominante de la conversación**, con secciones: objetivo, decisiones y porqué, datos y nombres clave, estado actual, pendientes; "solo texto, sin herramientas").
  3. `cli.summarizeSession({ sessionId, cwd, model, prompt, signal })` → corre el comando; `parsePrintJson(stdout)` valida `{ is_error:false, result: string no vacío }`; errores del CLI (`exit != 0`, `is_error`, JSON inválido, `result` vacío) → `ClaudeCliError` con mensaje legible (incluye stderr recortado; si menciona el modelo, el mensaje dice "revisá la preferencia `ui.importContext.model`").
  4. `trimSummary(text, 8000)`: si excede, conserva encabezado + secciones prioritarias (objetivo, decisiones, estado, pendientes) y agrega "[…resumen recortado por Hydra…]".
  5. `buildImportBlock({ sourceName, projectName, text, truncated })` → introducción fija en primera persona + `<imported-context session="…" project="…">…</imported-context>`.
  6. Devuelve `{ text, truncated, model, durationMs }`. La cancelación (`context.cancel`) aborta el `AbortController` del `importId`; el runner rechaza con `AbortError` → el invoke rechaza con `cancelled: true`.
- **Pegado** (FR-10/11/12/13): al resolver, el store pone `phase:'ready', text`. Un `useEffect` en `Pane` observa `[importState, session.state, ptyId]`: si `ready` y `session.state === 'idle'` y hay `ptyId` → `hydra.write(ptyId, '\x1b[200~' + text + '\x1b[201~')`, `controller.focus()`, toast verde, `phase:'done'` (se limpia a los 2,5 s). Si no está idle → `phase:'blocked'` y el pane muestra un aviso persistente con **Copiar** (`navigator.clipboard.writeText`) y **Reintentar pegado** (vuelve a evaluar la guarda). El estado vive en el store (no en el componente) para sobrevivir a ocultar/mostrar el pane (edge case) y para que solo haya una importación por destino.
- **Errores/cancelar** (FR-14/AC-7): `phase:'error', message` → aviso rojo con **Reintentar** (vuelve a `startImport` con la misma origen) y cerrar. Cancelar desde el overlay → `context.cancel` + `phase` se borra.
- **Idioma**: lo decide el prompt ("en el idioma predominante de la conversación"); Hydra no detecta idioma.

## Data model

Persistido (`hydra.json`, sin bump de versión; campo opcional validado en `ProjectStore.normalize`):
```ts
ui.importContext?: { model: string }        // default { model: 'haiku' }; string no vacío, se pasa tal cual a --model
```
Runtime (renderer, slice `importContext` del store zustand):
```ts
type ImportPhase = 'running' | 'ready' | 'blocked' | 'done' | 'error'
interface ImportState {
  importId: string; sourceSessionId: string; sourceName: string
  phase: ImportPhase; text?: string; truncated?: boolean; model?: string; error?: string
}
importContext: { dialogTargetId: string | null; byTarget: Record<string /*targetSessionId*/, ImportState> }
```
Contrato IPC nuevo (`src/shared/ipc.ts`):
```ts
'context.summarize': { args: [{ importId: string; sourceSessionId: string }];
                       result: { text: string; truncated: boolean; model: string; durationMs: number } }
'context.cancel':    { args: [{ importId: string }]; result: void }
'ui.getImportContext': { args: []; result: ImportContextPrefs }
'ui.setImportContext': { args: [Partial<ImportContextPrefs>]; result: ImportContextPrefs }
```
`ClaudeCliLike` gana `summarizeSession(opts: { sessionId; cwd; model; prompt; signal?: AbortSignal; timeoutMs? }): Promise<{ text: string; raw: PrintJsonResult }>`; `Runner` gana `signal?` en sus opts (execFile lo soporta nativamente). `FakeClaudeCli` (E2E) lo implementa con un texto fijo y un retardo configurable (`HYDRA_E2E_SUMMARY_DELAY_MS`) y respeta `signal`.

Módulos nuevos: `src/main/context/context-importer.ts` (+ `handoff-prompt.ts`, `import-block.ts`, `print-json.ts` con funciones puras y fixtures en `src/main/context/fixtures/`), `src/renderer/src/store/import-context-slice.ts`, `src/renderer/src/components/ImportContextDialog.tsx` (+ css), cambios en `Pane.tsx`, `hydra-client.ts`, `ipc.ts`, `types.ts`, `project-store.ts`, `app-context.ts`, `ipc.ts` (main), `fakes.ts`.

## External dependencies

- `claude` ≥ 2.1.241 con `-p`, `--resume`, `--fork-session`, `--no-session-persistence`, `--output-format json` (verificados). Ninguna librería npm nueva.
- Acceso al modelo configurado con las credenciales del usuario (lo resuelve el CLI).

## Trade-offs considered

- **Fork `-p` (elegido) vs. leer el `isCompactSummary` del `.jsonl`.** El atajo es gratis cuando existe, pero en 79 transcripts reales no existía nunca, obligaría a parsear formato interno y a ampliar la Constitution ("transcripts solo para analíticas"). Se descarta en 004; si 005 (analytics) termina parseando transcripts, se puede añadir como optimización sin cambiar la UI. Consecuencia: **no se toca la Constitution.**
- **Pegar desde el renderer (elegido) vs. que main escriba al PTY.** El renderer ya tiene `ptyId`, el estado de la sesión y el controlador de foco; la guarda "idle" se evalúa en el mismo lugar donde se escribe, sin carrera entre procesos. Main solo produce texto.
- **Bracketed paste (elegido) vs. escribir línea por línea / reemplazar saltos de línea.** Es lo que hace un pegado real; Claude Code lo soporta (spike). Riesgo: si el modo 2004 no está activo, cada `\n` enviaría; mitigación: test de integración con CLI real + la guarda de que el texto nunca incluye `\r`.
- **Estado de importación en el store (elegido) vs. local al `Pane`.** Sobrevive a ocultar/mostrar y a re-renders; impone "una importación por destino" de forma natural.
- **Prompt de traspaso fijo en main (elegido) vs. configurable.** Una sola fuente de verdad testeable; la intro también es fija (decisión de spec). Si hace falta, 007.
- **`--max-budget-usd`** (existe para `-p`): no se usa en 004 para no introducir otra preferencia; queda anotado para 007 junto con el modelo.
- **Detección de idioma en Hydra:** no; lo pide el prompt.

## Risks

1. **Los flags de `-p` no son contrato estable.** Mitigación: todo en `ClaudeCli` con fixtures + un test de integración contra el binario real que falla ruidosamente si cambia la salida; el usuario ve FR-14, nunca un pegado corrupto.
2. **Conversaciones enormes** → lento/caro. Mitigación: haiku por defecto, tope 90 s con cancelación, indicador de progreso; el diálogo no estima tamaño (no se lee el transcript).
3. **Hooks globales del usuario** (`SessionStart`, `Stop`) se disparan en el fork `-p`. Aceptado: son del usuario y corren como en cualquier `-p`; los hooks de Hydra no, porque solo se inyectan por `--settings` a las sesiones `--bg`.
4. **`--resume` exige el `cwd` correcto.** Se usa el `cwd` de `agents --json`; si la carpeta ya no existe → error claro.
5. **Sesiones externas sin `sessionId`** en `agents --json`: se excluyen del diálogo (con nota "sin acceso a la conversación" si hace falta mostrarlas).
6. **Carrera destino→working durante el pegado:** la guarda se evalúa inmediatamente antes del `write`; si cambia después, el texto ya está en el prompt (queda en cola de Claude Code, que es el comportamiento de un pegado manual). Aceptado.
7. **Auth OAuth desde la `.app`:** `--bg` ya funciona desde el Finder con el env resuelto; `-p` usa la misma resolución. Se verifica en QA manual con la `.app` empaquetada.

## Test plan

- **Unit (Vitest):** `buildHandoffPrompt()` (contiene secciones e instrucción de idioma), `buildImportBlock()` (intro en primera persona con nombre/proyecto, bloque delimitado, sin `\r`), `trimSummary()` (no recorta bajo el tope; recorta conservando secciones prioritarias y marca), `parsePrintJson()` (fixtures: ok, `is_error`, JSON inválido, `result` vacío, stdout con ruido antes del JSON), `ClaudeCli.summarizeSession()` con runner espía (args exactos, `cwd`, `signal`, error legible), `ContextImporter` con CLI falso (origen inexistente, cancelación, recorte), `ProjectStore` (default/validación de `ui.importContext`), slice `importContext` (una importación por destino, transiciones running→ready→done/blocked/error), `canImportInto()`.
- **Integración (Vitest, `claude` real, marcada `integration`):** (a) `summarizeSession` sobre una sesión `-p --session-id` creada por el test con un dato plantado → el resumen lo contiene, **no aparece ningún `.jsonl` nuevo** en el directorio del proyecto y el de la origen no cambia de tamaño; (b) cancelación a los 500 ms → rechaza con abort en < 2 s y el proceso hijo no queda vivo; (c) bracketed paste: sesión `--bg` + `attach` en PTY real, escribir `ESC[200~texto multilínea ESC[201~` sin `\r` → el transcript **no** tiene mensaje de usuario nuevo; luego `\r` → aparece como un único mensaje íntegro (réplica del spike; limpia con stop/rm).
- **E2E (Playwright, fakes):** E2E-6: dos sesiones A y B; en B el botón está habilitado (idle) y en una sesión `working` (vía `e2e.setStatus`) deshabilitado con tooltip; abrir diálogo desde B → lista A (no B), agrupada, con filtro y "modelo: haiku"; confirmar → overlay de progreso con cancelar; al resolver, `e2e.ptyRecords` de B contiene **una** escritura que empieza con `ESC[200~`, contiene la intro y el resumen falso, termina con `ESC[201~` y **no** contiene `\r`; toast verde; B tiene foco. E2E-7: con `HYDRA_E2E_SUMMARY_DELAY_MS` alto, cambiar B a `working` durante la espera → no se escribe; aparece el aviso con Copiar/Reintentar; volver a idle + Reintentar → se escribe. E2E-8: cancelar → sin escritura, botón habilitado.
- **Manual (`docs/qa-004.md`):** flujo real entre dos sesiones de este repo (AC-1/2 con recall), desde la `.app` empaquetada (riesgo 7), sesión origen larga (tiempo/costo observados), editar el texto en el prompt antes de Enter (AC-5), modelo inválido en `hydra.json` (AC-6/8).
