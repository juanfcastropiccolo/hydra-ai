# Plan: Árbol de archivos del proyecto

Feature ID: 002
Status: complete (2026-08-23)
Last updated: 2026-08-23

## Chosen stack

Sin dependencias nuevas de runtime. Todo se resuelve con lo que ya usa 001 más APIs de Node/Electron:

| Necesidad | Elección | Por qué |
|---|---|---|
| Listar directorios | `fs.promises.readdir(dir, { withFileTypes: true })` por nivel, bajo demanda | Lazy por diseño (FR-6/FR-17); sin librerías |
| Observar cambios | `fs.watch(root, { recursive: true })` (FSEvents en macOS, soportado por Node ≥ 20) + debounce/agrupado 300 ms | Cubre todo el árbol con un solo watcher; sin `chokidar` (Constitution: sin deps hasta que duela). Si FSEvents falla (p. ej. volúmenes de red), fallback a re-listar las carpetas expandidas cada 2 s |
| Estado git | `git status --porcelain=v1 -z --untracked-files=all --ignored=matching` vía `execFile`, parseado en una función pura; `git rev-parse --show-toplevel` para detectar repo/raíz | Un solo proceso por refresco; el parser se testea con fixtures; sin `simple-git`/`isomorphic-git` |
| Abrir / revelar / portapapeles / menú contextual | `shell.openPath`, `shell.showItemInFolder`, `clipboard`, `Menu.buildFromTemplate(...).popup()` de Electron (main) | Nativo, ya disponible |
| Abrir en editor | detectar `code` en PATH resuelto o `/Applications/Visual Studio Code.app`; si no, `$VISUAL`/`$EDITOR` (si es GUI) ; si no, `shell.openPath` | FR-14 |
| Atajo ⌘⇧E | Menú de aplicación de Electron (`Menu.setApplicationMenu`) con accelerator → evento IPC `ui.toggleFileTree` | Funciona aunque el foco esté dentro de xterm (que captura teclas); además la app gana un menú nativo mínimo (Hydra / Ver / Ventana) |
| Iconos | set propio: componente `FileIcon` con mapa `nombre/extensión → { glyph, color }` y SVGs inline pequeños (carpeta abierta/cerrada + ~20 tipos) | Decisión de spec: sin temas de terceros |
| Drag & drop | HTML5 DnD (`draggable`, `dataTransfer` con MIME propio `application/x-hydra-path`) → `onDrop` en `Pane` → `hydra.write(ptyId, quoted + ' ')` | Todo en renderer, reutiliza la escritura al PTY de 001 |
| Persistencia | `hydra.json → ui.fileTree: { open, width }` (campos opcionales, versión 1 sin migración) | Reutiliza `ProjectStore` |
| Estado del árbol | slice nuevo en el store zustand: `fileTree: { open, width, projectId, expandedByProject, selectedPath, filter, highlights }` + caché de nodos por ruta | Mismo patrón que 001; selectores de primitivas/estables |
| Tests | Vitest (unit + integración con fs/git reales en temp), Playwright (E2E con un proyecto de fixture en disco + `git init`) | Constitution |

## Ajuste 2026-08-23 (en implementación)

Por pedido de Juan el árbol **vive en la barra izquierda** como segunda vista (solapa saliente Sesiones/Archivos) en lugar de un panel derecho. Cambian: `Sidebar` (tabs + ancho variable + resizer), `FileTreePanel` (embebido, sin resizer/cierre propios), `App` (sin botón en la barra superior ni columna derecha). El resto del plan (servicios, IPC, store, DnD, menú) no cambia.

## Architecture overview

```
Renderer                                                     Main
┌────────────────────────────────────────────┐               ┌──────────────────────────────────────────┐
│ TopBar ── [Archivos] ──► store.fileTree.open│   IPC         │ FsService                                 │
│ <FileTreePanel projectId=…>                 │──fs.list────►│   list(dir) → entries (kind,size,symlink)  │
│   <TreeHeader> nombre · ruta · filtro · ⊟   │◄─fs.changed──│   watch(root): fs.watch recursive +        │
│   <TreeNode>* (virtualizado por filas)      │               │     debounce 300 ms → {root, dirs[]}       │
│     FileIcon · nombre · GitBadge · ●        │──git.status─►│ GitService                                 │
│     draggable → dataTransfer               │◄─git.changed─│   status(root) → Map<relPath,Status>       │
│ <Pane onDrop> → hydra.write(path + ' ')     │               │   parse porcelain (puro, con fixtures)     │
│ store.fileTree: open,width,projectId,       │──fs.open─────►│ FsActions: openPath / reveal / copy /      │
│   expandedByProject, selected, filter       │──fs.menu─────►│   openInEditor / contextMenu.popup()       │
└────────────────────────────────────────────┘               │ AppMenu: ⌘⇧E → ui.toggleFileTree           │
                                                             └──────────────────────────────────────────┘
```

**Flujos clave**

- **Abrir panel:** `store.toggleFileTree()` → persiste `ui.fileTree.open` → `<FileTreePanel>` monta → `projectId` = proyecto del pane con foco (`focusedSessionId` → `session.projectId`), si no el último (`lastFocusedProjectId` en store), si no el primero. Pide `fs.list(root)` (nivel 1) y `git.status(root)`; registra `fs.watch(root)` (main mantiene **un watcher por root abierto**, se libera al cerrar el panel o cambiar de proyecto).
- **Expandir carpeta:** `fs.list(dir)` bajo demanda → caché `nodesByPath[dir] = entries`. Expandidos por proyecto viven en `expandedByProject[projectId]: Set<relPath>`.
- **Cambio en disco:** main agrupa eventos 300 ms → `fs.changed {root, dirs: string[]}` (carpetas padre afectadas) → renderer re-lista **solo** las carpetas afectadas que estén expandidas (o sean la raíz) y marca `highlights` para entradas nuevas (2 s). Main también re-lanza `git status` (debounce 500 ms) → `git.changed {root, statuses}`.
- **Estado git por carpeta:** derivado en renderer: una carpeta tiene punto si algún `status` tiene prefijo `dir/`. Ignorados: las entradas `!!` (y sus hijos) se pintan atenuadas.
- **Seguir al foco:** `store.fileTree.projectId` se deriva de `focusedSessionId`; un `subscribe` actualiza `projectId` cuando cambia el proyecto del foco (no al perderlo), cumpliendo FR-2/FR-3.
- **DnD:** `TreeNode` pone `application/x-hydra-path = absPath` y `text/plain = relPath`. `Pane.onDrop` calcula ruta relativa al `cwd` de su sesión (pura: `relativeForShell(absPath, sessionCwd)` → relativa si está dentro, absoluta si no; comillas simples si hace falta) y hace `hydra.write(ptyId, text + ' ')` + `controller.focus()`.
- **Menú contextual:** `fs.contextMenu({path, root, isDir})` → main arma `Menu` nativo con las 4-5 acciones; "Abrir terminal acá" responde con `ui.openNewSession {projectId, cwd}` → renderer abre `NewSessionDialog` con `cwd` pre-cargado (el diálogo muestra esa carpeta; `sessions.create` acepta `cwd` opcional que debe estar dentro de un proyecto registrado).
- **Teclado/foco:** el árbol es `tabIndex=0` con manejo de ↑↓←→/Enter; al enfocarse, xterm pierde foco → `focusedSessionId=null` (001). `Esc` → `focusTerminalIn(último pane)`.
- **Layout:** `.main` pasa a `grid-template-columns: 1fr auto` con el panel como segunda columna, ancho por `store.fileTree.width`; el `ResizeObserver` de cada `XTermView` ya refita al cambiar el ancho (FR-19).

## Data model

Persistido (`hydra.json`, sin bump de versión; campos opcionales validados):
```ts
ui.fileTree?: { open: boolean; width: number }   // default { open: false, width: 300 }
```
Runtime (renderer):
```ts
interface FsEntry { name: string; kind: 'dir' | 'file' | 'symlink' | 'other'; symlinkTarget?: string; unreadable?: boolean }
type GitStatus = 'untracked' | 'modified' | 'deleted' | 'added' | 'renamed' | 'ignored' | 'conflict'
fileTree: {
  open: boolean; width: number
  projectId: string | null; lastFocusedProjectId: string | null
  nodes: Record<string /*absDir*/, FsEntry[]>
  expandedByProject: Record<string /*projectId*/, string[] /*absDir*/>
  selectedPath: string | null; filter: string
  git: { root: string | null; statuses: Record<string /*relPath*/, GitStatus> }
  highlights: Record<string /*absPath*/, number /*expiresAt*/>
  error: string | null
}
```
Contrato IPC nuevo (en `src/shared/ipc.ts`): `fs.list`, `fs.watch`/`fs.unwatch`, `fs.open`, `fs.reveal`, `fs.copyPath`, `fs.openInEditor`, `fs.contextMenu`, `git.status`, `ui.getFileTree`/`ui.setFileTree`; eventos `fs.changed`, `git.changed`, `ui.toggleFileTree`, `ui.openNewSession`. `sessions.create` gana `cwd?`.

## External dependencies

- `git` en PATH (viene con Xcode CLT / Homebrew). Si falta: árbol sin decoraciones, sin error (FR-8).
- `code` (VS Code CLI) opcional para "Abrir en editor".
- Ninguna librería npm nueva en runtime.

## Trade-offs considered

- **`fs.watch` recursivo vs. `chokidar`/`@parcel/watcher`.** Elegido `fs.watch`: en macOS usa FSEvents, un solo handle por raíz, cero deps. Rechazado chokidar: más robusto multiplataforma, pero no somos multiplataforma (Constitution) y agrega ~10 deps. Riesgo conocido: `fs.watch` recursivo no reporta el path exacto en algunos eventos → por eso re-listamos la carpeta padre, no el archivo.
- **`git status --porcelain` vía CLI vs. `isomorphic-git`.** CLI: exacto, respeta `.gitignore` global/excludes, submódulos; un proceso cada ~0,5 s como máximo. Rechazado isomorphic-git: pesado y difiere del comportamiento real de git.
- **Lista completa en memoria vs. lazy por nivel.** Lazy: cumple FR-17 sin virtualización compleja; el costo es que el filtro (FR-11) solo busca en carpetas ya listadas **más** un listado recursivo bajo demanda acotado (máx. 10 000 entradas, ignorando `node_modules`/`.git`/ignorados) cuando se escribe en el filtro. Documentado en la UI ("buscando en carpetas no ignoradas").
- **Virtualización de filas.** No en esta feature: con lazy por nivel, raramente hay > 2 000 filas visibles. Si un AC de rendimiento falla, se agrega virtualización simple (altura fija de fila, render de ventana) sin cambiar el contrato.
- **Menú contextual nativo (main) vs. HTML.** Nativo: look macOS, gratis. El costo es un round-trip IPC; irrelevante.
- **Atajo como menú de app vs. `keydown` en renderer.** Menú: funciona con el foco dentro de xterm, que se traga las teclas. Además deja la estructura para futuros atajos.
- **Iconos propios vs. Material Icon Theme.** Decidido en spec.

## Risks

1. **`fs.watch` recursivo en macOS:** eventos sin `filename` o duplicados; mitigación: siempre re-listar el directorio padre afectado y, si no hay filename, re-listar todas las carpetas expandidas (acotado por debounce). Test de integración lo cubre.
2. **`git status` lento en repos enormes** (monorepos): debounce 500 ms y nunca más de una ejecución en vuelo; si tarda > 3 s se muestra el árbol sin esperar el git.
3. **DnD y xterm:** xterm no debe capturar el `drop` antes que el Pane → el handler va en el contenedor del pane con `onDragOver preventDefault`; se verifica en E2E.
4. **Foco:** el árbol con `tabIndex` quita el foco a xterm correctamente, pero hay que asegurarse de que el borde verde no quede "pegado" (001 AC-5). E2E.
5. **Rutas con caracteres raros** en el shell: función `quoteForShell` con tests (espacios, `'`, `$`, acentos).
6. **"Abrir terminal acá" en una subcarpeta**: `sessions.create` con `cwd` fuera de cualquier proyecto → se rechaza con mensaje claro; dentro → la sesión se agrupa por prefijo más específico (ya existe en 001).
7. **Cambios masivos** (`npm install`): agrupado + re-list por carpeta; AC-5 ("en < 2 s tras el último cambio") se mide en integración con 2 000 archivos creados en ráfaga.

## Test plan

- **Unit (Vitest):** `parseGitPorcelain()` (fixtures: M/A/D/??/!!/R/UU, rutas con espacios, `-z`), `deriveFolderStatus()`, `relativeForShell()` + `quoteForShell()`, `iconFor(name, kind)` (tabla), `sortEntries()`, reducer del slice `fileTree` (expand por proyecto, follow-focus, filter, highlights expiran), `coalesceWatchEvents()`.
- **Integración (Vitest, fs/git reales en temp):** `FsService.list` sobre árbol de fixture (oculta `.git`, detecta symlink, no-legible); `FsService.watch` detecta creación/borrado/rename y agrupa ráfagas (2 000 archivos) en < 2 s; `GitService.status` sobre repo temp con M/U/D/ignored; `GitService` en carpeta sin git → vacío sin error.
- **E2E (Playwright):** fixture crea un proyecto temp con `git init`, archivos y un `.gitignore`; E2E-4: abrir panel con ⌘⇧E/botón, ver árbol, iconos y badges, carpetas primero, `.git` oculto; expandir carpeta lazy; crear un archivo desde el test (fs) → aparece resaltado < 2 s; filtro; E2E-5: DnD de un archivo a un pane → el PTY falso recibe `src/index.ts ` y el pane tiene foco; panel sigue al foco entre dos proyectos; Esc devuelve foco; abrir/cerrar 5 veces no re-adjunta (mismo `pid` en `e2e.ptyRecords`).
- **Manual (`docs/qa-002.md`):** doble clic abre app default, Revelar en Finder, Abrir en editor (VS Code), menú nativo, proyecto grande real (este repo con `node_modules`), atajo ⌘⇧E con el foco dentro de xterm.
