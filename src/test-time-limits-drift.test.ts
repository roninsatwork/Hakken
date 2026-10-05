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
 *
 * Nor does a test wait on scheduled functions with convex-test's own
 * `finishAllScheduledFunctions`: it gives up after ten thousand turns of the
 * fake clock, a count standing in for a clock, and a function whose module is
 * loaded cold under a busy full run takes longer — the Content gap test failed
 * that way on 2026-10-04 and passed alone. `finishScheduled`
 * (`src/test/finishScheduled.ts`) waits by real time instead.
 *
 * And no test waits any other way that a busy run outlasts (AGENTS.md, "Tests
 * that never flake"; Anthony, 2026-10-05: "i don't want timeouts and flakes
 * ever again"): no loop moving the fake clock a counted number of times; no
 * moving it once and hoping the work got there (`whileMovingClock` in
 * `src/test/realTime.ts` waits for the work itself); no deadline read from a
 * clock fake timers replace, which in Vitest 4 is every clock; no sleep long
 * enough to be waiting for something; and every wait on screen the one
 * default, set in `vitest.setup.ts`.
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
/** convex-test's own wait on scheduled functions, bounded by a count of clock turns. */
const TURN_COUNTED_WAIT = /\.finishAllScheduledFunctions\s*\(/g

/** Moving the fake clock, or draining scheduled functions. */
const CLOCK_MOVE = /\bvi\.(?:advanceTimers\w*|runAllTimers\w*|runOnlyPendingTimers\w*)\s*\(|\.finishInProgressScheduledFunctions\s*\(/
/** Moves that only wait for work to reach a timer: `whileMovingClock` waits for the work itself. */
const CLOCK_PUMP = /\bvi\.(?:advanceTimersToNextTimer(?:Async)?|runAllTimersAsync|runOnlyPendingTimers(?:Async)?)\s*\(/g
/** A real clock read, which fake timers replace too (Vitest 4). */
const CLOCK_READ = /\bprocess\.hrtime\b|\bperformance\.now\s*\(/g
/** A real sleep: `new Promise((r) => setTimeout(r, N))`. */
const REAL_SLEEP = /new Promise\s*\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*\{?\s*setTimeout\s*\(\s*\1\s*,\s*([\d_]+)\s*\)/g
/** "Today" or a day before it, worked out from the real clock: `new Date()` or `Date.now()` sliced to a day. */
const TODAY_FROM_CLOCK = /new Date\(\s*(?:\)|Date\.now\(\)|now\b)[^\n]*\.toISOString\(\)\.slice\(0,\s*10\)/g
/** A test that fixes the clock, so "today" cannot change under it. */
const CLOCK_FIXED = /\buseMiddayUtc\s*\(|\bsetSystemTime\s*\(|\buseFakeTimers\s*\(/

/** A wait on screen given its own limit, or Vitest's own wait, which no default reaches. */
const SCREEN_WAIT = /\b(?:find(?:All)?By\w+|waitFor(?:ElementToBeRemoved)?)\s*\(/g

/** The text of a loop's body: from its header's closing parenthesis, a braced block or one statement. */
function loopBodies(source: string): Array<{ at: number; body: string }> {
  const bodies: Array<{ at: number; body: string }> = []
  for (const match of source.matchAll(/\b(?:for|while)\s*\(/g)) {
    let index = (match.index ?? 0) + match[0].length
    let depth = 1
    while (index < source.length && depth > 0) {
      if (source[index] === '(') depth += 1
      else if (source[index] === ')') depth -= 1
      index += 1
    }
    const header = source.slice(match.index, index)
    while (/\s/.test(source[index] ?? '')) index += 1
    let end = index
    if (source[index] === '{') {
      let braces = 0
      for (; end < source.length; end += 1) {
        if (source[end] === '{') braces += 1
        else if (source[end] === '}' && --braces === 0) break
      }
    } else {
      end = source.indexOf(';', index)
    }
    bodies.push({ at: match.index ?? 0, body: header + source.slice(index, end + 1) })
  }
  return bodies
}

/** The call's own arguments, from its opening parenthesis to the one that closes it. */
function callArguments(source: string, open: number): string {
  let depth = 0
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '(') depth += 1
    else if (source[index] === ')' && --depth === 0) return source.slice(open, index + 1)
  }
  return source.slice(open)
}

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

  test('scheduled functions are waited for by real time, never a count of clock turns', () => {
    const offenders = files.flatMap((file) => {
      const source = readFileSync(join(repoRoot, file), 'utf8')
      return Array.from(source.matchAll(TURN_COUNTED_WAIT)).map((match) => `${file}:${source.slice(0, match.index).split('\n').length}`)
    })
    expect(
      offenders,
      '`finishAllScheduledFunctions` gives up after ten thousand clock turns, which a cold module outlasts under a busy run. '
      + 'Use `await finishScheduled(t)` from `src/test/finishScheduled.ts`.',
    ).toEqual([])
  })

  const offendersOf = (find: (file: string, source: string) => number[]) => files.flatMap((file) => {
    const source = readFileSync(join(repoRoot, file), 'utf8')
    return find(file, source).map((at) => `${file}:${source.slice(0, at).split('\n').length}`)
  })

  test('no test moves the fake clock in a loop, a counted number of times', () => {
    const offenders = offendersOf((_, source) => loopBodies(source).filter((loop) => CLOCK_MOVE.test(loop.body)).map((loop) => loop.at))
    expect(
      offenders,
      'A loop that moves the clock "N times and hopes" runs out before cold code has loaded in a busy run. '
      + 'Wait for the work itself: `whileMovingClock` (src/test/realTime.ts), `finishScheduled` or `finishDueNow` (src/test/finishScheduled.ts).',
    ).toEqual([])
  })

  test('no test moves the clock and hopes the work got there', () => {
    const offenders = offendersOf((_, source) => Array.from(source.matchAll(CLOCK_PUMP)).map((match) => match.index ?? 0))
    expect(
      offenders,
      'Moving the fake clock to its next timer, or running every timer once, finishes nothing that has not yet reached a timer — '
      + 'and under a busy run it has not. `await whileMovingClock(work)` (src/test/realTime.ts) moves it until the work is done.',
    ).toEqual([])
  })

  test('no test reads a deadline from a clock fake timers replace', () => {
    const offenders = offendersOf((_, source) => (/\bvi\.useFakeTimers\s*\(/.test(source)
      ? Array.from(source.matchAll(CLOCK_READ)).map((match) => match.index ?? 0)
      : []))
    expect(
      offenders,
      'Vitest 4\'s fake timers replace `process.hrtime` and `performance.now` too, so time read from them is fake. '
      + 'Use `realDeadline` (src/test/realTime.ts), which keeps a real timer from before the fakes.',
    ).toEqual([])
  })

  test('no test sleeps long enough to be waiting for something', () => {
    const offenders = offendersOf((_, source) => Array.from(source.matchAll(REAL_SLEEP))
      .filter((match) => Number(match[2].replace(/_/g, '')) >= 50)
      .map((match) => match.index ?? 0))
    expect(
      offenders,
      'A sleep is a guess at how long something takes; a busy run outlasts it, and the test then checks nothing or fails. '
      + 'Wait for what it does (`waitFor`, `findBy…`, `whileMovingClock`).',
    ).toEqual([])
  })

  test('a test that works out today keeps away from midnight', () => {
    const offenders = offendersOf((_, source) => (CLOCK_FIXED.test(source)
      ? []
      : Array.from(source.matchAll(TODAY_FROM_CLOCK)).map((match) => match.index ?? 0)))
    expect(
      offenders,
      'A test that works out "today" from the real clock, beside code that works it out again, fails on the run that crosses midnight. '
      + 'Call `useMiddayUtc()` (src/test/realTime.ts) before each test, and `vi.useRealTimers()` after.',
    ).toEqual([])
  })

  test('every wait on screen takes the one default', () => {
    const offenders = offendersOf((_, source) => [
      ...Array.from(source.matchAll(SCREEN_WAIT))
        .filter((match) => /\btimeout\s*:/.test(callArguments(source, (match.index ?? 0) + match[0].length - 1)))
        .map((match) => match.index ?? 0),
      ...Array.from(source.matchAll(/\bvi\.waitFor\s*\(/g)).map((match) => match.index ?? 0),
    ])
    expect(
      offenders,
      'A wait on screen with a limit of its own is shorter than the default a busy run needs, and `vi.waitFor` ignores the default. '
      + 'Drop the limit, and use Testing Library\'s `waitFor` or `findBy…`: the one default is in vitest.setup.ts.',
    ).toEqual([])
  })

  test('the run is set as measured, and the one default for screens is where it is said to be', () => {
    const config = readFileSync(join(repoRoot, 'vitest.config.ts'), 'utf8')
    expect(config).toMatch(/\.\.\.\(LOCAL_RUN \? \{ maxWorkers: '50%', experimental: \{ fsModuleCache: true \} \} : \{\}\)/)
    expect(config).toMatch(/const STUBS_PUT_BACK = \{ unstubEnvs: true, unstubGlobals: true \} as const/)
    expect(config.match(/\.\.\.STUBS_PUT_BACK/g)).toHaveLength(2)
    const setup = readFileSync(join(repoRoot, 'vitest.setup.ts'), 'utf8')
    expect(setup).toMatch(/configure\(\{ asyncUtilTimeout: SCREEN_WAIT_MS \}\)/)
  })

  test('the one limit is where it is said to be', () => {
    const config = readFileSync(join(repoRoot, 'vitest.config.ts'), 'utf8')
    expect(config).toMatch(/const TEST_TIMEOUT_MS = process\.env\.GITHUB_ACTIONS \? 180_000 : 30_000/)
    expect(config.match(/testTimeout: TEST_TIMEOUT_MS/g)).toHaveLength(2)
  })
})
