import { defineConfig } from 'vitest/config'
import type { TestUserConfig } from 'vitest/config'
import type { UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const rootAlias = {
  '@': path.resolve(__dirname, './'),
}

type VitestPlugin = NonNullable<UserConfig['plugins']>[number]

const reactPlugin = react() as unknown as VitestPlugin
const coverageThresholds = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, './coverage-thresholds.json'), 'utf8'),
).current
const coverageConfig: NonNullable<TestUserConfig['coverage']> & { all: boolean } = {
  provider: 'v8',
  reportsDirectory: './coverage',
  reporter: ['text', 'html', 'json-summary'],
  all: true,
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
  thresholds: coverageThresholds,
}

export default defineConfig({
  plugins: [reactPlugin],
  resolve: {
    alias: rootAlias,
  },
  test: {
    globals: true,
    coverage: coverageConfig,
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
