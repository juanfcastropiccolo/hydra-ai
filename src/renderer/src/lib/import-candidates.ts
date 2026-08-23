// Feature 004 FR-2/3/4: which sessions can be a source, grouped by project for the dialog. Pure.
import type { Project, Session } from '@shared/types'

export interface CandidateGroup {
  projectId: string | null
  projectName: string
  sessions: Session[]
}

/**
 * Every known session except the target and those without a usable conversation id, filtered by
 * `query` (name or project, case/diacritic-insensitive), grouped by project (registered projects
 * in sidebar order, then "Fuera de proyectos"). Ended sessions are excluded (non-goal: history).
 */
export function groupImportCandidates(opts: {
  sessions: Session[]
  projects: Project[]
  targetSessionId: string
  query?: string
}): CandidateGroup[] {
  const q = norm(opts.query ?? '')
  const nameOf = new Map(opts.projects.map((p) => [p.id, p.name]))
  const eligible = opts.sessions.filter(
    (s) => s.sessionId !== opts.targetSessionId && s.sessionId && s.state !== 'ended'
  )
  const matches = (s: Session): boolean =>
    !q ||
    norm(s.name).includes(q) ||
    norm((s.projectId && nameOf.get(s.projectId)) || '').includes(q)
  const byProject = new Map<string | null, Session[]>()
  for (const s of eligible) {
    if (!matches(s)) continue
    const key = s.projectId && nameOf.has(s.projectId) ? s.projectId : null
    const list = byProject.get(key) ?? []
    list.push(s)
    byProject.set(key, list)
  }
  const groups: CandidateGroup[] = []
  for (const p of opts.projects) {
    const list = byProject.get(p.id)
    if (list?.length)
      groups.push({ projectId: p.id, projectName: p.name, sessions: sortByName(list) })
  }
  const rest = byProject.get(null)
  if (rest?.length)
    groups.push({ projectId: null, projectName: 'Fuera de proyectos', sessions: sortByName(rest) })
  return groups
}

const sortByName = (l: Session[]): Session[] =>
  [...l].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))

const norm = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
