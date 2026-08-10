import { describe, expect, it } from "vitest";
import { normalizeFontKey, resolveFontFamily } from "./themeFonts";

/**
 * The old font dropdown submitted raw CSS, and its "Inter" option was the
 * literal `var(--font-sans)` — written back into `--font-sans`, a cycle that
 * computed invalid and dropped the app to the browser serif. These tests pin
 * the property that makes the bug unrepresentable: nothing this module
 * returns may reference the variables the injector writes it into.
 */
describe("resolveFontFamily", () => {
  it("returns nothing for the default, so the app stack is left alone", () => {
    expect(resolveFontFamily(undefined)).toBeUndefined();
    expect(resolveFontFamily(null)).toBeUndefined();
    expect(resolveFontFamily("")).toBeUndefined();
    expect(resolveFontFamily("default")).toBeUndefined();
  });

  it("resolves mono to a concrete stack that does not reference --font-sans or --font-heading", () => {
    const stack = resolveFontFamily("mono");
    expect(stack).toContain("monospace");
    expect(stack).not.toContain("--font-sans");
    expect(stack).not.toContain("--font-heading");
  });

  it("treats the legacy raw-CSS values as their modern equivalents", () => {
    // The self-cycle value — the bug itself. Default is already Inter.
    expect(resolveFontFamily("var(--font-sans)")).toBeUndefined();
    expect(resolveFontFamily("var(--font-mono)")).toBe(resolveFontFamily("mono"));
  });

  it("renders the app default for legacy fonts that were never loaded", () => {
    // Playfair/Outfit options existed but no @font-face or next/font ever
    // loaded them; the browser silently fell back to a generic serif.
    expect(resolveFontFamily("'Playfair Display', serif")).toBeUndefined();
    expect(resolveFontFamily("'Outfit', sans-serif")).toBeUndefined();
  });

  it("never returns a value containing the variable it may be written into", () => {
    const candidates = [
      "default", "mono",
      "var(--font-sans)", "var(--font-mono)", "var(--font-heading)",
      "'Playfair Display', serif",
    ];
    for (const candidate of candidates) {
      const resolved = resolveFontFamily(candidate);
      if (resolved === undefined) continue;
      expect(resolved, candidate).not.toContain("var(--font-sans)");
      expect(resolved, candidate).not.toContain("var(--font-heading)");
    }
  });
});

describe("normalizeFontKey", () => {
  it("maps stored values onto the two dropdown keys", () => {
    expect(normalizeFontKey(undefined)).toBe("default");
    expect(normalizeFontKey("var(--font-sans)")).toBe("default");
    expect(normalizeFontKey("'Playfair Display', serif")).toBe("default");
    expect(normalizeFontKey("mono")).toBe("mono");
    expect(normalizeFontKey("var(--font-mono)")).toBe("mono");
  });
});
