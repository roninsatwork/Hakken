// npm run check:theme — fails when the look saved on the dev deployment and
// hakken.theme.json differ (design-drift-plan D1). Local only: GitHub cannot
// read the database, so on GitHub it says so and passes; the file itself is
// held to the code there by src/theme-record-drift.test.ts.
import { readSavedTheme, readThemeRecord, themeDifferences } from "./theme-record.mjs";

if (process.env.GITHUB_ACTIONS) {
  console.log("check:theme: skipped on GitHub (the saved look lives in the dev database).");
  process.exit(0);
}

let saved;
try {
  saved = readSavedTheme();
} catch (error) {
  console.warn(`check:theme: could not read the saved look from the dev deployment, so it was not compared (${error.message.split("\n")[0]}).`);
  process.exit(0);
}

const differences = themeDifferences(readThemeRecord(), saved);
if (differences.length === 0) {
  console.log("check:theme: hakken.theme.json matches the look saved in System Settings.");
  process.exit(0);
}
console.error("check:theme: the look saved in System Settings differs from hakken.theme.json:");
for (const [field, recorded, now] of differences) console.error(`  ${field}: file ${recorded ?? "unset"}, saved ${now ?? "unset"}`);
console.error("Run `npm run theme:pull` to copy the saved look into the repo.");
process.exit(1);
