// Feature 006: persistence for session cards (know-cards.json in userData). Atomic + versioned.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { SessionCard } from '@shared/know/types'

export const CARDS_VERSION = 1

export interface CardsFile {
  version: number
  cards: Record<string, SessionCard>
}

export function loadCards(path: string): CardsFile {
  if (!existsSync(path)) return { version: CARDS_VERSION, cards: {} }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<CardsFile>
    if (raw.version !== CARDS_VERSION || typeof raw.cards !== 'object' || !raw.cards)
      return { version: CARDS_VERSION, cards: {} }
    return { version: CARDS_VERSION, cards: raw.cards }
  } catch {
    return { version: CARDS_VERSION, cards: {} }
  }
}

export function saveCards(path: string, file: CardsFile): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(file), 'utf8')
  renameSync(tmp, path)
}
