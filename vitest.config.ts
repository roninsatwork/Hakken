import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

const rootAlias = {
  '@': path.resolve(__dirname, './'),
}

export default defineConfig({
  plugins: [react() as any],
  resolve: {
    alias: rootAlias,
  },
  test: {
    globals: true,
    projects: [
      {
        plugins: [react() as any],
        resolve: {
          alias: rootAlias,
        },
        test: {
          name: 'ui',
          globals: true,
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
          setupFiles: ['./vitest.setup.ts'],
        },
      },
      {
        resolve: {
          alias: rootAlias,
        },
        test: {
          name: 'backend',
          globals: true,
          environment: 'node',
          include: ['convex/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
})
