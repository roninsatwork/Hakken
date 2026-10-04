import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { lookOutline } from "./test/lookOutline";

/**
 * Approved looks stay held (docs/plans/active/design-drift-plan.md, D4).
 *
 * A look test renders an approved screen and compares its outline — its kit
 * parts top to bottom, their titles, its tables' headings — with the file
 * saved beside the plan's approved drawing, `docs/plans/assets/<plan>/look/`.
 * This holds the machinery: the kit keeps its part markers, every saved look
 * has a test that reads it, and every approved Search Console board has one.
 */

const root = process.cwd();
const ASSETS = path.join(root, "docs/plans/assets");

function filesUnder(dir: string, match: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "node_modules" ? [] : filesUnder(full, match);
    return match.test(name) ? [full] : [];
  });
}

const lookFiles = readdirSync(ASSETS).flatMap((plan) => {
  const dir = path.join(ASSETS, plan, "look");
  try {
    return readdirSync(dir).filter((name) => name.endsWith(".txt")).map((name) => ({ plan, board: name.replace(/\.txt$/, "") }));
  } catch {
    return [];
  }
});
const lookTests = filesUnder(path.join(root, "src"), /Look\w*\.test\.tsx$/).map((file) => readFileSync(file, "utf8"));

describe("approved looks", () => {
  test("every part of the screen kit keeps its marker", () => {
    const parts: Record<string, string[]> = {
      "PageHeader.tsx": ['data-part="page-header"', 'data-part="detail-header"', 'data-part="primary-action"'],
      "DetailLayout.tsx": ['data-part="record-header"'],
      "DetailTabs.tsx": ['data-part="tabs"'],
      "Figure.tsx": ['data-part="figure"', 'data-part="figures"'],
      "ChartCard.tsx": ['data-part="chart-card"'],
      "Notice.tsx": ['data-part="notice"'],
      "Table.tsx": ['data-part="table"', 'data-part="search"'],
      "TableBar.tsx": ['data-part="table-bar"'],
      "TableControls.tsx": ['data-part="search"', 'data-part="filter"'],
      "Select.tsx": ['data-part="filter"', 'data-part="select"'],
      "SettingsCard.tsx": ['data-part="settings-card"'],
      "CompactList.tsx": ['data-part="compact-list"'],
      "SaveControls.tsx": ['data-part="save"'],
      "DownloadButton.tsx": ['data-part="download"'],
    };
    const missing = Object.entries(parts).flatMap(([file, markers]) => {
      const source = readFileSync(path.join(root, "src/ui/components/screens", file), "utf8");
      return markers.filter((marker) => !source.includes(marker)).map((marker) => `${file}: ${marker}`);
    });
    expect(missing).toEqual([]);
  });

  test("every saved look has a look test that reads it", () => {
    const orphans = lookFiles.filter(({ plan, board }) => !lookTests.some((source) => source.includes(`"${plan}"`) && source.includes(`"${board}"`)));
    expect(orphans).toEqual([]);
  });

  test("every approved Search Console board has a saved look", () => {
    const canvas = JSON.parse(readFileSync(path.join(ASSETS, "search-console-redesign/canvas.json"), "utf8")) as { boards: Record<string, unknown> };
    const boards = Object.keys(canvas.boards).map((file) => file.replace(/\.dc\.html$/, ""));
    const saved = new Set(lookFiles.filter((look) => look.plan === "search-console-redesign").map((look) => look.board));
    expect(boards.filter((board) => !saved.has(board))).toEqual([]);
  });

  test("the outline reads parts in order, nested, with titles and headings but no data", () => {
    document.body.innerHTML = `
      <div data-part="detail-header"><a data-part="back" data-part-label="Keywords">← Keywords</a>
        <div data-part="page-header"><h1 data-part-title>ai agency</h1></div></div>
      <div data-part="figures"><div data-part="figure"><div data-part-title>Clicks</div><div>1,284</div></div></div>
      <div data-part="filter" data-part-label="Intent"><span>Intent: Commercial</span></div>
      <div data-part="search"><input placeholder="Search keywords…" value="ai"></div>
      <section data-part="settings-card"><h2 data-part-title>Its pages · 12</h2></section>
      <div data-part="table"><div data-part="table-bar"><span>4,120 keywords</span></div>
        <table><thead><tr><th></th><th>rival-one.test</th><th>rival-two.test</th></tr>
          <tr><th>Keyword</th><th>Position</th><th>Traffic</th><th>Position</th><th>Traffic</th></tr></thead>
        <tbody><tr><td>ai agency</td><td><div data-part="select" data-part-label="Classification of /ai/"></div></td></tr></tbody></table>
      </div>`;
    expect(lookOutline(document.body)).toBe([
      "detail-header",
      "  back: Keywords",
      "  page-header: ‹the record's name›",
      "figures",
      "  figure: Clicks",
      "filter: Intent",
      "search: Search keywords…",
      "settings-card: Its pages · #",
      "table: Keyword | (Position | Traffic) for each",
      "  table-bar",
    ].join("\n"));
  });
});
