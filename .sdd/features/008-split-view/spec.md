# Split view — dos terminales lado a lado

Feature ID: 008
Status: specified (pedida por Juan 2026-09-03; implementada en la misma sesión)
Last updated: 2026-09-03

## Problem

Hydra muestra las sesiones en grilla (todas, chicas) o una sola expandida (grande). Para comparar dos sesiones que trabajan sobre lo mismo (A/B de un prompt, dos ramas, un agente y su revisor) hace falta verlas **a la vez y grandes**: hoy hay que ir alternando la expandida o leerlas en celdas de 420 px.

## Users

- **Juan:** quiere elegir dos sesiones y verlas lado a lado, cada una con toda la altura, y volver a la grilla con el mismo gesto de siempre (doble clic).

## Desired outcome

Con una sesión expandida pulso ◫ en su header, elijo otra sesión de la lista y las dos quedan una al lado de la otra ocupando todo el cuadro. Cada mitad conserva su header (nombre, renombrar, importar, ocultar, terminar). Doble clic en cualquiera, ⤡ o Esc me devuelven a la grilla.

## Functional requirements

1. **FR-1 — Entrada:** el header de la sesión expandida (en la topbar, ver 007/expanded) tiene un botón ◫ "Dividir" que abre un menú con las demás sesiones visibles (nombre y proyecto). Elegir una la muestra a la derecha.
2. **FR-2 — Layout:** las dos terminales comparten el área central al 50 % de ancho y 100 % de alto, sin tarjeta flotante; la topbar se divide en dos mitades con el header de cada terminal. Las demás sesiones siguen montadas pero invisibles (misma regla que el modo expandido: mismo árbol DOM, solo cambian clases).
3. **FR-3 — Salir:** doble clic sobre cualquiera de las dos terminales o sus headers, el botón ⤡ de cualquiera, o Esc sin terminal enfocada vuelven a la grilla. ◫ en el pane derecho lo quita del split (queda la izquierda expandida); ◫ en el izquierdo permite cambiar la sesión derecha.
4. **FR-4 — Foco:** en split se pinta el borde de foco (hay dos terminales); el foco sigue saliendo del `focus/blur` del textarea de xterm (Constitution 3).
5. **FR-5 — Invariantes:** ocultar o que desaparezca la sesión derecha deshace el split; ocultar o que desaparezca la izquierda promueve la derecha a expandida. Nunca la misma sesión en los dos lados. El split no se persiste (como el expandido).

## Acceptance criteria

- **AC-1:** Given tres sesiones visibles y `p2` expandida, When pulso ◫ y elijo `p3`, Then `pane-grid` tiene `data-split="true"`, `p2` y `p3` tienen ancho similar (> 1,3× la celda de grilla y < 0,7× el ancho expandido), la topbar muestra los dos nombres y las tres siguen en el DOM.
- **AC-2:** Given el split, When hago doble clic sobre `p3`, Then vuelve la grilla (`data-expanded="false"`, `data-split="false"`).
- **AC-3:** Given el split, When pulso ◫ en el header de `p3`, Then queda `p2` expandida sola.
- **AC-4:** Given el split, When oculto `p2` desde su header, Then `p3` queda expandida sola.
