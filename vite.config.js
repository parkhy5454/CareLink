import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Replit에서 바로 실행할 수 있도록 host/port/allowedHosts 설정
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: parseInt(process.env.PORT) || 3000,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.API_PORT || 3001}`,
        changeOrigin: true
      }
    }
  },
  preview: {
    host: '0.0.0.0',
    port: parseInt(process.env.PORT) || 3000,
    allowedHosts: true
  }
})
