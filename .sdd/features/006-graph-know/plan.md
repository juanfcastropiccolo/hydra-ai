# Plan: Graph Know — conocimiento y recuperación de contexto

Feature ID: 006
Status: planned (aprobado 2026-08-23)
Last updated: 2026-08-23
Base: spec 006 + investigación 2026-08-23 (informe en el historial de la sesión: GraphRAG/LightRAG/MiniRAG/HippoRAG/LazyGraphRAG/Zep-Graphiti/Mem0/A-MEM; conclusión: a 50–500 sesiones gana un híbrido léxico+grafo liviano con hechos destilados, no GraphRAG pesado).

## Chosen stack

| Necesidad | Elección | Por qué |
|---|---|---|
| Índice estructural | Extender el pipeline de 005: el reductor de transcripts gana una pasada de "conocimiento" — **archivos tocados** (inputs de Edit/Write/Read/NotebookEdit + primer token de comandos Bash), y una **bolsa de términos** por sesión (tokenización simple ES/EN, stopwords, term→freq) | Reusa streaming/offsets/caché ya probados; la bolsa por sesión pesa pocos KB (no duplicamos transcripts) |
| Búsqueda léxica | **BM25 propio en TS** (~80 líneas) con documento = sesión, sobre las bolsas de términos; snippets **bajo demanda** releyendo solo los transcripts del top-k | Cero deps; a esta escala (cientos de docs) es instantáneo; FTS5/better-sqlite3 traería binarios nativos sin necesidad |
| Grafo + multi-salto | Grafo en memoria (persistido en el caché): nodos proyecto/sesión/archivo/tema/hecho, aristas por pertenencia y co-ocurrencia; consulta = seeds léxicos → **Personalized PageRank** (power iteration, ~30 líneas) → score por sesión/hecho | Patrón HippoRAG/MiniRAG: multi-salto archivo↔sesión↔decisión sin LLM en consulta |
| Fusión | **RRF** (k=60) entre ranking BM25 y ranking PPR; filtros por proyecto/fecha antes de rankear | Estándar, robusto, sin tuning |
| Fichas | Generalizar `ClaudeCli.summarizeSession` (004) → `runPrompt` reutilizable; prompt fijo que pide **JSON** (resumen + hechos `{text, kind, entities[]}` + `superseded_ids` dados los hechos vigentes que se le pasan del mismo proyecto); parser tolerante con fixtures | Mismo mecanismo verificado en 004 (fork sin persistencia, origen intacta); haiku ≈ US$0.01–0.05/sesión |
| Disparador de fichas | El watcher del índice (005) detecta transcript con bytes nuevos; cuando la sesión correspondiente está `idle`/ausente del daemon por > 2 min → encola; **cola serial** (1 en vuelo), reintentos con backoff | FR-3/FR-16; nunca compite con el uso interactivo |
| MCP server | **`@modelcontextprotocol/sdk`** (streamable HTTP sobre `node:http`, bind 127.0.0.1, puerto persistido en prefs, default 4855) con tools `search_past_work` y `get_session_context` | **Única dependencia nueva de runtime**, mantenida por Anthropic; implementar el protocolo a mano es riesgo sin valor. Justificación registrada en decision log |
| Registro | `ClaudeCli` gana `mcpAdd/mcpRemove/mcpGet` (`claude mcp add --transport http hydra-know http://127.0.0.1:<port>/mcp -s user`) — solo desde el botón "Conectar" (FR-10) | El CLI es la fuente de verdad de su propia config |
| Auto-exclusión | Parámetro opcional `exclude_session_id` en la tool + la descripción de la tool instruye a pasarlo cuando la sesión conoce su id | El protocolo MCP no identifica al caller; es lo máximo honesto |
| UI | `GraphKnowView` en el área central (mismo mecanismo `centerView` de 005, ahora `'sessions'|'analytics'|'graph'`); buscador con resultados; **grafo SVG con force-layout propio** (~150 líneas, tope ~120 nodos visibles, expansión por vecindario); panel de detalles; estado del índice | Sin d3: a ≤120 nodos un layout simple rinde y mantiene el estilo |
| Prefs | `ui.know: { autoCards: boolean (true), port: number (4855) }`; modelo de fichas comparte `ui.importContext.model` | FR-3/FR-9; una sola pref de modelo económico en toda la app |
| Persistencia | `know-index.json` en userData (versionado, atómico, igual que 005): bolsas de términos, archivos, grafo, fichas/hechos | Constitution: JSON, no DB |
| Tests | Vitest unit (tokenizer, BM25, PPR, RRF, grafo, parser de fichas, supersede, cola), integración (índice sobre fixtures; ficha con CLI real; MCP por HTTP con cliente JSON-RPC crudo), Playwright (vista, búsqueda, grafo, conectar con CLI falso) | Constitution |

## Architecture overview

```
Main                                                              Renderer
┌────────────────────────────────────────────────┐                ┌──────────────────────────────────────┐
│ KnowIndexer (extiende pipeline 005)             │                │ Sidebar [Graph Know] → centerView     │
│  reduce+: filesTouched, termBag                 │◄─know.open────│ GraphKnowView                         │
│  KnowGraph: build(nodes,edges) · ppr(seeds)     │──know.status──►│  SearchBox → know.search {query,…}    │
│  Bm25 · rrf · snippets(top-k, on demand)        │◄─know.search──│  Results (hechos/snippets, importar   │
│ CardQueue: sesión quieta+bytes nuevos → encola  │──know.changed─►│    contexto→004, ir al pane)          │
│  ClaudeCli.runPrompt (fork -p haiku, JSON)      │                │  GraphCanvas (SVG force, ≤120 nodos,  │
│  parseCard → facts + superseded_ids             │                │    expandir vecinos, resaltar match)  │
│ KnowMcpServer (@modelcontextprotocol/sdk)       │                │  IndexStatus (fichas, costo, toggle,  │
│  http 127.0.0.1:4855/mcp                        │                │    Conectar/Desconectar MCP)          │
│  search_past_work / get_session_context ───────►│ (misma función de búsqueda que la UI)                 │
│ ClaudeCli.mcpAdd/Remove/Get  ◄──know.connect────│                └──────────────────────────────────────┘
└────────────────────────────────────────────────┘
```

**Flujos clave**

- **Índice:** `know.open` reusa el escaneo incremental (mismo watcher/offsets que 005; una sola lectura de disco alimenta ambos índices). La bolsa de términos y archivos tocados se guardan por sesión en `know-index.json`; el grafo se reconstruye en memoria al cargar (barato).
- **Búsqueda:** `search(query, {project?, from?, to?, excludeSessionId?, limit=5})` → tokenizar → seeds (archivos/temas/términos que matchean nodos) → BM25 + PPR → RRF → para el top-k, armar resultado: hechos vigentes cuyas entidades matchean (si hay ficha) o snippet (regrep del transcript, acotado) + metadatos. Presupuesto de salida acotado por caracteres (~4 000 ≈ 1K tokens).
- **Fichas:** cola serial; prompt pide JSON estricto (`--output-format json` + instrucción); se le pasan los hechos vigentes del proyecto (compactos) para que devuelva `superseded_ids`; resultado parseado tolerante (JSON dentro de texto, como `parsePrintJson`). Ficha guardada con `generatedAt`, `sourceLastTs` (si el transcript creció después, la sesión queda "pendiente" de nuevo). Costo estimado acumulado con la tabla de precios de 005.
- **MCP:** server arranca con Hydra (si el puerto está tomado por otra instancia, se informa y no se sirve); `initialize/tools-list/tools-call` los maneja el SDK; los handlers llaman a la misma `search`. Respuestas como texto compacto formateado (no JSON gigante).
- **Conectar:** botón → `mcpGet('hydra-know')` para estado → `mcpAdd`/`mcpRemove`; si el registro apunta a un puerto viejo, `mcpAdd` lo repara (remove+add).
- **UI grafo:** vista inicial = top nodos por grado/actividad reciente (≤120); fuerza: repulsión + resortes por arista, 300 iteraciones en un worker de rAF; clic expande vecinos; búsqueda resalta el subgrafo del top-k y atenúa el resto.

## Data model

```ts
// know-index.json (userData, versionado, atómico)
{ version: 1, sessions: Record<sessionId, {
    termBag: Record<term, number>; files: Record<path, number>; commands: string[];
    card?: { summary: string; facts: Fact[]; generatedAt: number; sourceLastTs: number; model: string; costUsd?: number }
  }> }
interface Fact { id: string; text: string; kind: 'decision'|'dato'|'estado'|'pendiente'; entities: string[]; ts: number; supersededBy?: string }
```
Prefs (`hydra.json`): `ui.know?: { autoCards: boolean; port: number }` (defaults `{ autoCards: true, port: 4855 }`); `ui.centerView` gana `'graph'`.
IPC nuevo: `know.open/close/status/search/toggleAutoCards/generatePending/reindex/connectMcp/disconnectMcp`; eventos `know.status` (índice, cola, costo, mcp), `know.changed`.
Módulos: `src/main/know/{know-indexer.ts, term-bag.ts, bm25.ts, graph.ts (build+ppr), rrf.ts, snippets.ts, card-queue.ts, card-prompt.ts, parse-card.ts, mcp-server.ts}`, `src/shared/know/types.ts`, `src/renderer/src/store/know-slice.ts`, `src/renderer/src/components/know/{GraphKnowView, SearchResults, GraphCanvas, IndexStatus}`.

## External dependencies

- **`@modelcontextprotocol/sdk`** (runtime, nueva — ver decision log al aprobar).
- CLI `claude` con `mcp add/remove/get` y `-p --resume --fork-session` (ya verificado en 004).

## Trade-offs considered

- **BM25+PPR+RRF (elegido) vs. embeddings locales.** La evidencia (BM25 Wins at Scale; Han 2025) dice que a esta escala el híbrido léxico+grafo cubre; embeddings agregan ~100 MB de modelo ONNX y complejidad. Queda como fase 2 con criterio de entrada: fallas de vocabulario reales en 20–30 queries de prueba.
- **Doc = sesión (elegido) vs. chunks.** Con fichas devolviendo el texto fino, rankear sesiones alcanza y el índice queda 100× más chico; los snippets por regrep cubren el caso sin ficha.
- **SDK MCP oficial (elegido) vs. protocolo a mano.** Primera dep de runtime del proyecto; se justifica: protocolo con versiones/transports en evolución, SDK de Anthropic. Alternativa rechazada: stdio standalone (funciona sin Hydra pero duplica el runtime del índice; la spec ya decidió HTTP).
- **Supersede vía el mismo call de ficha (elegido) vs. pasada LLM dedicada (Mem0-style ADD/UPDATE/DELETE).** Un solo call por sesión mantiene el costo lineal; el precio es que solo se invalida contra los hechos vigentes del mismo proyecto que se le pasan (acotados a ~30). Suficiente para v1.
- **Force-layout propio (elegido) vs. d3-force.** ≤120 nodos visibles no ameritan la dep; el layout es 150 líneas testeables.
- **Puerto fijo persistido (elegido) vs. aleatorio.** El registro MCP guarda la URL; un puerto estable evita re-registrar.

## Risks

1. **Calidad de búsqueda** (el riesgo real de la feature): mitigación = set de 20–30 queries reales de Juan como test de aceptación manual en QA; si el léxico falla por vocabulario, entra la fase 2 (embeddings) como feature aparte.
2. **JSON de las fichas mal formado** (haiku): parser tolerante + reintento único con "solo JSON"; ficha fallida no rompe nada (FR-17).
3. **`@modelcontextprotocol/sdk` en Electron main:** verificar en el task 1 que empaqueta bien (sin binarios); si trae problemas, fallback a implementar streamable HTTP mínimo a mano (el contrato de tools es nuestro).
4. **Costo de fichas en el primer índice** (backfill de ~25+ sesiones reales): el backfill inicial pide confirmación en la UI ("Generar N fichas ≈ $X") en vez de arrancar solo; después sí es automático por sesión nueva.
5. **Dos instancias de Hydra:** el segundo bind falla → estado "MCP servido por otra instancia"; sin crash.
6. **Registro MCP huérfano** (Hydra desinstalada): documentado en README (`claude mcp remove hydra-know`).

## Test plan

- **Unit:** tokenizer (ES/EN, stopwords, rutas/símbolos como términos), BM25 (ranking conocido), PPR (grafo de juguete: multi-salto sube al vecino correcto), RRF, build del grafo desde el índice, `parseCard` (fixtures: JSON limpio, JSON en texto, roto), supersede (ids aplicados, vigentes primero), cola de fichas (serial, backoff, sesión que crece re-encola), presupuesto de salida (~4 000 chars), prefs `ui.know`.
- **Integración:** índice know sobre las fixtures de 005 (archivos tocados y términos esperados); **ficha real** con CLI (`integration`): sesión `-p` con hechos plantados → JSON parseado con los hechos; **MCP por HTTP**: levantar el server en puerto efímero y hacer `initialize` + `tools/call search_past_work` con un cliente JSON-RPC crudo → respuesta compacta correcta; `mcpAdd/Get/Remove` contra el CLI real (scope user, con cleanup).
- **E2E (fakes):** vista Graph Know: búsqueda sobre índice sembrado (resultados, filtro, importar contexto dispara el flujo 004), grafo renderiza ≤120 nodos y expande al clic, estado del índice + toggle, botón Conectar con `FakeClaudeCli.mcpAdd` registrado.
- **Manual (`docs/qa-006.md`):** AC-1 punta a punta desde una sesión de Claude real fuera de Hydra; set de queries reales de Juan (calidad); backfill con confirmación de costo; Hydra cerrada → error claro en la tool.
