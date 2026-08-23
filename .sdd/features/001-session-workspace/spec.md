# Workspace de sesiones de Claude Code

Feature ID: 001
Status: planned (spec aprobada 2026-08-23; ajustes FR-9/14/16 aprobados con el plan)
Last updated: 2026-08-23

## Problem

Hoy, trabajar con varias sesiones de Claude Code en paralelo significa tener N pestañas o ventanas de terminal abiertas, sin forma de ver de un vistazo cuál está trabajando, cuál terminó y cuál está bloqueada esperando que uno apruebe algo o conteste una pregunta. Hay que ir pestaña por pestaña. Las sesiones tampoco están agrupadas por proyecto: una pestaña de "Integralo" está al lado de una de "trading-bots" y se confunden. Y al cerrar la terminal por accidente, se pierde el contexto visual de qué había en marcha.

## Users

- **Juan (autor, desarrollador solo)**: corre entre 2 y 4 sesiones de Claude Code simultáneas sobre 1-3 proyectos distintos, en una MacBook. Quiere mirar una sola pantalla y saber quién necesita atención, y poder "meterse" en cualquier sesión para escribirle sin cambiar de app.
- **(Futuro) Otros desarrolladores Mac** con el mismo patrón de trabajo. No condiciona esta feature, pero nada de lo que se decida aquí debe asumir que el usuario es el autor.

## Desired outcome

Abro Hydra desde el Dock. A la izquierda veo mis proyectos; cada uno lista sus sesiones vivas. Le doy "nueva sesión" a un proyecto y aparece un pane nuevo con Claude Code corriendo **en la carpeta de ese proyecto, ya autenticado y listo para recibir un prompt** — sin pasos intermedios. En la zona central veo todas las terminales en una grilla, cada una con un semáforo: verde si Claude está trabajando, rojo si está esperando algo de mí, amarillo si está ocioso. Hago clic en una y un borde verde me dice "estás acá": lo que tipeo va a esa sesión y a ninguna otra. Si quiero concentrarme en una, la expando a toda el área central y la vuelvo a contraer cuando termino. Cierro Hydra, la reabro una hora después, y las sesiones que seguían vivas están ahí, en su lugar, listas para seguir.

## Functional requirements

### Proyectos

1. **FR-1:** El usuario puede **agregar un proyecto** eligiendo una carpeta del disco. El proyecto queda identificado por su ruta y un nombre visible (por defecto, el nombre de la carpeta; editable).
2. **FR-2:** El usuario puede **quitar un proyecto** de la lista. Quitarlo no borra la carpeta ni termina sus sesiones; solo deja de mostrarse en Hydra.
3. **FR-3:** La lista de proyectos **persiste entre aperturas** de la app.
4. **FR-4:** Cada proyecto en el sidebar muestra **sus sesiones** (nombre y semáforo) y un **contador de sesiones que requieren atención** (estado rojo), visible aunque el proyecto esté colapsado.

### Sesiones

5. **FR-5:** Desde un proyecto, el usuario pulsa **"Nueva sesión"** y se abre un **diálogo de creación** que muestra: (a) un campo **nombre de la sesión**, pre-rellenado con un nombre generado (p. ej. `<proyecto>-<n>`) y editable; (b) la **carpeta** en la que vivirá la sesión (la del proyecto, solo lectura en este diálogo); (c) botones **Cancelar** y **Crear**. `Enter` equivale a Crear; `Esc` a Cancelar. Al crear, la sesión arranca en esa carpeta con la autenticación y configuración que el usuario ya tiene en Claude Code — no pide login ni pasos adicionales — y aparece inmediatamente como un pane en la grilla con el foco. Cancelar no deja rastro.
6. **FR-6:** Cada sesión tiene un **nombre** visible (el elegido en el diálogo; editable después desde el encabezado del pane o el sidebar). El nombre no puede quedar vacío; si el usuario lo borra, Crear queda deshabilitado.
7. **FR-7:** El usuario puede **terminar una sesión** (acción explícita, con confirmación si la sesión está trabajando). Terminar = el proceso de Claude Code se detiene y el pane desaparece.
8. **FR-8:** El usuario puede **ocultar un pane sin terminar la sesión**: la sesión sigue corriendo y sigue listada en el sidebar; un clic en el sidebar la vuelve a mostrar.
9. **FR-9:** Al abrir Hydra, las **sesiones que siguen vivas** en la carpeta de un proyecto registrado se **detectan y se muestran** en el sidebar con su estado actual. Las creadas por Hydra (o enviadas a background por el usuario desde su terminal) se muestran además en la grilla, con su historial de pantalla reciente. Las **sesiones externas en primer plano** (abiertas a mano en otra terminal y no enviadas a background) se listan en el sidebar con nombre, semáforo y la marca "externa"; **no pueden adjuntarse ni terminarse desde Hydra** — la entrada explica que hay que enviarlas a background desde esa terminal para operarlas aquí. (Ajuste 2026-08-23 tras verificar el comportamiento del CLI.)
10. **FR-10:** Cerrar Hydra **no termina** ninguna sesión.

### Grilla y panes

11. **FR-11:** El área central muestra los panes de las sesiones visibles **agrupados por proyecto**, con una etiqueta de proyecto encabezando cada grupo. Dentro de un grupo, los panes se acomodan en una grilla de 2 columnas; si hay más panes de los que entran en pantalla, el área central hace scroll vertical.
12. **FR-12:** Cada pane es una **terminal real e interactiva**: muestra exactamente lo que muestra Claude Code en una terminal normal y acepta todo lo que una terminal normal acepta (texto, atajos, respuestas a prompts de permiso, pegar).
13. **FR-13:** Cada pane tiene un **encabezado** con: nombre de la sesión, semáforo, botón expandir/contraer, botón ocultar, botón terminar.
14. **FR-14 — Semáforo:** cada pane (y su entrada en el sidebar) muestra un indicador de tres estados:
    - 🟢 **Verde — trabajando:** Claude está procesando, ejecutando herramientas o generando respuesta.
    - 🔴 **Rojo — esperando acción del usuario:** Claude está bloqueado en un prompt de permiso, una pregunta, un diálogo o cualquier cosa que solo el usuario puede destrabar.
    - 🟡 **Amarillo — ocioso:** no está corriendo nada; esperando un prompt nuevo, terminada o detenida.
    El cambio de estado debe reflejarse en pantalla en **menos de 2 segundos** para sesiones creadas por Hydra y en **menos de 3 segundos** para sesiones externas. (Ajuste 2026-08-23.)
15. **FR-15 — Foco:** un clic en cualquier parte de un pane le da el foco. El pane con foco se distingue con un **borde verde** claramente visible; ningún otro pane lo tiene. Todo lo que el usuario tipea va **únicamente** al pane con foco. Si ningún pane tiene foco, el tipeo no va a ninguna sesión.
16. **FR-16 — Expandir:** el botón expandir lleva el pane a ocupar **toda el área central** (el sidebar permanece visible). El mismo botón (ahora "contraer") lo devuelve a la grilla; la tecla `Esc` también lo contrae **cuando el foco no está dentro de la terminal** (si está, `Esc` va a Claude Code, como en cualquier terminal). (Ajuste 2026-08-23.) Mientras un pane está expandido, los demás siguen corriendo, siguen recibiendo salida y sus semáforos en el sidebar siguen actualizándose.
17. **FR-17 — Doble clic:** hacer doble clic en **cualquier parte** de un pane (encabezado o área de terminal) equivale a pulsar expandir/contraer. Consecuencia asumida: dentro del área de terminal el doble clic **no** selecciona palabras; la selección de texto se hace arrastrando con el mouse (clic sostenido), que sigue funcionando con normalidad. Decisión de producto del 2026-08-23.
18. **FR-18:** Al **redimensionar** la ventana, expandir o contraer, la terminal de cada pane se ajusta al nuevo tamaño sin dejar texto cortado ni artefactos.

### Robustez

19. **FR-19:** Si una sesión **muere inesperadamente** (proceso terminado desde afuera, crash), su pane lo indica visiblemente (estado "finalizada", con la última salida aún legible) y ofrece cerrarlo o relanzar una sesión nueva en el mismo proyecto. La app sigue funcionando con normalidad.
20. **FR-20:** Si Hydra **no encuentra Claude Code instalado** o no puede ejecutarlo, lo informa al arrancar con un mensaje accionable (qué falta y cómo instalarlo), en lugar de fallar en silencio al crear la primera sesión.
21. **FR-21:** La app se distribuye como una **aplicación de escritorio macOS** que se abre desde el Finder/Dock, sin requerir que el usuario tenga una terminal abierta ni variables de entorno configuradas.

## Non-goals

- **Árbol de archivos del proyecto** (feature 002).
- **Chat box** debajo de cada terminal (feature 003).
- **Analytics**, **Graph Know** y pantalla de **Config** (features posteriores). El sidebar puede mostrar esas entradas deshabilitadas como placeholder, pero no hacen nada.
- **Layouts configurables** (arrastrar panes, cambiar número de columnas, tiling libre). La grilla es fija de 2 columnas.
- **Sesiones que no sean de Claude Code** (un shell genérico, otros agentes).
- **Worktrees / branches por sesión.** Todas las sesiones de un proyecto corren en la misma carpeta.
- **Notificaciones del sistema** (banner de macOS cuando una sesión pasa a rojo). Deseable, pero no en esta feature.
- **Atajos de teclado globales** para saltar entre panes. Solo clic en esta feature.
- **Importar contexto de otra sesión** (botón en el pane que abre un selector de sesiones y trae el contexto compactado de la elegida). Registrado como feature 004.

## Edge cases

- **Carpeta de proyecto borrada o movida** después de agregarla: el proyecto se muestra con un aviso y no permite crear sesiones hasta que se corrija la ruta.
- **Dos proyectos con el mismo nombre** (carpetas homónimas en rutas distintas): se distinguen por ruta; el nombre visible puede repetirse.
- **Sesión externa en una carpeta de proyecto** (el usuario abrió Claude Code a mano en iTerm en esa carpeta): aparece en el sidebar como sesión del proyecto, con semáforo y marca "externa"; adjuntar y terminar están deshabilitados con explicación. Si el usuario la envía a background desde su terminal, en el siguiente refresco pasa a ser adjuntable y terminable como cualquier otra.
- **Más de 6 panes visibles:** la grilla hace scroll; el rendimiento debe mantenerse usable (ver AC-12).
- **Expandir un pane y cerrar la app:** al reabrir, la grilla vuelve a estado normal (no se persiste el estado expandido).
- **Pérdida de foco de la ventana** (usuario pasa a otra app) y vuelta: el pane que tenía foco lo recupera; el borde nunca queda en un pane distinto al que recibe teclado.
- **Claude Code se actualiza** a una versión nueva mientras Hydra corre: las sesiones existentes siguen funcionando; las nuevas usan la versión nueva. Hydra no debe quedar atada a una versión específica para lo básico.
- **Clic en un pane mientras otro tiene una selección de texto activa:** la selección se descarta, el foco cambia. Nunca se "pega" en el pane equivocado.
- **Doble clic accidental al hacer clic rápido para enfocar:** dos clics en menos del umbral de doble clic del sistema expanden el pane; un clic simple solo enfoca. El primer clic del doble clic también da foco, así que tras expandir el pane ya tiene el borde verde.
- **El usuario responde "y" a un permiso justo cuando el semáforo aún dice rojo:** el estado se actualiza a verde en el tiempo límite; no hay estado intermedio confuso ("rojo pero ya corriendo") por más de 2 s.

## Acceptance criteria

- **AC-1 (agregar proyecto):** Given Hydra abierta sin proyectos, when el usuario pulsa "Agregar proyecto" y elige la carpeta `~/Documents/foo`, then aparece "foo" en el sidebar sin sesiones, y sigue apareciendo tras cerrar y reabrir Hydra.
- **AC-2 (diálogo de nueva sesión):** Given el proyecto "foo" en el sidebar, when el usuario pulsa "Nueva sesión", then se abre un diálogo con el campo nombre pre-rellenado (p. ej. `foo-1`), la carpeta `~/Documents/foo` visible, y los botones Cancelar y Crear; when pulsa Cancelar o `Esc`, then el diálogo se cierra y no se crea ninguna sesión ni pane.
- **AC-2b (spawn):** Given el diálogo abierto con el nombre "refactor-auth", when el usuario pulsa Crear (o `Enter`), then en menos de 5 segundos (menos de 8 segundos si es la primera sesión desde que arrancó el servicio de fondo de Claude Code; ajuste 2026-08-23 según spike) aparece un pane titulado "refactor-auth" con Claude Code corriendo en `~/Documents/foo`, mostrando su prompt inicial listo para recibir texto, con el foco (borde verde) en ese pane, y la sesión "refactor-auth" listada bajo "foo" en el sidebar.
- **AC-2c (nombre vacío):** Given el diálogo abierto, when el usuario borra el nombre, then el botón Crear se deshabilita hasta que haya al menos un carácter.
- **AC-3 (ya autenticado):** Given el usuario ya usa Claude Code en su terminal con su cuenta, when crea una sesión desde Hydra, then la sesión no pide login ni selección de cuenta.
- **AC-4 (foco exclusivo):** Given dos panes A y B visibles, when el usuario hace clic en B y tipea "hola", then "hola" aparece solo en la terminal de B, el borde verde está solo en B, y A no recibió ninguna tecla.
- **AC-5 (sin foco):** Given ningún pane con foco (p. ej. el usuario hizo clic en el sidebar), when tipea, then ninguna sesión recibe el texto.
- **AC-6 (semáforo verde):** Given un pane ocioso (amarillo), when el usuario envía un prompt, then el semáforo pasa a verde en menos de 2 segundos.
- **AC-7 (semáforo rojo):** Given un pane trabajando, when Claude Code muestra un prompt de permiso, then el semáforo del pane y el del sidebar pasan a rojo en menos de 2 segundos, y el contador de atención del proyecto se incrementa.
- **AC-8 (semáforo amarillo):** Given un pane trabajando, when Claude termina de responder y espera un prompt nuevo, then el semáforo pasa a amarillo en menos de 2 segundos.
- **AC-9 (expandir/contraer):** Given una grilla con 3 panes, when el usuario pulsa expandir en el pane 2 (o hace doble clic en su encabezado), then el pane 2 ocupa toda el área central con la terminal redibujada al nuevo tamaño sin artefactos; when pulsa contraer o `Esc`, then vuelve la grilla de 3 con los otros dos panes mostrando la salida acumulada mientras estaban ocultos.
- **AC-10 (doble clic en terminal):** Given un pane en la grilla, when el usuario hace doble clic sobre el área de terminal, then el pane se expande (igual que AC-9) y no queda texto seleccionado; when hace doble clic de nuevo estando expandido, then se contrae. Given un pane con texto, when el usuario arrastra el mouse sobre una línea, then el texto se selecciona y el pane NO cambia de tamaño.
- **AC-11 (reconexión):** Given dos sesiones vivas creadas desde Hydra, when el usuario cierra Hydra y la reabre, then ambas sesiones aparecen en el sidebar y en la grilla con su semáforo correcto, y al hacer clic en una se puede seguir escribiendo en la misma conversación.
- **AC-12 (cerrar no mata):** Given una sesión trabajando, when el usuario cierra Hydra, then el proceso de Claude Code sigue corriendo (verificable desde una terminal externa) y al reabrir Hydra está en la grilla.
- **AC-13 (ocultar ≠ terminar):** Given un pane visible, when el usuario pulsa ocultar, then el pane desaparece de la grilla, la sesión sigue listada en el sidebar con su semáforo actualizándose, y un clic en ella la vuelve a mostrar con su contenido.
- **AC-14 (terminar):** Given una sesión trabajando, when el usuario pulsa terminar y confirma, then el proceso se detiene, el pane desaparece y la sesión deja de figurar en el sidebar.
- **AC-15 (muerte externa):** Given una sesión visible en Hydra, when su proceso es terminado desde una terminal externa, then en menos de 5 segundos el pane muestra estado "finalizada" con su última salida legible, ofrece cerrar o relanzar, y el resto de la app sigue operativa.
- **AC-16 (sin Claude Code):** Given una máquina donde Claude Code no está instalado o no es ejecutable, when se abre Hydra, then se muestra un mensaje que indica el problema y cómo resolverlo, y el botón "Nueva sesión" está deshabilitado.
- **AC-17 (.app desde Finder):** Given la app empaquetada, when el usuario la abre con doble clic desde el Finder (sin ninguna terminal abierta), then puede agregar un proyecto y crear una sesión funcional (AC-2 se cumple).
- **AC-18 (resize):** Given 4 panes visibles, when el usuario redimensiona la ventana, then cada terminal se reajusta al nuevo tamaño y una línea de 80 caracteres escrita a continuación se ve completa, sin cortes.
- **AC-19 (sesión externa detectada):** Given el proyecto "foo" registrado, when el usuario abre Claude Code a mano en `~/Documents/foo` desde iTerm, then en menos de 5 segundos aparece como sesión de "foo" en el sidebar con su semáforo y la marca "externa", y los botones adjuntar/terminar están deshabilitados con una explicación; when el usuario envía esa sesión a background desde iTerm, then en menos de 5 segundos pasa a ser adjuntable y al adjuntarla aparece en la grilla.
- **AC-8b (latencia externa):** Given una sesión externa listada, when cambia de estado, then su semáforo en el sidebar se actualiza en menos de 3 segundos.

## Integration

(Feature 001 — no hay features previas.)

- Affected existing features: ninguna.
- Shared interfaces touched: ninguna.
- Breaking changes: ninguna.

## Open questions

Todas resueltas el 2026-08-23:

- [x] **Doble clic:** en cualquier parte del pane (FR-17). Se asume la pérdida de la selección de palabra por doble clic dentro de la terminal; el arrastre sigue seleccionando.
- [x] **Sesiones externas:** se muestran con semáforo; adjuntables/terminables solo si están en background (FR-9, AC-19). Ajustado el 2026-08-23 al verificar que `attach` solo acepta sesiones background.
- [x] **Grilla:** global, agrupada por proyecto, con scroll vertical (FR-11).
