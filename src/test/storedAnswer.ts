import type { Id } from "@/convex/_generated/dataModel";

/** A test harness that can store a file, as convex-test's `t.run` can. */
type StoringHarness = {
  run: <T>(work: (ctx: { storage: { store: (blob: Blob) => Promise<Id<"_storage">> } }) => Promise<T>) => Promise<T>;
};

/**
 * A DataForSEO answer stored as the collecting action stores it
 * (`keepAnswerFile`, `convex/seoPullAnswers.ts`): a file, and its size — what
 * the mutation recording a request's answer is given (`resultFile`).
 */
export async function storedAnswer(t: StoringHarness, json: string): Promise<{ file: Id<"_storage">; bytes: number }> {
  const file = await t.run(async (ctx) => await ctx.storage.store(new Blob([json], { type: "application/json" })));
  return { file, bytes: new TextEncoder().encode(json).length };
}
