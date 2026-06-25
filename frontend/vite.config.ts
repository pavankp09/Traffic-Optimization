import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

declare const process: any;

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
        configure: (proxy, _options) => {
          const originalEmit = proxy.emit
          proxy.emit = function (event: any, ...args: any[]) {
            if (event === 'error') {
              const err = args[0] as any
              const ignoredErrors = ['ECONNREFUSED', 'ECONNRESET', 'ECONNABORTED', 'EPIPE', 'ETIMEDOUT']
              if (err && ignoredErrors.includes(err.code)) {
                const res = args[2] as any
                if (res) {
                  if (!res.headersSent && typeof res.writeHead === 'function') {
                    res.writeHead(502, { 'Content-Type': 'text/plain' })
                    res.end('Bad Gateway: Backend server is starting up or offline.')
                  } else if (typeof res.destroy === 'function') {
                    res.destroy()
                  }
                }
                return true
              }
            }
            return originalEmit.apply(this, [event, ...args])
          }
        }
      },
      '/socket.io': {
        target: process.env.VITE_BACKEND_URL ?? 'http://127.0.0.1:8004',
        changeOrigin: true,
        ws: true,
        configure: (proxy, _options) => {
          const originalEmit = proxy.emit
          proxy.emit = function (event: any, ...args: any[]) {
            if (event === 'error') {
              const err = args[0] as any
              const ignoredErrors = ['ECONNREFUSED', 'ECONNRESET', 'ECONNABORTED', 'EPIPE', 'ETIMEDOUT']
              if (err && ignoredErrors.includes(err.code)) {
                const res = args[2] as any
                if (res) {
                  if (!res.headersSent && typeof res.writeHead === 'function') {
                    res.writeHead(502, { 'Content-Type': 'text/plain' })
                    res.end('Bad Gateway: Backend server is starting up or offline.')
                  } else if (typeof res.destroy === 'function') {
                    res.destroy()
                  }
                }
                return true
              }
            }
            return originalEmit.apply(this, [event, ...args])
          }

          proxy.on('open', (proxySocket?: any) => {
            if (!proxySocket) return
            const originalEmitSocket = proxySocket.emit
            proxySocket.emit = function (event: any, ...args: any[]) {
              if (event === 'error') {
                const err = args[0] as any
                const ignoredErrors = ['ECONNREFUSED', 'ECONNRESET', 'ECONNABORTED', 'EPIPE', 'ETIMEDOUT']
                if (err && ignoredErrors.includes(err.code)) {
                  return true
                }
              }
              return originalEmitSocket.apply(this, [event, ...args])
            }
          })

          proxy.on('proxyReqWs', (proxyReq, req, socket, options, head) => {
            const originalEmitSocket = socket.emit
            socket.emit = function (event: any, ...args: any[]) {
              if (event === 'error') {
                const err = args[0] as any
                const ignoredErrors = ['ECONNREFUSED', 'ECONNRESET', 'ECONNABORTED', 'EPIPE', 'ETIMEDOUT']
                if (err && ignoredErrors.includes(err.code)) {
                  return true
                }
              }
              return originalEmitSocket.apply(this, [event, ...args])
            }
          })
        }
      },
    },
  },
})
