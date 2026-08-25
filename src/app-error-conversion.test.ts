import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

/**
 * Every convex file is appError-clean unless it is on the shrink-only list
 * of files not yet converted.
 *
 * Production Convex redacts a plain `throw new Error(...)` to "Server Error",
 * so any message written for a person disappears exactly where a person reads
 * it. `convex/utils/appError.ts` is the fix; the 2026-08-21 conversion
 * (foundation-quality plan, phase 2) brought the request-path and admin
 * tiers through it.
 *
 * This guard is an inverse of its first design (an allowlist of finished
 * files), rebuilt after the same-day review: an allowlist could not protect
 * brand-new files (clean on day one, guarded only if the author remembered
 * to list them) nor files carrying a single deliberate plain throw. Under
 * this design the default is guarded: a file is either NOT_YET_CONVERTED
 * (listed below, unconstrained, remove the entry when you convert it) or it
 * must contain zero plain `throw new Error(` — including files that do not
 * exist yet.
 *
 * The list may only SHRINK. Adding a file to it means un-converting part of
 * the platform and needs the same review the conversion had. If a listed
 * file is deleted or renamed, remove its entry in the same change.
 */

const NOT_YET_CONVERTED = new Set([
  // The movement demo is frozen (AGENTS.md); its four throws are left alone
  // rather than converted, and go when the demo goes.
  "convex/movements.ts",
  // Not a throw: the phrase appears inside this module's own explanation of
  // why plain throws do not survive production.
  "convex/utils/appError.ts",
]);

const repoRoot = process.cwd();

function convexSourceFiles(dir: string): string[] {
  return fs.readdirSync(path.join(repoRoot, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      return entry.name === "_generated" ? [] : convexSourceFiles(relative);
    }
    if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) return [];
    return [relative];
  });
}

describe("appError conversion holds and spreads", () => {
  test("every listed file still exists (remove entries for deleted or renamed files)", () => {
    const missing = [...NOT_YET_CONVERTED].filter(
      (file) => !fs.existsSync(path.join(repoRoot, file))
    );
    expect(
      missing,
      `Listed files no longer exist — remove their entries (and list the successor only if it truly still has plain throws):\n${missing.join("\n")}`
    ).toEqual([]);
  });

  test("no listed file is already clean (shrink the list as files convert)", () => {
    const alreadyClean = [...NOT_YET_CONVERTED].filter((file) => {
      const fullPath = path.join(repoRoot, file);
      if (!fs.existsSync(fullPath)) return false;
      return !fs.readFileSync(fullPath, "utf8").includes("throw new Error(");
    });
    expect(
      alreadyClean,
      `These files have zero plain throws — delete their entries so the guard covers them:\n${alreadyClean.join("\n")}`
    ).toEqual([]);
  });

  test("every unlisted convex file contains no plain `throw new Error(`", () => {
    const offenders: string[] = [];
    for (const file of convexSourceFiles("convex")) {
      if (NOT_YET_CONVERTED.has(file)) continue;
      const lines = fs.readFileSync(path.join(repoRoot, file), "utf8").split("\n");
      lines.forEach((line, index) => {
        if (line.includes("throw new Error(")) {
          offenders.push(`${file}:${index + 1}: ${line.trim()}`);
        }
      });
    }
    expect(
      offenders,
      `Plain throws in converted (or new) files. Use appError(code, message) from convex/utils/appError.ts so the message survives to production:\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
