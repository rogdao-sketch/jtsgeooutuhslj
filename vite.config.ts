import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import glsl from 'vite-plugin-glsl'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), glsl()],
  build: { chunkSizeWarningLimit: 1300 },
})
