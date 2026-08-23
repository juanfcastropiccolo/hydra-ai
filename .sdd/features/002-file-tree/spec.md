# Árbol de archivos del proyecto

Feature ID: 002
Status: specified (aprobada 2026-08-23)
Last updated: 2026-08-23

## Problem

Cuando Claude Code trabaja en un proyecto crea, modifica y borra archivos, y hoy la única forma de ver qué pasó es leer el scroll de la terminal o ir a Finder/VS Code. Falta, dentro de Hydra, una vista del árbol de archivos del proyecto que se actualice sola, muestre qué cambió, y permita abrir o referenciar un archivo sin salir de la app.

## Users

- **Juan (y cualquier dev Mac con Hydra):** mientras una o varias sesiones trabajan, quiere mirar de reojo el árbol del proyecto, ver qué archivos están apareciendo/cambiando, abrir uno con la app que corresponda, y arrastrar un archivo a una terminal para decirle a Claude "mirá este".

## Desired outcome

Tengo un pane con foco. Aprieto el botón "Archivos" de la barra superior (o su atajo) y a la derecha de la grilla se despliega un panel con el árbol del proyecto de ese pane, tal como lo vería en un editor: carpetas plegables, iconos por tipo de archivo, y los archivos modificados/nuevos/borrados con su color de estado git y un punto en las carpetas que los contienen. Mientras Claude crea archivos, el árbol se actualiza solo. Hago doble clic en un archivo y se abre con su app por defecto; clic derecho me da Revelar en Finder, copiar ruta, abrir en mi editor. Arrastro un archivo al pane de otra sesión y su ruta relativa aparece escrita en el prompt de esa sesión. Cambio el foco a un pane de otro proyecto y el árbol cambia de proyecto. Cierro el panel y la grilla recupera el ancho.

## Functional requirements

### Panel

1. **FR-1:** Existe un botón **"Archivos"** en la barra superior del área central y un atajo de teclado (⌘⇧E, como en editores) que **abre/cierra** un panel lateral a la derecha de la grilla. El estado abierto/cerrado persiste entre aperturas de la app.
2. **FR-2:** El panel muestra el árbol del **proyecto del pane con foco**. Si ningún pane tiene foco, muestra el del **último pane que lo tuvo**; si nunca hubo foco, el del primer proyecto del sidebar. El encabezado del panel muestra el nombre y la ruta del proyecto que está mostrando.
3. **FR-3:** Al cambiar el foco a un pane de **otro proyecto**, el panel cambia de árbol en menos de 1 segundo, conservando el estado de carpetas expandidas de cada proyecto por separado durante la sesión de la app.
4. **FR-4:** El panel es **redimensionable** arrastrando su borde (ancho mínimo 200 px; el ancho persiste). Con el panel abierto y un pane expandido, el pane expandido ocupa el área central restante (el panel sigue visible).
5. **FR-5:** Si el proyecto está marcado como carpeta inexistente, el panel lo indica y no intenta listar.

### Árbol

6. **FR-6:** El árbol lista **todo el contenido** del proyecto, como lo haría un editor de código: carpetas primero (orden alfabético, insensible a mayúsculas), luego archivos; archivos y carpetas ocultos (que empiezan con `.`) se muestran; **solo se oculta la carpeta `.git`**. Carpetas muy grandes (p. ej. `node_modules`) se muestran plegadas y sus hijos se cargan **al expandirlas**, nunca antes.
7. **FR-7:** Cada entrada muestra un **icono según su tipo**: carpeta abierta/cerrada (con variantes reconocibles para carpetas conocidas como `src`, `test`, `docs`, `node_modules`, `.sdd`), y para archivos un icono por extensión/nombre conocido (TypeScript, JavaScript, JSON, Markdown, CSS, HTML, imágenes, YAML, shell, Python, Rust, Go, lock files, `package.json`, `README`, `.gitignore`, etc.) con un icono genérico para el resto.
8. **FR-8 — Estado git:** si el proyecto es un repositorio git, cada archivo se decora con su estado: **nuevo/sin seguimiento** (verde, sufijo `U`), **modificado** (amarillo/naranja, `M`), **borrado** (rojo tachado, `D`), **ignorado por `.gitignore`** (texto atenuado). Una carpeta que contiene cambios muestra un **punto de color** al lado de su nombre. Si el proyecto no es un repo git, el árbol se muestra sin decoraciones y sin error.
9. **FR-9 — Actualización en vivo:** los cambios en disco (crear, renombrar, borrar, modificar) hechos por Claude, por el usuario o por cualquier proceso se reflejan en el árbol en **menos de 2 segundos**, sin perder las carpetas expandidas ni la posición de scroll. El estado git se refresca con la misma cadencia.
10. **FR-10:** Un archivo o carpeta **nuevo** que aparece mientras el panel está abierto se **resalta brevemente** (≈2 s) para que se note dónde apareció.
11. **FR-11:** Hay un **filtro rápido** (campo de texto arriba del árbol, atajo ⌘F con el panel enfocado) que filtra entradas por nombre en todo el árbol, mostrando las rutas que coinciden con sus carpetas padre expandidas. Vaciarlo restaura el árbol.
12. **FR-12:** Un botón **"Colapsar todo"** y otro **"Revelar"** (expande hasta un archivo dado su ruta; lo usa FR-10 y el futuro) en el encabezado del panel.

### Acciones sobre archivos

13. **FR-13:** **Doble clic** (o `Enter` con la entrada seleccionada) en un archivo lo abre con la **aplicación por defecto** de macOS. En una carpeta, expande/colapsa.
14. **FR-14 — Menú contextual** (clic derecho) sobre archivo o carpeta: **Revelar en Finder**, **Copiar ruta absoluta**, **Copiar ruta relativa al proyecto**, **Abrir en editor** (VS Code si está instalado, si no `$EDITOR`/`$VISUAL`, si no la app por defecto), **Abrir terminal acá** (solo carpetas: nueva sesión de Claude Code en esa carpeta, pasando por el diálogo de nueva sesión con la carpeta pre-cargada — reutiliza 001 FR-5).
15. **FR-15 — Arrastrar a una terminal:** arrastrar un archivo o carpeta del árbol y soltarlo sobre un pane **escribe en esa sesión la ruta relativa al proyecto de la sesión** (entre comillas si contiene espacios), seguida de un espacio, sin enviar Enter. Si el archivo está fuera del proyecto de la sesión destino, escribe la ruta absoluta. El pane destino recibe el foco. Arrastrar sobre cualquier otra zona no hace nada.
16. **FR-16:** Navegación por teclado dentro del árbol: ↑/↓ mueven la selección, →/← expanden/colapsan, `Enter` abre, `Esc` devuelve el foco al pane que lo tenía.

### Robustez y rendimiento

17. **FR-17:** Proyectos grandes (decenas de miles de archivos) no bloquean la interfaz: el árbol se lista por niveles, bajo demanda; el primer nivel aparece en menos de 500 ms para un proyecto típico.
18. **FR-18:** Si la carpeta del proyecto se vuelve ilegible o desaparece mientras el panel está abierto, el panel muestra un aviso claro y se recupera solo cuando vuelve a estar disponible.
19. **FR-19:** El panel no altera ninguna garantía de la feature 001: el foco de teclado de las terminales sigue siendo exclusivo (interactuar con el árbol quita el foco a las terminales; `Esc` lo devuelve), y ocultar/mostrar el panel no re-adjunta ni redimensiona incorrectamente las terminales (se refitan al nuevo ancho).

## Non-goals

- **Vista previa / editor de archivos dentro de Hydra.** Solo abrir con apps externas.
- **Operaciones de archivos** (crear, renombrar, borrar, mover desde el árbol). Quizá en una feature posterior.
- **Árbol de múltiples proyectos a la vez** o vista de "workspace multi-raíz".
- **Búsqueda de contenido** dentro de archivos (solo filtro por nombre).
- **Acciones git** (stage, commit, diff). Solo decoraciones de estado.
- **Sincronizar selección del árbol con lo que Claude está editando** en tiempo real (es parte de lo que podría hacer 005 Graph Know).

## Edge cases

- **Proyecto sin git:** árbol normal, sin decoraciones ni punto en carpetas.
- **Submódulos / repos anidados:** se decoran según el repo más cercano a cada archivo; si no se puede determinar, sin decoración. No se entra a explorar `.git` nunca.
- **Enlaces simbólicos:** se muestran con un indicador; si apuntan fuera del proyecto o forman ciclos, no se siguen.
- **Archivos sin permiso de lectura:** aparecen atenuados; abrirlos muestra el error del sistema.
- **Miles de cambios a la vez** (p. ej. `npm install`): las actualizaciones se agrupan para no repintar miles de veces; el árbol queda consistente en < 2 s después del último cambio.
- **Arrastrar a un pane oculto o finalizado:** no hay destino válido; no pasa nada.
- **Nombre con caracteres especiales/espacios/acentos:** la ruta pegada va entre comillas simples si hace falta, de forma que funcione en un shell.
- **Cambio de foco durante el arrastre:** el destino es el pane donde se suelta, no el que tenía foco.
- **Panel abierto al cerrar la app con un proyecto que luego se quita:** al reabrir, muestra el primer proyecto disponible o el estado vacío.

## Acceptance criteria

- **AC-1 (abrir/cerrar):** Given un pane con foco del proyecto "foo", when pulso "Archivos" (o ⌘⇧E), then aparece a la derecha un panel con encabezado "foo" y su ruta y el árbol del primer nivel en < 500 ms; when lo vuelvo a pulsar, then se cierra y las terminales recuperan el ancho sin artefactos; when reinicio Hydra, then el panel conserva su estado abierto/cerrado y ancho.
- **AC-2 (sigue al foco):** Given panel abierto mostrando "foo", when hago clic en un pane del proyecto "bar", then el árbol cambia a "bar" en < 1 s; when vuelvo a "foo", then las carpetas que había expandido en "foo" siguen expandidas.
- **AC-3 (contenido completo e iconos):** Given un proyecto con `.gitignore`, `node_modules/`, `src/index.ts`, `README.md`, `.sdd/`, when abro el panel, then veo todas esas entradas (no veo `.git`), carpetas antes que archivos, `node_modules` plegado, y cada entrada con un icono acorde (TS, Markdown, carpeta `src`, etc.).
- **AC-4 (estado git):** Given un repo con `a.ts` modificado, `nuevo.ts` sin seguimiento y `viejo.ts` borrado, when abro el panel, then `a.ts` aparece con color/marca de modificado, `nuevo.ts` de nuevo, `viejo.ts` de borrado (tachado), y la carpeta que los contiene tiene un punto de color; when hago commit desde fuera, then en < 2 s las marcas desaparecen.
- **AC-5 (en vivo):** Given el panel abierto, when una sesión de Claude crea `src/nuevo/archivo.ts`, then en < 2 s aparece `src/nuevo/` y dentro `archivo.ts`, resaltados brevemente, sin que se colapsen las carpetas que yo tenía abiertas ni se mueva el scroll.
- **AC-6 (abrir):** Given un archivo `.md` en el árbol, when hago doble clic (o Enter), then se abre con la aplicación por defecto de macOS.
- **AC-7 (menú contextual):** Given un archivo, when clic derecho → "Copiar ruta relativa", then el portapapeles contiene `src/index.ts`; when "Revelar en Finder", then Finder lo muestra seleccionado; when "Abrir en editor" y VS Code está instalado, then se abre en VS Code.
- **AC-8 (terminal acá):** Given una carpeta `packages/api`, when clic derecho → "Abrir terminal acá", then se abre el diálogo de nueva sesión con esa carpeta pre-cargada y, al crear, el pane corre en esa carpeta (aparece bajo el proyecto correspondiente en el sidebar).
- **AC-9 (arrastrar):** Given dos panes A (proyecto foo) y B (proyecto bar) y el árbol de foo abierto, when arrastro `src/index.ts` y lo suelto sobre A, then en la terminal de A aparece escrito `src/index.ts ` (sin Enter) y A tiene el foco; when lo suelto sobre B, then aparece la ruta absoluta entre comillas si hace falta.
- **AC-10 (filtro):** Given un árbol con 500 archivos, when escribo `store` en el filtro, then solo veo las entradas cuyo nombre contiene "store" con sus carpetas padre; when lo vacío, then vuelve el árbol completo con el estado de expansión anterior.
- **AC-11 (teclado):** Given el árbol enfocado, when uso ↑/↓/→/←/Enter, then la selección y expansión responden y Enter abre; when pulso Esc, then el foco vuelve al pane que lo tenía y su borde verde reaparece.
- **AC-12 (no rompe 001):** Given el panel abierto, when tipeo en un pane con foco, then las teclas van solo a ese pane; when abro/cierro el panel 5 veces, then ninguna terminal se re-adjunta (mismo contenido, sin banner nuevo) y todas se ven completas al nuevo ancho.
- **AC-13 (proyecto grande):** Given un proyecto con > 20 000 archivos (p. ej. con `node_modules` instalado), when abro el panel, then el primer nivel aparece en < 500 ms y la interfaz no se congela; when expando `node_modules`, then sus hijos se listan bajo demanda.
- **AC-14 (sin git / carpeta ausente):** Given un proyecto que no es repo git, then el árbol se ve sin decoraciones ni errores; given un proyecto marcado como inexistente, then el panel muestra el aviso y ningún árbol.

## Integration

- **Affected existing features:** 001 (Workspace de sesiones).
  - Barra superior del área central: se agrega el botón "Archivos".
  - Layout del área central: el panel ocupa una columna a la derecha; la grilla y el modo expandido se adaptan (FR-4, FR-19).
  - Pane: acepta "soltar" archivos (FR-15) y escribe en su sesión; reutiliza la escritura al PTY existente.
  - Diálogo de nueva sesión: acepta una carpeta pre-cargada distinta a la raíz del proyecto (FR-14 "Abrir terminal acá"). La sesión resultante se asigna al proyecto por su ruta, como ya hace 001.
  - Foco: el árbol es una zona "sin terminal"; al interactuar, ningún pane tiene foco (coherente con 001 FR-15/AC-5).
- **Shared interfaces touched:** persistencia de preferencias de UI (estado/ancho del panel); contrato entre procesos para listar directorios, observar cambios, estado git, abrir/revelar/copiar.
- **Breaking changes:** ninguna. Los AC de 001 deben seguir pasando.

## Open questions

Resueltas el 2026-08-23:

- [x] **Iconos:** set integrado estilo editor (por extensión/nombre, con colores), sin dependencias de terceros.
- [x] **Ignorados por `.gitignore`:** se muestran atenuados, como en VS Code (ya reflejado en FR-8).
