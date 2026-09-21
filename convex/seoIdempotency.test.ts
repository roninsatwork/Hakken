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
