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
    to: `                    this.__rebucket(_id, this._documents[_id] ?? null, null);
                    delete this._documents[_id];
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
                    const before = this._documents[_id] ?? null;
                    this._documents[_id] =
                        commitTs === null ? write : resolveCommittedValues(write, commitTs);
                    this.__rebucket(_id, before, this._documents[_id]);`,
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
    //
    // A field equal to a word or a number is answered by comparing the two as they are (2026-11-02): Convex's own
    // comparison built a pair for each value and compared a word letter by letter, and a website's lists, read
    // field by field for every record, spent a third of a collection's time there (googleAnalyticsCountries.test.ts).
    // Two words are equal in Convex's order exactly when they are the same word; two numbers, NaN apart, exactly
    // when `Object.is` says so (it tells 0 from -0, as Convex does). Anything else is compared as before.
    what: "an index read works out its range once",
    from: `                this._iterateDocs(tableName, (doc) => {
                    if (source.range.every((filter) => evaluateRangeFilter(doc, filter))) {`,
    to: `                const range = source.range.map((filter) => ({ path: filter.fieldPath.split("."), type: filter.type, value: evaluateQueryValue(filter.value) }));
                const inRange = (doc, { path, type, value }) => {
                    let result = doc;
                    for (const p of path) {
                        result = result !== undefined && result !== null && isSimpleObject(result) ? result[p] : undefined;
                    }
                    if (type === "Eq" && typeof result === "string" && typeof value === "string") {
                        return result === value;
                    }
                    if (type === "Eq" && typeof result === "number" && typeof value === "number" && !Number.isNaN(result) && !Number.isNaN(value)) {
                        return Object.is(result, value);
                    }
                    const order = compareValues(result === undefined ? undefined : resolvePendingValues(result), value);
                    return type === "Eq" ? order === 0 : type === "Gt" ? order > 0 : type === "Gte" ? order >= 0 : type === "Lt" ? order < 0 : type === "Lte" ? order <= 0 : undefined;
                };
                const equal = range.filter(({ type, value }) => type === "Eq" && (typeof value === "string" || typeof value === "number"));
                const read = equal.length > 0
                    ? (callback) => this.__iterateEqual(tableName, equal, callback)
                    : (callback) => this._iterateDocs(tableName, callback);
                read((doc) => {
                    if (range.every((filter) => inRange(doc, filter))) {`,
  },
  {
    // An index read still went through every record of its table, and a website's lists and days hold thousands: a
    // collection spent a third of its time there (googleAnalyticsHistory.test.ts, 2026-11-04, measured on GitHub's
    // run at 40 seconds a collection). Where a read asks for a field equal to a word or a number, it now goes straight
    // to the records with that value: they're kept in buckets by those fields' values, built the first time a read
    // asks for those fields and kept up as records are saved. A bucket only narrows where to look. Every record found
    // still goes through the range check above, and a transaction's unsaved writes are always read too, so a record
    // moved, added or removed is seen exactly as before. 0 and -0 share a bucket, and that check tells them apart.
    what: "an index read asking for a field's value goes straight to its records",
    from: `    _iterateDocs(tableName, callback) {`,
    to: `    __bucketPart(value) {
        return typeof value === "string" ? "s" + value.length + ":" + value : typeof value === "number" ? "n" + value + ";" : null;
    }
    __bucketKey(doc, paths) {
        let key = "";
        for (const path of paths) {
            let result = doc;
            for (const p of path) {
                result = result !== undefined && result !== null && isSimpleObject(result) ? result[p] : undefined;
            }
            const part = this.__bucketPart(result);
            if (part === null) {
                return null;
            }
            key += part;
        }
        return key;
    }
    __rebucket(id, before, after) {
        const held = this.__buckets?.get(tableNameFromId(id));
        if (!held) {
            return;
        }
        for (const one of held.values()) {
            const was = before === null ? null : this.__bucketKey(before, one.paths);
            const now = after === null ? null : this.__bucketKey(after, one.paths);
            if (was === now) {
                continue;
            }
            if (was !== null) {
                one.ids.get(was)?.delete(id);
            }
            if (now !== null) {
                if (!one.ids.has(now)) one.ids.set(now, new Set());
                one.ids.get(now).add(id);
            }
        }
    }
    __iterateEqual(tableName, equal, callback) {
        this.__buckets ??= new Map();
        if (!this.__buckets.has(tableName)) this.__buckets.set(tableName, new Map());
        const held = this.__buckets.get(tableName);
        const fields = equal.map(({ path }) => path.join(".")).join("|");
        if (!held.has(fields)) {
            const one = { paths: equal.map(({ path }) => path), ids: new Map() };
            for (const id of this.__tableIds?.get(tableName) ?? []) {
                const key = this.__bucketKey(this._documents[id], one.paths);
                if (key !== null) {
                    if (!one.ids.has(key)) one.ids.set(key, new Set());
                    one.ids.get(key).add(id);
                }
            }
            held.set(fields, one);
        }
        const wanted = equal.map(({ value }) => this.__bucketPart(value)).join("");
        const ids = new Set(held.get(fields).ids.get(wanted) ?? []);
        for (let i = 0; i < this._writes.length; i++) {
            for (const id of Object.keys(this._writes[i])) {
                if (tableNameFromId(id) === tableName) {
                    ids.add(id);
                }
            }
        }
        for (const id of ids) {
            let document = undefined;
            for (let i = this._writes.length - 1; i >= 0 && document === undefined; i--) {
                document = this._writes[i][id];
            }
            if (document === undefined) {
                document = this._documents[id] ?? null;
            }
            if (document !== null) {
                callback(document);
            }
        }
    }
    _iterateDocs(tableName, callback) {`,
  },
  {
    // Every id a query goes through is its own table's (the first change), or a write's picked out by its table, yet
    // each was checked again for its table as the record was read. It is read as `get` reads it: the newest write
    // first, then what is stored (2026-11-02).
    what: "a query reads its own table's records without checking each id's table again",
    from: `            const document = this.get(tableName, id);`,
    to: `            let document = undefined;
            for (let i = this._writes.length - 1; i >= 0 && document === undefined; i--) {
                document = this._writes[i][id];
            }
            if (document === undefined) {
                document = this._documents[id] ?? null;
            }`,
  },
  {
    // A field that may be one of several kinds tried each kind until one fitted, and each that did not threw an error
    // on the way, its message and its stack written out: a record with many such fields, written at every answer from
    // Google (a website's connection, noting what Google said is left), spent a third of a night's run making errors
    // (googleAnalyticsCollect.test.ts, 2026-11-02). A kind a value plainly is not is passed over without one: a
    // different word, not null, not a word, number, true or false, bigint, list or object. Those are exactly the cases
    // the library's own check throws for, so the same kinds fit and the same records are refused, in the same words.
    what: "a field of several kinds passes over a kind its value plainly is not",
    from: `        case "union": {
            let isValid = false;
            for (const v of validator.value) {
                try {`,
    to: `        case "union": {
            let isValid = false;
            const plainlyNot = (kind) => kind.type === "literal" ? value !== kind.value
                : kind.type === "null" ? value !== null
                : kind.type === "string" ? typeof value !== "string"
                : kind.type === "number" ? typeof value !== "number"
                : kind.type === "boolean" ? typeof value !== "boolean"
                : kind.type === "bigint" ? typeof value !== "bigint"
                : kind.type === "array" ? !Array.isArray(value)
                : kind.type === "object" ? typeof value !== "object" || value === null
                : false;
            for (const v of validator.value) {
                if (plainlyNot(v)) {
                    continue;
                }
                try {`,
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
