// npm run theme:pull — copies the look saved in Admin → System Settings →
// Global Aesthetics (the dev deployment) into hakken.theme.json, the one
// record of the look. Run it after changing colours or fonts there.
import { existsSync } from "node:fs";
import { THEME_FILE, readSavedTheme, readThemeRecord, themeDifferences, writeThemeRecord } from "./theme-record.mjs";

const saved = readSavedTheme();
const before = existsSync(THEME_FILE) ? readThemeRecord() : {};
const changed = themeDifferences(before, saved);
writeThemeRecord(saved);
if (changed.length === 0) {
  console.log("hakken.theme.json already matches the saved look.");
} else {
  console.log(`hakken.theme.json updated, ${changed.length} setting(s):`);
  for (const [field, was, now] of changed) console.log(`  ${field}: ${was ?? "unset"} → ${now ?? "unset"}`);
  console.log("Then: npm run test:run -- src/theme-record-drift.test.ts, and update what it names.");
}
