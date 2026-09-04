import { createContext } from 'react'

/**
 * Topbar elements that host the headers of the expanded pane (`a`) and, in split view (008),
 * of the pane on the right (`b`). App renders them while a pane is expanded and publishes them
 * here via callback refs; Pane portals its header into the slot of its role.
 */
export interface TopbarSlots {
  a: HTMLElement | null
  b: HTMLElement | null
}

export const TopbarSlotContext = createContext<TopbarSlots>({ a: null, b: null })
