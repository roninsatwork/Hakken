import { defineConfig } from 'vitest/config'
import type { PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const rootAlias = {
  '@': path.resolve(__dirname, './'),
}

const reactPlugin = react() as PluginOption

export default defineConfig({
  plugins: [reactPlugin],
  resolve: {
    alias: rootAlias,
  },
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.{ts,tsx}', 'convex/**/*.ts'],
      exclude: [
        'adk-python/**',
        'convex/_generated/**',
        'convex/crons.ts',
        'convex/debug.ts',
        'convex/debugModels.ts',
        'convex/http.ts',
        'convex/migrations.ts',
        'convex/seed*.ts',
        'convex/testQuery.ts',
        'coverage/**',
        'node_modules/**',
        '.next/**',
        '**/*.config.{ts,tsx,js,mjs,cjs}',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        'src/e2e/**',
        'src/**/_generated/**',
        'vitest.setup.ts',
      ],
    },
    projects: [
      {
        plugins: [reactPlugin],
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
