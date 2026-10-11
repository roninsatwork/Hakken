import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { repoRoot } from "./test/driftUtils";

/**
 * The server's copy of What Hakken sees' words (`convex/utils/seenWords.json`,
 * search-console-volatility-plan.md §8) matches the language files: a box's
 * words changed in `messages/` without `node scripts/seen-words.mjs` would
 * have Ask Hakken say one thing and the screen another.
 */
describe("What Hakken sees' words on the server", () => {
  test("seenWords.json is cut from messages/ as they are now", () => {
    expect(() => execFileSync(process.execPath, [path.join(repoRoot, "scripts/seen-words.mjs"), "--check"], { stdio: "pipe" })).not.toThrow();
  });
});
