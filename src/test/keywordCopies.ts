import type { Id } from "@/convex/_generated/dataModel";
import type { MutationCtx } from "@/convex/_generated/server";
import { KEYWORD_COPY_FIELDS, keywordsCopyKey } from "@/convex/utils/keywordCopyLayout";

/** A keyword as a website's compact keyword copy holds it, with what a test does not care about filled in. */
export type CopiedKeyword = {
  keyword: string;
  position: number;
  day: string;
  volume?: number | null;
  intent?: string;
  difficulty?: number | null;
  traffic?: number | null;
};

/**
 * Write a website's keyword copy from a place, as its site rebuild would
 * (`siteKeywordCopy.ts`): for tests of what reads the copies — Content gap,
 * worked out from them when read (`siteContentGap.ts`) — without filing and
 * rebuilding each website first.
 */
export async function writeKeywordCopy(
  ctx: MutationCtx,
  websiteId: Id<"websites">,
  place: number,
  keywords: CopiedKeyword[],
  latestCheckDay: string | null = null,
): Promise<void> {
  const key = keywordsCopyKey(websiteId, place);
  const rows = keywords.map((entry, index) => [
    `k${index}`, entry.keyword, entry.position, "p04_10", "/", entry.volume ?? null, entry.intent ?? "BUYING", "SAME", 0, entry.day,
    null, null, entry.traffic ?? null, entry.difficulty ?? null,
  ]);
  await ctx.db.insert("siteListCopies", {
    kind: "keywords", key, buildId: "test", fields: [...KEYWORD_COPY_FIELDS], rows: rows.length, parts: 1, cut: null,
    meta: { latestCheckDay }, builtAt: Date.now(),
  });
  await ctx.db.insert("siteListCopyParts", { kind: "keywords", key, buildId: "test", part: 0, data: JSON.stringify(rows) });
}
