import { contextBridge, ipcRenderer } from 'electron'
import type { HydraApi } from '@shared/ipc'

const hydra: HydraApi = {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  send: (channel, payload) => ipcRenderer.send(channel, payload),
  on: (channel, listener) => {
    const wrapped = (_e: Electron.IpcRendererEvent, payload: unknown): void => {
      listener(payload as Parameters<typeof listener>[0])
    }
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  }
}

contextBridge.exposeInMainWorld('hydra', hydra)
