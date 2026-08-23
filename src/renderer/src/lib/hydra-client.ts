// Bridges window.hydra (preload) with the zustand store. Call initHydraClient() once at boot.
import { appStore } from '../store/app-store'

let started = false

export function initHydraClient(): () => void {
  if (started) return () => {}
  started = true
  const st = appStore.getState()
  const offs = [
    window.hydra.on('claude.availability', (a) => appStore.getState().setAvailability(a)),
    window.hydra.on('projects.changed', (e) => appStore.getState().setProjects(e.projects)),
    window.hydra.on('sessions.changed', (e) => appStore.getState().setSessions(e.sessions))
  ]
  void window.hydra.invoke('claude.availability').then(st.setAvailability)
  void window.hydra.invoke('projects.list').then(st.setProjects)
  void window.hydra.invoke('sessions.list').then(st.setSessions)
  void window.hydra.invoke('ui.getHidden').then(st.setHidden)
  return () => {
    offs.forEach((off) => off())
    started = false
  }
}

/** Thin helpers so components never touch window.hydra directly. */
export const hydra = {
  pickFolder: () => window.hydra.invoke('projects.pickFolder'),
  addProject: (path: string, name?: string) => window.hydra.invoke('projects.add', { path, name }),
  removeProject: (id: string) => window.hydra.invoke('projects.remove', { id }),
  renameProject: (id: string, name: string) => window.hydra.invoke('projects.rename', { id, name }),
  suggestSessionName: (projectId: string) =>
    window.hydra.invoke('sessions.suggestName', { projectId }),
  createSession: (projectId: string, name: string) =>
    window.hydra.invoke('sessions.create', { projectId, name }),
  stopSession: (sessionId: string) => window.hydra.invoke('sessions.stop', { sessionId }),
  renameSession: (sessionId: string, name: string) =>
    window.hydra.invoke('sessions.rename', { sessionId, name }),
  setHidden: (sessionId: string, hidden: boolean) =>
    window.hydra.invoke('ui.setHidden', { sessionId, hidden }),
  openPty: (sessionId: string, cols: number, rows: number) =>
    window.hydra.invoke('pty.open', { sessionId, cols, rows }),
  closePty: (ptyId: string) => window.hydra.invoke('pty.close', { ptyId }),
  scrollback: (ptyId: string) => window.hydra.invoke('pty.scrollback', { ptyId }),
  write: (ptyId: string, data: string) => window.hydra.send('pty.write', { ptyId, data }),
  resize: (ptyId: string, cols: number, rows: number) =>
    window.hydra.send('pty.resize', { ptyId, cols, rows }),
  onPtyData: (cb: (e: { ptyId: string; data: string }) => void) => window.hydra.on('pty.data', cb),
  onPtyExit: (cb: (e: { ptyId: string; exitCode: number }) => void) =>
    window.hydra.on('pty.exit', cb)
}
