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

type HakkenCoverageConfig = {
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
} satisfies HakkenCoverageConfig

/*
 * One time limit for every test, set here and nowhere else (AGENTS.md, "Test
 * time limits"). A timeout exists to catch a hang, not to police speed.
 *
 * On GitHub it is three minutes. Its runner, with coverage instrumentation and
 * the whole suite at once, runs these tests 10 to 12 times slower than a
 * laptop — 1.25s became over 15s, 3.4s over 30s, 4s became 45s — and every CI
 * run that failed in its tests from 2026-09-21 to 2026-09-28 (runs 6, 7, 14, 15
 * and 18) failed on a clock alone, each fixed one test at a time until the
 * next. Here it is thirty seconds, and speed itself is checked by the speed
 * budget `npm run test:run` applies (`scripts/check-test-speed.mjs`): a test
 * over five seconds here fails the local check, which on GitHub is about a
 * minute, well inside three.
 */
const TEST_TIMEOUT_MS = process.env.GITHUB_ACTIONS ? 180_000 : 30_000

/*
 * How hard a run here drives the machine (AGENTS.md, "Tests that never
 * flake"). A test's time in the full run is mostly waiting for the app's
 * code to load, not running: a test of 0.2s alone took 22s there, one of 1s
 * took 30s and timed out, because nineteen workers queued on one process to
 * turn the same files into code. Measured on 2026-10-05, the whole run alike
 * at about four and a half minutes (the Sites speed test sets its length):
 *
 *   nineteen workers, nothing kept      14 tests past 5s, the longest 22s
 *   half the cores (ten)                 4 past 5s, the longest 15.5s
 *   transformed files kept between runs  3 past 5s, the longest 7.5s
 *   both                                 1 past 5s, the longest 5.6s
 *
 * So here: half the cores, and the transformed files kept on disk between
 * runs (`node_modules/.vite/vitest`), redone for any file that changed.
 * GitHub's runs are left as they were: its three-minute limit has the room,
 * and its own cache of `node_modules` must never carry this one.
 */
const LOCAL_RUN = !process.env.GITHUB_ACTIONS

/*
 * What one test stubs — an environment value, `fetch` — is put back before
 * the next, whether or not it remembered to: a stub left behind changed the
 * tests after it, in whatever order a run happened to take. Each project sets
 * it, as each sets its time limit: a project takes nothing from the root.
 */
const STUBS_PUT_BACK = { unstubEnvs: true, unstubGlobals: true } as const

export default defineConfig({
  plugins: [reactPlugin],
  resolve: {
    alias: rootAlias,
  },
  test: {
    globals: true,
    coverage: coverageConfig,
    ...(LOCAL_RUN ? { maxWorkers: '50%', experimental: { fsModuleCache: true } } : {}),
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
          /*
           * The same reasoning as the backend project below: the Arcade engine
           * tests here are integration tests, not unit tests. They build a
           * district's geometry or play a whole map to completion. Raising them
           * one test at a time did not hold — the slowness belongs to the class
           * of test, not to any particular one — so the limit is the one above,
           * for every test.
           */
          testTimeout: TEST_TIMEOUT_MS,
          hookTimeout: TEST_TIMEOUT_MS,
          ...STUBS_PUT_BACK,
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
           * A genuine deadlock still fails, thirty seconds later here and three minutes
           * on GitHub (`TEST_TIMEOUT_MS` above).
           */
          testTimeout: TEST_TIMEOUT_MS,
          hookTimeout: TEST_TIMEOUT_MS,
          ...STUBS_PUT_BACK,
        },
      },
    ],
  },
})
