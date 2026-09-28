/// <reference types="vite/client" />

import type { MemologApi } from '@shared/api'

declare global {
  interface Window {
    /** Unique passerelle vers le process principal, exposée par le preload. */
    memolog: MemologApi
  }
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

export {}
