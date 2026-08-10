import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The theme-drift ratchet (theme compliance plan, Phase 4).
 *
 * The Aesthetics screen can only tell the truth while the app actually uses
 * its tokens. This test counts the two ways a component can bypass them —
 * hardcoded hex in class strings and raw Tailwind palette classes — and fails
 * if the count RISES above the recorded baseline. Whoever lowers the count
 * updates the baseline downward in the same commit; it must never go up.
 *
 * Excluded on purpose:
 * - tests and e2e fixtures (assertions, not rendered UI);
 * - `src/app/(public)` — the marketing/login surface keeps its own deliberate
 *   cream palette (owner scope decision, 2026-08-10);
 * - the two sanctioned palette modules (movement pose colours and chart
 *   series colours), which are domain palettes typed once on purpose.
 */

const SRC_ROOT = join(__dirname);

const EXCLUDED_PATH_PARTS = [
  "/app/(public)/",
  "/demos/movements/_lib/movementPalette.ts",
  "/ui/components/charts/chartPalette.ts",
  "/e2e/",
  "/test/",
];

const PALETTE_FAMILIES =
  "red|rose|amber|yellow|emerald|green|sky|blue|indigo|orange|purple|cyan|violet|slate|zinc|gray|fuchsia|teal|lime|pink|stone|neutral";

// A palette utility like text-red-500, bg-amber-500/10, border-rose-400,
// hover:text-emerald-300 — but not tokens (text-success) or greys via tokens.
const PALETTE_CLASS_PATTERN = new RegExp(
  `(?:^|[\\s"'\`:])(?:[a-z-]+:)*(?:text|bg|border|ring|fill|stroke|from|to|via|divide|outline|decoration|accent|shadow)-(?:${PALETTE_FAMILIES})-\\d{2,3}(?:/\\d{1,3})?`,
  "g",
);

// A hex colour inside a class attribute's arbitrary value: text-[#10b981],
// bg-[#f59e0b]/10, border-[#FF5A1F].
const HEX_CLASS_PATTERN = /\[#[0-9a-fA-F]{3,8}\]/g;

function isExcluded(path: string) {
  const normalized = path.split("\\").join("/");
  if (/\.(test|spec)\.[jt]sx?$/.test(normalized)) return true;
  return EXCLUDED_PATH_PARTS.some((part) => normalized.includes(part));
}

function collectSourceFiles(dir: string, out: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      collectSourceFiles(path, out);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    if (isExcluded(path)) continue;
    out.push(path);
  }
  return out;
}

function countDrift() {
  let paletteClasses = 0;
  let hexInClasses = 0;
  const perFile = new Map<string, number>();

  for (const file of collectSourceFiles(SRC_ROOT)) {
    const content = readFileSync(file, "utf8");
    const paletteMatches = content.match(PALETTE_CLASS_PATTERN)?.length ?? 0;
    const hexMatches = content.match(HEX_CLASS_PATTERN)?.length ?? 0;
    paletteClasses += paletteMatches;
    hexInClasses += hexMatches;
    if (paletteMatches + hexMatches > 0) {
      perFile.set(file, paletteMatches + hexMatches);
    }
  }

  return { paletteClasses, hexInClasses, total: paletteClasses + hexInClasses, perFile };
}

/**
 * The recorded baseline. Lower it whenever a migration lands; never raise it.
 * If this test fails on your change, you added a hardcoded colour — use the
 * theme tokens (text-success/destructive/warning/info, bg-card, text-muted,
 * border-border-dim, …) or the StatusPill atom instead. See
 * docs/plans/active/theme-compliance-plan.md.
 */
/*
 * History: ~2,039 before the theme compliance plan; 1,231 recorded
 * 2026-08-10 after Phases 2 and 4 migrated the top offender screens and
 * extracted the movements/chart palettes.
 */
const DRIFT_BASELINE = 1231;

/**
 * Files allowed to keep a local `get*Color`-style helper: one maps patch
 * OPERATIONS (not statuses) through the shared tone classes, the other maps
 * a numeric score inside the frozen movement demo's domain palette. A new
 * helper anywhere else is the copy-paste pattern that produced eighteen
 * divergent status colour maps — extend `src/ui/atoms/statusTone.ts` instead.
 */
const ALLOWED_COLOR_HELPER_FILES = [
  "src/app/(dashboard)/admin/agents/[id]/memory/page.tsx",
  "src/app/(dashboard)/demos/movements/_lib/movementSkeleton.ts",
];

describe("status colour helpers stay consolidated", () => {
  it("no new local get*Color helpers appear outside the allowed files", () => {
    const helperPattern = /(?:function|const)\s+get[A-Z]\w*Color\b/;
    const offenders: string[] = [];

    for (const file of collectSourceFiles(SRC_ROOT)) {
      if (!helperPattern.test(readFileSync(file, "utf8"))) continue;
      const relative = file.replace(SRC_ROOT, "src").split("\\").join("/");
      if (!ALLOWED_COLOR_HELPER_FILES.includes(relative)) offenders.push(relative);
    }

    expect(offenders, "extend src/ui/atoms/statusTone.ts instead of adding a local colour helper").toEqual([]);
  });
});

/**
 * Tailwind v4 only compiles classes it can see as literal text. The movement
 * demos build classes from palette constants at runtime (`bg-[${SALMON}]/10`),
 * which the scanner cannot see — the safelist comment in movementPalette.ts
 * is what keeps them compiled. This test fails when a component uses a
 * combination the safelist does not carry, which would otherwise ship as a
 * silently unstyled element.
 */
describe("movement palette safelist", () => {
  const MOVEMENTS_ROOT = join(SRC_ROOT, "app/(dashboard)/demos/movements");
  const PALETTE_PATH = join(MOVEMENTS_ROOT, "_lib/movementPalette.ts");

  it("covers every palette class combination the demos emit", () => {
    const paletteSource = readFileSync(PALETTE_PATH, "utf8");

    const constants = new Map<string, string>();
    for (const match of paletteSource.matchAll(/export const (MOVEMENT_\w+) = "(#[0-9a-fA-F]{6})"/g)) {
      constants.set(match[1], match[2]);
    }
    expect(constants.size).toBeGreaterThan(0);

    const safelist = new Set(paletteSource.match(/[a-z-]+(?::[a-z-]+)*-\[#[0-9a-fA-F]{6}\](?:\/[\d.[\]]+)?/g) ?? []);

    // A template class: prefix-[${CONSTANT}] with an optional opacity suffix,
    // possibly behind variants (hover:, focus:).
    const templatePattern =
      /((?:[a-z-]+:)*[a-z-]+)-\[\$\{(MOVEMENT_\w+)\}\](\/[\d.[\]]+)?/g;

    const missing = new Set<string>();
    for (const file of collectSourceFiles(MOVEMENTS_ROOT)) {
      if (file === PALETTE_PATH) continue;
      const content = readFileSync(file, "utf8");
      for (const match of content.matchAll(templatePattern)) {
        const [, prefix, constant, opacity] = match;
        const hex = constants.get(constant);
        if (!hex) continue;
        const literal = `${prefix}-[${hex}]${opacity ?? ""}`;
        if (!safelist.has(literal)) missing.add(literal);
      }
    }

    expect(
      [...missing],
      "add these to the safelist comment in movementPalette.ts or Tailwind will not compile them",
    ).toEqual([]);
  });
});

describe("theme drift ratchet", () => {
  it(`hardcoded colour count never rises above the baseline (${DRIFT_BASELINE})`, () => {
    const { total, perFile } = countDrift();

    if (total > DRIFT_BASELINE) {
      const worst = [...perFile.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([file, count]) => `  ${count}\t${file.replace(SRC_ROOT, "src")}`)
        .join("\n");
      throw new Error(
        `Theme drift rose to ${total} (baseline ${DRIFT_BASELINE}).\n` +
        `Use theme tokens or StatusPill instead of hardcoded colours.\n` +
        `Worst files:\n${worst}`,
      );
    }

    expect(total).toBeLessThanOrEqual(DRIFT_BASELINE);
  });
});
