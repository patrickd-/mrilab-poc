import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      input: {
        lab: 'index.html',
        presentation: 'presentation/index.html',
      },
    },
  },
})
