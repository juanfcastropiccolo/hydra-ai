# Graph Know — conocimiento y recuperación de contexto del trabajo pasado

Feature ID: 006
Status: specified (aprobada 2026-08-23)
Last updated: 2026-08-23
Base: investigación 2026-08-23 (GraphRAG/LightRAG/MiniRAG/HippoRAG/Zep-Graphiti/Mem0; ver plan) y decisión de Juan: el grafo existe para **optimizar cómo Claude accede al contexto del trabajo pasado**, no como visor decorativo.

## Problem

Todo lo que Claude y yo hicimos está en los transcripts locales, pero es inaccesible en la práctica: para saber "¿dónde trabajamos el auth?", "¿qué se decidió sobre X?" o "¿qué sesión conoce este archivo?" hay que releer transcripts enteros — lento, caro en tokens y no escala. La 004 permite traer contexto de una sesión elegida a mano; falta la capa de arriba: un **índice de conocimiento** consultable, que devuelva poco texto y muy relevante, tanto para mí (buscador + grafo navegable en Hydra) como para **cualquier sesión de Claude** (una herramienta de búsqueda que el modelo pueda invocar solo).

## Users

- **Las sesiones de Claude Code** (dentro o fuera de Hydra): ganan una herramienta para buscar trabajo pasado y traer hechos/decisiones destilados sin releer nada.
- **Juan:** busca desde Hydra, explora el grafo (proyectos, sesiones, archivos, temas), y desde un resultado importa contexto a un pane (004).

## Desired outcome

Trabajo con Hydra abierta. En una sesión cualquiera le digo a Claude "fijate qué hicimos sobre el file watcher" y Claude usa la herramienta `search_past_work` de Hydra: recibe 3 resultados compactos (sesión, proyecto, fecha, hechos relevantes, archivos) y sigue trabajando con ese contexto — sin pegar transcripts. En Hydra, la sección **Graph Know** tiene un buscador que responde igual de rápido y un grafo visual: nodos de proyectos, sesiones, archivos y temas conectados; busco "auth" y se ilumina el subgrafo relevante; clic en una sesión → su ficha (resumen, decisiones, archivos) y el botón "Importar contexto" hacia mi pane activo. Las fichas se generan solas (un llamado barato por sesión cuando termina de trabajar) y puedo apagarlas; sin fichas, la búsqueda estructural sigue funcionando. Todo es local.

## Functional requirements

### Índice de conocimiento

1. **FR-1 — Índice incremental:** el conocimiento se construye sobre los mismos transcripts locales que 005 (todas las sesiones de la máquina, solo lectura, temporales excluidos — FR-10b de 005) y de forma **incremental**: solo se procesa lo nuevo o cambiado. Sin servicios externos; llamadas a LLM solo vía el CLI de Claude.
2. **FR-2 — Estructura gratis:** de cada sesión se extraen, sin LLM, sus entidades estructurales: **archivos tocados** (leídos/editados/creados, con conteo), comandos ejecutados relevantes, rama git, proyecto/carpeta, título, fechas, herramientas usadas — más el **texto** indexado para búsqueda léxica.
3. **FR-3 — Fichas de conocimiento (automáticas):** cuando una sesión con actividad nueva queda inactiva (o termina), Hydra genera/actualiza **automáticamente** su **ficha**: resumen breve + 5–15 **hechos atómicos** (decisiones con su porqué, datos clave, estado, pendientes), cada hecho ligado a sus entidades (archivos, temas). Se genera con un único llamado al CLI con un modelo económico (mismo default y preferencia de modelo que ya existe: `haiku`, configurable). Hay un **toggle** para desactivar la generación automática y un botón para generar a demanda; el estado del índice muestra fichas hechas/pendientes y el costo estimado acumulado.
4. **FR-4 — Vigencia temporal:** los hechos llevan fecha; cuando una ficha nueva contradice o reemplaza un hecho anterior sobre las mismas entidades, el viejo queda **superseded** (no se borra) y la búsqueda prefiere el vigente, pudiendo mostrar el historial.
5. **FR-5 — Grafo:** el índice se materializa como un grafo consultable: nodos **proyecto / sesión / archivo / tema-entidad / hecho** y aristas por pertenencia y co-ocurrencia. Es la base de la búsqueda multi-salto ("este archivo se tocó en aquella sesión donde se decidió tal cosa") y del grafo visual.

### Búsqueda

6. **FR-6 — Consulta unificada:** una consulta en lenguaje libre (o un nombre de archivo/tema) devuelve resultados **ordenados por relevancia** combinando coincidencia de texto y cercanía en el grafo; filtrable por proyecto y por fecha. La misma búsqueda sirve al MCP y a la UI.
7. **FR-7 — Respuesta compacta:** cada resultado trae sesión (título, proyecto, fecha), los **hechos** relevantes (o snippet si no hay ficha) y las entidades que matchearon, con un identificador para pedir el detalle. La respuesta por defecto cabe en **menos de ~1 000 tokens**; el detalle de una sesión (ficha completa) se pide aparte.
8. **FR-8 — Sin fichas también funciona:** con el toggle apagado (o fichas aún no generadas), la búsqueda estructural+léxica devuelve resultados útiles (sesiones, archivos, snippets); las fichas solo mejoran la calidad del texto devuelto.

### Acceso para Claude (MCP)

9. **FR-9 — Server local:** Hydra sirve un **MCP server HTTP local** (solo loopback) con al menos dos herramientas: `search_past_work(query, project?, limit?)` → resultados compactos (FR-7), y `get_session_context(session_id)` → la ficha completa de esa sesión. Disponible para **cualquier** sesión de Claude Code de la máquina mientras Hydra esté abierta.
10. **FR-10 — Registro con consentimiento:** Hydra **no** toca la configuración de Claude Code sin permiso: la vista Graph Know ofrece "Conectar con Claude Code" que registra el server (alcance usuario) usando el propio CLI, muestra el estado (conectado/no), y permite desconectarlo. El puerto es estable entre aperturas para que el registro no se invalide.
11. **FR-11 — Hydra cerrada:** si Hydra no está corriendo, la herramienta simplemente no responde y Claude Code lo maneja como cualquier MCP caído (error claro, la sesión sigue); al abrir Hydra vuelve a estar disponible sin re-registrar.
12. **FR-12 — Solo local y solo lectura:** el server escucha únicamente en 127.0.0.1, no expone operaciones de escritura ni datos hacia afuera; las respuestas salen del índice local.

### UI — sección Graph Know

13. **FR-13 — Buscador:** el ítem **Graph Know** del sidebar (hoy deshabilitado) abre la vista en el área central (mismo mecanismo que Analytics): un buscador prominente con resultados en vivo (los mismos del MCP: sesión, hechos, archivos, score) y filtros por proyecto/fecha. Desde un resultado: ver ficha completa y **"Importar contexto"** al último pane con foco (reutiliza 004).
14. **FR-14 — Grafo visual navegable:** un canvas con el grafo (nodos por tipo con color/forma distinguible, aristas), con zoom/pan, filtros por tipo de nodo y **límite de nodos visibles** para que sea legible (nunca una bola de pelos: se parte de los nodos más relevantes y se expande por vecindario al hacer clic). Buscar resalta el subgrafo relevante; clic en un nodo → panel lateral con sus detalles (ficha/hechos para sesiones, sesiones que lo tocaron para archivos/temas) y acciones (importar contexto, ir al pane si está viva).
15. **FR-15 — Estado del índice:** la vista muestra sesiones indexadas, fichas generadas/pendientes, costo estimado acumulado de fichas, el toggle de generación automática, botón "Generar pendientes" y "Reindexar".

### Rendimiento y robustez

16. **FR-16 —** La búsqueda responde en **< 300 ms** con el índice caliente; la generación de fichas corre en segundo plano sin bloquear la UI ni las terminales; nunca más de una generación de ficha en vuelo.
17. **FR-17 —** Fallos del CLI al generar una ficha (modelo inválido, sin red) se registran y reintentan después; nunca rompen el índice ni la búsqueda. El índice se reconstruye si su caché está corrupto o cambia de versión.

## Non-goals

- **Embeddings / búsqueda vectorial** local: fase 2, solo si la búsqueda léxica+grafo muestra fallas reales de vocabulario.
- **Respuestas redactadas** por el MCP (el server devuelve hechos/snippets; redactar es trabajo de la sesión que consulta).
- **Inyección automática de contexto** sin que Claude o el usuario lo pidan.
- **Edición manual del grafo** (crear/borrar nodos o hechos a mano).
- **Memoria entre máquinas** o sincronización.
- **GraphRAG pesado** (comunidades + resúmenes jerárquicos con LLM), bases de grafos dedicadas.
- **Indexar contenido de archivos del disco** (solo lo que pasó por las conversaciones).

## Edge cases

- **Sesión sin ficha todavía** (recién terminada, toggle apagado, o el CLI falló): aparece en resultados con snippet estructural/léxico.
- **Sesiones enormes:** la ficha se genera igual (el CLI ya carga la conversación como en 004); si excede el tope de tiempo, se reintenta con la porción más reciente y se marca parcial.
- **Preferencia de modelo inválida:** error visible en el estado del índice, reintento tras corregir (como 004).
- **Dos ventanas/instancias de Hydra:** solo una sirve el MCP (el puerto ocupado lo decide); la otra lo indica.
- **El usuario borra transcripts:** los nodos/hechos de esas sesiones desaparecen del índice en el próximo escaneo.
- **Query vacía o sin resultados:** la UI y la tool devuelven vacío explicado, no error.
- **Registro MCP previo apuntando a un puerto viejo:** "Conectar" repara el registro.
- **Sesiones temporales:** excluidas del índice y del grafo (coherente con 005).

## Acceptance criteria

- **AC-1 (búsqueda desde Claude):** Given Hydra abierta con el índice construido y el MCP conectado, when en una sesión de Claude Code (fuera de Hydra) el usuario pide "buscá qué hicimos sobre <tema real>", then Claude invoca `search_past_work` y recibe ≤ N resultados compactos con sesión, proyecto, fecha y hechos relevantes, y la respuesta total de la tool queda bajo ~1 000 tokens; y `get_session_context` del mejor resultado devuelve la ficha completa.
- **AC-2 (calidad multi-salto):** Given un archivo que se tocó en la sesión A donde además se tomó una decisión, when busco por el nombre del archivo, then la sesión A aparece arriba y su resultado incluye la decisión (aunque la decisión no mencione el archivo textualmente).
- **AC-3 (fichas automáticas):** Given el toggle activado, when una sesión con actividad nueva queda inactiva, then en segundo plano aparece su ficha (resumen + hechos con entidades) sin que la UI ni las terminales se bloqueen, y el estado del índice refleja la ficha nueva y su costo estimado.
- **AC-4 (vigencia):** Given un hecho de la sesión vieja contradicho por una sesión nueva sobre el mismo tema, when busco ese tema, then el hecho vigente aparece primero y el viejo figura como reemplazado.
- **AC-5 (sin fichas):** Given el toggle apagado y sin fichas, when busco un término que aparece en transcripts, then igual obtengo las sesiones correctas con snippets y archivos.
- **AC-6 (conectar/desconectar):** Given Hydra abierta, when pulso "Conectar con Claude Code", then una sesión nueva de Claude lista el server y sus tools; when lo desconecto, then deja de aparecer; when cierro Hydra, then la tool falla con error claro y la sesión sigue funcionando; al reabrir Hydra la tool vuelve sin re-registrar.
- **AC-7 (buscador UI):** Given la vista Graph Know, when tipeo una consulta, then los resultados aparecen en < 300 ms con el índice caliente, filtrables por proyecto, y "Importar contexto" desde un resultado dispara el flujo de 004 hacia el último pane con foco.
- **AC-8 (grafo visual):** Given el grafo con cientos de nodos potenciales, then la vista inicial muestra un subgrafo legible (límite de nodos, tipos distinguibles); when busco, then se resalta el subgrafo relevante; when hago clic en un nodo sesión, then veo su ficha y acciones; expandir un nodo agrega sus vecinos sin congelar la UI.
- **AC-9 (robustez):** Given un fallo del CLI al generar una ficha, then el índice sigue sirviendo búsquedas, el error es visible y el reintento posterior la genera; given caché corrupto, then se reconstruye solo.
- **AC-10 (no rompe nada):** los AC de 001/002/004/005 siguen verdes; la generación de fichas no altera las sesiones origen (como 004: fork sin persistencia).

## Integration

- **Affected existing features:** 005 (el indexer/caché de transcripts se extiende con entidades, texto y fichas), 004 (importar contexto desde un resultado; comparte la preferencia de modelo económico), 001 (sidebar: ítem Graph Know; vista central como Analytics).
- **Shared interfaces touched:** contrato IPC (búsqueda, estado del índice, toggle, conectar/desconectar MCP), preferencias (`ui.graph`: toggle, modelo si se separa del de 004), caché del índice en userData.
- **Breaking changes:** ninguna.
- **Constitution:** requiere dos entradas en el decision log al aprobar el plan: (1) ampliar la cláusula de lectura de transcripts ("para analíticas **y Graph Know**"); (2) nueva superficie de integración con Claude Code: además del CLI y los hooks, Hydra **expone** un MCP server local que las sesiones consumen — registrado vía el propio CLI (`claude mcp add`) y solo con consentimiento del usuario.

## Open questions

- [x] Propósito: recuperación de contexto optimizada, no un visor (Juan, 2026-08-23).
- [x] Acceso de Claude: MCP server local **HTTP servido por Hydra** (Juan).
- [x] Fichas: **automáticas** con toggle (Juan).
- [x] UI: buscador + grafo visual navegable en la sección Graph Know (Juan).
- [x] **Auto-exclusión:** la tool excluye de los resultados a la sesión que consulta, cuando puede identificarla (aprobado 2026-08-23).
