import path from 'path';
import fs from 'fs';
import { describe, expect, test } from 'vitest';
import { repoRoot, walkFiles, relativePath } from './test/driftUtils';

/**
 * Backend modules do not grow, and the oversized ones may only shrink.
 *
 * `agentSkills.ts` reached 2,458 lines before anything stopped it, and the
 * only reason it was ever measured is that an outside auditor read the tree
 * and said so. Splitting it fixed one file; it did not fix the absence of
 * anything that would have noticed. This is that missing thing, built the way
 * every other baseline in this repo is built: freeze the measured population,
 * let it fall, never let it rise.
 *
 * The frozen list is the honest count on 2026-08-26 — 23 modules above
 * 1000 lines, `schema.ts` among them because a schema is one declaration per
 * field and splitting it would buy nothing. None of the others were touched to
 * produce this list. They are recorded, not endorsed, and each is free to
 * leave by getting smaller.
 *
 * Two rules, both shrink-only:
 *   - a module over the ceiling that is not on the list fails
 *   - a module on the list that grew past its frozen count fails
 *   - an entry whose file has shrunk under the ceiling, or gone, must be
 *     deleted, or it sits there claiming to guard something it no longer does
 */

const CEILING = 1000;

const FROZEN: Record<string, number> = {
  'convex/schema.ts': 4421,
  'convex/agentEvalFixtures.ts': 2000,
  'convex/salesDataResearch.ts': 1991,
  'convex/wikiPages.ts': 1888,
  'convex/knowledge.ts': 1752,
  'convex/aiModels.ts': 1538,
  'convex/agents.ts': 1390,
  'convex/salesDataMarketDiscovery.ts': 1352,
  'convex/agentRuns.ts': 1343,
  'convex/agentRuntime.ts': 1212,
  'convex/users.ts': 1210,
  'convex/aiToolExecutionService.ts': 1175,
  'convex/agentSkills.ts': 1173,
  'convex/salesData.ts': 1152,
  'convex/agentMemoryCandidates.ts': 1151,
  'convex/agentObjectiveLoop.ts': 1101,
  'convex/analytics.ts': 1076,
  'convex/dataMigrations.ts': 1074,
  'convex/salesDataResearchJobs.ts': 1070,
  'convex/workflowEngine.ts': 1047,
  'convex/companyMemories.ts': 1035,
  'convex/purges.ts': 1018,
  'convex/aiTools.ts': 1007,
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

  test('no frozen module grew', () => {
    const grown = backendModules
      .filter((file) => file in FROZEN && lineCount(file) > FROZEN[file])
      .map((file) => `${file} grew from ${FROZEN[file]} to ${lineCount(file)}`);

    expect(grown).toEqual([]);
  });

  test('no frozen entry is stale', () => {
    const stale = Object.keys(FROZEN)
      .filter((file) => !backendModules.includes(file) || lineCount(file) <= CEILING);

    expect(stale).toEqual([]);
  });
});
