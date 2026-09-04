import { createContext } from 'react'

/**
 * The topbar element that hosts the expanded pane's header (App renders it while a pane is
 * expanded and publishes it here via a callback ref). Pane portals its header into it.
 */
export const TopbarSlotContext = createContext<HTMLElement | null>(null)
