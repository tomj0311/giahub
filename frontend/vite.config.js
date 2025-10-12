import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    open: false,
    allowedHosts: [
      '135-235-137-65.nip.io',
      'localhost',
      '127.0.0.1'
    ]
  },
  build: {
    outDir: 'dist'
  }
})
