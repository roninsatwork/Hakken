import path from 'path';
import fs from 'fs';
import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import { repoRoot, walkFiles, relativePath } from './test/driftUtils';

/**
 * Client-callable surfaces declare what they return, and the gap only closes.
 *
 * An outside audit read return-validator coverage as 11% and it was right about
 * the number: 455 client-callable declarations still said nothing about their
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
 *
 * **The row rule parses now, and this is why.** It used to match the text
 * `return await ctx.db.get(` — the call written on one line. Almost every read
 * in `convex/` wraps the chain over several lines, so the rule read past nearly
 * all of them and reported zero offenders while four people surfaces were still
 * handing back whole `users` rows. Text matching also cannot tell a handler
 * that returns a row from one that returns an object built around a nested
 * read. Both are questions about syntax, so the answer comes from the syntax
 * tree, and the test below breaks the rule against each of those shapes so it
 * cannot quietly go blind again.
 */

const MISSING_SHAPE_CEILING = 284;

/**
 * Handlers that still hand back a database row unshaped. This list may only
 * shrink; each one leaves as its file gains declared shapes.
 *
 * `convex/movements.ts:list` is the entry that stays. It is frozen Posture
 * Studio code and is excluded from this effort permanently.
 */
const FROZEN_UNSHAPED = new Set<string>([
  'convex/agentImprovementSuggestions.ts:getForRun',
  'convex/agentImprovementSuggestions.ts:getRecentForAgent',
  'convex/agentLogs.ts:getForRun',
  'convex/agentMemories.ts:getForAgent',
  'convex/agentMemoryCandidates.ts:getForRun',
  'convex/agentMemoryCandidates.ts:getRecentForAgent',
  'convex/agentRunFeedback.ts:getForRun',
  'convex/agentRunFeedback.ts:getMineForAgent',
  'convex/agentRunReflections.ts:getForRun',
  'convex/agentRunReflections.ts:getRecentForAgent',
  'convex/agentVersions.ts:getForAgent',
  'convex/aiTools.ts:getPaginatedTools',
  'convex/chatAdmin.ts:getAdminThreadMessages',
  'convex/companyEvals.ts:getRunsForCase',
  'convex/companyMemories.ts:getCandidatesForCompany',
  'convex/companyMemories.ts:getForCompany',
  'convex/companyMemories.ts:getPreviewForCompany',
  'convex/companySkills.ts:getBindingsForSkill',
  'convex/dataMigrations.ts:getStatus',
  'convex/mcpServers.ts:listServers',
  'convex/movements.ts:list',
  'convex/notifications.ts:listMine',
  'convex/plans.ts:getActivePlans',
  'convex/widgets.ts:getGlobalWidgets',
  'convex/widgets.ts:getPrimaryGlobalWidget',
  'convex/widgets.ts:getPrimaryWidgetByCompany',
  'convex/widgets.ts:getWidgetsByCompany',
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

type Declaration = { id: string; hasShape: boolean; returnsRawRow: boolean };

const withoutWrappers = (node: ts.Expression): ts.Expression => {
  let current = node;
  for (;;) {
    if (ts.isParenthesizedExpression(current)) { current = current.expression; continue; }
    if (ts.isAwaitExpression(current)) { current = current.expression; continue; }
    if (ts.isAsExpression(current) || ts.isNonNullExpression(current)) { current = current.expression; continue; }
    return current;
  }
};

/** A `ctx.db.get(...)` or `ctx.db.query(...)` anywhere down the call chain. */
const isDatabaseRead = (node: ts.Expression) => {
  let current: ts.Node = withoutWrappers(node);
  while (ts.isCallExpression(current) || ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    if (ts.isPropertyAccessExpression(current)
      && (current.name.text === 'get' || current.name.text === 'query')
      && ts.isPropertyAccessExpression(current.expression)
      && current.expression.name.text === 'db') {
      return true;
    }
    current = current.expression;
  }
  return false;
};

/** Statements belonging to this function, never to one nested inside it. */
const walkOwnBody = (fn: ts.Node, visit: (node: ts.Node) => void) => {
  const step = (node: ts.Node) => {
    if (node !== fn
      && (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node))) {
      return;
    }
    visit(node);
    ts.forEachChild(node, step);
  };
  ts.forEachChild(fn, step);
};

const handlerReturnsRawRow = (fn: ts.ArrowFunction | ts.FunctionExpression) => {
  if (!ts.isBlock(fn.body)) return isDatabaseRead(fn.body);

  const bindings = new Map<string, ts.Expression>();
  const returned: ts.Expression[] = [];
  walkOwnBody(fn, (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      bindings.set(node.name.text, node.initializer);
    }
    if (ts.isReturnStatement(node) && node.expression) returned.push(node.expression);
  });

  return returned.some((expression) => {
    if (isDatabaseRead(expression)) return true;
    const bare = withoutWrappers(expression);
    const binding = ts.isIdentifier(bare) ? bindings.get(bare.text) : undefined;
    return binding ? isDatabaseRead(binding) : false;
  });
};

const readDeclarations = (fileName: string, contents: string): Declaration[] => {
  const source = ts.createSourceFile(fileName, contents, ts.ScriptTarget.Latest, true);
  const found: Declaration[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
        const call = declaration.initializer;
        if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) continue;
        if (!CLIENT_BUILDERS.has(call.expression.text)) continue;
        const config = call.arguments[0];
        if (!config || !ts.isObjectLiteralExpression(config)) continue;

        const property = (name: string) => config.properties.find((entry) =>
          entry.name && ts.isIdentifier(entry.name) && entry.name.text === name);
        const handler = property('handler');
        const fn = handler && ts.isPropertyAssignment(handler) ? handler.initializer : undefined;
        const hasShape = Boolean(property('returns'));

        found.push({
          id: `${fileName}:${declaration.name.text}`,
          hasShape,
          returnsRawRow: !hasShape
            && fn !== undefined
            && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))
            && handlerReturnsRawRow(fn),
        });
      }
    }
    ts.forEachChild(node, visit);
  };

  ts.forEachChild(source, visit);
  return found;
};

const backendModules = walkFiles(path.join(repoRoot, 'convex'), new Set(['.ts']))
  .map((file) => relativePath(file).replaceAll(path.sep, '/'))
  .filter((file) => !file.includes('.test.') && !file.includes('_generated'));

const declarations = backendModules.flatMap((file) =>
  readDeclarations(file, fs.readFileSync(path.join(repoRoot, file), 'utf8')));

const unshapedRawRows = declarations
  .filter((declaration) => !declaration.hasShape && declaration.returnsRawRow)
  .map((declaration) => declaration.id);

describe('client-callable return shapes hold', () => {
  test('the guard read the backend', () => {
    // A rule that matches nothing passes exactly as happily as one that works.
    expect(backendModules.length).toBeGreaterThan(250);
    expect(declarations.length).toBeGreaterThan(400);
  });

  test('the rule reads every shape a return can take', () => {
    // The four shapes the old text-matching rule got wrong, run through the
    // real rule. Two must be caught and two must not; break any one of them
    // and this fails, rather than the population quietly reading as clean.
    const sample = `
      export const wrapped = query({
        handler: async (ctx) => {
          return await ctx.db
            .query("users")
            .withIndex("by_company", (q) => q.eq("companyId", companyId))
            .paginate(opts);
        },
      });
      export const inline = query({
        handler: async (ctx) => { return await ctx.db.get(id); },
      });
      export const narrowed = query({
        handler: async (ctx) => {
          const page = await ctx.db
            .query("users")
            .paginate(opts);
          return { ...page, page: page.page.map(toClientUser) };
        },
      });
      export const nestedRead = query({
        handler: async (ctx) => {
          const rows = await Promise.all(ids.map(async (id) => await ctx.db.get(id)));
          return { rows: rows.map((row) => ({ id: row._id })) };
        },
      });
    `;
    const read = Object.fromEntries(readDeclarations('sample.ts', sample)
      .map((declaration) => [declaration.id.split(':')[1], declaration.returnsRawRow]));

    expect(read).toEqual({ wrapped: true, inline: true, narrowed: false, nestedRead: false });
  });

  test('the population without a declared shape only shrinks', () => {
    const missing = declarations.filter((declaration) => !declaration.hasShape);

    expect(missing.length).toBeLessThanOrEqual(MISSING_SHAPE_CEILING);
  });

  test('no new handler hands back an unshaped database row', () => {
    expect(unshapedRawRows.filter((id) => !FROZEN_UNSHAPED.has(id))).toEqual([]);
  });

  test('no frozen entry is stale', () => {
    const live = new Set(unshapedRawRows);

    expect(Array.from(FROZEN_UNSHAPED).filter((id) => !live.has(id))).toEqual([]);
  });
});
