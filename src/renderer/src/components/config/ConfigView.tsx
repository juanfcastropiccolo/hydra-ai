// Feature 007: the preferences screen — Discord-like: category nav on the left, one category on
// the right. Instant controls save through prefs.set; text fields go through usePending + PendingBar.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ClaudeAvailability } from '@shared/types'
import { PROJECT_COLORS, type ProjectColor } from '@shared/types'
import {
  defaultPrefs,
  deriveInitials,
  EFFORTS,
  FONT_MAX,
  FONT_MIN,
  PERMISSION_MODES,
  renderNamePattern,
  type HydraPrefs,
  type PrefsPatch,
  type SessionEffort,
  type SessionPermissionMode
} from '@shared/prefs'
import type { AnalyticsRange, ModelPricing } from '@shared/analytics/types'
import { DEFAULT_PRICING, PRICING_SNAPSHOT_DATE } from '@shared/analytics/pricing'
import { hydra } from '../../lib/hydra-client'
import { useAppStore } from '../../store/app-store'
import { knowStore, useKnow } from '../../store/know-slice'
import { prefsStore, usePrefs } from '../../store/prefs-slice'
import { fmtDateTime, fmtUsd } from '../analytics/formatters'
import { modelLabel } from '../analytics/charts/palette'
import styles from './config.module.css'
import {
  DangerButton,
  NumberField,
  PendingBar,
  Row,
  SavedToast,
  Section,
  Select,
  Slider,
  Swatches,
  TextField,
  Toggle
} from './controls'
import { usePending } from './use-pending'

type Category = 'profile' | 'appearance' | 'sessions' | 'context' | 'analytics' | 'maintenance'

const NAV: Array<{ group: string; items: Array<{ key: Category; label: string; icon: string }> }> =
  [
    {
      group: 'Usuario',
      items: [
        { key: 'profile', label: 'Perfil', icon: '👤' },
        { key: 'appearance', label: 'Apariencia', icon: '🎨' }
      ]
    },
    {
      group: 'Hydra',
      items: [
        { key: 'sessions', label: 'Sesiones', icon: '🧵' },
        { key: 'context', label: 'Contexto e IA', icon: '🧠' },
        { key: 'analytics', label: 'Analytics', icon: '📊' }
      ]
    },
    { group: 'Sistema', items: [{ key: 'maintenance', label: 'Mantenimiento', icon: '🛠️' }] }
  ]

const COLOR_OPTIONS = (Object.keys(PROJECT_COLORS) as ProjectColor[]).map((c) => ({
  value: c,
  color: PROJECT_COLORS[c],
  label: c
}))

/** Save a patch and flash the "Guardado" toast. */
function useInstantSave(): {
  save: (patch: PrefsPatch) => Promise<void>
  saved: boolean
  error: string | null
} {
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const save = async (patch: PrefsPatch): Promise<void> => {
    try {
      const p = await hydra.setPrefs(patch)
      prefsStore.getState().setPrefs(p)
      setError(null)
      setSaved(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setSaved(false), 1500)
    } catch (e) {
      setError((e as Error).message)
      throw e
    }
  }
  return { save, saved, error }
}

export function ConfigView(): React.JSX.Element {
  const [category, setCategory] = useState<Category>('profile')
  const { save, saved, error } = useInstantSave()
  return (
    <div className={styles.view} data-testid="config-root">
      <nav className={styles.nav} aria-label="Categorías de configuración">
        {NAV.map((g) => (
          <div key={g.group} className={styles.navGroup}>
            <div className={styles.navGroupLabel}>{g.group}</div>
            {g.items.map((it) => (
              <button
                key={it.key}
                type="button"
                className={`${styles.navItem} ${category === it.key ? styles.navItemActive : ''}`}
                onClick={() => setCategory(it.key)}
                aria-current={category === it.key ? 'page' : undefined}
                data-testid={`config-nav-${it.key}`}
              >
                <span className={styles.navIcon} aria-hidden="true">
                  {it.icon}
                </span>
                {it.label}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className={styles.content} data-testid={`config-section-${category}`}>
        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}
        {category === 'profile' && <ProfileSection save={save} />}
        {category === 'appearance' && <AppearanceSection save={save} />}
        {category === 'sessions' && <SessionsSection save={save} />}
        {category === 'context' && <ContextSection save={save} />}
        {category === 'analytics' && <AnalyticsSection save={save} />}
        {category === 'maintenance' && <MaintenanceSection />}
      </div>
      <SavedToast visible={saved} />
    </div>
  )
}

type SaveFn = (patch: PrefsPatch) => Promise<void>

function RestoreDefaults({
  section,
  save,
  label = 'Restaurar valores por defecto'
}: {
  section: keyof HydraPrefs
  save: SaveFn
  label?: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={styles.ghost}
      onClick={() => {
        if (
          window.confirm(
            `¿Restaurar ${label.toLowerCase().replace('restaurar ', '')} de esta categoría?`
          )
        )
          void save({ [section]: defaultPrefs()[section] } as PrefsPatch)
      }}
      data-testid={`restore-${section}`}
    >
      {label}
    </button>
  )
}

// ---- Perfil ----------------------------------------------------------------------------------

function ProfileSection({ save }: { save: SaveFn }): React.JSX.Element {
  const profile = usePrefs((p) => p.profile)
  const pending = usePending(profile, (patch) => save({ profile: patch }))
  const initialsPreview = pending.draft.initials.trim() || deriveInitials(pending.draft.name)
  const initialsError = pending.draft.initials.trim().length > 3 ? 'Máximo 3 caracteres' : null
  return (
    <>
      <h1 className={styles.h1}>Perfil</h1>
      <Section
        title="Tu avatar"
        description="Cómo te mostrás en la esquina de la barra lateral."
        actions={<RestoreDefaults section="profile" save={save} />}
      >
        <div className={styles.avatarPreview}>
          <span className={styles.avatar}>{initialsPreview.toUpperCase().slice(0, 3)}</span>
          <span className={styles.avatarName}>{pending.draft.name || 'Sin nombre'}</span>
        </div>
        <Row label="Nombre" hint="Se muestra junto al avatar.">
          <TextField
            value={pending.draft.name}
            onChange={(v) => pending.set('name', v)}
            onEnter={() => void pending.save()}
            testId="profile-name"
            width={240}
          />
        </Row>
        <Row
          label="Iniciales"
          hint="1 a 3 caracteres. Vacío = se derivan del nombre."
          error={initialsError}
        >
          <TextField
            value={pending.draft.initials}
            onChange={(v) => pending.set('initials', v.slice(0, 4))}
            onEnter={() => void pending.save()}
            testId="profile-initials"
            width={90}
          />
        </Row>
      </Section>
      <PendingBar
        dirty={pending.dirty}
        saving={pending.saving}
        onSave={() => void pending.save()}
        onDiscard={pending.discard}
        error={pending.error}
      />
    </>
  )
}

// ---- Apariencia ------------------------------------------------------------------------------

function AppearanceSection({ save }: { save: SaveFn }): React.JSX.Element {
  const appearance = usePrefs((p) => p.appearance)
  const zoomLevel = usePrefs((p) => p.zoomLevel)
  const width = usePrefs((p) => p.fileTree.width)
  return (
    <>
      <h1 className={styles.h1}>Apariencia</h1>
      <Section
        title="Terminales"
        description="Cambia en vivo en todos los panes, sin volver a adjuntar."
        actions={<RestoreDefaults section="appearance" save={save} />}
      >
        <Row label="Tamaño de fuente" hint={`${FONT_MIN}–${FONT_MAX} px.`}>
          <Slider
            value={appearance.terminalFontSize}
            min={FONT_MIN}
            max={FONT_MAX}
            onChange={(v) => void save({ appearance: { terminalFontSize: v } })}
            format={(v) => `${v} px`}
            testId="appearance-font"
          />
        </Row>
      </Section>
      <Section
        title="Ventana"
        description="Zoom con el que abre Hydra (⌘+ / ⌘− lo cambian en vivo y se recuerda al cerrar)."
      >
        <Row label="Zoom por defecto">
          <Select
            value={String(zoomLevel)}
            options={[-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2].map((z) => ({
              value: String(z),
              label: z === 0 ? '100 %' : `${Math.round(100 * Math.pow(1.2, z))} %`
            }))}
            onChange={(v) => void save({ zoomLevel: Number(v) })}
            testId="appearance-zoom"
          />
        </Row>
        <Row label="Ancho de la barra lateral" hint="Se ajusta arrastrando su borde.">
          <span className={styles.readonly}>{width} px</span>
        </Row>
      </Section>
      <Section
        title="Color de acento"
        description="Foco de los panes, botones y logo. Los gráficos mantienen su propia paleta."
      >
        <Row label="Acento">
          <Swatches
            value={appearance.accent}
            options={COLOR_OPTIONS}
            onChange={(v) => void save({ appearance: { accent: v } })}
            testId="appearance-accent"
          />
        </Row>
      </Section>
    </>
  )
}

// ---- Sesiones --------------------------------------------------------------------------------

const MODEL_OPTIONS = [
  { value: '', label: 'Por defecto del CLI' },
  { value: 'fable', label: 'Fable 5' },
  { value: 'opus', label: 'Opus 5' },
  { value: 'sonnet', label: 'Sonnet 5' },
  { value: 'haiku', label: 'Haiku 4.5' }
]

function SessionsSection({ save }: { save: SaveFn }): React.JSX.Element {
  const sessions = usePrefs((p) => p.sessions)
  const pending = usePending(
    { model: sessions.model, namePattern: sessions.namePattern },
    (patch) => save({ sessions: patch })
  )
  const knownModel = MODEL_OPTIONS.some((o) => o.value === pending.draft.model)
  const patternError = pending.draft.namePattern.includes('{n}') ? null : 'Debe incluir {n}'
  const preview = renderNamePattern(pending.draft.namePattern, {
    project: 'hydra-ai',
    n: 3,
    date: new Date().toISOString().slice(0, 10)
  })
  const setPermission = (v: SessionPermissionMode): void => {
    if (
      v === 'bypassPermissions' &&
      !window.confirm(
        'bypassPermissions desactiva TODAS las confirmaciones de Claude Code en las sesiones nuevas. ¿Seguro?'
      )
    )
      return
    void save({ sessions: { permissionMode: v } })
  }
  return (
    <>
      <h1 className={styles.h1}>Sesiones</h1>
      <Section
        title="Al crear una sesión"
        description="Opciones que Hydra pasa a `claude --bg`. Los panes existentes no cambian."
        actions={<RestoreDefaults section="sessions" save={save} />}
      >
        <Row
          label="Modelo"
          hint={knownModel ? 'Se pasa como `--model`.' : 'Nombre libre: el CLI decide si existe.'}
        >
          <span className={styles.inline}>
            <Select
              value={knownModel ? pending.draft.model : '__custom'}
              options={[...MODEL_OPTIONS, { value: '__custom', label: 'Otro…' }]}
              onChange={(v) => pending.set('model', v === '__custom' ? 'claude-' : v)}
              testId="sessions-model"
            />
            {!knownModel && (
              <TextField
                value={pending.draft.model}
                onChange={(v) => pending.set('model', v)}
                onEnter={() => void pending.save()}
                mono
                width={220}
                testId="sessions-model-custom"
              />
            )}
          </span>
        </Row>
        <Row label="Esfuerzo" hint="`--effort`. Vacío = por defecto.">
          <Select
            value={sessions.effort}
            options={EFFORTS.map((e) => ({ value: e as SessionEffort, label: e || 'Por defecto' }))}
            onChange={(v) => void save({ sessions: { effort: v } })}
            testId="sessions-effort"
          />
        </Row>
        <Row
          label="Modo de permisos"
          hint={
            sessions.permissionMode === 'bypassPermissions' ? (
              <span className={styles.warn}>
                ⚠ Sin confirmaciones: Claude puede ejecutar cualquier cosa.
              </span>
            ) : (
              '`--permission-mode`. Vacío = por defecto.'
            )
          }
        >
          <Select
            value={sessions.permissionMode}
            options={PERMISSION_MODES.map((m) => ({
              value: m as SessionPermissionMode,
              label: m || 'Por defecto'
            }))}
            onChange={setPermission}
            testId="sessions-permission"
          />
        </Row>
        <Row
          label="Nombre sugerido"
          hint={
            <>
              Placeholders: {'{project}'}, {'{n}'}, {'{date}'}. Vista previa: <code>{preview}</code>
            </>
          }
          error={patternError}
        >
          <TextField
            value={pending.draft.namePattern}
            onChange={(v) => pending.set('namePattern', v)}
            onEnter={() => void pending.save()}
            mono
            width={220}
            testId="sessions-pattern"
          />
        </Row>
      </Section>
      <Section title="Al terminar una sesión">
        <Row
          label="Confirmar si está trabajando"
          hint="Pregunta antes de terminar una sesión con un turno en curso."
        >
          <Toggle
            checked={sessions.confirmStopWorking}
            onChange={(v) => void save({ sessions: { confirmStopWorking: v } })}
            testId="sessions-confirm-stop"
          />
        </Row>
      </Section>
      <PendingBar
        dirty={pending.dirty}
        saving={pending.saving}
        onSave={() => void pending.save()}
        onDiscard={pending.discard}
        error={pending.error}
      />
    </>
  )
}

// ---- Contexto e IA ---------------------------------------------------------------------------

function ContextSection({ save }: { save: SaveFn }): React.JSX.Element {
  const importContext = usePrefs((p) => p.importContext)
  const know = usePrefs((p) => p.know)
  const analytics = usePrefs((p) => p.analytics)
  const status = useKnow((s) => s.status)
  // MCP status lives in the know slice; fetch once so Config works before Graph Know was opened.
  useEffect(() => {
    void hydra.knowStatus().then(setKnowStatus)
  }, [])
  const pending = usePending(
    {
      model: importContext.model,
      port: know.port,
      maxBudgetUsd: know.maxBudgetUsd ?? ('' as number | '')
    },
    async (patch) => {
      const out: PrefsPatch = {}
      if (patch.model !== undefined) out.importContext = { model: patch.model }
      const kn: Partial<HydraPrefs['know']> = {}
      if (patch.port !== undefined) kn.port = Number(patch.port)
      if (patch.maxBudgetUsd !== undefined)
        kn.maxBudgetUsd = patch.maxBudgetUsd === '' ? undefined : Number(patch.maxBudgetUsd)
      if (Object.keys(kn).length) out.know = kn
      await save(out)
    }
  )
  const portError =
    Number.isInteger(Number(pending.draft.port)) &&
    Number(pending.draft.port) >= 1024 &&
    Number(pending.draft.port) <= 65535
      ? null
      : 'Puerto entre 1024 y 65535'
  const mcpLabel = !status
    ? '…'
    : status.mcp.state === 'serving'
      ? status.mcp.registered
        ? `Conectado — ${`http://127.0.0.1:${status.mcp.port}/mcp`}`
        : `Sirviendo en ${status.mcp.port}, sin conectar`
      : status.mcp.state === 'port-taken'
        ? 'Servido por otra instancia de Hydra'
        : 'Apagado (se enciende al abrir Graph Know)'
  return (
    <>
      <h1 className={styles.h1}>Contexto e IA</h1>
      <Section
        title="Modelo económico"
        description="Usado para importar contexto (004) y para las fichas de Graph Know (006). Se pasa a `claude -p --model`."
        actions={<RestoreDefaults section="importContext" save={save} label="Restaurar modelo" />}
      >
        <Row label="Modelo">
          <span className={styles.inline}>
            <Select
              value={
                MODEL_OPTIONS.some((o) => o.value === pending.draft.model && o.value)
                  ? pending.draft.model
                  : '__custom'
              }
              options={[
                ...MODEL_OPTIONS.filter((o) => o.value),
                { value: '__custom', label: 'Otro…' }
              ]}
              onChange={(v) => pending.set('model', v === '__custom' ? 'claude-' : v)}
              testId="context-model"
            />
            {!MODEL_OPTIONS.some((o) => o.value === pending.draft.model && o.value) && (
              <TextField
                value={pending.draft.model}
                onChange={(v) => pending.set('model', v)}
                onEnter={() => void pending.save()}
                mono
                width={220}
                testId="context-model-custom"
              />
            )}
          </span>
        </Row>
      </Section>
      <Section title="Fichas de conocimiento">
        <Row
          label="Fichas automáticas"
          hint="Genera la ficha de una sesión cuando termina de trabajar (un llamado barato por sesión)."
        >
          <Toggle
            checked={know.autoCards}
            onChange={(v) => void save({ know: { autoCards: v } })}
            testId="context-autocards"
          />
        </Row>
        <Row
          label="Presupuesto máximo por ficha"
          hint="USD; vacío = sin tope. Se pasa como `--max-budget-usd`."
        >
          <NumberField
            value={pending.draft.maxBudgetUsd}
            onChange={(v) => pending.set('maxBudgetUsd', v)}
            onEnter={() => void pending.save()}
            min={0.01}
            step={0.01}
            suffix="USD"
            testId="context-budget"
          />
        </Row>
      </Section>
      <Section
        title="MCP para Claude Code"
        description="Server local `hydra-know` (solo 127.0.0.1) con `search_past_work` y `get_session_context`."
      >
        <Row
          label="Puerto"
          hint="Cambiarlo reinicia el server y actualiza el registro si estaba conectado."
          error={portError}
        >
          <NumberField
            value={pending.draft.port}
            onChange={(v) => pending.set('port', v as number)}
            onEnter={() => void pending.save()}
            min={1024}
            max={65535}
            testId="context-port"
          />
        </Row>
        <Row label="Estado" hint={mcpLabel}>
          <button
            type="button"
            className={styles.ghost}
            onClick={() =>
              void (status?.mcp.registered ? hydra.knowDisconnectMcp() : hydra.knowConnectMcp())
                .then(() => hydra.knowStatus())
                .then((st) => setKnowStatus(st))
            }
            data-testid="context-mcp-toggle"
          >
            {status?.mcp.registered ? 'Desconectar' : 'Conectar con Claude Code'}
          </button>
        </Row>
      </Section>
      <Section title="Analytics">
        <Row label="Rango por defecto" hint="Con el que abre el dashboard.">
          <Select
            value={typeof analytics.range === 'string' ? analytics.range : 'custom'}
            options={[
              { value: 'today', label: 'Hoy' },
              { value: '7d', label: '7 días' },
              { value: '30d', label: '30 días' },
              { value: 'all', label: 'Todo' },
              ...(typeof analytics.range === 'string'
                ? []
                : [{ value: 'custom', label: 'Personalizado (actual)' }])
            ]}
            onChange={(v) =>
              v !== 'custom' && void save({ analytics: { range: v as AnalyticsRange } })
            }
            testId="context-range"
          />
        </Row>
      </Section>
      <PendingBar
        dirty={pending.dirty}
        saving={pending.saving}
        onSave={() => void pending.save()}
        onDiscard={pending.discard}
        error={pending.error}
      />
    </>
  )
}

const setKnowStatus = (st: import('@shared/know/types').KnowStatus): void =>
  knowStore.getState().setStatus(st)

// ---- Analytics (precios) ----------------------------------------------------------------------

function AnalyticsSection({ save }: { save: SaveFn }): React.JSX.Element {
  const pricing = usePrefs((p) => p.analytics.pricing)
  const rows = useMemo(() => {
    const merged: Record<string, ModelPricing & { source: 'default' | 'custom' }> = {}
    for (const [m, p] of Object.entries(DEFAULT_PRICING)) merged[m] = { ...p, source: 'default' }
    for (const [m, p] of Object.entries(pricing)) merged[m] = { ...p, source: 'custom' }
    return Object.entries(merged).sort(([a], [b]) => a.localeCompare(b))
  }, [pricing])
  // Draft = local overrides while editing (null = follow `pricing` from prefs); no effect needed.
  const [local, setLocal] = useState<Record<string, ModelPricing> | null>(null)
  const draft = local ?? pricing
  const dirty = local !== null
  const setDraft = (next: Record<string, ModelPricing>): void => setLocal(next)
  const edit = (model: string, field: keyof ModelPricing, value: number): void => {
    const base = draft[model] ??
      DEFAULT_PRICING[model] ?? { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }
    setLocal({ ...draft, [model]: { ...base, [field]: value } })
  }
  const [newModel, setNewModel] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const commit = async (next: Record<string, ModelPricing>): Promise<void> => {
    setSaving(true)
    try {
      await save({ analytics: { pricing: next } })
      setLocal(null)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }
  return (
    <>
      <h1 className={styles.h1}>Analytics</h1>
      <Section
        title="Precios por modelo"
        description={`USD por millón de tokens. Los valores por defecto son el snapshot del ${PRICING_SNAPSHOT_DATE}; lo que edites queda como override (marcado). Se aplica sin reindexar.`}
        actions={
          <button
            type="button"
            className={styles.ghost}
            onClick={() =>
              window.confirm('¿Quitar todos los overrides y volver a los precios por defecto?') &&
              void commit({})
            }
            data-testid="pricing-restore"
          >
            Restaurar defaults
          </button>
        }
      >
        <div className={styles.tableWrap}>
          <table className={styles.table} data-testid="pricing-table">
            <thead>
              <tr>
                <th>Modelo / prefijo</th>
                <th>Entrada</th>
                <th>Salida</th>
                <th>Caché escr.</th>
                <th>Caché lect.</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(([model, p]) => {
                const d = draft[model] ?? p
                const custom = model in draft
                return (
                  <tr key={model} data-testid="pricing-row" data-model={model} data-custom={custom}>
                    <td className={styles.mono}>
                      {modelLabel(model)} <span className={styles.dim}>{model}</span>
                      {custom && <span className={styles.badge}>override</span>}
                    </td>
                    {(['input', 'output', 'cacheWrite', 'cacheRead'] as const).map((f) => (
                      <td key={f}>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          className={`${styles.input} ${styles.cell}`}
                          value={d[f]}
                          onChange={(e) => edit(model, f, Number(e.target.value))}
                          data-testid={`pricing-${model}-${f}`}
                        />
                      </td>
                    ))}
                    <td>
                      {custom && (
                        <button
                          type="button"
                          className={styles.ghost}
                          title="Quitar override"
                          onClick={() => {
                            const next = { ...draft }
                            delete next[model]
                            setDraft(next)
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <Row label="Agregar modelo" hint="Id exacto o prefijo (p. ej. claude-opus-6).">
          <span className={styles.inline}>
            <TextField
              value={newModel}
              onChange={setNewModel}
              mono
              width={220}
              placeholder="claude-…"
              testId="pricing-new"
            />
            <button
              type="button"
              className={styles.ghost}
              disabled={!newModel.trim()}
              onClick={() => {
                edit(newModel.trim(), 'input', 0)
                setNewModel('')
              }}
              data-testid="pricing-add"
            >
              Agregar
            </button>
          </span>
        </Row>
      </Section>
      <PendingBar
        dirty={dirty}
        saving={saving}
        onSave={() => void commit(draft)}
        onDiscard={() => setLocal(null)}
        error={error}
      />
    </>
  )
}

// ---- Mantenimiento ---------------------------------------------------------------------------

type MaintInfo = import('@shared/ipc').IpcInvoke['maint.info']['result']

function MaintenanceSection(): React.JSX.Element {
  const [info, setInfo] = useState<MaintInfo | null>(null)
  const [errors, setErrors] = useState<Array<{ ts: number; source: string; message: string }>>([])
  const [msg, setMsg] = useState<string | null>(null)
  const availability = useAppStore((s) => s.availability)
  const status = useKnow((s) => s.status)
  const refresh = (): void => {
    void hydra.maintInfo().then(setInfo)
    void hydra.maintErrors().then(setErrors)
  }
  useEffect(refresh, [availability, status?.cardsDone, status?.indexedSessions])
  const run = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
    try {
      const r = await fn()
      setMsg(typeof r === 'string' ? `${label}: ${r}` : `${label} ✓`)
      refresh()
    } catch (e) {
      setMsg(`${label}: ${(e as Error).message}`)
    }
  }
  const fmtBytes = (b: number): string =>
    b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : b >= 1e3 ? `${Math.round(b / 1e3)} KB` : `${b} B`
  return (
    <>
      <h1 className={styles.h1}>Mantenimiento</h1>
      {msg && (
        <div className={styles.notice} role="status" data-testid="maint-msg">
          {msg}
          <button type="button" className={styles.ghost} onClick={() => setMsg(null)}>
            ✕
          </button>
        </div>
      )}
      <Section title="Claude Code" description="El CLI que Hydra encontró al arrancar.">
        <Row label="Ejecutable" hint={info?.cli.ok ? info.cli.path : (info?.cli.message ?? '…')}>
          <button
            type="button"
            className={styles.ghost}
            onClick={() =>
              void run('Detección', () =>
                hydra
                  .maintRedetectCli()
                  .then((a: ClaudeAvailability) =>
                    a.ok ? `${a.binaryPath} (${a.version ?? '?'})` : a.message
                  )
              )
            }
            data-testid="maint-redetect"
          >
            Volver a detectar
          </button>
        </Row>
        <Row label="Versión">
          <span className={styles.readonly} data-testid="maint-cli-version">
            {info?.cli.version ?? '—'}
          </span>
        </Row>
      </Section>
      <Section
        title="Datos de Hydra"
        description={info?.dataDir ?? ''}
        actions={
          <button
            type="button"
            className={styles.ghost}
            onClick={() => void hydra.maintOpenDataDir()}
            data-testid="maint-open-dir"
          >
            Abrir en Finder
          </button>
        }
      >
        {(info?.files ?? []).map((f) => (
          <Row key={f.name} label={f.name} hint={f.path}>
            <span className={styles.readonly}>{fmtBytes(f.bytes)}</span>
          </Row>
        ))}
        <Row
          label="Índice de transcripts"
          hint="Vuelve a leer todos los transcripts (analytics y Graph Know)."
        >
          <button
            type="button"
            className={styles.ghost}
            onClick={() => void run('Reindexar', () => hydra.maintReindex())}
            data-testid="maint-reindex"
          >
            Reindexar
          </button>
        </Row>
        <Row
          label="Fichas de conocimiento"
          hint={`${status?.cardsDone ?? 0} fichas. Borrarlas obliga a generarlas de nuevo (cuesta).`}
        >
          <DangerButton
            onClick={() =>
              window.confirm('¿Borrar todas las fichas? Volver a generarlas tiene costo.') &&
              void run('Borrar fichas', () => hydra.maintClearCards())
            }
            testId="maint-clear-cards"
          >
            Borrar fichas
          </DangerButton>
        </Row>
        <Row label="Caché de analytics" hint="Se reconstruye solo al abrir Analytics.">
          <DangerButton
            onClick={() =>
              window.confirm('¿Borrar el caché de analytics y reindexar?') &&
              void run('Borrar caché', () => hydra.maintClearAnalyticsCache())
            }
            testId="maint-clear-cache"
          >
            Borrar caché
          </DangerButton>
        </Row>
      </Section>
      <Section
        title="Backup de preferencias"
        description="hydra.json completo: proyectos y preferencias. Importar valida el archivo y guarda hydra.json.bak antes de reemplazar."
      >
        <Row label="Exportar">
          <button
            type="button"
            className={styles.ghost}
            onClick={() =>
              void run('Exportado', () =>
                hydra.maintExportHydraJson().then((p) => p ?? 'cancelado')
              )
            }
            data-testid="maint-export"
          >
            Exportar hydra.json…
          </button>
        </Row>
        <Row label="Importar" hint="Reemplaza proyectos y preferencias actuales.">
          <DangerButton
            onClick={() =>
              window.confirm(
                'Importar reemplaza TODOS tus proyectos y preferencias por los del archivo (se guarda un .bak). ¿Continuar?'
              ) &&
              void run('Importado', () =>
                hydra
                  .maintImportHydraJson()
                  .then((r) =>
                    r ? `${r.projects} proyectos (backup: ${r.backupPath})` : 'cancelado'
                  )
              )
            }
            testId="maint-import"
          >
            Importar hydra.json…
          </DangerButton>
        </Row>
      </Section>
      <Section
        title="Errores recientes"
        description="Últimos errores del proceso principal (hooks, CLI, fichas, MCP)."
        actions={
          <button
            type="button"
            className={styles.ghost}
            onClick={() =>
              void navigator.clipboard.writeText(
                errors
                  .map((e) => `${new Date(e.ts).toISOString()} [${e.source}] ${e.message}`)
                  .join('\n')
              )
            }
            disabled={!errors.length}
            data-testid="maint-copy-errors"
          >
            Copiar
          </button>
        }
      >
        {errors.length === 0 && (
          <div className={styles.dim}>Sin errores registrados en esta sesión de Hydra.</div>
        )}
        {errors.map((e, i) => (
          <div key={i} className={styles.errorRow} data-testid="maint-error">
            <span className={styles.dim}>{fmtDateTime(e.ts)}</span>{' '}
            <span className={styles.badge}>{e.source}</span> {e.message}
          </div>
        ))}
      </Section>
      <Section title="Acerca de">
        <Row label="Hydra">
          <span className={styles.readonly}>{info?.versions.hydra ?? '—'}</span>
        </Row>
        <Row label="Electron / Node">
          <span className={styles.readonly}>
            {info ? `${info.versions.electron} / ${info.versions.node}` : '—'}
          </span>
        </Row>
        <Row label="Costo acumulado de fichas">
          <span className={styles.readonly}>{fmtUsd(status?.estCostUsd ?? 0)} est.</span>
        </Row>
      </Section>
    </>
  )
}
