import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react()
  ],

  // Node by default. A component test opts into a DOM with `// @vitest-environment jsdom` at its top.
  test: { environment: 'node', include: ['src/**/*.test.{ts,tsx}'] },

})
