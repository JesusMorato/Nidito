import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// La app se publica en https://jesusmorato.github.io/Nidito/
// por eso la ruta base es /Nidito/ (debe coincidir con el nombre del repo).
export default defineConfig({
  plugins: [vue()],
  base: '/Nidito/',
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
