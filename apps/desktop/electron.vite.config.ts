import { resolve } from 'node:path'

import vue from '@vitejs/plugin-vue'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

/**
 * Trois cibles distinctes : le process principal (Node), le preload (isolé,
 * CommonJS car la fenêtre tourne en `sandbox`) et le renderer (navigateur).
 * `@memolog/core` est volontairement *inclus* dans le bundle du main :
 * c'est du TypeScript source dans le monorepo, pas un paquet publié.
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@memolog/core'] })]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    plugins: [vue()]
  }
})
