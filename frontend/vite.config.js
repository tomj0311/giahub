import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: false,
    proxy: {
      '/rbac': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/auth/login': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/auth/google': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/auth/logout': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/auth/me': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/users': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: 'dist'
  }
})
