import type { MutationCtx } from "../_generated/server";

/**
 * A transaction's reads counted as they happen: each `get`, and each query,
 * which reads one range. Convex allows 4,096 a transaction, so work that walks
 * a company's websites counts its own and stops well inside that.
 *
 * Shared by the work list's pages (`seoCollection.ts`) and the check of
 * whether a company has anything due (`seoCollectionDue.ts`).
 */
export function countingReads(ctx: MutationCtx): { ctx: MutationCtx; reads: () => number } {
  let reads = 0;
  const db = new Proxy(ctx.db, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;
      const call = value as (...args: unknown[]) => unknown;
      return (...args: unknown[]) => {
        if (property === "get" || property === "query") reads += 1;
        return call.apply(target, args);
      };
    },
  });
  return { ctx: { ...ctx, db }, reads: () => reads };
}
