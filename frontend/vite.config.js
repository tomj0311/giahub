import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: parseInt(process.env.VITE_DEV_SERVER_PORT) || 5173,
    host: process.env.VITE_DEV_SERVER_HOST || '0.0.0.0',
    open: false,
    allowedHosts: process.env.VITE_ALLOWED_HOSTS ? process.env.VITE_ALLOWED_HOSTS.split(',') : [
      '135-235-137-65.nip.io',
      'localhost',
      '127.0.0.1'
    ]
  },
  build: {
    outDir: 'dist'
  }
})
