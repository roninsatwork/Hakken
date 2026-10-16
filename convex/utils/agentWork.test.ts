import fs from "fs";
import path from "path";
import { describe, expect, test } from "vitest";
import { ASSIGNABLE_AGENT_ROLES } from "./agentRoles";
import { AGENT_WORK, agentWorkOf } from "./agentWork";
import { WIKI_STAFF } from "../wikiStaff";
import { AUTO_CLASSIFIER } from "./autoClassifyAgent";
import { CLARITY_COLLECTOR } from "./clarityCollectorAgent";
import { repoRoot } from "@/src/test/driftUtils";

/**
 * The Agents screen's map of what each agent does and when it runs
 * (agents-and-clarity-plan.md, AG2, AG4): every role an agent can hold is in
 * it, and every timer it names runs as `crons.ts` says, so the screen's Runs
 * column cannot disagree with what runs.
 */

const crons = fs.readFileSync(path.join(repoRoot, "convex/crons.ts"), "utf8");

/** A timer's spec as `crons.ts` writes it: its name, then its `{ … }`. */
function cronSpec(name: string): string | null {
  const at = crons.indexOf(`"${name}"`);
  if (at < 0) return null;
  const open = crons.indexOf("{", at);
  const close = crons.indexOf("}", open);
  return crons.slice(open + 1, close).replace(/\s+/g, " ").trim();
}

describe("what each agent does and when it runs", () => {
  test("every role an agent can be given, every member of the wiki's staff, Auto Classify and the Clarity Collector, is in the map", () => {
    const missing = [...ASSIGNABLE_AGENT_ROLES, ...WIKI_STAFF.map((member) => member.systemKey), AUTO_CLASSIFIER.systemKey, CLARITY_COLLECTOR.systemKey].filter((key) => !(key in AGENT_WORK));
    expect(missing).toEqual([]);
  });

  test("every timer named runs as crons.ts has it", () => {
    const differing: string[] = [];
    for (const [key, work] of Object.entries(AGENT_WORK)) {
      const timer = work.timer;
      if (!timer) continue;
      const spec = cronSpec(timer.cron);
      const expected = "every" in timer
        ? Object.entries(timer.every).map(([unit, count]) => `${unit}: ${count}`).join(", ")
        : "daily" in timer
          ? `hourUTC: ${timer.daily.hourUTC}, minuteUTC: ${timer.daily.minuteUTC}`
          : `day: ${timer.monthly.day}, hourUTC: ${timer.monthly.hourUTC}, minuteUTC: ${timer.monthly.minuteUTC}`;
      if (spec !== expected) differing.push(`${key}: the map says ${timer.cron} { ${expected} }, crons.ts says ${spec === null ? "nothing" : `{ ${spec} }`}`);
    }
    expect(differing).toEqual([]);
  });

  test("an agent someone made runs on its schedule if it has one, and otherwise when asked", () => {
    expect(agentWorkOf(undefined, true)).toEqual({ what: "own", when: "schedule", trigger: undefined });
    expect(agentWorkOf(undefined, false)).toMatchObject({ what: "own", when: "asked" });
    expect(agentWorkOf("SOMETHING_NEW", false)).toMatchObject({ what: "platform", when: "asked" });
    expect(agentWorkOf("INSIGHTS_EDITOR", false)).toEqual({ what: "insights", when: "team" });
  });
});
