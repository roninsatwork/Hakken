import { getConvexSize, getDocumentSize, v, type Value } from "convex/values";

import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { TableNames } from "./_generated/dataModel";
import { KEEP_RULES } from "./keepRules";
import { appError } from "./utils/appError";

/**
 * Every table's rows and size as Convex counts them (`getDocumentSize`), and
 * where each table's bytes go, field by field (core-data-normalisation-plan.md,
 * part 3): run by hand to measure the whole database, as `seoStorageMeasure`
 * measures DataForSEO's tables and `searchConsoleTidy:keptSize` a website's
 * Search Console. It reads every table whole, a page at a time — as much as
 * the database holds, which Convex charges as reading — so it is run rarely:
 * the measurement before a plan's part and the one after.
 */

const TABLES = Object.keys(KEEP_RULES) as TableNames[];

/** Rows read a page to start with: halved for a table whose page is too large to read at once. */
const FIRST_PAGE = 200;

/** One page of a table: its rows, its bytes, and each field's share of them. */
export const tablePart = internalQuery({
  args: { table: v.string(), cursor: v.union(v.string(), v.null()), numItems: v.number() },
  returns: v.object({
    rows: v.number(),
    bytes: v.number(),
    fields: v.array(v.object({ field: v.string(), bytes: v.number() })),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    if (!TABLES.includes(args.table as TableNames)) throw appError("INVALID_INPUT", `There is no table called ${args.table}.`);
    const page = await ctx.db.query(args.table as TableNames).paginate({ cursor: args.cursor, numItems: args.numItems });
    let bytes = 0;
    const fields = new Map<string, number>();
    for (const row of page.page as Array<Record<string, Value>>) {
      bytes += getDocumentSize(row);
      for (const [field, value] of Object.entries(row)) fields.set(field, (fields.get(field) ?? 0) + field.length + 1 + getConvexSize(value));
    }
    return {
      rows: page.page.length,
      bytes,
      fields: [...fields].map(([field, held]) => ({ field, bytes: held })),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

const mb = (bytes: number) => Math.round(bytes / 10_000) / 100;

/**
 * Every table's rows and megabytes, largest first, each with its keep rule
 * (`keepRules.ts`) and its largest fields. `tables` narrows it; `fields` is
 * how many fields to name per table (default five).
 */
export const measureEveryTable = internalAction({
  args: { tables: v.optional(v.array(v.string())), fields: v.optional(v.number()) },
  returns: v.object({
    totalMb: v.number(),
    tables: v.array(v.object({
      table: v.string(),
      keep: v.string(),
      rows: v.number(),
      bytes: v.number(),
      mb: v.number(),
      fields: v.array(v.object({ field: v.string(), bytes: v.number(), mb: v.number() })),
    })),
  }),
  handler: async (ctx, args) => {
    const report = [];
    for (const table of args.tables ?? TABLES) {
      let rows = 0;
      let bytes = 0;
      const fields = new Map<string, number>();
      let numItems = FIRST_PAGE;
      for (let cursor: string | null = null; ;) {
        let page: { rows: number; bytes: number; fields: Array<{ field: string; bytes: number }>; continueCursor: string; isDone: boolean };
        try {
          page = await ctx.runQuery(internal.storageMeasure.tablePart, { table, cursor, numItems });
        } catch (error) {
          // A page of large rows read past what one read may hold: the same page, half as many rows.
          if (numItems === 1) throw error;
          numItems = Math.max(1, Math.floor(numItems / 2));
          continue;
        }
        rows += page.rows;
        bytes += page.bytes;
        for (const one of page.fields) fields.set(one.field, (fields.get(one.field) ?? 0) + one.bytes);
        if (page.isDone) break;
        cursor = page.continueCursor;
      }
      const rule = KEEP_RULES[table as TableNames];
      report.push({
        table,
        keep: rule ? rule.keep : "UNKNOWN",
        rows,
        bytes,
        mb: mb(bytes),
        fields: [...fields].sort((one, two) => two[1] - one[1]).slice(0, args.fields ?? 5).map(([field, held]) => ({ field, bytes: held, mb: mb(held) })),
      });
    }
    report.sort((one, two) => two.bytes - one.bytes);
    return { totalMb: Math.round(report.reduce((sum, one) => sum + one.mb, 0) * 100) / 100, tables: report };
  },
});
