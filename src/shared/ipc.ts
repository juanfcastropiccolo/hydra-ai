// Typed IPC contract between main and renderer. Both sides import from here;
// nothing crosses the bridge that is not described in these two maps.
import type { ClaudeAvailability, Project, Session } from './types'

/** Request/response channels (renderer → main, via ipcRenderer.invoke). */
export interface IpcInvoke {
  'projects.list': { args: []; result: Project[] }
  'projects.add': { args: [{ path: string; name?: string }]; result: Project }
  'projects.remove': { args: [{ id: string }]; result: void }
  'projects.rename': { args: [{ id: string; name: string }]; result: Project }
  /** Opens the native folder picker; resolves null if the user cancelled. */
  'projects.pickFolder': { args: []; result: string | null }

  'sessions.list': { args: []; result: Session[] }
  'sessions.create': { args: [{ projectId: string; name: string }]; result: Session }
  'sessions.stop': { args: [{ sessionId: string }]; result: void }
  'sessions.rename': { args: [{ sessionId: string; name: string }]; result: void }
  'sessions.suggestName': { args: [{ projectId: string }]; result: string }

  /** Attach a PTY to a session; returns the pty id to use in pty.* calls. */
  'pty.open': {
    args: [{ sessionId: string; cols: number; rows: number }]
    result: { ptyId: string }
  }
  'pty.close': { args: [{ ptyId: string }]; result: void }
  /** Replays the buffered scrollback (last N KB) so a remounted pane is not blank. */
  'pty.scrollback': { args: [{ ptyId: string }]; result: string }

  'ui.getHidden': { args: []; result: string[] }
  'ui.setHidden': { args: [{ sessionId: string; hidden: boolean }]; result: void }

  'claude.availability': { args: []; result: ClaudeAvailability }

  /** E2E only (HYDRA_E2E=1): what each fake PTY received. Rejects otherwise. */
  'e2e.ptyRecords': {
    args: []
    result: Array<{
      pid: number
      args: string[]
      writes: string[]
      resizes: Array<{ cols: number; rows: number }>
      killed: boolean
    }>
  }
  /** E2E only: flip a fake session's status so the traffic light changes. */
  'e2e.setStatus': { args: [{ bgId: string; status: string; waitingFor?: string }]; result: void }
}

/** Fire-and-forget messages (renderer → main, via ipcRenderer.send). */
export interface IpcSend {
  'pty.write': { ptyId: string; data: string }
  'pty.resize': { ptyId: string; cols: number; rows: number }
}

/** Push events (main → renderer, via webContents.send). */
export interface IpcEvents {
  'pty.data': { ptyId: string; data: string }
  'pty.exit': { ptyId: string; exitCode: number }
  'sessions.changed': { sessions: Session[] }
  'projects.changed': { projects: Project[] }
  'claude.availability': ClaudeAvailability
}

export type InvokeChannel = keyof IpcInvoke
export type SendChannel = keyof IpcSend
export type EventChannel = keyof IpcEvents

export type InvokeArgs<C extends InvokeChannel> = IpcInvoke[C]['args']
export type InvokeResult<C extends InvokeChannel> = IpcInvoke[C]['result']

/** Shape exposed on `window.hydra` by the preload script. */
export interface HydraApi {
  invoke<C extends InvokeChannel>(channel: C, ...args: InvokeArgs<C>): Promise<InvokeResult<C>>
  send<C extends SendChannel>(channel: C, payload: IpcSend[C]): void
  on<C extends EventChannel>(channel: C, listener: (payload: IpcEvents[C]) => void): () => void
}
