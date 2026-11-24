import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Les appels /api/* sont relayés vers le serveur Node (server/), qui détient la clé OpenAI.
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
