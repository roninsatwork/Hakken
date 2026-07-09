#!/usr/bin/env node
// Aggregate per-region avatar follow errors from replay-lab capture folders,
// and optionally compare two capture runs with a regression verdict.
//
// Usage:
//   node scripts/movement-debug/aggregate-follow-errors.mjs <capturesDir>
//   node scripts/movement-debug/aggregate-follow-errors.mjs <beforeDir> <afterDir>
//
// Errors are `1 - dot(avatarBoneWorldDir, sourceDesiredDir)` per segment,
// captured by buildMovementAvatarVisualTelemetry into each capture's
// diagnostics. Lower is better. A cell regressing by more than the
// tolerance (default 0.01) fails the comparison.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const REGIONS = ["spine", "arm", "upper", "lower", "foot"];
const DIAGNOSTIC_KEYS = {
  arm: "avatarFollowArmError",
  foot: "avatarFollowFootError",
  lower: "avatarLowerError",
  spine: "avatarFollowSpineError",
  upper: "avatarUpperError",
};
const REGRESSION_TOLERANCE = Number(process.env.FOLLOW_ERROR_TOLERANCE ?? 0.01);

function aggregate(dir) {
  const sessions = {};
  for (const sub of readdirSync(dir)) {
    const subPath = join(dir, sub);
    if (!statSync(subPath).isDirectory()) continue;
    const jsonFile = readdirSync(subPath).find((file) => file.endsWith(".json"));
    if (!jsonFile) continue;

    const data = JSON.parse(readFileSync(join(subPath, jsonFile), "utf8"));
    const collected = Object.fromEntries(REGIONS.map((region) => [region, []]));
    for (const capture of data.captures ?? []) {
      const diagnostics = capture.diagnostics ?? {};
      for (const region of REGIONS) {
        const value = diagnostics[DIAGNOSTIC_KEYS[region]];
        if (typeof value === "number") collected[region].push(value);
      }
    }

    sessions[data.sessionId] = Object.fromEntries(
      REGIONS.map((region) => [
        region,
        collected[region].length
          ? Number((collected[region].reduce((sum, value) => sum + value, 0) / collected[region].length).toFixed(4))
          : null,
      ]),
    );
  }
  return sessions;
}

const [beforeDir, afterDir] = process.argv.slice(2);
if (!beforeDir) {
  console.error("Usage: aggregate-follow-errors.mjs <capturesDir> [afterDir]");
  process.exit(2);
}

const before = aggregate(beforeDir);

if (!afterDir) {
  for (const [sessionId, regions] of Object.entries(before)) {
    console.log(
      sessionId.slice(0, 12),
      REGIONS.map((region) => `${region} ${regions[region] ?? "--"}`).join(" | "),
    );
  }
  process.exit(0);
}

const after = aggregate(afterDir);
let regressions = 0;

for (const [sessionId, beforeRegions] of Object.entries(before)) {
  const afterRegions = after[sessionId];
  if (!afterRegions) {
    console.log(sessionId.slice(0, 12), "MISSING in after run");
    regressions += 1;
    continue;
  }
  const row = [sessionId.slice(0, 12)];
  for (const region of REGIONS) {
    const delta = (afterRegions[region] ?? 0) - (beforeRegions[region] ?? 0);
    const isWorse = delta > REGRESSION_TOLERANCE;
    if (isWorse) regressions += 1;
    row.push(`${region} ${beforeRegions[region] ?? "--"}->${afterRegions[region] ?? "--"}${isWorse ? " WORSE" : ""}`);
  }
  console.log(row.join(" | "));
}

console.log(`cells worse: ${regressions} (tolerance ${REGRESSION_TOLERANCE})`);
process.exit(regressions > 0 ? 1 : 0);
