import { getDocumentSize, type Value } from "convex/values";

/** One read of the database: its table, the index it went by, and the records it returned with their size. */
export type MeteredRead = { table: string; index: string | null; documents: number; bytes: number };

const sizeOf = (found: unknown): { documents: number; bytes: number } => {
  const records = Array.isArray(found)
    ? found
    : found && typeof found === "object" && Array.isArray((found as { page?: unknown }).page)
      ? (found as { page: unknown[] }).page
      : found ? [found] : [];
  return {
    documents: records.length,
    bytes: records.reduce<number>((sum, record) => sum + getDocumentSize(record as Record<string, Value>), 0),
  };
};

/**
 * The database a function is given, every read on it metered: the table, the
 * index it went by, the records it returned and their size as Convex counts
 * them (`getDocumentSize`) — what Convex's own limits count, 16 MiB and 32,000
 * records a read (core-data-normalisation-plan.md, §8). Counted, not timed,
 * so it holds on any machine, GitHub's included. `gets: false` notes only
 * queries, for a test pinning which tables a function reads.
 */
export function metered<Db extends object>(
  db: Db,
  options: { gets?: boolean } = {},
): { db: Db; reads: MeteredRead[]; bytes: () => number; documents: () => number } {
  const reads: MeteredRead[] = [];
  const note = (read: MeteredRead, found: unknown) => {
    const size = sizeOf(found);
    read.documents += size.documents;
    read.bytes += size.bytes;
    return found;
  };
  const wrap = (read: MeteredRead, query: object): object => new Proxy(query, {
    get(target, property) {
      const value = Reflect.get(target, property) as unknown;
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        if (property === "withIndex") read.index = String(args[0]);
        const out = (value as (...rest: unknown[]) => unknown).apply(target, args);
        if (out instanceof Promise) return out.then((found: unknown) => note(read, found));
        return out && typeof out === "object" ? wrap(read, out) : out;
      };
    },
  });
  const proxied = new Proxy(db, {
    get(target, property) {
      const value = Reflect.get(target, property) as unknown;
      if (typeof value !== "function") return value;
      if (property === "query") {
        return (table: string) => {
          const read: MeteredRead = { table, index: null, documents: 0, bytes: 0 };
          reads.push(read);
          return wrap(read, (value as (name: string) => object).call(target, table));
        };
      }
      if (property === "get" && options.gets !== false) {
        return async (...args: unknown[]) => {
          const read: MeteredRead = { table: "(get)", index: null, documents: 0, bytes: 0 };
          reads.push(read);
          return note(read, await (value as (...rest: unknown[]) => Promise<unknown>).apply(target, args));
        };
      }
      return (value as (...rest: unknown[]) => unknown).bind(target);
    },
  });
  return {
    db: proxied,
    reads,
    bytes: () => reads.reduce((sum, read) => sum + read.bytes, 0),
    documents: () => reads.reduce((sum, read) => sum + read.documents, 0),
  };
}

/** A registered Convex query or mutation, as a module exports it: its handler is kept on it. */
type Registered = { _handler?: unknown };

/**
 * What one function reads when called as a screen calls it — signed in as
 * `subject`, with these arguments — on a metered database: the bytes, as
 * Convex counts them (core-data-normalisation-plan.md §7A.7, each screen's
 * budget). The function as its module exports it, not as `api` names it.
 */
export async function bytesReadBy(
  t: { withIdentity: (identity: { subject: string }) => { run: <T>(work: (ctx: { db: object }) => Promise<T>) => Promise<T> } },
  subject: string,
  fn: Registered,
  args: Record<string, unknown>,
): Promise<number> {
  const handler = fn._handler as ((ctx: object, args: Record<string, unknown>) => Promise<unknown>) | undefined;
  if (!handler) throw new Error("Not a registered Convex function.");
  return await t.withIdentity({ subject }).run(async (ctx) => {
    const meter = metered(ctx.db);
    await handler({ ...ctx, db: meter.db }, args);
    return meter.bytes();
  });
}
