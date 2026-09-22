import type { MutationCtx } from "./_generated/server";

/**
 * Renaming the pound-named spend columns to dollar names.
 *
 * Split out of `dataMigrations.ts` when that crossed the thousand-line ceiling
 * the module-size guard sets. It is a clean seam: this is one rename with a
 * table map, two passes and its own cursor scheme, and none of it is reused by
 * any other migration.
 */

type MigrationBatchResult = {
  cursor: string | null;
  isDone: boolean;
  processed: number;
  updated: number;
};

type MigrationRunner = (
  ctx: MutationCtx,
  cursor: string | null,
  batchSize: number,
) => Promise<MigrationBatchResult>;

/**
 * The six tables holding provider spend under a pound name.
 *
 * Provider spend only. Plan prices, monthly revenue and the opportunity report
 * are genuinely sterling and keep their names: both currencies live on this
 * platform at once, which is exactly why a name that lies about one of them is
 * worth the trouble of fixing.
 *
 * Kept as data rather than six near-identical migrations, because the thing
 * that goes wrong with a rename is doing five of six. One field sits inside a
 * nested object, so its patch rewrites the whole object; that is why each table
 * brings a function rather than a field name.
 */
type PoundPatch = Record<string, unknown> | null;

type PoundTable = {
  name: "agentTransactions" | "agentRuns" | "agentRunSteps"
    | "agents" | "analyticsDailySnapshots" | "decisionRuns";
  /** The dollar-named copy, or null when the row already has it or has nothing. */
  toDollars: (row: Record<string, unknown>) => PoundPatch;
  /** The same row with its pound names emptied, or null when there are none. */
  clearPounds: (row: Record<string, unknown>) => PoundPatch;
};

const copyField = (row: Record<string, unknown>, from: string, to: string): PoundPatch =>
  row[to] === undefined && typeof row[from] === "number" ? { [to]: row[from] } : null;

const clearField = (row: Record<string, unknown>, from: string): PoundPatch =>
  row[from] === undefined ? null : { [from]: undefined };

const merge = (...patches: PoundPatch[]): PoundPatch => {
  const combined = Object.assign({}, ...patches.filter(Boolean));
  return Object.keys(combined).length > 0 ? combined : null;
};

const TABLES_WITH_POUND_NAMES: readonly PoundTable[] = [
  {
    name: "agentTransactions",
    toDollars: (row) => copyField(row, "costGBP", "costUsd"),
    clearPounds: (row) => clearField(row, "costGBP"),
  },
  {
    name: "agentRuns",
    toDollars: (row) => merge(copyField(row, "costGBP", "costUsd"), copyField(row, "maxCostGBP", "maxCostUsd")),
    clearPounds: (row) => merge(clearField(row, "costGBP"), clearField(row, "maxCostGBP")),
  },
  {
    name: "agentRunSteps",
    toDollars: (row) => copyField(row, "costGBP", "costUsd"),
    clearPounds: (row) => clearField(row, "costGBP"),
  },
  {
    name: "agents",
    toDollars: (row) => copyField(row, "maxCostGBP", "maxCostUsd"),
    clearPounds: (row) => clearField(row, "maxCostGBP"),
  },
  {
    name: "analyticsDailySnapshots",
    // Nested: the whole `metrics` object is rewritten, because a patch cannot
    // reach one key inside it.
    toDollars: (row) => {
      const metrics = row.metrics as Record<string, unknown> | undefined;
      if (!metrics || metrics.costUsd !== undefined || typeof metrics.costGBP !== "number") return null;
      return { metrics: { ...metrics, costUsd: metrics.costGBP } };
    },
    clearPounds: (row) => {
      const metrics = row.metrics as Record<string, unknown> | undefined;
      if (!metrics || metrics.costGBP === undefined) return null;
      const { costGBP: _dropped, ...rest } = metrics;
      return { metrics: rest };
    },
  },
  {
    name: "decisionRuns",
    toDollars: (row) => copyField(row, "costGBP", "costUsd"),
    clearPounds: (row) => clearField(row, "costGBP"),
  },
];

/**
 * One cursor walking six tables, encoded as `<table index>:<that table's cursor>`.
 *
 * The runner hands back a single string, so the table being walked has to ride
 * inside it. A resumed run then picks up in the right table as well as at the
 * right row.
 */
const readTableIndex = (cursor: string | null): number => {
  if (!cursor) return 0;
  const index = Number(cursor.slice(0, cursor.indexOf(":")));
  return Number.isFinite(index) && index >= 0 && index < TABLES_WITH_POUND_NAMES.length ? index : 0;
};

const readInnerCursor = (cursor: string | null): string | null => {
  if (!cursor) return null;
  const inner = cursor.slice(cursor.indexOf(":") + 1);
  return inner === "" ? null : inner;
};

const advanceTables = (
  cursor: string | null,
  page: { isDone: boolean; continueCursor: string },
): { cursor: string | null; isDone: boolean } => {
  const index = readTableIndex(cursor);
  if (!page.isDone) return { cursor: `${index}:${page.continueCursor}`, isDone: false };
  const next = index + 1;
  if (next >= TABLES_WITH_POUND_NAMES.length) return { cursor: null, isDone: true };
  return { cursor: `${next}:`, isDone: false };
};

/**
 * Copies every pound-named spend figure onto its dollar-named twin.
 *
 * Nothing about the money changes. Providers bill in dollars, DataForSEO
 * bills in dollars, and nothing has converted anything since a hardcoded 0.78
 * was removed — so these fields have always held dollars under a name that
 * said pounds. That name had already put a pound sign over a dollar figure on
 * four screens, one of them a customer's own settings page, which is why it
 * is corrected now rather than after a year of runs.
 *
 * Step one of two. The schema carries both names, this fills the new one, and
 * `2026-09-22-clear-pound-names` empties the old one so it can be dropped.
 * Idempotent per row, so a resumed run is safe.
 */
export const copyPoundNamesToDollars: MigrationRunner = async (ctx, cursor, batchSize) => {
  const table = TABLES_WITH_POUND_NAMES[readTableIndex(cursor)]!;
  const page = await ctx.db.query(table.name).paginate({ cursor: readInnerCursor(cursor), numItems: batchSize });

  let updated = 0;
  for (const row of page.page) {
    const patch = table.toDollars(row as unknown as Record<string, unknown>);
    if (!patch) continue;
    await ctx.db.patch(row._id, patch as never);
    updated += 1;
  }

  const next = advanceTables(cursor, page);
return { cursor: next.cursor, isDone: next.isDone, processed: page.page.length, updated };
};

/**
 * Empties the pound-named fields, so the schema can stop declaring them.
 *
 * Run only once the code reads and writes the dollar names, because a cleared
 * field with nothing reading the new one would lose the figure. Convex refuses
 * a schema that omits a field some row still carries, which is why this step
 * exists at all rather than the name simply being deleted.
 */
export const clearPoundNames: MigrationRunner = async (ctx, cursor, batchSize) => {
  const table = TABLES_WITH_POUND_NAMES[readTableIndex(cursor)]!;
  const page = await ctx.db.query(table.name).paginate({ cursor: readInnerCursor(cursor), numItems: batchSize });

  let updated = 0;
  for (const row of page.page) {
    const patch = table.clearPounds(row as unknown as Record<string, unknown>);
    if (!patch) continue;
    await ctx.db.patch(row._id, patch as never);
    updated += 1;
  }

  const next = advanceTables(cursor, page);
return { cursor: next.cursor, isDone: next.isDone, processed: page.page.length, updated };
};
