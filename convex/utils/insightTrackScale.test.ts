import { describe, expect, test } from "vitest";
import { pageChanges, type PageYear } from "./insightTrack";

/** The previous all-pairs choice, retained here only as a small parity reference. */
function referenceChoice(now: readonly PageYear[], gone: string) {
  const words = (path: string) => new Set(path.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2).map((word) => word.slice(0, 6)));
  const one = words(gone);
  return now.map((page) => {
    const two = words(page.path), common = [...one].filter((word) => two.has(word)).length;
    return { page: page.path, score: common / (new Set([...one, ...two]).size || 1) };
  }).filter((row) => row.score >= 0.34).sort((a, b) => b.score - a.score)[0]?.page ?? null;
}

describe("large-site page comparisons", () => {
  test("preserves the previous choice, including equal scores, six-letter words and paths with no words", () => {
    const terms = ["door", "handles", "brass", "silver", "developer", "development", "modern", "cabinet", "round"];
    const now = Array.from({ length: 120 }, (_, at) => ({ path: `/${terms[at % terms.length]}-${terms[(at * 7 + 2) % terms.length]}-${at}/`, visits: 30, enquiries: 3 }));
    const year = ["/a/", "/99/", ...Array.from({ length: 80 }, (_, at) => `/${terms[(at * 3) % terms.length]}-${terms[(at * 5 + 1) % terms.length]}-old-${at}/`)].map((path) => ({ path, visits: 40, enquiries: 4 }));
    expect(pageChanges(now, year).map((change) => change.to)).toEqual(year.map((page) => referenceChoice(now, page.path)));
  });

  test("handles 150,000 current pages and 10,000 disappeared pages while keeping every outcome", () => {
    const now = Array.from({ length: 150_000 }, (_, at) => ({ path: `/door-handles/s${at.toString(36).padStart(5, "0")}/`, visits: 30, enquiries: 3 }));
    const year = Array.from({ length: 10_000 }, (_, at) => ({ path: `/door-handles/o${at.toString(36).padStart(5, "0")}/`, visits: 40, enquiries: 4 }));
    const changes = pageChanges(now, year);
    expect(changes).toHaveLength(year.length);
    expect(changes[0]).toMatchObject({ kind: "REPLACED", from: year[0].path, to: now[0].path });
    expect(changes.at(-1)).toMatchObject({ from: year.at(-1)!.path, to: now[0].path });
  });
});
