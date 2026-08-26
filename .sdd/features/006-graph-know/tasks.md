# Tasks: Graph Know — conocimiento y recuperación de contexto

Feature ID: 006
Status: complete (2026-08-26, v1)
Last updated: 2026-08-23

Convenciones: un task ≈ un commit (Conventional Commits), tests en el mismo task que el código. Ningún task se marca `[x]` con tests rojos. Los AC de 001/002/004/005 (unit + E2E) siguen verdes en cada task.

## Fase 1 — Búsqueda pura (shared/main, sin LLM ni red)

- [x] **1.** Tipos + prefs + dep: `src/shared/know/types.ts` (`Fact`, `SessionKnowledge`, `KnowSearchHit`, `KnowStatus`, `KnowSearchQuery`), `ui.know { autoCards: true, port: 4855 }` validado en `ProjectStore`, `ui.centerView` gana `'graph'`; instalar `@modelcontextprotocol/sdk` y **verificar que empaqueta** en `Hydra.app` (riesgo 3: `npm run package` + arranque) — done when: typecheck/lint verdes; unit de ProjectStore; app empaquetada arranca con el SDK importado en main.
- [x] **2.** `src/main/know/term-bag.ts`: tokenizador ES/EN (minúsculas, sin acentos, stopwords de ambos idiomas, conserva rutas `src/foo.ts`, símbolos `camelCase`→partes+entero, números fuera) + `termBagFrom(texts)` — done when: unit tests con textos mixtos, rutas, código.
- [x] **3.** Extender el reductor de 005 con la pasada de conocimiento: `filesTouched` (inputs `file_path` de Edit/Write/Read/NotebookEdit; conteo), `commands` (primer token de Bash, deduplicado, tope 50), `termBag` acumulada (prompts del usuario + texto del asistente, tope de términos) — el estado sigue siendo JSON serializable y el caché de 005 **bumpea versión** — done when: unit sobre las fixtures existentes (archivos/comandos/términos esperados); tests de 005 siguen verdes; tamaño del estado por sesión < 30 KB con la fixture real.
- [x] **4.** `bm25.ts` (doc = sesión, sobre termBags; k1=1.2 b=0.75), `graph.ts` (build: nodos proyecto/sesión/archivo/tema/hecho + aristas; `ppr(seeds, alpha=0.15, iters≤30)`), `rrf.ts` — done when: unit: ranking BM25 conocido; PPR en grafo de juguete rankea el multi-salto correcto (archivo→sesión→hecho); RRF fusiona como se espera; PPR de 5 000 nodos < 50 ms.
- [x] **5.** `know-search.ts`: `search(index, graph, q)` → seeds léxicos + BM25 + PPR + RRF + filtros (proyecto/fechas/exclude) + armado de hits (hechos vigentes que matchean o marca "necesita snippet") + presupuesto ~4 000 chars; `snippets.ts` (regrep acotado del transcript para el top-k) — done when: unit con índice sintético (10 sesiones): AC-2 (multi-salto) y AC-5 (sin fichas) reproducidos; presupuesto respetado.
- [x] **6.** `KnowIndexer`: integra la pasada de conocimiento al escaneo incremental de 005 (una sola lectura alimenta ambos), persiste `know-index.json` (versionado/atómico), expone `status()`/`search()`/`reindex()` — done when: integración sobre las fixtures en temp (índice correcto, incremental: apéndice → solo delta, corrupto → rebuild); temporales excluidos.

## Fase 2 — Fichas (LLM)

- [x] **7.** `card-prompt.ts` (prompt fijo: JSON con `summary`, `facts[{text,kind,entities}]`, `superseded_ids`, en el idioma de la conversación) + `parse-card.ts` (tolerante: JSON en texto, campos faltantes; fixtures) + `ClaudeCli.runPrompt` (generalización de `summarizeSession`; 004 pasa a usarla) — done when: unit de parser y args del CLI; tests de 004 siguen verdes.
- [x] **8.** `card-queue.ts`: detecta sesiones con `sourceLastTs` viejo + estado quieto (idle o ausente del daemon > 2 min), cola serial, reintento con backoff, costo estimado por ficha (tabla 005), respeta `autoCards`; **backfill inicial requiere confirmación** (`know.generatePending` con `{estimate}` → UI confirma) — done when: unit con CLI falso (orden, 1 en vuelo, backoff, re-encolado si el transcript creció, toggle off = solo manual); integración con CLI real (`integration`): ficha de una sesión `-p` con hechos plantados → JSON correcto, origen intacta.
- [x] **9.** Supersede + vigencia: al guardar una ficha se aplican `superseded_ids`; `search` prefiere vigentes y anota reemplazados — done when: unit AC-4.

## Fase 3 — MCP

- [x] **10.** `mcp-server.ts` con el SDK: streamable HTTP en `127.0.0.1:<pref>`, tools `search_past_work(query, project?, limit?, exclude_session_id?)` y `get_session_context(session_id)` con descripciones cuidadas; respuestas texto compacto; puerto tomado → estado "otra instancia" — done when: integración: server en puerto efímero + cliente JSON-RPC crudo hace `initialize`/`tools/list`/`tools/call` y valida contenido y tope de tamaño.
- [x] **11.** `ClaudeCli.mcpAdd/mcpGet/mcpRemove` (+ fake) e IPC `know.connectMcp/disconnectMcp/status` — done when: unit de args; integración real (`integration`): add → get lo muestra → remove lo saca (scope user, nombre `hydra-know`, con cleanup en afterAll).
- [x] **12.** Wiring en `AppContext` (server arranca con la app si el índice existe; `dispose` lo baja) + IPC `know.*` completo — done when: probe con driver real: `claude mcp list` ve `hydra-know` tras conectar; una sesión `-p` real invoca `search_past_work` vía MCP y recibe resultados (pre-AC-1).

## Fase 4 — UI

- [x] **13.** Slice `know-slice` + `GraphKnowView` (centerView `'graph'`, Sidebar habilita el ítem): buscador con resultados en vivo (debounce 150 ms), filtros, acciones (ficha completa, "Importar contexto" → 004 hacia `lastFocusedSessionId`, "ir al pane" si viva) — done when: unit del slice; AC-7 a mano en dev.
- [x] **14.** `IndexStatus`: sesiones/fichas/pendientes, costo acumulado, toggle autoCards, "Generar pendientes" con confirmación de costo, "Reindexar", estado y botones MCP (Conectar/Desconectar/servido por otra instancia) — done when: AC-3/AC-6 (parte UI) a mano.
- [x] **15.** `GraphCanvas`: force-layout propio (≤120 nodos, tipos con color/forma de la paleta 005, aristas), zoom/pan, clic = panel de detalles + expandir vecinos, búsqueda resalta subgrafo — done when: unit del layout (converge, sin NaN); AC-8 a mano con el índice real.

## Fase 5 — Tests y cierre

- [x] **16.** E2E (`e2e/08-graph-know.spec.ts`): índice sembrado vía fixtures de transcripts (reusa el seeder de 07) + fichas sembradas en `know-index.json`; buscar → resultados correctos; grafo renderiza y expande; toggle y estado; Conectar llama al fake CLI; importar contexto escribe en el pane (writes del PTY falso) — done when: verde; 01–07 verdes.
- [x] **17.** QA manual `docs/qa-006.md`: AC-1 real desde una sesión de Claude fuera de Hydra; **set de 20–30 queries reales de Juan** con veredicto de calidad (el riesgo 1); backfill con costo; Hydra cerrada → error claro; look del grafo — done when: checklist completo por Juan; fallos → tasks de fix.
- [x] **18.** Cierre: README (sección Graph Know + nota `claude mcp remove hydra-know` al desinstalar), CLAUDE.md (módulos `know/`, reglas), `.sdd/README.md`, `status.json` → complete, bump 0.5.0 + tag `v0.5.0` — done when: hecho y pusheado.

## Traceability

| Task | FR | AC |
|------|----|----|
| 1 | FR-3, FR-9, FR-13 | — |
| 2–3 | FR-1, FR-2 | AC-5 |
| 4–5 | FR-5, FR-6, FR-7, FR-8 | AC-2, AC-5 |
| 6 | FR-1, FR-16, FR-17 | AC-9 |
| 7–8 | FR-3, FR-16, FR-17 | AC-3, AC-9, AC-10 |
| 9 | FR-4 | AC-4 |
| 10 | FR-9, FR-7, FR-12 | AC-1 |
| 11–12 | FR-10, FR-11 | AC-1, AC-6 |
| 13 | FR-13, FR-6 | AC-7 |
| 14 | FR-3, FR-10, FR-15 | AC-3, AC-6 |
| 15 | FR-14 | AC-8 |
| 16 | — | AC-3/5/6/7/8 (automatizados) |
| 17 | — | AC-1, AC-2, AC-4 + calidad |
| 18 | — | — |
