import { describe, expect, test } from "vitest";
import { readRepoFile } from "./test/driftUtils";

/**
 * The standard website header (Anthony, 2026-10-30, on the Conversions canvas:
 * "can we make this a standard header component that we roll out to all
 * pages"): every section that opens a website wears `DetailHeader` with
 * `layout="compact"` — the name on its own row, "Updated …" and the filters
 * on the row under it — with no property line (`description`) and no
 * "figures to" line (`note`), and the eye is drawn by the top bar alone.
 * docs/plans/active/conversions-and-agents-build-plan-2026-10-30.md, phase 1.
 */
const WEBSITE_LAYOUTS = [
  "src/app/(dashboard)/app/analytics/[siteId]/layout.tsx",
  "src/app/(dashboard)/app/search-console/[siteId]/layout.tsx",
  "src/app/(dashboard)/app/bing-webmaster/[siteId]/layout.tsx",
  "src/app/(dashboard)/app/clarity/[siteId]/layout.tsx",
  "src/app/(dashboard)/app/sites/[siteId]/layout.tsx",
];

/** The `<DetailHeader … />` element of a layout: from its opening tag to the `/>` on a line of its own. */
const detailHeaderOf = (source: string) => source.match(/<DetailHeader[\s\S]*?\n {8}\/>/)?.[0] ?? null;

describe("The standard website header", () => {
  test.each(WEBSITE_LAYOUTS)("%s wears the compact header, with no property line and no figures-to note", (file) => {
    const header = detailHeaderOf(readRepoFile(file));
    expect(header, "a DetailHeader closed by `/>` on its own line").not.toBeNull();
    expect(header).toContain('layout="compact"');
    expect(header).not.toMatch(/\bdescription=/);
    expect(header).not.toMatch(/\bnote=/);
  });

  test("the eye is drawn by the top bar alone, never by a header part", () => {
    expect(readRepoFile("src/ui/components/layout/Header.tsx")).toContain("<HakkenSeesEye />");
    for (const file of ["src/ui/components/screens/PageHeader.tsx", "src/ui/components/screens/DetailLayout.tsx"]) {
      expect(readRepoFile(file), `${file} draws the eye`).not.toContain("HakkenSeesEye");
    }
  });
});
