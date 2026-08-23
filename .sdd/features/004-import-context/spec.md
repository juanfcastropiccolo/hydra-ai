# Importar contexto de otra sesión

Feature ID: 004
Status: specified (aprobada 2026-08-23)
Last updated: 2026-08-23

## Problem

Cuando trabajo con varias sesiones de Claude Code a la vez, una sesión suele acumular contexto valioso (decisiones, nombres, estado de un refactor, qué se probó y qué no) que otra sesión necesita para continuar o colaborar: la sesión A investigó un bug y la B va a arreglarlo en otro proyecto; la A se quedó sin contexto y quiero seguir en una sesión fresca; la B tiene que respetar decisiones que se tomaron en la A. Hoy la única forma es copiar y pegar a mano trozos de terminal, o volver a explicar todo. Falta, dentro de Hydra, una acción "traé el contexto de esa otra sesión a esta", con un resumen de calidad que el humano pueda revisar antes de enviarlo.

## Users

- **Juan (y cualquier dev Mac con Hydra)** con dos o más sesiones vivas. Quiere, desde el pane de la sesión destino, elegir una sesión origen de una lista, esperar unos segundos, y ver aparecer en el prompt de la destino un resumen bien armado del contexto de la origen, listo para revisar y enviar con Enter.

## Desired outcome

Tengo el pane de la sesión "api-fix" con foco. Pulso el botón **Importar contexto** de su encabezado y se abre una ventana con las demás sesiones activas (nombre, proyecto, estado). Elijo "investigacion-bug". Hydra muestra "Resumiendo el contexto de *investigacion-bug*…" con un indicador de progreso; 10–30 s después, en el prompt del pane "api-fix" aparece pegado un bloque de texto: una breve introducción en mi voz ("Te comparto, como contexto de referencia, el resumen de otra sesión mía…") y el resumen de la origen (objetivo, decisiones, datos clave, estado, pendientes). **No se envía solo:** lo leo, lo edito si quiero, y pulso Enter. La sesión origen no se entera de nada: sigue exactamente donde estaba. Si algo falla (la origen ya no existe, el resumen no se pudo generar), el pane me lo dice con un mensaje claro y no se pega nada.

## Functional requirements

### Entrada y selección

1. **FR-1 — Botón en el pane:** cada pane tiene una acción **"Importar contexto"** (icono en el encabezado, con tooltip, y entrada en el menú contextual del pane si lo hubiera). Está disponible solo cuando la sesión del pane está **viva y en reposo** (semáforo verde/idle); en otro caso el botón se muestra deshabilitado con un tooltip que explica por qué ("la sesión está trabajando" / "está esperando una respuesta tuya" / "finalizada").
2. **FR-2 — Selector de sesión origen:** al pulsarlo se abre un **diálogo modal** con la lista de **sesiones activas** que Hydra conoce (las mismas del sidebar, de todos los proyectos), **excluyendo la sesión destino**. Cada entrada muestra nombre (alias de Hydra si lo hay), proyecto, semáforo, y una marca "externa" cuando corresponda. Hay un filtro rápido por nombre/proyecto. `Esc` cancela; `Enter` o doble clic confirma la entrada seleccionada. Si no hay ninguna otra sesión, el diálogo lo dice y ofrece cerrar.
3. **FR-3 — Sesiones de otros proyectos:** se puede importar desde una sesión de **cualquier proyecto**, no solo del mismo; el diálogo agrupa u ordena por proyecto para que sea fácil encontrarla.
4. **FR-4 — Sesiones externas y finalizadas:** una sesión externa (abierta a mano en otra terminal, ver 001 FR-9) **sí** puede usarse como origen si el sistema puede acceder a su conversación; una sesión finalizada **no** aparece en la lista (no-goal: historial).

### Obtención del contexto

5. **FR-5 — Resumen de traspaso:** el contexto importado es un **resumen** estructurado de la conversación de la origen, escrito para que otra sesión pueda continuar el trabajo: objetivo, decisiones tomadas (con su porqué cuando esté), datos y nombres clave (archivos, comandos, identificadores), estado actual y pendientes. Se genera con el mismo Claude Code y las credenciales que el usuario ya tiene; Hydra no llama a ninguna API por su cuenta.
6. **FR-6 — La origen no se toca:** generar el resumen **no modifica** la conversación de la sesión origen (no le agrega turnos, no le cambia el estado, no la hace compactar) y **no deja sesiones ni conversaciones nuevas** que luego aparezcan en listas de Hydra o del CLI. Se puede importar desde una sesión origen que está **trabajando** en ese momento.
7. **FR-7 — Modelo del resumen:** el resumen se genera con un modelo económico por defecto (**haiku**). La elección es una **preferencia persistida** de Hydra (ajustable desde la futura pantalla de configuración, feature 007; hasta entonces editable en el archivo de preferencias). El diálogo de importación muestra qué modelo va a usar.
8. **FR-8 — Progreso y tiempos:** mientras se genera el resumen, el pane destino muestra un indicador visible ("Resumiendo el contexto de *X*…") y el botón queda deshabilitado. El resumen de una sesión típica (decenas de turnos) tarda menos de **30 s**; si supera 90 s se cancela con aviso. El usuario puede cancelar desde el indicador.
9. **FR-9 — Tamaño:** el texto pegado no supera un tope razonable para un prompt (orientativo: ~8 000 caracteres); si el resumen lo excede, se recorta conservando las secciones de mayor valor (objetivo, decisiones, estado, pendientes) y se indica que fue recortado.

### Inyección en la sesión destino

10. **FR-10 — Queda pegado, no enviado:** el resultado se escribe en el **prompt del pane destino** como si el usuario lo hubiera pegado: un único bloque multilínea, **sin pulsar Enter**. El usuario lo revisa, lo edita o lo borra con las teclas habituales del prompt de Claude Code, y lo envía cuando quiere. El pane destino recibe el foco al terminar el pegado.
11. **FR-11 — Encuadre en la voz del usuario:** el bloque empieza con una introducción fija, en primera persona del usuario, que dice que es el resumen de otra sesión suya de Claude Code llamada *X* (proyecto *Y*), que se comparte como contexto de referencia y que no hay que ejecutar nada; el resumen va delimitado claramente (p. ej. dentro de un bloque marcado como contexto importado). *Motivo (spike 004): con un encuadre imperativo ("contexto importado: respondé ok") el modelo lo rechazó como intento de inyección; con encuadre en primera persona lo aceptó y lo usó.*
12. **FR-12 — Solo si la destino sigue en reposo:** si durante la generación la sesión destino cambió de estado (empezó a trabajar, pide un permiso, se finalizó), Hydra **no pega** el texto en el prompt; muestra el resumen en un aviso dentro del pane con las opciones **Copiar** y **Reintentar pegado**, para no escribir dentro de un diálogo de permisos ni interrumpir un turno. *(Constitution, principio 3.)*
13. **FR-13 — Aviso de éxito:** al pegar, el pane muestra un aviso breve verde ("Contexto de *X* listo para enviar — revisalo y pulsá Enter"), en el mismo estilo que el aviso de "Adjuntado" de 002 FR-15.
14. **FR-14 — Errores:** si la origen ya no existe, su conversación no es accesible, el resumen falla o se cancela, el pane destino muestra un aviso rojo con la causa y una acción de reintento; nunca se pega un texto parcial ni vacío.

### Límites

15. **FR-15 — Nada nuevo que persistir:** Hydra no guarda los resúmenes ni un historial de importaciones (solo la preferencia de modelo). Repetir la importación vuelve a generar el resumen.
16. **FR-16 — No rompe 001/002:** la acción no altera el foco de otros panes, no re-adjunta terminales, y el aviso/indicador no tapa el prompt del pane.

## Non-goals

- **Importar desde sesiones finalizadas o historial** (`/resume`-like). Solo sesiones activas. Un "buscador de conversaciones pasadas" podría ser parte de 005/006.
- **Importar la conversación completa** (todos los turnos, tool calls) en vez de un resumen. Llenaría el contexto de la destino.
- **Sincronización continua** entre sesiones (seguir importando a medida que la origen avanza). Es una acción puntual.
- **Edición del resumen dentro de Hydra** (un editor propio). La edición se hace en el prompt de la terminal, que ya lo permite.
- **Importar hacia varias sesiones a la vez**, o desde varias sesiones en un solo bloque.
- **Compactar la sesión origen** o intervenirla de cualquier modo.
- **Pantalla de configuración** general: llega en 007; aquí solo se define la preferencia y su valor por defecto.

## Edge cases

- **La origen es muy larga** (conversación de horas): el resumen tarda más y cuesta más; el indicador de progreso lo cubre y el tope de 90 s evita esperas infinitas. El diálogo puede señalar sesiones "largas" si esa información está disponible (no obligatorio).
- **La origen está bloqueada en un permiso o trabajando:** se puede importar igual (FR-6); el resumen refleja el estado "está esperando que el usuario apruebe X".
- **La origen es la propia destino:** no aparece en la lista (FR-2).
- **La destino pierde el foco / el usuario cambia de pane durante la generación:** al terminar se pega en la destino (la que originó la acción), no en el pane con foco, y la destino recibe el foco (FR-10). Si la destino fue ocultada, el texto se pega igual y al mostrarla está en el prompt.
- **La destino se cerró o murió durante la generación:** se cancela en silencio; si Hydra puede, muestra el resumen en un aviso con "Copiar".
- **Dos importaciones a la vez en el mismo pane:** no se permite; el botón está deshabilitado mientras hay una en curso (FR-8). En panes distintos, sí.
- **Texto con caracteres especiales, acentos, bloques de código, tabulaciones:** llega íntegro al prompt; un pegado multilínea no dispara envíos parciales.
- **El modelo configurado no está disponible** (nombre inválido, sin acceso): error claro (FR-14) que menciona la preferencia.
- **Claude Code actualizado cambia el comportamiento interno:** los tests de integración contra el CLI real deben detectarlo (ver plan); el error llega al usuario como FR-14, nunca como un pegado corrupto.

## Acceptance criteria

- **AC-1 (flujo feliz):** Given dos sesiones vivas A (origen, con una conversación de varios turnos donde se fijó una decisión y un dato concreto) y B (destino, idle con foco), when pulso "Importar contexto" en B, elijo A y espero, then en < 30 s el prompt de B contiene un bloque que empieza con la introducción en primera persona nombrando a A y su proyecto, seguido del resumen que incluye la decisión y el dato; el cursor está al final, **no se envió nada** (la conversación de B no tiene turnos nuevos), y B muestra el aviso verde. When pulso Enter, then B responde teniendo en cuenta ese contexto.
- **AC-2 (origen intacta):** Given el mismo flujo, when termina la importación, then la conversación de A no tiene turnos ni estado nuevos, A sigue en el mismo estado del semáforo, y la lista de sesiones de Hydra (y `claude agents`) no muestra ninguna sesión adicional.
- **AC-3 (lista de orígenes):** Given sesiones en dos proyectos más la destino, when abro el diálogo desde la destino, then veo todas menos la destino, con nombre, proyecto y semáforo, agrupadas por proyecto; when tipeo en el filtro, then la lista se reduce; when no hay otras sesiones, then el diálogo lo dice.
- **AC-4 (destino no idle):** Given la destino trabajando o esperando un permiso, then el botón está deshabilitado con tooltip explicativo. Given la destino idle al inicio pero que empieza a trabajar durante la generación, when termina el resumen, then **no** se escribe en el prompt; aparece el aviso con "Copiar" y "Reintentar pegado"; when la destino vuelve a idle y pulso "Reintentar pegado", then el texto aparece en el prompt.
- **AC-5 (revisar y editar):** Given el bloque pegado en B, when borro una línea con las teclas del prompt y pulso Enter, then lo enviado es el texto editado.
- **AC-6 (errores):** Given que la sesión A se termina entre que abro el diálogo y confirmo, when confirmo, then B muestra un aviso rojo con la causa y nada se pega. Given un modelo configurado inválido, then el aviso rojo lo menciona.
- **AC-7 (cancelar):** Given una importación en curso, when pulso cancelar en el indicador, then desaparece el indicador, el botón vuelve a habilitarse y no se pega nada.
- **AC-8 (modelo por defecto y preferencia):** Given preferencias por defecto, then el diálogo indica "haiku"; when cambio la preferencia al otro modelo admitido y repito, then el diálogo indica el nuevo modelo y la importación funciona.
- **AC-9 (no rompe 001/002):** Given tres panes, when importo en uno, then los otros dos no cambian de foco, ninguna terminal se re-adjunta, y el aviso no tapa el prompt del pane destino.

## Integration

- **Affected existing features:** 001 (Workspace de sesiones) y 002 (Árbol de archivos).
  - Encabezado del pane (001 FR-13): se agrega el icono "Importar contexto".
  - Estado de sesión (001 FR-14 / SessionWatcher): se usa para habilitar/deshabilitar la acción y para la guarda de FR-12.
  - Lista de sesiones del sidebar (001 FR-4/FR-9): el diálogo reutiliza la misma fuente (incluidas externas).
  - Escritura al PTY y foco (001 FR-15; 002 FR-15 "soltar archivo"): se reutiliza el mecanismo de pegar texto en el prompt sin Enter y el aviso verde.
  - Preferencias de UI (`hydra.json`): una clave nueva para el modelo del resumen (futura 007 Config la expone).
- **Shared interfaces touched:** contrato entre procesos (nueva operación "resumir sesión" con progreso/cancelación; lectura de la preferencia), tipos de estado de sesión.
- **Breaking changes:** ninguna. Los AC de 001 y 002 siguen vigentes.
- **Constitution:** la Constitution limita la lectura de `~/.claude/projects/*.jsonl` a "analíticas". Si el plan decide usar el resumen de compactación ya existente en el transcript (atajo gratuito, spike 004 §2), habrá que ampliar esa cláusula con una entrada en el decision log. El camino principal (resumen vía CLI) no requiere cambios.

## Open questions

- [x] **¿Se envía solo o queda pegado?** Queda pegado, el humano revisa y pulsa Enter (decisión de Juan, 2026-08-23).
- [x] **¿Modelo fijo o configurable?** Haiku por defecto, preferencia persistida; UI en 007 Config (Juan, 2026-08-23).
- [x] **Idioma del resumen:** el de la conversación origen (Juan, 2026-08-23).
- [x] **Texto introductorio:** fijo; se edita en el prompt tal cual (Juan, 2026-08-23).
