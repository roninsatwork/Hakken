import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

/**
 * Admin copy stays in the catalogue.
 *
 * The 2026-08-21 externalisation (admin-clone-readiness plan, phase 4) moved
 * every hardcoded admin sentence into `messages/en.json`/`it.json` —
 * ~2,100 keys per language across three batches. `check:messages` proves the
 * keys screens USE exist; nothing proved the screens keep USING keys. This
 * floor does: the number of non-test components under the admin roots that
 * call `useTranslations` may only RISE. A change that strips translation
 * usage from screens (a revert, a copy-paste from an old branch, a
 * regenerated file) drops the count and fails here.
 *
 * Honest limits, stated: a brand-new file with hardcoded English copy does
 * not lower the count, so this floor cannot catch it — no static check can
 * tell copy from data reliably. The floor defends the migration; review
 * defends new screens. Files with no copy of their own (thin wrappers,
 * prop-driven components) legitimately never adopt, which is why this is a
 * floor and not a per-file list.
 *
 * When adoption rises (new translated screens), raise the floors to the new
 * measured counts in the same change — same ratchet convention as
 * coverage-thresholds.json.
 */

const FLOORS: Array<{ root: string; floor: number }> = [
  // Raised to the measured counts on 2026-08-26, twice. The first raise
  // (139→156, 22→29, and the customer root joining at 36) was correct that
  // morning; the day's later work then added translated components and left
  // seven units of slack between the floors and the truth — room for that many
  // screens to leave the catalogue with nothing failing. A ratchet with slack
  // in it is not a ratchet, which is the same finding a review made about the
  // theme baseline the same afternoon.
  { root: "src/app/(dashboard)/admin", floor: 158 },
  { root: "src/ui", floor: 31 },
  { root: "src/app/(dashboard)/app", floor: 39 },
];

const repoRoot = process.cwd();

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    if (!entry.name.endsWith(".tsx") || entry.name.endsWith(".test.tsx")) return [];
    return [fullPath];
  });
}

describe("admin translation adoption holds", () => {
  test.each(FLOORS)("$root keeps at least $floor components on useTranslations", ({ root, floor }) => {
    const adopters = walk(path.join(repoRoot, root)).filter((file) =>
      fs.readFileSync(file, "utf8").includes("useTranslations")
    ).length;
    expect(
      adopters,
      `${root} has ${adopters} components using useTranslations; the floor is ${floor}. ` +
        `If screens were legitimately merged or deleted, lower the floor in the same change ` +
        `with a sentence saying which; anything else is copy leaving the catalogue.`
    ).toBeGreaterThanOrEqual(floor);
  });
});
