import { describe, expect, it } from "vitest";

import {
  buildSeoIdempotencyKey,
  hashSeoParams,
  seoCycleDate,
} from "./seoIdempotency";

/**
 * The key that stops us paying twice.
 *
 * DataForSEO charges when a task is posted, not when its result is read, so a
 * duplicate here is not a tidiness problem — it is a second invoice line for
 * data already bought. Every test below is one way a duplicate could slip
 * through.
 */
describe("hashSeoParams", () => {
  it("does not care what order the keys were written in", () => {
    // The same request built by two call sites must not be bought twice.
    expect(hashSeoParams({ target: "a.com", limit: 10 }))
      .toBe(hashSeoParams({ limit: 10, target: "a.com" }));
  });

  it("treats an absent parameter and an undefined one as the same request", () => {
    // DataForSEO is sent neither, so both are the same question.
    expect(hashSeoParams({ target: "a.com", limit: undefined }))
      .toBe(hashSeoParams({ target: "a.com" }));
  });

  it("separates requests that differ in any value", () => {
    expect(hashSeoParams({ target: "a.com", limit: 10 }))
      .not.toBe(hashSeoParams({ target: "a.com", limit: 20 }));
    expect(hashSeoParams({ target: "a.com" }))
      .not.toBe(hashSeoParams({ target: "b.com" }));
  });

  it("keeps keyword order significant", () => {
    // A keyword list is not a set: results come back positionally, so a
    // reordered list is a different request and must hash differently.
    expect(hashSeoParams({ keywords: ["shoes", "boots"] }))
      .not.toBe(hashSeoParams({ keywords: ["boots", "shoes"] }));
  });

  it("sorts nested settings but not nested lists", () => {
    expect(hashSeoParams({ filters: { depth: 10, lang: "en" } }))
      .toBe(hashSeoParams({ filters: { lang: "en", depth: 10 } }));
  });
});

describe("hashSeoParams at a day's scale", () => {
  it("is 64 bits, and a hundred thousand searches never share one", () => {
    // Every search checked on a day shares its operation, placeholder and
    // date, so this alone tells them apart. At 32 bits, ten thousand a day
    // collided about one day in a hundred (reliability plan 3.5).
    const seen = new Set<string>();
    for (let index = 0; index < 100_000; index += 1) {
      const hash = hashSeoParams({ keyword: `carp fishing bait ${index}`, location_code: 2826, language_code: "en", depth: 100 });
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
      seen.add(hash);
    }
    expect(seen.size).toBe(100_000);
  });

  it("tells apart searches the 32-bit key took for one another", () => {
    // Each pair shared one 32-bit key: the second search would have been
    // served the first one's results page.
    const clashed = [
      ["net bait 923 line 7", "tackle rod 7635 rod 16"],
      ["bucket pva 1788 spod 10", "boilies spod 3821 pva 19"],
      ["tackle rod 1773 rod 10", "pva hook 3709 fishing 20"],
    ];
    for (const [first, second] of clashed) {
      expect(hashSeoParams({ keyword: first, language_code: "en", location_code: 2826 }))
        .not.toBe(hashSeoParams({ keyword: second, language_code: "en", location_code: 2826 }));
    }
  });
});

describe("seoCycleDate", () => {
  it("is a UTC day, so a cycle and its catch-up agree", () => {
    // A cycle that starts at 09:00 and a sweep that catches up at 23:00 are
    // collecting the same day and must not buy the same task twice.
    expect(seoCycleDate(Date.UTC(2026, 8, 21, 9, 0, 0))).toBe("2026-09-21");
    expect(seoCycleDate(Date.UTC(2026, 8, 21, 23, 0, 0))).toBe("2026-09-21");
  });
});

describe("buildSeoIdempotencyKey", () => {
  const base = {
    operationId: "backlinks_summary",
    websiteId: "website_1",
    params: { target: "a.com" },
    cycleStartedAt: Date.UTC(2026, 8, 21, 9, 0, 0),
  };

  it("is stable for the same question in the same cycle", () => {
    expect(buildSeoIdempotencyKey(base)).toBe(buildSeoIdempotencyKey(base));
  });

  it("changes with the day", () => {
    // Otherwise the second day's collection would look like a duplicate of the
    // first and the pipeline would quietly stop collecting.
    expect(buildSeoIdempotencyKey(base)).not.toBe(
      buildSeoIdempotencyKey({ ...base, cycleStartedAt: Date.UTC(2026, 8, 22, 9, 0, 0) }),
    );
  });

  it("changes with the website and with the operation", () => {
    expect(buildSeoIdempotencyKey(base))
      .not.toBe(buildSeoIdempotencyKey({ ...base, websiteId: "website_2" }));
    expect(buildSeoIdempotencyKey(base))
      .not.toBe(buildSeoIdempotencyKey({ ...base, operationId: "serp_google_organic" }));
  });

  it("reads as the four things it is made of", () => {
    // Someone debugging a duplicate charge reads this key in a log; it should
    // tell them what was asked without a lookup.
    const key = buildSeoIdempotencyKey(base);
    expect(key.startsWith("backlinks_summary:website_1:")).toBe(true);
    expect(key.endsWith(":2026-09-21")).toBe(true);
  });
});
