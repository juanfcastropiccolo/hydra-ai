// Feature 006: the Graph Know view — search over the knowledge index, index status/MCP controls
// and the navigable graph. Same data as the MCP tools.
import { useEffect, useMemo, useRef } from 'react'
import type { KnowSearchHit } from '@shared/know/types'
import { hydra } from '../../lib/hydra-client'
import { runImport } from '../../lib/import-flow'
import { useAppStore } from '../../store/app-store'
import { knowStore, useKnow } from '../../store/know-slice'
import { fmtDateTime, fmtUsd } from '../analytics/formatters'
import { GraphCanvas } from './GraphCanvas'
import { KIND_LABEL } from './node-kinds'
import styles from './know.module.css'

const KIND_ES: Record<string, string> = {
  decision: 'decisión',
  dato: 'dato',
  estado: 'estado',
  pendiente: 'pendiente'
}

export function GraphKnowView(): React.JSX.Element {
  const status = useKnow((s) => s.status)
  const query = useKnow((s) => s.query)
  const hits = useKnow((s) => s.hits)
  const searching = useKnow((s) => s.searching)
  const graph = useKnow((s) => s.graph)
  const highlight = useKnow((s) => s.highlight)
  const selectedNode = useKnow((s) => s.selectedNode)
  const openSessionId = useKnow((s) => s.openSessionId)
  const openCard = useKnow((s) => s.openCard)
  const error = useKnow((s) => s.error)
  const sessions = useAppStore((s) => s.sessions)
  const lastFocused = useAppStore((s) => s.lastFocusedSessionId)
  const setCenterView = useAppStore((s) => s.setCenterView)
  const focus = useAppStore((s) => s.focus)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const offs = [hydra.onKnowStatus((st) => knowStore.getState().setStatus(st))]
    hydra
      .knowOpen()
      .then((st) => knowStore.getState().setStatus(st))
      .catch((e: Error) => knowStore.getState().setError(e.message))
    void hydra.knowGraph({}).then((g) => knowStore.getState().setGraph(g))
    return () => offs.forEach((off) => off())
  }, [])

  // status changes (new cards, rescans) refresh the graph lazily
  const cardsDone = status?.cardsDone ?? 0
  const indexed = status?.indexedSessions ?? 0
  useEffect(() => {
    if (!indexed) return
    void hydra.knowGraph({}).then((g) => knowStore.getState().setGraph(g))
  }, [indexed, cardsDone])

  const search = (q: string): void => {
    knowStore.getState().setQuery(q)
    if (debounce.current) clearTimeout(debounce.current)
    if (!q.trim()) {
      knowStore.getState().setHits([], q)
      knowStore.getState().setHighlight([])
      return
    }
    knowStore.getState().setSearching(true)
    debounce.current = setTimeout(() => {
      hydra
        .knowSearch({ query: q, limit: 8 })
        .then((h) => knowStore.getState().setHits(h, q))
        .catch((e: Error) => knowStore.getState().setError(e.message))
    }, 150)
  }

  const openSession = (sessionId: string): void => {
    void hydra.knowCard(sessionId).then((card) => knowStore.getState().openSession(sessionId, card))
  }
  const expandNode = (id: string): void => {
    void hydra.knowGraph({ expand: [id] }).then((g) => knowStore.getState().mergeGraph(g))
    if (id.startsWith('s:')) openSession(id.slice(2))
  }
  const importContext = (hit: KnowSearchHit): void => {
    const target = lastFocused
    if (!target) {
      knowStore.getState().setError('No hay un pane de destino: enfocá una terminal primero.')
      return
    }
    setCenterView('sessions')
    void hydra.setCenterView('sessions')
    void runImport(target, { sessionId: hit.sessionId, name: hit.title })
  }
  const goToPane = (sessionId: string): void => {
    setCenterView('sessions')
    void hydra.setCenterView('sessions')
    focus(sessionId)
  }
  const liveIds = useMemo(() => new Set(sessions.map((s) => s.sessionId)), [sessions])

  return (
    <div className={styles.view} data-testid="know-root">
      <header className={styles.header}>
        <div>
          <h1 className={styles.h1}>Graph Know</h1>
          <p className={styles.subtitle}>Buscá en todo tu trabajo pasado con Claude Code</p>
        </div>
        <IndexStatusBar />
      </header>
      {error && (
        <div className={styles.error} role="alert">
          {error}
          <button className={styles.linkBtn} onClick={() => knowStore.getState().setError(null)}>
            cerrar
          </button>
        </div>
      )}
      <input
        className={styles.search}
        placeholder="¿Qué estás buscando? (tema, archivo, decisión, comando…)"
        value={query}
        onChange={(e) => search(e.target.value)}
        autoFocus
        data-testid="know-search"
      />
      <div className={styles.columns}>
        <div className={styles.results} data-testid="know-results">
          {searching && <div className={styles.muted}>Buscando…</div>}
          {!searching && query.trim() && hits.length === 0 && (
            <div className={styles.muted} data-testid="know-empty">
              Sin resultados para «{query}».
            </div>
          )}
          {hits.map((h) => (
            <article key={h.sessionId} className={styles.hit} data-testid="know-hit">
              <header className={styles.hitHead}>
                <button className={styles.hitTitle} onClick={() => openSession(h.sessionId)}>
                  {h.title}
                </button>
                {liveIds.has(h.sessionId) && (
                  <span className={styles.liveDot} title="Sesión viva" />
                )}
              </header>
              <div className={styles.hitMeta}>
                {h.projectLabel} · {fmtDateTime(h.firstTs)}
              </div>
              {h.facts.map((f) => (
                <div key={f.id} className={styles.fact}>
                  <span className={styles.factKind}>{KIND_ES[f.kind] ?? f.kind}</span> {f.text}
                </div>
              ))}
              {h.replaced.map((f) => (
                <div key={f.id} className={`${styles.fact} ${styles.factOld}`}>
                  <span className={styles.factKind}>reemplazado</span> {f.text}
                </div>
              ))}
              {h.snippet && <div className={styles.snippet}>{h.snippet}</div>}
              <div className={styles.hitActions}>
                <button onClick={() => importContext(h)} data-testid="know-import">
                  Importar contexto
                </button>
                {liveIds.has(h.sessionId) && (
                  <button onClick={() => goToPane(h.sessionId)} data-testid="know-goto">
                    Ir al pane
                  </button>
                )}
                <button onClick={() => openSession(h.sessionId)}>Ficha</button>
              </div>
            </article>
          ))}
        </div>
        <aside className={styles.panel} data-testid="know-panel">
          {openSessionId ? (
            <SessionPanel
              sessionId={openSessionId}
              card={openCard}
              liveIds={liveIds}
              onGoTo={goToPane}
            />
          ) : selectedNode ? (
            <NodePanel nodeId={selectedNode} onOpenSession={openSession} />
          ) : (
            <div className={styles.muted}>
              Elegí un resultado o un nodo del grafo para ver el detalle.
            </div>
          )}
        </aside>
      </div>
      {graph && graph.nodes.length > 0 && (
        <section className={styles.graphSection}>
          <GraphCanvas
            graph={graph}
            highlight={highlight}
            selected={selectedNode}
            onSelect={(id) => {
              knowStore.getState().selectNode(id)
              if (id?.startsWith('s:')) openSession(id.slice(2))
              else knowStore.getState().openSession(null, null)
            }}
            onExpand={expandNode}
          />
        </section>
      )}
    </div>
  )
}

function IndexStatusBar(): React.JSX.Element | null {
  const status = useKnow((s) => s.status)
  if (!status) return <div className={styles.muted}>Cargando índice…</div>
  const mcpLabel =
    status.mcp.state === 'serving'
      ? status.mcp.registered
        ? 'MCP conectado'
        : 'MCP sirviendo (sin conectar)'
      : status.mcp.state === 'port-taken'
        ? 'MCP en otra instancia'
        : 'MCP apagado'
  return (
    <div className={styles.statusBar} data-testid="know-status">
      <span>
        {status.indexedSessions} sesiones · {status.cardsDone} fichas
        {status.cardsPending > 0 && ` · ${status.cardsPending} pendientes`}
        {status.generating && ' · generando…'}
        {status.estCostUsd > 0 && ` · ${fmtUsd(status.estCostUsd)} est.`}
      </span>
      <label
        className={styles.toggle}
        title="Generar fichas automáticamente cuando una sesión termina"
      >
        <input
          type="checkbox"
          checked={status.autoCards}
          onChange={(e) =>
            void hydra
              .knowSetPrefs({ autoCards: e.target.checked })
              .then(() => hydra.knowStatus())
              .then((st) => knowStore.getState().setStatus(st))
          }
          data-testid="know-autocards"
        />
        fichas automáticas
      </label>
      {status.cardsPending > 0 && (
        <button
          className={styles.ghostBtn}
          title={`Generar ${status.cardsPending} fichas pendientes (~${fmtUsd(status.cardsPending * 0.03)})`}
          onClick={() => {
            if (
              window.confirm(
                `Generar ${status.cardsPending} fichas con el modelo económico (~${fmtUsd(status.cardsPending * 0.03)} estimado)?`
              )
            )
              void hydra.knowGeneratePending()
          }}
          data-testid="know-generate"
        >
          Generar pendientes
        </button>
      )}
      <button
        className={styles.ghostBtn}
        onClick={() =>
          void (status.mcp.registered ? hydra.knowDisconnectMcp() : hydra.knowConnectMcp()).then(
            (st) => knowStore.getState().setStatus(st)
          )
        }
        title={
          status.mcp.registered
            ? 'Quitar hydra-know de la config de Claude Code'
            : 'Registrar hydra-know en Claude Code (todas tus sesiones ganan search_past_work)'
        }
        data-testid="know-mcp-toggle"
      >
        {status.mcp.registered ? 'Desconectar MCP' : 'Conectar con Claude Code'}
      </button>
      <span className={styles.muted} data-testid="know-mcp-state">
        {mcpLabel}
      </span>
      {status.lastError && (
        <span className={styles.warnNote} title={status.lastError}>
          ⚠ ficha con error
        </span>
      )}
    </div>
  )
}

function SessionPanel({
  sessionId,
  card,
  liveIds,
  onGoTo
}: {
  sessionId: string
  card: import('@shared/know/types').SessionCard | null
  liveIds: ReadonlySet<string>
  onGoTo: (id: string) => void
}): React.JSX.Element {
  return (
    <div data-testid="know-card-panel">
      <div className={styles.panelTitle}>Ficha de sesión</div>
      <div className={styles.panelId}>{sessionId}</div>
      {liveIds.has(sessionId) && (
        <button className={styles.ghostBtn} onClick={() => onGoTo(sessionId)}>
          Ir al pane
        </button>
      )}
      {card ? (
        <>
          <p className={styles.panelSummary}>{card.summary}</p>
          {card.facts.map((f) => (
            <div key={f.id} className={`${styles.fact} ${f.supersededBy ? styles.factOld : ''}`}>
              <span className={styles.factKind}>
                {f.supersededBy ? 'reemplazado' : (KIND_ES[f.kind] ?? f.kind)}
              </span>{' '}
              {f.text}
              {f.entities.length > 0 && (
                <span className={styles.factEntities}> [{f.entities.join(', ')}]</span>
              )}
            </div>
          ))}
          <div className={styles.muted}>
            Generada {fmtDateTime(card.generatedAt)} · {card.model}
            {card.costUsd !== undefined && ` · ${fmtUsd(card.costUsd)}`}
          </div>
        </>
      ) : (
        <GenerateCard sessionId={sessionId} />
      )}
    </div>
  )
}

function GenerateCard({ sessionId }: { sessionId: string }): React.JSX.Element {
  return (
    <div>
      <p className={styles.muted}>Esta sesión todavía no tiene ficha.</p>
      <button
        className={styles.ghostBtn}
        onClick={() =>
          void hydra.knowGenerateOne(sessionId).then((ok) => {
            if (ok)
              void hydra
                .knowCard(sessionId)
                .then((c) => knowStore.getState().openSession(sessionId, c))
          })
        }
        data-testid="know-generate-one"
      >
        Generar ficha ahora
      </button>
    </div>
  )
}

function NodePanel({
  nodeId,
  onOpenSession
}: {
  nodeId: string
  onOpenSession: (id: string) => void
}): React.JSX.Element {
  const graph = useKnow((s) => s.graph)
  const node = graph?.nodes.find((n) => n.id === nodeId)
  const neighbours = useMemo(() => {
    if (!graph) return []
    const out: Array<{ id: string; label: string; kind: string }> = []
    for (const e of graph.edges) {
      const other = e.a === nodeId ? e.b : e.b === nodeId ? e.a : null
      if (!other) continue
      const n = graph.nodes.find((x) => x.id === other)
      if (n) out.push(n)
    }
    return out.slice(0, 20)
  }, [graph, nodeId])
  if (!node) return <div className={styles.muted}>Nodo fuera de vista.</div>
  return (
    <div data-testid="know-node-panel">
      <div className={styles.panelTitle}>{KIND_LABEL[node.kind]}</div>
      <div className={styles.panelSummary}>{node.label}</div>
      <div className={styles.muted}>Conexiones visibles:</div>
      {neighbours.map((n) => (
        <button
          key={n.id}
          className={styles.neighbour}
          onClick={() => {
            knowStore.getState().selectNode(n.id)
            if (n.id.startsWith('s:')) onOpenSession(n.id.slice(2))
          }}
        >
          <span className={styles.factKind}>{KIND_LABEL[n.kind]}</span> {n.label}
        </button>
      ))}
    </div>
  )
}
