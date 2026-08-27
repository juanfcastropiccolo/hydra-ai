# Config — preferencias de Hydra

Feature ID: 007
Status: specified (aprobada 2026-08-26)
Last updated: 2026-08-26

## Problem

Hydra ya tiene una decena de preferencias (modelo económico de 004/006, fichas automáticas y puerto MCP de 006, tabla de precios y rango de 005, zoom, ancho de la barra…) pero solo se pueden cambiar **editando `hydra.json` a mano**, y otras cosas están **hardcodeadas** (el avatar "JF Juan", el tamaño de fuente de las terminales, las opciones con las que se crean las sesiones). Falta una pantalla de configuración que centralice todo eso con buen diseño, más un lugar para diagnóstico y mantenimiento (qué CLI se está usando, borrar cachés, ver errores).

## Users

- **Juan (y cualquier dev Mac con Hydra):** quiere ajustar Hydra sin tocar archivos, entender de un vistazo qué está configurado, y tener a mano las acciones de mantenimiento cuando algo se rompe. Quiere que se vea **"cool, tipo Discord"**: navegación de categorías a la izquierda, contenido limpio a la derecha, controles modernos.

## Desired outcome

Pulso **Config** en la barra lateral (o ⌘,) y el área central muestra una pantalla estilo Discord: a la izquierda una lista de categorías (Perfil, Apariencia, Sesiones, Contexto e IA, Analytics, Mantenimiento) y a la derecha la categoría activa con sus controles, cada uno con título y una línea de explicación. Los toggles y selects **guardan al instante** con un aviso discreto "Guardado"; los campos de texto (nombre, precios) muestran una **barra flotante "Tenés cambios sin guardar — Guardar / Descartar"** hasta que confirmo. Cambio el modelo económico, activo fichas automáticas, pongo mi nombre e iniciales, subo la fuente de las terminales y lo veo aplicado en vivo. En Mantenimiento veo qué `claude` está usando Hydra y su versión, cuánto pesan los cachés, y puedo reindexar, borrarlos, abrir la carpeta de datos, exportar/importar mi `hydra.json` y ver los últimos errores.

## Functional requirements

### Estructura

1. **FR-1 — Entrada:** el ítem **Config** del sidebar (hoy deshabilitado) abre la vista en el área central (mismo mecanismo que Analytics/Graph Know; las terminales no se desmontan). Atajo **⌘,** (estándar macOS) desde cualquier vista. La categoría activa persiste durante la sesión de la app.
2. **FR-2 — Layout tipo Discord:** columna izquierda con categorías agrupadas (**Usuario:** Perfil, Apariencia · **Hydra:** Sesiones, Contexto e IA, Analytics · **Sistema:** Mantenimiento), con ícono y estado activo; columna derecha con el título de la categoría, secciones con encabezado y controles alineados; en anchos chicos la lista pasa a pestañas horizontales.
3. **FR-3 — Guardado:** toggles, selects y sliders guardan **al instante** (aviso "Guardado" ✓ de 1,5 s); los campos de texto/número guardan con **Enter** o mediante la **barra "cambios sin guardar"** (Guardar / Descartar) que aparece abajo mientras haya cambios pendientes; cambiar de categoría con cambios pendientes pregunta. Cada control valida y muestra el error debajo sin perder lo tipeado.
4. **FR-4 — Ayuda en contexto:** cada control tiene una descripción de una línea; los que tienen efecto en costo o en Claude Code lo dicen ("Se pasa a `claude -p` como `--model`").

### Categorías y controles

5. **FR-5 — Perfil:** **nombre** e **iniciales** del avatar (hoy hardcodeados); vista previa del avatar del sidebar en vivo. Iniciales: 1–3 caracteres, derivadas automáticamente del nombre si se dejan vacías.
6. **FR-6 — Apariencia:** **tamaño de fuente de las terminales** (10–20 px, aplica en vivo a todos los panes sin re-adjuntar), **zoom por defecto** de la ventana (el mismo que hoy se guarda al cerrar; selector −2…+2), **color de acento** de la app (verde por defecto + la misma paleta de 8 de los proyectos), y **ancho por defecto de la barra lateral** (informativo: "se ajusta arrastrando").
7. **FR-7 — Sesiones:** opciones que Hydra pasa al **crear una sesión** (`claude --bg`): **modelo** (default del CLI / fable / opus / sonnet / haiku / nombre exacto), **esfuerzo** (default / low / medium / high / xhigh / max), **modo de permisos** (default / acceptEdits / auto / plan / bypassPermissions con advertencia), **patrón del nombre sugerido** (`<proyecto>-<n>` por defecto, con placeholders), y **confirmar antes de terminar una sesión que está trabajando** (hoy siempre). Un pane creado después usa los nuevos valores; los existentes no cambian.
8. **FR-8 — Contexto e IA:** **modelo económico** (`ui.importContext.model`: usado por Importar contexto y por las fichas) con selector + campo libre; **fichas automáticas** (toggle) y **presupuesto máximo por ficha** (USD, opcional → `--max-budget-usd`); **MCP**: puerto (1024–65535, con "reiniciar server" al cambiar), estado (sirviendo / en otra instancia / apagado), **Conectar / Desconectar con Claude Code** y la URL registrada; **rango por defecto de Analytics** y **generación de fichas al abrir Graph Know** (sí/preguntar).
9. **FR-9 — Analytics:** **tabla de precios por modelo** editable (filas: modelo o prefijo, entrada, salida, caché escritura, caché lectura por millón; agregar/quitar; "restaurar defaults"; muestra la fecha del snapshot de precios por defecto) y el **rango por defecto**.
10. **FR-10 — Mantenimiento:** **CLI**: ruta detectada, versión, botón "volver a detectar"; **datos**: ruta de la carpeta de datos con "Abrir en Finder", tamaño de `hydra.json`, `analytics-index.json`, `know-cards.json`; acciones **Reindexar transcripts**, **Borrar fichas** (confirmación), **Borrar caché de analytics**, **Exportar hydra.json** (guardar como…) e **Importar hydra.json** (elegir archivo, valida, pide confirmación, reemplaza y recarga); **errores recientes**: últimos 50 errores de main (hooks, CLI, fichas, MCP) con hora y "Copiar"; **Acerca de**: versión de Hydra, Electron y Node.
11. **FR-11 — Restaurar por defecto:** cada categoría tiene "Restaurar valores por defecto" (confirmación) que solo afecta esa categoría.

### Robustez

12. **FR-12 —** Un `hydra.json` importado inválido se rechaza con el motivo; nunca se pisa el actual sin confirmar; se hace backup `hydra.json.bak` antes de reemplazar.
13. **FR-13 —** Cambiar el puerto MCP reinicia el server local y, si estaba conectado, **actualiza el registro** en Claude Code (con aviso). Si el puerto está tomado, lo dice y no guarda.
14. **FR-14 —** Los cambios se reflejan sin reiniciar Hydra (fuente, acento, avatar, modelo, fichas, precios, rango). Solo el zoom por defecto y las opciones de sesión aplican a lo que se cree/abra después.

## Non-goals

- Editar `hydra.json` como texto dentro de la app.
- Configuración de Claude Code en sí (`~/.claude/settings.json`, MCPs de terceros, hooks del usuario): solo lo que Hydra pasa por flags.
- Sincronizar preferencias entre máquinas / cuenta.
- Temas claros (Hydra es oscura; solo cambia el acento).
- Configuración de proyectos (nombre/color ya se editan en el sidebar).

## Edge cases

- **Modelo inválido** en Sesiones o Contexto e IA: se acepta como texto libre (el CLI decide) pero se advierte "no está en la lista conocida"; los errores reales llegan cuando se usa (004/006 ya los muestran).
- **`bypassPermissions`:** advertencia explícita en rojo y confirmación al activarlo.
- **Puerto tomado / cambio con Hydra conectada:** FR-13.
- **Importar un `hydra.json` de una versión futura:** se rechaza con "versión no soportada".
- **Nombre vacío:** se mantiene el anterior; iniciales vacías → derivadas.
- **Fuente muy grande en pane chico:** xterm refita solo; no se limita más allá del rango.
- **Cambios pendientes al cerrar Hydra:** se descartan (los campos de texto sin confirmar), igual que Discord.

## Acceptance criteria

- **AC-1 (navegar):** Given Hydra abierta, when pulso Config o ⌘,, then veo la pantalla con las 6 categorías y Perfil activa; when vuelvo a Sessions, then las terminales están intactas (sin re-attach).
- **AC-2 (guardado instantáneo):** Given Contexto e IA, when activo "fichas automáticas", then aparece "Guardado" y `hydra.json` refleja `ui.know.autoCards: true` en < 1 s; when reinicio Hydra, then sigue activo.
- **AC-3 (cambios pendientes):** Given Perfil, when tipeo un nombre nuevo, then aparece la barra "cambios sin guardar"; when pulso Descartar, then vuelve el anterior; when tipeo y pulso Guardar, then el avatar del sidebar cambia en vivo y persiste.
- **AC-4 (apariencia en vivo):** Given dos panes, when subo la fuente a 16 px, then ambos panes se redibujan con la nueva fuente sin re-adjuntar; when cambio el acento a violeta, then el borde de foco, los botones activos y el logo-texto usan violeta.
- **AC-5 (sesiones):** Given modelo "haiku" y esfuerzo "low" en Sesiones, when creo una sesión nueva, then el proceso `claude --bg` recibe `--model haiku --effort low`; los panes existentes no cambian.
- **AC-6 (precios):** Given la tabla de precios, when edito el precio de salida de opus y guardo, then Analytics recalcula el costo sin reindexar; when "restaurar defaults", then vuelve el snapshot.
- **AC-7 (MCP):** Given el server sirviendo en 4855 y conectado, when cambio el puerto a 4900, then el server reinicia en 4900 y `claude mcp get hydra-know` muestra la URL nueva; when pongo un puerto tomado, then se rechaza con mensaje.
- **AC-8 (mantenimiento):** Given Mantenimiento, then veo ruta y versión del CLI, tamaños de los archivos de datos y los últimos errores; when pulso "Borrar fichas", then pide confirmación y Graph Know pasa a 0 fichas; when exporto e importo el `hydra.json`, then las preferencias quedan iguales y existe `hydra.json.bak`.
- **AC-9 (validación):** Given un puerto 80 o unas iniciales de 5 letras, then el campo muestra el error y no se guarda.
- **AC-10 (no rompe nada):** AC de 001–006 siguen verdes.

## Integration

- **Affected existing features:** 001 (sidebar: ítem Config, avatar, atajo ⌘,; creación de sesiones con flags), 002 (ancho de barra informativo), 004/006 (modelo económico, presupuesto), 005 (precios, rango), 006 (fichas, MCP).
- **Shared interfaces touched:** `hydra.json` gana `ui.profile`, `ui.appearance`, `ui.sessions`; IPC de preferencias unificado (`prefs.get/set` por sección) + acciones de mantenimiento; `claude --bg` gana flags opcionales; log de errores en main.
- **Breaking changes:** ninguna (todas las claves nuevas son opcionales con defaults).

## Open questions

- [x] Alcance: las 4 áreas, look tipo Discord (Juan, 2026-08-26).
- [x] **Acento:** solo la UI (foco, botones, logo); los gráficos mantienen su paleta validada (Juan, 2026-08-26).
- [x] **Importar hydra.json:** todo el archivo (backup/restore), con confirmación y `.bak` (Juan, 2026-08-26).
