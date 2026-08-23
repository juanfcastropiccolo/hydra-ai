import { describe, expect, it } from 'vitest'
import type { Session } from '@shared/types'
import { groupImportCandidates } from './import-candidates'

const s = (
  id: string,
  name: string,
  projectId: string | null,
  over: Partial<Session> = {}
): Session => ({
  sessionId: id,
  bgId: id,
  kind: 'background',
  name,
  cwd: '/x',
  projectId,
  startedAt: 1,
  state: 'idle',
  lastStateAt: 1,
  source: 'poll',
  origin: 'hydra',
  ...over
})
const projects = [
  { id: 'P1', name: 'Hydra', path: '/h', addedAt: '' },
  { id: 'P2', name: 'Trading', path: '/t', addedAt: '' }
]

describe('groupImportCandidates', () => {
  it('excludes the target and ended sessions, groups by project in sidebar order, then "Fuera de proyectos"', () => {
    const groups = groupImportCandidates({
      sessions: [
        s('t', 'trading-1', 'P2'),
        s('b', 'beta', 'P1'),
        s('target', 'yo', 'P1'),
        s('a', 'Alfa', 'P1'),
        s('e', 'ended', 'P1', { state: 'ended' }),
        s('o', 'otra', null),
        s('g', 'ghost-project', 'P9')
      ],
      projects,
      targetSessionId: 'target'
    })
    expect(groups.map((g) => [g.projectName, g.sessions.map((x) => x.name)])).toEqual([
      ['Hydra', ['Alfa', 'beta']],
      ['Trading', ['trading-1']],
      ['Fuera de proyectos', ['ghost-project', 'otra']]
    ])
  })
  it('filters by session name or project name, ignoring case and accents', () => {
    const sessions = [s('a', 'Investigación', 'P1'), s('b', 'fix', 'P2')]
    expect(
      groupImportCandidates({
        sessions,
        projects,
        targetSessionId: 'z',
        query: 'investigacion'
      }).map((g) => g.sessions.map((x) => x.name))
    ).toEqual([['Investigación']])
    expect(
      groupImportCandidates({ sessions, projects, targetSessionId: 'z', query: 'TRAD' }).map(
        (g) => g.projectName
      )
    ).toEqual(['Trading'])
    expect(
      groupImportCandidates({ sessions, projects, targetSessionId: 'z', query: 'nada' })
    ).toEqual([])
  })
})
