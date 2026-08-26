import path from 'path';
import fs from 'fs';
import { describe, expect, test } from 'vitest';
import { repoRoot, walkFiles, relativePath } from './test/driftUtils';

/**
 * Client-callable surfaces declare what they return, and the gap only closes.
 *
 * An outside audit read return-validator coverage as 11% and it was right about
 * the number: 455 client-callable declarations still say nothing about their
 * shape. Writing 455 validators is not a session's work, and the count was
 * never the harm anyway — the harm is a handler posting a whole database row to
 * a browser, which is how `users.tokenIdentifier` reached any colleague in the
 * same company and `workflows.webhookSecret` reached the workflow editor.
 *
 * So this guards the two things that matter while the rest is worked through:
 * the population may not grow, and the handlers that hand back an unshaped row
 * are named, frozen and may only leave. Both are shrink-only, like every other
 * baseline here.
 *
 * Note what declaring a shape does and does not do. A Convex return validator
 * refuses an unexpected field rather than quietly dropping it, so a validator
 * alone does not strip a secret — the row has to be narrowed on the way out,
 * and the validator is what makes forgetting that a failure. `toClientUser`
 * and `toClientWorkflow` are those narrowings.
 */

const MISSING_SHAPE_CEILING = 362;

/** Handlers that still return a database row unshaped. This list may only shrink. */
const FROZEN_UNSHAPED = new Set<string>([
]);

const CLIENT_BUILDERS = new Set([
  'query', 'mutation', 'action',
  'tenantQuery', 'tenantMutation', 'tenantAction',
  'adminQuery', 'adminMutation', 'adminAction',
  'superAdminQuery', 'superAdminMutation', 'superAdminAction',
  'publicQuery', 'publicMutation', 'publicAction',
  'softQuery', 'softMutation',
  'moduleQuery', 'moduleMutation',
  'governanceQuery', 'governanceMutation',
]);

const backendModules = walkFiles(path.join(repoRoot, 'convex'), new Set(['.ts']))
  .map((file) => relativePath(file).replaceAll(path.sep, '/'))
  .filter((file) => !file.includes('.test.') && !file.includes('_generated'));

type Declaration = { id: string; hasShape: boolean; returnsRawRow: boolean };

const declarations: Declaration[] = backendModules.flatMap((file) => {
  const contents = fs.readFileSync(path.join(repoRoot, file), 'utf8');
  const lines = contents.split('\n');
  const found: Declaration[] = [];

  for (const match of contents.matchAll(/^export const (\w+) = (\w+)\(\{/gm)) {
    if (!CLIENT_BUILDERS.has(match[2])) continue;

    const start = contents.slice(0, match.index ?? 0).split('\n').length - 1;
    let end = start;
    while (end < lines.length && lines[end] !== '});') end += 1;
    const body = lines.slice(start, end).join('\n');

    // A row that is read and handed straight back, either inline or through a
    // variable that nothing shapes in between.
    const direct = /return (await )?ctx\.db\.(get|query)\b/.test(body);
    const viaVariable = Array.from(body.matchAll(/const (\w+) = await ctx\.db\.(?:get|query)\b/g))
      .some((assignment) => body.includes(`return ${assignment[1]};`));

    found.push({
      id: `${file}:${match[1]}`,
      hasShape: /^ {2}returns:/m.test(body),
      returnsRawRow: direct || viaVariable,
    });
  }

  return found;
});

describe('client-callable return shapes hold', () => {
  test('the guard read the backend', () => {
    // A rule that matches nothing passes exactly as happily as one that works.
    expect(backendModules.length).toBeGreaterThan(250);
    expect(declarations.length).toBeGreaterThan(400);
  });

  test('the population without a declared shape only shrinks', () => {
    const missing = declarations.filter((declaration) => !declaration.hasShape);

    expect(missing.length).toBeLessThanOrEqual(MISSING_SHAPE_CEILING);
  });

  test('no new handler hands back an unshaped database row', () => {
    const offenders = declarations
      .filter((declaration) => !declaration.hasShape && declaration.returnsRawRow)
      .map((declaration) => declaration.id)
      .filter((id) => !FROZEN_UNSHAPED.has(id));

    expect(offenders).toEqual([]);
  });

  test('no frozen entry is stale', () => {
    const live = new Set(declarations
      .filter((declaration) => !declaration.hasShape && declaration.returnsRawRow)
      .map((declaration) => declaration.id));
    const stale = Array.from(FROZEN_UNSHAPED).filter((id) => !live.has(id));

    expect(stale).toEqual([]);
  });
});
