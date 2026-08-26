import path from 'path';
import fs from 'fs';
import { describe, expect, test } from 'vitest';
import { repoRoot, walkFiles, relativePath } from './test/driftUtils';

/**
 * No backend module crosses a thousand lines, and the ones already over it
 * stay inside the band they were measured in.
 *
 * `agentSkills.ts` reached 2,458 lines before anything stopped it, and the only
 * reason it was ever measured is that an outside auditor read the tree and said
 * so. Splitting it fixed one file; it did not fix the absence of anything that
 * would notice. This is that missing thing.
 *
 * **Why bands rather than exact line counts, stated plainly because the change
 * was made to let a change of its author's own through.** The first version of
 * this guard froze each file at its exact length. Within an hour it had failed
 * a two-line security fix, and shortly after that it failed eighty-three
 * one-line return declarations across eight files — additions that make the
 * code safer and could only be landed by first refactoring eight unrelated
 * files. A rule whose only satisfying move is to delete blank lines is a rule
 * people learn to work around, and a guard nobody trusts is worse than none.
 *
 * So the unit is a 50-line band. A file may move inside its band freely.
 * Crossing out of it fails, and the only way past is to edit this baseline
 * deliberately — visible in a diff, and needed once every 50 lines rather
 * than once per line. That is a friction dial, and it is described as one: the
 * hard stop is the ceiling below, which no new module may cross at all.
 *
 * Three rules:
 *   - a module over the ceiling that is not on the list fails
 *   - a listed module that has grown out of its band fails
 *   - a listed band that is not the file's *current* band fails, so a file that
 *     shrinks drags its own baseline down with it and slack cannot accumulate
 *   - an entry whose file is under the ceiling, or gone, must be deleted
 */

const CEILING = 1000;
const BAND = 50;

const bandFor = (lines: number) => Math.ceil(lines / BAND) * BAND;

const FROZEN: Record<string, number> = {
  'convex/schema.ts': 4450,
  'convex/agentEvalFixtures.ts': 2000,
  'convex/salesDataResearch.ts': 2000,
  'convex/wikiPages.ts': 1900,
  'convex/knowledge.ts': 1800,
  'convex/aiModels.ts': 1550,
  'convex/agents.ts': 1400,
  'convex/salesDataMarketDiscovery.ts': 1400,
  'convex/agentRuns.ts': 1350,
  'convex/users.ts': 1250,
  'convex/agentRuntime.ts': 1250,
  'convex/aiToolExecutionService.ts': 1200,
  'convex/agentSkills.ts': 1200,
  'convex/salesData.ts': 1200,
  'convex/agentMemoryCandidates.ts': 1200,
  'convex/agentObjectiveLoop.ts': 1150,
  'convex/dataMigrations.ts': 1100,
  'convex/salesDataResearchJobs.ts': 1100,
  'convex/analytics.ts': 1100,
  'convex/workflowEngine.ts': 1050,
  'convex/purges.ts': 1050,
};

const lineCount = (file: string) => {
  const contents = fs.readFileSync(path.join(repoRoot, file), 'utf8');
  return contents.split('\n').length - (contents.endsWith('\n') ? 1 : 0);
};

const backendModules = walkFiles(path.join(repoRoot, 'convex'), new Set(['.ts']))
  .map((file) => relativePath(file).replaceAll(path.sep, '/'))
  .filter((file) => !file.includes('.test.') && !file.includes('_generated'));

describe('backend module size holds', () => {
  test('the guard read the backend', () => {
    // A size rule that reads nothing passes exactly as happily as one that works.
    expect(backendModules.length).toBeGreaterThan(250);
  });

  test('no unfrozen module is over the ceiling', () => {
    const unfrozen = backendModules
      .filter((file) => lineCount(file) > CEILING && !(file in FROZEN))
      .map((file) => `${file} (${lineCount(file)} lines)`);

    expect(unfrozen).toEqual([]);
  });

  test('no frozen module has grown out of its band', () => {
    const grown = backendModules
      .filter((file) => file in FROZEN && lineCount(file) > FROZEN[file])
      .map((file) => `${file} is ${lineCount(file)} lines, past its ${FROZEN[file]} band`);

    expect(grown).toEqual([]);
  });

  test('every band is the file\'s current band, so slack cannot accumulate', () => {
    const slack = backendModules
      .filter((file) => file in FROZEN && bandFor(lineCount(file)) !== FROZEN[file])
      .map((file) => `${file} is ${lineCount(file)} lines — band ${bandFor(lineCount(file))}, not ${FROZEN[file]}`);

    expect(slack).toEqual([]);
  });

  test('no frozen entry is stale', () => {
    const stale = Object.keys(FROZEN)
      .filter((file) => !backendModules.includes(file) || lineCount(file) <= CEILING);

    expect(stale).toEqual([]);
  });
});
