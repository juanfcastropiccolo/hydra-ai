import { contextBridge, ipcRenderer, webUtils } from 'electron'
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
// Feature 002: absolute path of a File dropped from Finder (File.path is gone in modern Electron).
contextBridge.exposeInMainWorld('hydraFiles', {
  pathFor: (file: File): string => webUtils.getPathForFile(file)
})
