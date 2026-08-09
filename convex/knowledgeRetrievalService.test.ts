import { describe, expect, test } from "vitest";

import { fuseRetrievalRankings, RRF_K } from "./knowledgeRetrievalService";

describe("fuseRetrievalRankings", () => {
  test("a chunk both searches found outranks a chunk only one found", () => {
    // The acceptance case from the improvement plan: similarity alone ranks
    // the keyword-bearing chunk poorly, but keyword search puts it first.
    // Agreement (found by both, even mid-list) must beat similarity's
    // favourite (found by one).
    const fused = fuseRetrievalRankings({
      vectorRanked: [{ _id: "about-similar-things" }, { _id: "has-the-keyword" }],
      keywordRanked: [{ _id: "has-the-keyword" }],
    });

    expect(fused[0]._id).toBe("has-the-keyword");
  });

  test("keyword-only results are retrievable at all", () => {
    // The failure hybrid retrieval exists to fix: the embedding missed the
    // chunk entirely, keyword search found it.
    const fused = fuseRetrievalRankings({
      vectorRanked: [{ _id: "a" }, { _id: "b" }],
      keywordRanked: [{ _id: "exact-code-match" }],
    });

    expect(fused.map((f) => f._id)).toContain("exact-code-match");
  });

  test("empty keyword results leave the vector ranking unchanged", () => {
    // Most queries have no meaningful keyword hits; hybrid must then degrade
    // to exactly what similarity-only produced, same order.
    const fused = fuseRetrievalRankings({
      vectorRanked: [{ _id: "first" }, { _id: "second" }, { _id: "third" }],
      keywordRanked: [],
    });

    expect(fused.map((f) => f._id)).toEqual(["first", "second", "third"]);
  });

  test("both lists empty fuses to nothing", () => {
    expect(fuseRetrievalRankings({ vectorRanked: [], keywordRanked: [] })).toEqual([]);
  });

  test("contribution follows 1/(K + rank)", () => {
    // Pin the arithmetic so a refactor cannot quietly change the dampening.
    const [only] = fuseRetrievalRankings({
      vectorRanked: [{ _id: "x" }],
      keywordRanked: [{ _id: "x" }],
    });

    expect(only._score).toBeCloseTo(2 / (RRF_K + 1), 10);
  });
});

describe("retrieval stays consolidated", () => {
  test("no module searches knowledgeChunks outside the shared spine", async () => {
    // The four per-site copies are gone; this stops a fifth appearing. A new
    // caller belongs in knowledgeRetrieval.ts, where hybrid search and the
    // closed scope type apply automatically.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const dir = path.join(process.cwd(), "convex");
    const offenders: string[] = [];
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
      if (name === "knowledgeRetrieval.ts") continue;
      const text = fs.readFileSync(path.join(dir, name), "utf8");
      if (text.includes('vectorSearch("knowledgeChunks"')) offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });
});
