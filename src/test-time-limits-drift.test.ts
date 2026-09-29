import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { describe, expect, test } from 'vitest'
import { repoRoot } from './test/driftUtils'

/**
 * No test sets its own time limit (AGENTS.md, "Test time limits").
 *
 * There is one, in `vitest.config.ts`: three minutes on GitHub, where it only
 * catches a hang, and thirty seconds here. A limit given to one test overrides
 * it on GitHub too — which is how a 15-second limit failed a push on
 * 2026-09-28, the fifth CI run in a week to fail on a clock alone. Speed is
 * judged here instead, test by test on its own (`scripts/check-test-speed.mjs`).
 *
 * Read as source: `}, 15_000);` closing a test or a hook, or a test given
 * `{ timeout: … }`. Waiting up to a time for something on screen
 * (`findByText(…, {}, { timeout })`) is a different thing and is not matched.
 */

/** Files allowed a limit of their own, and why. May shrink, never grow. */
const ALLOWED = new Map([
  ['convex/sitesLoad.test.ts', 'The Sites speed test: about three minutes over 50,000 keywords by design, and it runs only here, never on GitHub.'],
])

/** A test's or hook's closing brace, at the start of its line, handed a number or a timeout constant. */
const CLOSING_LIMIT = /^[ \t]*\}[ \t]*,\s*(?:[1-9][\d_]{3,}|[A-Z][A-Z0-9_]*(?:TIMEOUT|_MS)[A-Z0-9_]*)\s*,?\s*\)\s*;/gm
/** A test, suite or hook given its options, a timeout among them. */
const OPTION_LIMIT = /\b(?:it|test|describe|bench)(?:\.[a-zA-Z]+)*\(\s*(['"`])(?:(?!\1)[^\n])*\1\s*,\s*\{[^}]*\btimeout\s*:/g
/** The limit changed from inside a test file. */
const CONFIG_LIMIT = /vi\.setConfig\(\s*\{[^}]*(?:testTimeout|hookTimeout)/g

function testFiles(dir: string): string[] {
  return readdirSync(join(repoRoot, dir), { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.test\.(?:ts|tsx|js|mjs)$/.test(file) && !file.includes('node_modules') && !file.includes('_generated'))
    .map((file) => `${dir}/${file}`)
}

describe('test time limits', () => {
  const files = ['convex', 'src', 'scripts', 'services'].flatMap(testFiles).filter((file) => file !== 'src/test-time-limits-drift.test.ts')

  test('the guard read the suite', () => {
    // A rule that reads nothing passes exactly as happily as one that works.
    expect(files.length).toBeGreaterThan(500)
  })

  test('no test sets a time limit of its own', () => {
    const offenders = files.flatMap((file) => {
      if (ALLOWED.has(file)) return []
      const source = readFileSync(join(repoRoot, file), 'utf8')
      return [CLOSING_LIMIT, OPTION_LIMIT, CONFIG_LIMIT].flatMap((pattern) =>
        Array.from(source.matchAll(pattern)).map((match) => `${file}:${source.slice(0, match.index).split('\n').length}`))
    })
    expect(
      offenders,
      'A test with a time limit of its own overrides the one limit in vitest.config.ts, on GitHub too. '
      + 'Remove it; if the test is slow, make it lighter — `npm run test:run` times every test on its own.',
    ).toEqual([])
  })

  test('the one limit is where it is said to be', () => {
    const config = readFileSync(join(repoRoot, 'vitest.config.ts'), 'utf8')
    expect(config).toMatch(/const TEST_TIMEOUT_MS = process\.env\.GITHUB_ACTIONS \? 180_000 : 30_000/)
    expect(config.match(/testTimeout: TEST_TIMEOUT_MS/g)).toHaveLength(2)
  })
})
