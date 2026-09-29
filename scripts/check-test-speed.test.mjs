import { describe, expect, it } from 'vitest';
import { BUDGET_MS, SLOW_TESTS, namePattern, overBudget, readTimings } from './check-test-speed.mjs';

/**
 * The test speed budget (AGENTS.md, "Test time limits"): which tests the full
 * run finds over it, and the pattern that times them again on their own.
 */
describe('the test speed budget', () => {
  const report = {
    testResults: [
      {
        name: '/repo/convex/example.test.ts',
        assertionResults: [
          { fullName: 'a suite a quick test', status: 'passed', duration: 40 },
          { fullName: 'a suite a slow test (whole company)', status: 'passed', duration: 7_200 },
          { fullName: 'a suite a failed test', status: 'failed', duration: 9_000 },
        ],
      },
    ],
  };

  it('reads each passed test with its file, full name and time', () => {
    expect(readTimings(report, '/repo')).toEqual([
      { file: 'convex/example.test.ts', name: 'a suite a quick test', key: 'convex/example.test.ts › a suite a quick test', duration: 40 },
      { file: 'convex/example.test.ts', name: 'a suite a slow test (whole company)', key: 'convex/example.test.ts › a suite a slow test (whole company)', duration: 7_200 },
    ]);
  });

  it('finds the tests over five seconds that are not slow on purpose', () => {
    const tests = readTimings(report, '/repo');
    expect(BUDGET_MS).toBe(5_000);
    expect(overBudget(tests, new Map()).map((test) => test.name)).toEqual(['a suite a slow test (whole company)']);
    expect(overBudget(tests, new Map([['convex/example.test.ts › a suite a slow test (whole company)', 'on purpose']]))).toEqual([]);
  });

  it('picks exactly those tests out of their file, whatever their names hold', () => {
    const pattern = new RegExp(namePattern(['a suite a slow test (whole company)', 'costs $0.10+']));
    expect(pattern.test('a suite a slow test (whole company)')).toBe(true);
    expect(pattern.test('costs $0.10+')).toBe(true);
    expect(pattern.test('a suite a slow test whole company')).toBe(false);
  });

  it('says why each test that is slow on purpose is', () => {
    for (const [key, why] of SLOW_TESTS) {
      expect(key).toContain(' › ');
      expect(why.length).toBeGreaterThan(20);
    }
  });
});
