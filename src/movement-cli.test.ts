import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { describe, expect, test } from 'vitest';
import { repoRoot } from './test/driftUtils';

/**
 * The movement demo's 101 commands stay reachable, and stay indexed.
 *
 * The review's twelfth package wanted them folded into a dispatcher and the
 * prefixed entries deleted. That half is not available: the names are
 * referenced 1,258 times across 96 files, and four of those sit inside the
 * frozen Posture Studio source — `MovementCaptureClient` prints one on screen
 * for the user to copy and type. A rename would put a broken instruction in
 * front of a customer.
 *
 * So `npm run movement` indexes them instead of replacing them, and this holds
 * the two properties that makes it worth having: the index is complete, and
 * every name in it dispatches. A dispatcher that had drifted from package.json
 * would list commands that no longer run, or miss ones that do, and either way
 * would be worse than the wall it replaced.
 */

const CLI = path.join(repoRoot, 'scripts/movement.mjs');

const movementScripts: string[] = Object.keys(
  JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).scripts ?? {},
).filter((name) => name.startsWith('movement:'));

const runCli = (args: string[]) => {
  try {
    return { status: 0, output: execFileSync('node', [CLI, ...args], { encoding: 'utf8' }) };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return { status: failure.status ?? 1, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
  }
};

describe('the movement command index holds', () => {
  const listing = runCli([]);

  test('there is a command set to index', () => {
    // An index proving nothing is indistinguishable from one that works.
    expect(movementScripts.length).toBeGreaterThan(50);
  });

  test('the index names every movement command', () => {
    const missing = movementScripts.filter(
      (name) => !listing.output.includes(name.slice('movement:'.length)),
    );

    expect(missing).toEqual([]);
  });

  test('the index counts what package.json actually holds', () => {
    expect(listing.output).toContain(`${movementScripts.length} movement demo commands`);
  });

  test('an unknown command is refused rather than silently run', () => {
    const result = runCli(['replay:no-such-command']);

    expect(result.status).toBe(1);
    expect(result.output).toContain('There is no "movement:replay:no-such-command"');
  });

  test('a wrong name is answered with its own family, not a neighbouring one', () => {
    // `includes` alone answered a bad `replay:` name with the whole of
    // `replay-game`, which sorts first and contains the string.
    const result = runCli(['replay:no-such-command']);
    const suggestions = result.output.split('Closest:')[1] ?? '';

    expect(suggestions).toContain('replay:analyze');
    expect(suggestions).not.toContain('replay-game:');
  });
});
