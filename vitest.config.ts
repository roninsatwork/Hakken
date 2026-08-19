import { defineConfig } from 'vitest/config'
import type { ViteUserConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const rootAlias = {
  '@': path.resolve(__dirname, './'),
}

type VitestPlugin = NonNullable<ViteUserConfig['plugins']>[number]

const reactPlugin = react() as unknown as VitestPlugin
const coverageThresholds = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, './coverage-thresholds.json'), 'utf8'),
).current

type SonaeCoverageConfig = {
  provider: 'v8'
  reportsDirectory: string
  reporter: Array<'text' | 'html' | 'json-summary'>
  all: true
  include: string[]
  exclude: string[]
  thresholds: typeof coverageThresholds
}

const coverageConfig = {
  provider: 'v8' as const,
  reportsDirectory: './coverage',
  reporter: ['text', 'html', 'json-summary'],
  all: true,
  include: ['src/**/*.{ts,tsx}', 'convex/**/*.ts'],
  exclude: [
    'convex/_generated/**',
    'convex/crons.ts',
    'convex/http.ts',
    'convex/seed*.ts',
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
} satisfies SonaeCoverageConfig

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
          include: [
            'convex/**/*.test.{ts,tsx}',
            'scripts/**/*.test.{js,mjs,ts,tsx}',
            // The voice relay is a plain Node service rather than app code,
            // but it was unreachable by the suite and shipped a bug that only
            // a live call could reveal. It runs with everything else now.
            'services/**/*.test.{js,mjs,ts,tsx}',
          ],
          /*
           * Vitest's default is 5s, which is too tight for these.
           *
           * Many of them are integration tests, not unit tests: `convexTest` runs the
           * real runtime, the real scheduler and the real database for a whole agent
           * turn. `agentRuntime.test.ts`'s slowest case takes ~550ms alone, and was
           * observed at 5,004ms — a 9x slowdown — while 429 files ran in parallel
           * against a busy machine. CI is the harder case, not the easier one: a
           * two-core runner with coverage instrumentation on top.
           *
           * A timeout exists to catch a hang, not to police performance. At 5s it was
           * doing the second job and failing at the first, and the failure did not
           * stay contained: a timed-out `t.action` keeps running, so its orphaned
           * model call consumed the `mockResolvedValueOnce` queued by the *next*
           * test, which then failed instantly on a response it never asked for. One
           * slow test, two red results, neither of them a real defect.
           *
           * A genuine deadlock still fails here, thirty seconds later, and stands out
           * against a suite whose full wall-clock is around twenty-five.
           */
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
})
