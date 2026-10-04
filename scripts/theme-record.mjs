// The one record of the app's look (docs/plans/active/design-drift-plan.md, D1).
//
// `hakken.theme.json` holds every look setting Admin → System Settings →
// Global Aesthetics saves, under the settings' own field names. The app's
// defaults (convex/settingsService.ts), the stylesheet's fallbacks
// (src/app/globals.css), the product file's brand and the drawing kit all
// follow it; src/theme-record-drift.test.ts fails when one does not.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const THEME_FILE = path.join(ROOT, "hakken.theme.json");

/** Every look setting, in the order the file keeps them. */
export const THEME_FIELDS = [
  "brandColorHex",
  "lightBrandColorHex",
  "bodyFontFamily",
  "headingFontFamily",
  "headingSizeGlobal",
  "darkBg", "darkFg", "darkCardBg", "darkCardFg", "darkSidebarBg", "darkBorder", "darkMuted", "darkMutedFg",
  "darkSuccess", "darkDestructive", "darkWarning", "darkInfo", "darkRing",
  "lightBg", "lightFg", "lightCardBg", "lightCardFg", "lightSidebarBg", "lightBorder", "lightMuted", "lightMutedFg",
  "lightSuccess", "lightDestructive", "lightWarning", "lightInfo", "lightRing",
];

export function readThemeRecord() {
  return JSON.parse(readFileSync(THEME_FILE, "utf8"));
}

export function writeThemeRecord(theme) {
  const ordered = Object.fromEntries(THEME_FIELDS.map((field) => [field, theme[field] ?? null]));
  writeFileSync(THEME_FILE, `${JSON.stringify(ordered, null, 2)}\n`);
}

/** The look settings saved on the dev deployment, read with the Convex CLI. */
export function readSavedTheme() {
  const output = execFileSync("npx", ["convex", "run", "settings:get"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const start = output.indexOf("{");
  if (start < 0) throw new Error("settings:get returned no settings");
  const saved = JSON.parse(output.slice(start));
  return Object.fromEntries(THEME_FIELDS.map((field) => [field, saved[field] ?? null]));
}

/** The fields whose values differ, as [field, recorded, saved]. */
export function themeDifferences(recorded, saved) {
  return THEME_FIELDS.filter((field) => (recorded[field] ?? null) !== (saved[field] ?? null)).map((field) => [field, recorded[field] ?? null, saved[field] ?? null]);
}

/** "R, G, B" of a hex colour, as SystemSettingsContext writes --brand-rgb. */
export function rgbTriplet(hex) {
  let value = hex.replace("#", "");
  if (value.length === 3) value = value.split("").map((c) => c + c).join("");
  const num = parseInt(value, 16);
  return `${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}`;
}

/** Words on a solid brand surface: the rule in SystemSettingsContext's onBrandFor, white by default. */
export function onBrand(hex) {
  const linear = rgbTriplet(hex).split(", ").map((part) => {
    const channel = Number(part) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  return 1.05 / (luminance + 0.05) < 3 ? "#222224" : "#ffffff";
}

/**
 * The CSS variables a mode paints, from the record — the same mapping
 * SystemSettingsContext applies at run time.
 */
export function themeVariables(theme, mode) {
  const dark = mode === "dark";
  const pick = (field) => theme[`${dark ? "dark" : "light"}${field}`];
  const brand = dark ? theme.brandColorHex : theme.lightBrandColorHex || theme.brandColorHex;
  return {
    "--brand": brand,
    "--brand-rgb": rgbTriplet(brand),
    "--on-brand": onBrand(brand),
    "--bg-main": pick("Bg"),
    "--radial-outer": pick("Bg"),
    "--text-primary": pick("Fg"),
    "--bg-card": pick("CardBg"),
    "--radial-inner": pick("CardBg"),
    "--bg-sidebar": pick("SidebarBg") ?? pick("CardBg"),
    "--text-secondary": pick("CardFg"),
    "--border-subtle": pick("Border"),
    "--bg-hover": pick("Muted"),
    "--text-muted": pick("MutedFg"),
    "--success-src": pick("Success"),
    "--destructive-src": pick("Destructive"),
    "--warning-src": pick("Warning"),
    "--info-src": pick("Info"),
    "--ring": pick("Ring"),
  };
}
