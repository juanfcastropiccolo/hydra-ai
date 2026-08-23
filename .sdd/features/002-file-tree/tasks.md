# Tasks: Árbol de archivos del proyecto

Feature ID: 002
Status: tasked (aprobado 2026-08-23)
Last updated: 2026-08-23

Convenciones: un task ≈ un commit (Conventional Commits), tests en el mismo task que el código (unit primero en `shared`/`main`). Ningún task se marca `[x]` con tests rojos. Los AC de 001 (unit + E2E existentes) deben seguir verdes en cada task.

## Fase 1 — Contratos y lógica pura (shared/main)

- [x] **1.** Tipos + contrato IPC de 002 en `src/shared/` (`FsEntry`, `GitStatus`, `FileTreePrefs`; canales `fs.list/watch/unwatch/open/reveal/copyPath/openInEditor/contextMenu`, `git.status`, `ui.getFileTree/setFileTree`; eventos `fs.changed`, `git.changed`, `ui.toggleFileTree`, `ui.openNewSession`; `sessions.create` gana `cwd?`) — done when: compila en main y renderer; `HydraFile.ui.fileTree` opcional validado en `ProjectStore` con tests (default `{open:false,width:300}`, valores inválidos → default).
- [x] **2.** `src/shared/paths.ts`: `relativeForShell(absPath, baseDir)` (relativa si está dentro, absoluta si no; `.`/`..` normalizados) y `quoteForShell(s)` (comillas simples solo si hace falta; escapa `'`) — done when: unit tests con espacios, `'`, `$`, acentos, rutas fuera del proyecto, symlinks `/private/var` vs `/var` (realpath inyectable).
- [x] **3.** `src/main/git/porcelain.ts`: `parseGitPorcelain(buf)` para `--porcelain=v1 -z` (códigos `M/A/D/R/C/U/??/!!`, renombres con dos rutas, espacios, rutas de carpeta ignorada `dir/`) → `Record<relPath, GitStatus>`; `deriveFolderStatuses()` (punto por carpeta, ignorado heredado) — done when: unit tests con fixtures capturadas de un repo real (`test/fixtures/git-*.bin`).
- [ ] **4.** `src/main/fs/fs-service.ts`: `list(dir)` (oculta `.git`, `withFileTypes`, symlink con target, no-legible marcado, orden carpetas→archivos case-insensitive), `watch(root)`/`unwatch(root)` con `fs.watch` recursivo + `coalesceWatchEvents()` (300 ms, padres afectados, fallback "todo" si no hay filename), un watcher por root — done when: unit tests de `sortEntries` y `coalesceWatchEvents`; integración en temp: create/rename/delete detectados; ráfaga de 2 000 archivos → ≤ 3 eventos agrupados y consistente en < 2 s.
- [ ] **5.** `src/main/git/git-service.ts`: `root(dir)` (`rev-parse --show-toplevel`), `status(root)` (execFile con el env de `EnvResolver`, una ejecución en vuelo, debounce 500 ms, timeout 5 s → vacío) — done when: integración en repo temp con M/U/D/ignored devuelve el mapa esperado; carpeta sin git → `{root:null, statuses:{}}` sin error; `git` ausente (PATH vacío) → igual, sin lanzar.
- [ ] **6.** `src/main/fs/fs-actions.ts`: `openPath`, `revealInFinder`, `copyToClipboard`, `openInEditor` (detección `code` en PATH resuelto o `/Applications/Visual Studio Code.app`; luego `$VISUAL`/`$EDITOR` si es app GUI; luego `shell.openPath`) y `buildContextMenu({path, root, isDir})` como **template puro** (testeable) + `popup` en main — done when: unit tests del resolutor de editor con fs/env falsos y del template (ítems según archivo/carpeta); integración: `openPath` sobre un `.txt` temp no lanza.
- [ ] **7.** Menú de aplicación nativo (`Menu.setApplicationMenu`): Hydra / Ver (**Archivos ⌘⇧E** → evento `ui.toggleFileTree`) / Ventana; registrar IPC de 002 en `ipc.ts` (`fs.*`, `git.*`, `ui.*`); `sessions.create` acepta `cwd` dentro de un proyecto registrado (rechazo con mensaje si no); `AppContext.dispose` libera watchers — done when: probe CDP: `fs.list(repo)` devuelve entradas sin `.git`; `git.status(repo)` devuelve estados; ⌘⇧E dispara el evento (verificado vía `webContents.send` capturado).

## Fase 2 — Renderer

- [ ] **8.** Slice `fileTree` en el store (tipos del plan; acciones `toggleOpen/setWidth/setProjectFromFocus/expand/collapse/collapseAll/setNodes/applyFsChanged/setGit/select/setFilter/addHighlights/pruneHighlights`) — done when: unit tests: follow-focus solo cambia al pasar a otro proyecto; expandidos por proyecto independientes; `applyFsChanged` re-lista solo expandidas; highlights expiran; filtro no toca `expandedByProject`.
- [ ] **9.** `FileIcon` (set propio): mapa nombre/ext → `{glyph, color}` (+ carpeta abierta/cerrada, carpetas conocidas `src/test/docs/node_modules/.sdd/.git…`) — done when: unit test de `iconFor()` (tabla de ≥ 25 casos + genérico); storybook no; screenshot manual.
- [ ] **10.** `FileTreePanel` + `TreeHeader` (nombre, ruta, filtro ⌘F, Colapsar todo) + `TreeNode` (indentación, caret, icono, nombre, `GitBadge`, punto de carpeta, atenuado si ignorado, resaltado de nuevo, `draggable`, selección, `tabIndex` + teclado ↑↓←→ Enter Esc) — done when: con datos mock en dev se ve como VS Code; teclado y selección funcionan; Esc devuelve el foco al último pane (`focusTerminalIn`).
- [ ] **11.** Integración de datos: `fs.list` lazy al expandir, `fs.watch` del proyecto mostrado (y `unwatch` al cambiar/cerrar), `fs.changed` → re-list de expandidas + highlights 2 s, `git.status` + `git.changed`, `setProjectFromFocus` suscrito a `focusedSessionId`; filtro: busca en nodos cargados + `fs.listRecursive` acotado (10 k, salta ignorados/`node_modules`/`.git`) — done when: AC-2, AC-3, AC-4, AC-5, AC-10, AC-14 verificables a mano en dev contra este repo (`hydra-ai` con `node_modules`).
- [ ] **12.** Layout: botón **Archivos** en la barra superior (estado activo), área central `1fr auto`, panel redimensionable por borde (min 200, persiste `width`), `ui.toggleFileTree` (⌘⇧E) → toggle, modo expandido convive con el panel — done when: AC-1, FR-4 y AC-12 a mano (abrir/cerrar ×5: mismo `ptyId`, terminales refitadas; tipeo solo al pane con foco).
- [ ] **13.** Acciones: doble clic/Enter → `fs.open`; clic derecho → `fs.contextMenu`; `ui.openNewSession {projectId, cwd}` → `NewSessionDialog` con carpeta pre-cargada (muestra la subcarpeta) → `sessions.create({cwd})` — done when: AC-6, AC-7, AC-8 a mano.
- [ ] **14.** Drag & drop: `TreeNode` → `dataTransfer` (`application/x-hydra-path`, `text/plain`); `Pane` acepta `onDragOver/onDrop` (sin que xterm lo capture) → `relativeForShell` + `quoteForShell` + `hydra.write(ptyId, text + ' ')` + foco; feedback visual de "soltar acá" — done when: AC-9 a mano con dos proyectos; arrastrar sobre sidebar/fondo no hace nada.

## Fase 3 — Tests y cierre

- [ ] **15.** E2E fixture: proyecto temp con `git init`, `src/index.ts` (modificado), `nuevo.ts` (untracked), `.gitignore` con `dist/`, `dist/x.js`, `README.md`; E2E-4 (`e2e/04-file-tree.spec.ts`): abrir por botón y ⌘⇧E, encabezado con nombre/ruta, carpetas primero, `.git` oculto, iconos por tipo, badges `M`/`U`, `dist` atenuado, expandir lazy (`src`), crear archivo desde el test → aparece resaltado < 2 s, filtro, Colapsar todo, teclado + Esc devuelve foco (AC-1/3/4/5/10/11/13 parcial) — done when: verde.
- [ ] **16.** E2E-5 (`e2e/05-file-tree-dnd.spec.ts`): dos proyectos, panel sigue al foco (AC-2); DnD de `src/index.ts` al pane del mismo proyecto → PTY falso recibe `src/index.ts ` y foco; al pane del otro → ruta absoluta; abrir/cerrar panel ×5 → mismo pid de PTY, tipeo solo al pane con foco (AC-9, AC-12) — done when: verde.
- [ ] **17.** QA manual `docs/qa-002.md` (AC-6/7/8, ⌘⇧E con foco en xterm, repo grande real con `node_modules`, Revelar en Finder, VS Code) + empaquetar `Hydra.app` 0.2.0 — done when: checklist completo por Juan; fallos → tasks de fix.
- [ ] **18.** Cierre: README (sección "Árbol de archivos"), CLAUDE.md (módulos nuevos y reglas: un watcher por root, git CLI), `status.json` → `complete`, `.sdd/README.md`, tag `v0.2.0` — done when: hecho y pusheado.

## Traceability

| Task | FR | AC |
|------|----|----|
| 1 | FR-1 (persistencia), FR-14 (cwd) | AC-1 |
| 2 | FR-15 | AC-9 |
| 3 | FR-8 | AC-4 |
| 4 | FR-6, FR-9, FR-17, FR-18 | AC-3, AC-5, AC-13, AC-14 |
| 5 | FR-8 | AC-4, AC-14 |
| 6 | FR-13, FR-14 | AC-6, AC-7 |
| 7 | FR-1 (⌘⇧E), FR-14 | AC-1, AC-8 |
| 8 | FR-2, FR-3, FR-9, FR-10, FR-11 | AC-2, AC-5, AC-10 |
| 9 | FR-7 | AC-3 |
| 10 | FR-6, FR-7, FR-8, FR-10, FR-11, FR-12, FR-16 | AC-3, AC-4, AC-10, AC-11 |
| 11 | FR-2, FR-3, FR-5, FR-8, FR-9, FR-18 | AC-2, AC-4, AC-5, AC-14 |
| 12 | FR-1, FR-4, FR-19 | AC-1, AC-12 |
| 13 | FR-13, FR-14 | AC-6, AC-7, AC-8 |
| 14 | FR-15 | AC-9 |
| 15-16 | — | AC-1/2/3/4/5/9/10/11/12/13 (automatizados) |
| 17 | — | AC-6/7/8 + manuales |
| 18 | — | — |
