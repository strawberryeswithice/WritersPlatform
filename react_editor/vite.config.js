import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: '/editor/',
  build: {
    outDir: path.resolve(__dirname, '../frontend/dist'),
    assetsDir: 'assets',
    emptyOutDir: true,
  },
})