import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { buildDrawingKit } from "./drawing-kit.mjs";
import { readThemeRecord } from "./theme-record.mjs";

/**
 * The drawing kit is rendered from the real components
 * (docs/plans/active/design-drift-plan.md, D2). A component that stops
 * rendering outside the app — a new provider, a hook the kit's stand-ins do
 * not answer — fails here, not in the next agent's drawing.
 */
const out = mkdtempSync(path.join(tmpdir(), "drawing-kit-"));
afterAll(() => rmSync(out, { recursive: true, force: true }));

describe("the drawing kit", () => {
  test("builds every part from the real components, in the recorded look", async () => {
    const { css, parts } = await buildDrawingKit(out);
    expect(parts.map((part) => part.id)).toEqual(expect.arrayContaining(["shell-sidebar", "shell-header", "page-header", "detail-header", "section-menu", "figures", "chart-card", "notice", "settings-card", "buttons", "filter-chips", "labels", "table"]));
    for (const part of parts) {
      expect(part.html.length, part.id).toBeGreaterThan(40);
      // An untranslated key or a value that never arrived would show as words.
      expect(part.html, part.id).not.toMatch(/\bundefined\b|\bNaN\b|\b(ui|sidebar|sites)\.[a-z]+\.[a-zA-Z]+/);
    }
    expect(css).toContain(`--brand: ${readThemeRecord().brandColorHex}`);
    expect(css).toContain(".text-foreground");
  });
});
