# Plan: Split view

Feature ID: 008
Status: planned
Last updated: 2026-09-03

Sin dependencias nuevas. Reusa el portal del header a la topbar (introducido al embeber el modo expandido, commit `bd8cd7f`).

| Necesidad | Elección | Por qué |
|---|---|---|
| Estado | `app-store`: `splitSessionId` (lado B) junto a `expandedSessionId` (lado A); `setSplit(id \| null)`; `toggleExpand`, `collapse`, `escape`, `hide`, `setSessions` mantienen las invariantes de FR-5 | Misma disciplina que expandir; testeable sin React |
| Layout | `PaneGrid`: mismo DOM; clases `splitPaneA` (izquierda 50 %) / `splitPaneB` (derecha 50 %) / `hiddenPane`; `data-split` en `pane-grid` y en cada pane | No remontar xterm (Constitution) |
| Headers | `TopbarSlotContext` pasa `{ a, b }`; App renderiza dos slots (mitades) cuando hay split; `Pane` portala su header al slot de su rol | El dblclick sigue burbujeando al pane |
| Menú ◫ | Dropdown propio en el header (lista de sesiones visibles menos A/B, con proyecto); cierra al elegir o al hacer mousedown fuera | Sin librerías; `mousedown`/`dblclick` con `stopPropagation` para no enfocar/expandir |
| Foco | `.pane[data-split='true'].focused` conserva el borde; solo el expandido a solas lo suprime | FR-4 |
| Tests | Vitest del store (setSplit, toggleExpand en split, hide/setSessions promueven o limpian); Playwright en `03-expand` (AC-1..AC-4) | Constitution |
