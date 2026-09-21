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

  /**
   * Frozen 2026-08-26. The docblock above has called this list shrink-only
   * since it was written, and nothing checked: adding a newly-unconverted file
   * passed green, which is the one thing the rule forbids.
   */
  const NOT_YET_CONVERTED_CEILING = 1
    ;

  test("the unconverted list only shrinks", () => {
    expect(
      [...NOT_YET_CONVERTED],
      `The not-yet-converted list grew. Un-converting part of the backend needs the review the conversion had — do not add an entry to make a change pass:`
    ).toHaveLength(NOT_YET_CONVERTED_CEILING);
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

  /**
   * Classes that may extend `Error` rather than `ConvexError`, and why.
   *
   * A subclass of `Error` is redacted to "Server Error" in production exactly
   * like a plain one, so the check above — which matches the literal
   * `throw new Error(` — could not see a single one of them. That is how the
   * sales spreadsheet import kept eleven sentences written for the person who
   * chose the file, and showed them "Server Error" instead, through a package
   * whose entire purpose was to stop that happening.
   *
   * An entry here is a promise that the class never reaches a client, and the
   * promise has to be checkable from the call site.
   */
  const INTERNAL_ERROR_CLASSES = new Map<string, string>([
    [
      "McpFailure",
      "convex/mcpToolCall.ts:162 is its only consumer and converts it into an `{ ok: false, error }` return value; nothing rethrows it.",
    ],
    [
      "ProviderRuntimeError",
      "carries provider status and retry metadata for `withProviderRetry` to branch on. It escapes to callers, so its message must stay safe — `safeProviderMessage` is what it is built from — but it is deliberately not a ConvexError: the agent runtime catches it and writes the failure into the run record rather than throwing at a screen.",
    ],
  ]);

  test("error classes in convex extend ConvexError, or say why they do not", () => {
    const offenders: string[] = [];

    for (const file of convexSourceFiles("convex")) {
      const lines = fs.readFileSync(path.join(repoRoot, file), "utf8").split("\n");

      lines.forEach((line, index) => {
        const match = /class\s+(\w+)\s+extends\s+Error\b/.exec(line);

        if (match && !INTERNAL_ERROR_CLASSES.has(match[1])) {
          offenders.push(`${file}:${index + 1}: ${match[1]}`);
        }
      });
    }

    expect(
      offenders,
      `These extend Error, so production redacts every message they carry to "Server Error". Extend ConvexError<AppErrorData> instead — or add the class to INTERNAL_ERROR_CLASSES with the reason it can never reach a client:\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  /**
   * Raw `ConvexError` throws carrying a bare string rather than an appError
   * payload.
   *
   * These were never broken — a string payload puts the sentence in
   * `.message`, so a reader still got it — but they carried no `code`, could
   * not be localised, and were invisible to every other check in this file.
   * The spec named 54 and the conversion never touched one; they were held to
   * a shrinking count on 2026-08-26 and converted the same day, so the count
   * is zero and the rule can be absolute rather than a ceiling.
   *
   * Zero as an assertion only means something if the scan is reading files,
   * which is what the count below insists on: this test found nothing to
   * report on the day it was written *because* there was nothing, and a walk
   * that silently stopped returning files would look identical.
   */
  test("no throw carries a message without a code", () => {
    const offenders: string[] = [];

    for (const file of convexSourceFiles("convex")) {
      const lines = fs.readFileSync(path.join(repoRoot, file), "utf8").split("\n");

      lines.forEach((line, index) => {
        if (line.includes("throw new ConvexError(")) {
          offenders.push(`${file}:${index + 1}`);
        }
      });
    }

    expect(
      convexSourceFiles("convex").length,
      "no convex source files were scanned at all, so the check below reads nothing"
    ).toBeGreaterThan(50);

    expect(
      offenders,
      `A ConvexError thrown with a bare string carries no code, so nothing can branch on it and it cannot be localised. Use appError(code, message) from convex/utils/appError.ts:\n${offenders.join("\n")}`
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
