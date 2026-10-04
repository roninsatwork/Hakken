import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { DEFAULT_SETTINGS, SHIPPED } from "../convex/settingsService";
import { productIdentity } from "../product.identity";
import { THEME_FIELDS, readThemeRecord, themeVariables } from "../scripts/theme-record.mjs";

/**
 * One record of the look (docs/plans/active/design-drift-plan.md, D1).
 *
 * `hakken.theme.json` is copied from the look saved in System Settings
 * (`npm run theme:pull`). On 2026-10-04 the repo held two other answers —
 * an orange brand in `hakken.product.json` and another in globals.css — so
 * anyone reading the code drew the wrong app. These hold every copy in the
 * code to the record; `npm run check:theme` holds the record to the database.
 */
const theme = readThemeRecord();
const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");

function block(selector: string): Record<string, string> {
  const match = css.match(new RegExp(`(?:^|\\n)${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`globals.css has no ${selector} block`);
  return Object.fromEntries(
    match[1]
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split(";")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("--"))
      .map((line) => {
        const [name, ...value] = line.split(":");
        return [name.trim(), value.join(":").trim()];
      }),
  );
}

const same = (value: string | undefined) => value?.toLowerCase().replace(/\s+/g, " ");

describe("the look has one record", () => {
  test("the record holds every look setting", () => {
    expect(Object.keys(theme)).toEqual(THEME_FIELDS);
    for (const field of THEME_FIELDS) expect(theme[field], field).toBeTruthy();
  });

  test.each([
    [":root", "light"],
    [".dark", "dark"],
  ])("globals.css %s paints the record's %s look", (selector, mode) => {
    const painted = block(selector);
    for (const [name, value] of Object.entries(themeVariables(theme, mode))) {
      expect(same(painted[name]), `${selector} ${name}`).toBe(same(value));
    }
  });

  test("the stylesheet's own fallbacks are the record's dark look", () => {
    const dark = themeVariables(theme, "dark");
    const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const fallback = (token: string) => code.match(new RegExp(`${token}:\\s*var\\(--[a-z-]+,\\s*([^)]+)\\)`))?.[1];
    expect(same(fallback("--color-brand"))).toBe(same(dark["--brand"]));
    expect(same(fallback("--color-on-brand"))).toBe(same(dark["--on-brand"]));
    expect(same(fallback("--color-success"))).toBe(same(dark["--success-src"]));
    expect(same(fallback("--color-destructive"))).toBe(same(dark["--destructive-src"]));
    expect(same(fallback("--color-warning"))).toBe(same(dark["--warning-src"]));
    expect(same(fallback("--color-info"))).toBe(same(dark["--info-src"]));
    expect(same(fallback("--color-ring"))).toBe(same(dark["--ring"]));
  });

  test("the widget on a client's website keeps the product's shipped colour, not the dashboard's", () => {
    // Decided 2026-10-03: the dashboard's pale accent would vanish on a
    // client's page. hakken.product.json's colour is that shipped colour.
    expect(SHIPPED.brandColorHex).toBe(productIdentity.brandColorHex);
    expect(SHIPPED.brandColorHex.toLowerCase()).not.toBe(theme.brandColorHex.toLowerCase());
  });

  test("a deployment that never saved a look starts in the record's", () => {
    const defaults = DEFAULT_SETTINGS as Record<string, unknown>;
    for (const field of THEME_FIELDS) expect(defaults[field], field).toBe(theme[field]);
  });

  test("Inter reaches the page root, where globals.css works out --font-sans", () => {
    // With Inter's variable only on <body>, `--font-sans: var(--font-inter), …`
    // never resolved and the app drew the system font (found 2026-10-04).
    const layout = readFileSync(path.join(process.cwd(), "src/app/layout.tsx"), "utf8");
    expect(layout).toMatch(/<html[^>]*className=\{inter\.variable\}/);
  });

  test("SystemSettingsContext applies every variable the record maps", () => {
    const context = readFileSync(path.join(process.cwd(), "src/context/SystemSettingsContext.tsx"), "utf8");
    for (const name of Object.keys(themeVariables(theme, "dark"))) {
      expect(context, name).toContain(`apply('${name}'`);
    }
  });
});
