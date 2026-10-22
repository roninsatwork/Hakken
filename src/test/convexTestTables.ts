/**
 * The test database finds a table's records without reading every other
 * table's first (AGENTS.md, "Tests that never flake": a slow test is made
 * lighter, never excused).
 *
 * `convex-test` keeps every record of every table in one object, and each
 * query — every index read, every `.first()` — went through all of them, each
 * id read by a pattern to find its table, before reading the table's own.
 * A collection's tests store a few thousand records across many tables, so
 * every lookup paid for all of them: a whole Google Analytics collection
 * spent two fifths of its time there (measured 2026-10-15, collection-reliability-plan.md
 * "Left", item 0), and its slowest tests ran past the five-second budget
 * (`scripts/check-test-speed.mjs`).
 *
 * This keeps each table's ids beside the records, as the database writes
 * them, so a query reads its own table's alone, in the same order as before:
 * an object's ids and a set's both keep the order they were added in.
 * Nothing else changes: the same records, the same order, the same checks.
 *
 * It is a change to `convex-test`'s own code as Vitest loads it, so it names
 * the three places it changes, and a `convex-test` whose code no longer has
 * them fails every backend test at once, saying so — never a silent return
 * to the slow way. `convexTestTables.test.ts` holds it against the installed
 * copy.
 */

/** The library file this changes. */
export const CONVEX_TEST_FILE = /[\\/]convex-test[\\/]dist[\\/]index\.js$/;

/** Each place changed: what the library says there, and what it says instead. */
export const CONVEX_TEST_CHANGES: ReadonlyArray<{ what: string; from: string; to: string }> = [
  {
    what: "a query reads its own table's ids",
    from: `        const ids = new Set(Object.keys(this._documents).filter(isInTable));`,
    to: `        const ids = new Set(this.__tableIds?.get(tableName) ?? []);`,
  },
  {
    what: "a record removed leaves its table's ids",
    from: `                    delete this._documents[_id];`,
    to: `                    delete this._documents[_id];
                    this.__tableIds?.get(tableNameFromId(_id))?.delete(_id);`,
  },
  {
    // convex-test 0.0.64 writes the record with its commit time filled in (Convex 1.43's `v.commitTs()`).
    what: "a record added joins its table's ids",
    from: `                    this._documents[_id] =
                        commitTs === null ? write : resolveCommittedValues(write, commitTs);`,
    to: `                    if (!(_id in this._documents)) {
                        this.__tableIds ??= new Map();
                        const table = tableNameFromId(_id);
                        if (!this.__tableIds.has(table)) this.__tableIds.set(table, new Set());
                        this.__tableIds.get(table).add(_id);
                    }
                    this._documents[_id] =
                        commitTs === null ? write : resolveCommittedValues(write, commitTs);`,
  },
  {
    // convex-test 0.0.64 looks for an unresolved commit time (`db.vars.commitTs`) in every value it reads: each
    // field an index or filter compares, each record written, each function's arguments and answer. A word, a
    // number or null cannot hold one, yet each paid for a look at its prototype before saying so; with the
    // records' own words and numbers the most of what a lookup reads, the slowest collection tests ran about
    // a third longer on the upgrade (measured 2026-10-22, dependency-updates-plan.md phase 3). Answering
    // "none" for them at once is what the library's own checks conclude for them, so nothing else changes.
    what: "a plain value holds no commit time",
    from: `function hasPendingValues(value) {
    if (value instanceof CommitTsPlaceholder) {`,
    to: `function hasPendingValues(value) {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    if (value instanceof CommitTsPlaceholder) {`,
  },
  {
    // An index read compared each record with its range by working out the range's own values again for every
    // record, and splitting each field's name again: the same answer each time. They are worked out once a read,
    // and each record compared exactly as `evaluateRangeFilter` compares it.
    what: "an index read works out its range once",
    from: `                this._iterateDocs(tableName, (doc) => {
                    if (source.range.every((filter) => evaluateRangeFilter(doc, filter))) {`,
    to: `                const range = source.range.map((filter) => ({ path: filter.fieldPath.split("."), type: filter.type, value: evaluateQueryValue(filter.value) }));
                const inRange = (doc, { path, type, value }) => {
                    let result = doc;
                    for (const p of path) {
                        result = result !== undefined && result !== null && isSimpleObject(result) ? result[p] : undefined;
                    }
                    const order = compareValues(result === undefined ? undefined : resolvePendingValues(result), value);
                    return type === "Eq" ? order === 0 : type === "Gt" ? order > 0 : type === "Gte" ? order >= 0 : type === "Lt" ? order < 0 : type === "Lte" ? order <= 0 : undefined;
                };
                this._iterateDocs(tableName, (doc) => {
                    if (range.every((filter) => inRange(doc, filter))) {`,
  },
];

/** The library's code with each table's ids kept; throws, naming the place, when the library no longer reads as expected. */
export function withTableIds(code: string): string {
  let changed = code;
  for (const change of CONVEX_TEST_CHANGES) {
    const found = changed.split(change.from).length - 1;
    if (found !== 1) {
      throw new Error(
        `convex-test changed: "${change.what}" (src/test/convexTestTables.ts) expected its line once in convex-test's code and found it ${found} times. ` +
        "Read the new version's _iterateDocs and commit, and update the change to match — or remove it if the library now keeps each table's ids itself.",
      );
    }
    changed = changed.replace(change.from, change.to);
  }
  return changed;
}

/** The Vite plugin: `convex-test`'s code changed as it loads. Needs `convex-test` inlined, so Vite loads it (`vitest.config.ts`). */
export function convexTestTables() {
  return {
    name: "hakken-convex-test-tables",
    enforce: "pre" as const,
    transform(code: string, id: string) {
      if (!CONVEX_TEST_FILE.test(id.split("?")[0])) return null;
      return { code: withTableIds(code), map: null };
    },
  };
}
