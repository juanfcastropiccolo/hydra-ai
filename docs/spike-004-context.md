# Spike 004 — Importar el contexto de otra sesión

Fecha: 2026-08-23 · Claude Code 2.1.241 · macOS 14 · scripts en `spikes/import-context/` (desechables).

## Preguntas

1. ¿Qué hay en el transcript `.jsonl` de una sesión y cómo se ubica a partir de lo que Hydra ya conoce?
2. ¿Cómo obtener el "contexto compactado" de una sesión viva sin tocarla?
3. ¿Cómo inyectarlo en otra sesión viva sin romperla?

## 1. Transcripts

- Ruta: `~/.claude/projects/<cwd con "/" y "." → "-">/<sessionId>.jsonl`. `claude agents --json` ya devuelve `cwd` y `sessionId` por sesión (background **e interactivas**), así que Hydra puede derivar la ruta sin configuración extra. Verificado: `/private/tmp/a.b/c` → `-private-tmp-a-b-c`.
- Es JSONL con un objeto por línea. Tipos observados en 79 transcripts de esta máquina: `user`, `assistant` (con `message.content` en formato API: text / thinking / tool_use / tool_result), `attachment`, `system` (subtipos `turn_duration`, `stop_hook_summary`, `away_summary`, `local_command`, `compact_boundary`…), `file-history-snapshot`, `queue-operation`, `last-prompt`, `ai-title`, `custom-title`, `mode`, `permission-mode`, `atis-latch`. Los mensajes encadenan por `uuid`/`parentUuid`. Los `user` con `isMeta: true` son contexto inyectado por el CLI (skills, hooks), no texto del usuario.
- Los transcripts reales pesan desde 50 KB hasta 15 MB (la sesión actual de este repo). Cualquier lectura debe ser streaming y tolerante a líneas rotas (el archivo se escribe mientras la sesión corre).

## 2. El contexto compactado

- `/compact` (manual o automático) escribe dos entradas: `system` con `subtype: "compact_boundary"` (incluye `compactMetadata`: `trigger`, `preTokens`, `postTokens`, uuids preservados) y a continuación un `user` con **`isCompactSummary: true`** cuyo `message.content` es el resumen completo ("This session is being continued from a previous conversation… Summary: 1. Primary Request and Intent…"). Verificado ejecutando `/compact` en una sesión de prueba.
- **Pero no se puede contar con que exista**: de los 79 transcripts de esta máquina, **ninguno** tenía una compactación (el resumen de "context management" de sesiones largas no queda en el `.jsonl`). Y no hay forma de pedirle al CLI que compacte otra sesión sin escribirle a su PTY (`/compact` en la sesión origen la modifica y le cuesta un turno al usuario).
- **Lo que sí funciona, sin tocar la sesión origen:**
  ```
  claude -p --resume <sessionId> --fork-session --no-session-persistence \
         --model haiku --output-format json "Generá un resumen de traspaso…"
  ```
  ejecutado con `cwd` = el `cwd` de la sesión origen. Carga toda la conversación, responde con el resumen en `result`, **no escribe ningún transcript nuevo** (sin `--no-session-persistence` deja un `<uuid>.jsonl` huérfano que después ensucia `/resume`) y **no altera el de la origen** (mismo número de líneas antes/después). Funciona aunque la sesión origen esté viva y adjunta desde una PTY. Medido: 8–14 s y US$0.02–0.03 con `haiku` sobre una conversación corta; el costo escala con el tamaño de la conversación (un transcript de 15 MB será caro con opus/fable → el modelo del resumen debe ser configurable, default `haiku` o `sonnet`).
- Calidad: el resumen generado en el fork recordó datos puntuales (palabra clave, decisiones, pendientes) y el destino los recuperó después. Suficiente para el caso de uso.
- `claude agents --json --all` no lista las ejecuciones `-p`, así que el fork no aparece como sesión fantasma en Hydra.

## 3. Inyección en la sesión destino

- `claude` no tiene un comando para enviar un prompt a una sesión background (`claude send` no existe; `agents` solo lista/gestiona). La única vía es la PTY de `attach`, que Hydra ya tiene por pane.
- Verificado con node-pty: escribir el texto envuelto en **bracketed paste** (`ESC[200~ … ESC[201~`) y luego `\r` entrega un texto multilínea como **un solo mensaje de usuario**, intacto, y la sesión responde. La TUI lo muestra como un pegado (texto largo se colapsa en "[Pasted text #1 +N lines]"), igual que si el usuario lo hubiera pegado a mano.
- **Hallazgo importante — el encuadre del texto:** con un wrapper imperativo ("Contexto importado… Respondé únicamente: ok") Haiku lo clasificó como **intento de inyección de prompt y lo rechazó**. Con un wrapper en primera persona del usuario ("Te comparto, como contexto de referencia, el resumen de otra sesión mía de Claude Code llamada X. No hay que ejecutar nada; confirmá en una línea que lo leíste." + `<imported-context session="X">…</imported-context>`) lo aceptó y lo usó. El wrapper es parte del diseño, no un detalle.
- Riesgos operativos a cubrir en la spec: si el destino está **trabajando**, el pegado entra a la cola de prompts de Claude Code (ok); si está **bloqueado en un diálogo de permisos** o en un selector, el texto caería dentro del diálogo → Hydra debe permitir importar solo con destino `idle` (SessionWatcher ya conoce el estado) o avisar. El usuario ve el texto antes de que se envíe si Hydra pega sin `\r` y deja que él confirme con Enter (opción más segura, a decidir en la spec).

## Alternativas descartadas

- `claude --resume <src> --fork-session` **interactivo** como sesión nueva: clona toda la conversación, pero no sirve para "agregar contexto a una sesión ya existente" (reemplaza, no suma) y no es background.
- `--append-system-prompt`: solo al crear la sesión; no aplica a una sesión viva.
- Leer el `.jsonl` y resumir nosotros (sin LLM): tendríamos el texto crudo, no un resumen; y llamar a la API directamente desde Hydra rompe el principio "el CLI es la fuente de verdad" y agrega credenciales. El fork `-p` usa la auth y el modelo del usuario.

## Recomendación

1. **Fuente del contexto:** si el transcript de la origen tiene un `isCompactSummary` reciente (posterior al último mensaje del usuario… o simplemente el último), ofrecerlo como opción gratis/instantánea; si no (caso normal), generar el resumen con `claude -p --resume --fork-session --no-session-persistence --model <configurable>` en el `cwd` de la origen, con un prompt de traspaso fijo (objetivo, decisiones, datos clave, estado, pendientes).
2. **Lista de sesiones:** las de `claude agents --json` (lo que ya muestra Hydra), excluyendo el destino; mostrar nombre, proyecto y estado.
3. **Inyección:** bracketed paste por la PTY del pane destino, con wrapper en primera persona + bloque `<imported-context>`; solo cuando el destino está `idle`; mostrar progreso (el resumen tarda 10–30 s) y error claro si el fork falla.
4. Tamaño: cortar el resumen si supera N KB (a definir) y advertir si la origen es enorme (costo).

## Veredicto

**GO.** Todo lo necesario existe en el CLI actual y se puede hacer sin persistir nada nuevo ni tocar la sesión origen. Con esto se puede escribir la spec de la feature 004 con los pies en la tierra. Riesgo principal: dependencia de flags de `claude -p` (`--fork-session`, `--no-session-persistence`) y del formato del `.jsonl`, que no son contrato público; el plan debe aislar eso en `src/main/claude/` con fixtures, como ya se hace con `agents --json`.
