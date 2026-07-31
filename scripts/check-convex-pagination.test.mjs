import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { findPaginationViolations } from "./check-convex-pagination.mjs";

/**
 * The guard is only worth having if it is quiet on the shapes the backend
 * already uses. A check that cries wolf on every branching query gets switched
 * off, so the "accepts" cases matter as much as the "rejects" ones.
 */

let workspace;

function writeFixture(files) {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), "convex-pagination-"));
  for (const [name, contents] of Object.entries(files)) {
    const full = path.join(workspace, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents, "utf8");
  }
  return findPaginationViolations({ scanDir: workspace, rootDir: workspace }).violations;
}

afterEach(() => {
  if (workspace) fs.rmSync(workspace, { recursive: true, force: true });
  workspace = undefined;
});

describe("findPaginationViolations", () => {
  it("accepts one paginated query per branch when each branch returns", () => {
    const violations = writeFixture({
      "memories.ts": `
        export const list = query({
          args: {},
          handler: async (ctx, args) => {
            if (args.searchTerm) {
              return await ctx.db.query("memories").withSearchIndex("s", (q) => q).paginate(args.paginationOpts);
            }
            if (args.companyId) {
              return await ctx.db.query("memories").withIndex("by_company").paginate(args.paginationOpts);
            }
            return await ctx.db.query("memories").paginate(args.paginationOpts);
          },
        });
      `,
    });

    expect(violations).toEqual([]);
  });

  it("accepts one paginated query chosen by if/else", () => {
    const violations = writeFixture({
      "companies.ts": `
        export const list = query({
          args: {},
          handler: async (ctx, args) => {
            const page = args.newest
              ? await ctx.db.query("companies").order("desc").paginate(args.paginationOpts)
              : await ctx.db.query("companies").order("asc").paginate(args.paginationOpts);
            return page;
          },
        });
      `,
    });

    expect(violations).toEqual([]);
  });

  it("accepts a batch helper that paginates once per call", () => {
    const violations = writeFixture({
      "billing.ts": `
        async function resetBatch(ctx, cursor) {
          const page = await ctx.db.query("companies").paginate({ cursor, numItems: 100 });
          return page.isDone ? null : page.continueCursor;
        }

        export const resetBatchMutation = internalMutation({
          args: {},
          handler: async (ctx, args) => {
            const next = await resetBatch(ctx, args.cursor);
            if (next) await ctx.scheduler.runAfter(0, internal.billing.resetBatchMutation, { cursor: next });
          },
        });
      `,
    });

    expect(violations).toEqual([]);
  });

  it("rejects two paginated queries run one after the other", () => {
    const violations = writeFixture({
      "billing.ts": `
        export const reset = internalMutation({
          args: {},
          handler: async (ctx, args) => {
            const companies = await ctx.db.query("companies").paginate(args.paginationOpts);
            const users = await ctx.db.query("users").paginate(args.paginationOpts);
            return { companies, users };
          },
        });
      `,
    });

    expect(violations).toHaveLength(1);
    expect(violations[0].function).toBe("reset");
    expect(violations[0].sites).toHaveLength(2);
  });

  it("rejects a page-filling loop", () => {
    const violations = writeFixture({
      "search.ts": `
        export const search = query({
          args: {},
          handler: async (ctx, args) => {
            let cursor = null;
            const kept = [];
            while (kept.length < args.numItems) {
              const page = await ctx.db.query("sales").paginate({ cursor, numItems: 200 });
              kept.push(...page.page.filter(Boolean));
              if (page.isDone) break;
              cursor = page.continueCursor;
            }
            return kept;
          },
        });
      `,
    });

    expect(violations).toHaveLength(1);
    expect(violations[0].function).toBe("search");
  });

  it("rejects two paginated queries reached through helpers", () => {
    const violations = writeFixture({
      "billing.ts": `
        async function resetCompanies(ctx) {
          return await ctx.db.query("companies").paginate({ cursor: null, numItems: 100 });
        }

        async function resetUsers(ctx) {
          return await ctx.db.query("users").paginate({ cursor: null, numItems: 100 });
        }

        export const reset = internalMutation({
          args: {},
          handler: async (ctx) => {
            await resetCompanies(ctx);
            await resetUsers(ctx);
          },
        });
      `,
    });

    expect(violations).toHaveLength(1);
    expect(violations[0].function).toBe("reset");
    expect(violations[0].sites).toHaveLength(2);
  });

  it("rejects a paginated query reached once per row of another query", () => {
    const violations = writeFixture({
      "rollup.ts": `
        export const rollup = query({
          args: {},
          handler: async (ctx, args) => {
            const agents = await ctx.db.query("agents").collect();
            return await Promise.all(
              agents.map(async (agent) => await ctx.db.query("runs").paginate(args.paginationOpts))
            );
          },
        });
      `,
    });

    expect(violations).toHaveLength(1);
    expect(violations[0].function).toBe("rollup");
  });

  it("follows a helper imported from another Convex module", () => {
    const violations = writeFixture({
      "helpers/pages.ts": `
        export async function firstPage(ctx, table) {
          return await ctx.db.query(table).paginate({ cursor: null, numItems: 50 });
        }
      `,
      "reports.ts": `
        import { firstPage } from "./helpers/pages";

        export const report = query({
          args: {},
          handler: async (ctx) => {
            const sales = await firstPage(ctx, "sales");
            const returns = await firstPage(ctx, "returns");
            return { sales, returns };
          },
        });
      `,
    });

    expect(violations).toHaveLength(1);
    expect(violations[0].function).toBe("report");
  });

  it("does not follow ctx.runQuery, which starts its own function call", () => {
    const violations = writeFixture({
      "actions.ts": `
        export const run = internalAction({
          args: {},
          handler: async (ctx, args) => {
            const first = await ctx.runQuery(internal.sales.page, args);
            const second = await ctx.runQuery(internal.returns.page, args);
            return { first, second };
          },
        });
      `,
    });

    expect(violations).toEqual([]);
  });

  it("stays quiet on a recursive helper that never paginates", () => {
    const violations = writeFixture({
      "workflow.ts": `
        async function executeNode(ctx, node) {
          for (const child of node.children) {
            await executeNode(ctx, child);
          }
          return node;
        }

        export const execute = internalMutation({
          args: {},
          handler: async (ctx, args) => {
            const page = await ctx.db.query("nodes").paginate(args.paginationOpts);
            await executeNode(ctx, page.page[0]);
            return page;
          },
        });
      `,
    });

    expect(violations).toEqual([]);
  });
});
