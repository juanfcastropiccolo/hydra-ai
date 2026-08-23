import type { HydraApi } from '@shared/ipc'

declare global {
  interface Window {
    hydra: HydraApi
    hydraFiles: { pathFor: (file: File) => string }
  }
}

export {}
