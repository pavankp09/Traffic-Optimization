import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: process.env.FRONTEND_HOST ?? '0.0.0.0',
    port: Number(process.env.FRONTEND_PORT ?? 8005),
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_URL ?? 'http://127.0.0.1:8004',
        changeOrigin: true,
      },
      '/socket.io': {
        target: process.env.VITE_BACKEND_URL ?? 'http://127.0.0.1:8004',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
