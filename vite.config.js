import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  // Relative asset paths so the same build works both on Vercel (served at /)
  // and bundled into the native app (loaded from the app's local origin).
  base: './',
  plugins: [react()],
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/lib/**/*.{js,jsx}'],
      exclude: ['src/lib/**/*.test.{js,jsx}'],
      thresholds: {
        statements: 85,
        branches: 75,
        functions: 88,
        lines: 88,
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(projectRoot, 'index.html'),
        nativeCameraParity: resolve(projectRoot, 'native-camera-parity.html'),
      },
    },
  },
})
