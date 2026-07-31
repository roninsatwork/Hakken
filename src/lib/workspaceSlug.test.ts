import { describe, expect, test } from "vitest";
import { isWorkspaceSectionPath, matchesWorkspace, workspaceSlug } from "./workspaceSlug";

/**
 * The section's URL carries the workspace's own name, which is the same rule
 * the nav label follows — the platform never writes a client's name down. What
 * matters here is that the segment names a workspace without selecting one:
 * typing someone else's name must not match.
 */

describe("workspaceSlug", () => {
  test("lowercases and hyphenates a company name", () => {
    expect(workspaceSlug("Comax")).toBe("comax");
    expect(workspaceSlug("Northwind Trading")).toBe("northwind-trading");
  });

  test("collapses punctuation and trims the edges", () => {
    expect(workspaceSlug("  Dispensers & Brackets Ltd. ")).toBe("dispensers-brackets-ltd");
    expect(workspaceSlug("A/B Testing Co")).toBe("a-b-testing-co");
  });

  test("folds accents so the name is typeable", () => {
    expect(workspaceSlug("Café Group")).toBe("cafe-group");
  });
});

describe("matchesWorkspace", () => {
  test("matches the workspace's own name however it is spelled", () => {
    expect(matchesWorkspace("comax", "Comax")).toBe(true);
    expect(matchesWorkspace("comax", "  comax ")).toBe(true);
    expect(matchesWorkspace("northwind-trading", "Northwind Trading")).toBe(true);
  });

  test("does not match another workspace", () => {
    expect(matchesWorkspace("northwind", "Comax")).toBe(false);
    expect(matchesWorkspace("", "Comax")).toBe(false);
  });

  test("survives an encoded segment", () => {
    expect(matchesWorkspace("northwind%20trading", "Northwind Trading")).toBe(true);
  });
});

describe("isWorkspaceSectionPath", () => {
  test("recognises the section's pages under any workspace name", () => {
    expect(isWorkspaceSectionPath("/app/comax/spreadsheet-import")).toBe(true);
    expect(isWorkspaceSectionPath("/app/comax/import-data")).toBe(true);
    expect(isWorkspaceSectionPath("/app/northwind-trading/spreadsheet-import")).toBe(true);
  });

  test("ignores the rest of the app", () => {
    expect(isWorkspaceSectionPath("/app")).toBe(false);
    expect(isWorkspaceSectionPath("/app/assistant")).toBe(false);
    expect(isWorkspaceSectionPath("/app/comax")).toBe(false);
    expect(isWorkspaceSectionPath("/app/reports/sales")).toBe(false);
  });
});
