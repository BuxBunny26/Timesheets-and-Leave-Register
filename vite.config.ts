import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('@supabase')) return 'vendor-supabase'
          if (id.includes('node_modules/xlsx')) return 'vendor-xlsx'
          if (id.includes('node_modules/date-holidays')) return 'vendor-holidays'
          if (id.includes('node_modules/react-router') || id.includes('node_modules/react-dom')) return 'vendor-react'
        },
      },
    },
  },
})
