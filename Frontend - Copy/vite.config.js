import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('react') || id.includes('react-dom') || id.includes('react-router') || id.includes('redux')) {
            return 'vendor-react'
          }
          if (id.includes('lucide-react')) return 'vendor-icons'
          if (id.includes('axios')) return 'vendor-http'
          if (id.includes('exceljs')) return 'office-excel'
          if (id.includes('docx') || id.includes('file-saver')) return 'office-word'
          return 'vendor'
        },
      },
    },
  },
})
