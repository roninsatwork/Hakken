import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

/**
 * The schedule and the ledger must be the same list (foundation-quality
 * plan, phase 1.3 — written for phase 3.2's file splits to lean on).
 *
 * Every cron dispatches through `internal.jobLedger.runJob` with a job name
 * as a plain string, and `jobLedger.ts` maps that string to the real
 * function. TypeScript checks neither side against the other, so a renamed
 * job silently orphans its schedule: the cron fires, the ledger records
 * "Unknown job", and the work never runs. crons.ts is read as source — the
 * house pattern from src/no-client-specific-fallbacks.test.ts — and the
 * registry is read through `listJobRuns`, which is built from the real JOBS
 * map at runtime.
 */

const cronsSource = fs.readFileSync(fileURLToPath(new URL("./crons.ts", import.meta.url)), "utf8");

type CronCall = {
  method: string;
  name: string;
  job: string | null;
  body: string;
};

function parseCronCalls(source: string): CronCall[] {
  const calls: CronCall[] = [];
  for (const match of source.matchAll(
    /crons\.(interval|hourly|daily|weekly|monthly|cron)\(([\s\S]*?)\n\);/g
  )) {
    const body = match[2];
    const name = /"([^"]+)"/.exec(body)?.[1] ?? "";
    const job = /job:\s*"([^"]+)"/.exec(body)?.[1] ?? null;
    calls.push({ method: match[1], name, job, body });
  }
  return calls;
}

/** The cadence the schedule itself implies, in minutes. */
function scheduledEveryMinutes(call: CronCall): number | null {
  if (call.method === "hourly") return 60;
  if (call.method === "daily") return 1440;
  if (call.method === "weekly") return 10080;
  // The ledger treats a month as 31 days.
  if (call.method === "monthly") return 44640;
  const interval = /\{\s*(minutes|hours):\s*(\d+)\s*\}/.exec(call.body);
  if (!interval) return null;
  return interval[1] === "hours" ? Number(interval[2]) * 60 : Number(interval[2]);
}

const cronCalls = parseCronCalls(cronsSource);

// Computed once and shared, like cronsSource above: the registry rows come
// from the static JOBS map, nothing mutates between tests, and each
// full-schema convexTest boot registers every module in convex/ — three
// identical boots bought no isolation, only setup time.
const registryRowsPromise = (async () => {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));
  const superAdminId = await t.run(async (ctx) =>
    ctx.db.insert("users", { email: "super@crons.test", role: "SUPER_ADMIN" })
  );
  return await t.withIdentity({ subject: superAdminId }).query(api.jobLedger.listJobRuns, {});
})();

function readRegistryRows() {
  return registryRowsPromise;
}

describe("crons and the job ledger agree", () => {
  test("the parser actually found the schedule", () => {
    // A refactor of crons.ts that this regex no longer matches must fail
    // loudly here, not let every assertion below pass over an empty list.
    expect(cronCalls.length).toBeGreaterThan(20);
    for (const call of cronCalls) {
      expect(call.name, `A ${call.method} cron with no name label`).not.toBe("");
    }
  });

  test("every cron dispatches through the ledger door under its own name", () => {
    for (const call of cronCalls) {
      // Bypassing runJob means the job runs unrecorded — a failing sweep
      // would look exactly like a working one again.
      expect(call.body, `Cron "${call.name}" does not go through internal.jobLedger.runJob`)
        .toContain("internal.jobLedger.runJob");
      // The label and the payload must be the same string, or the ledger
      // records one name while the dashboard schedule shows another.
      expect(call.job, `Cron "${call.name}" dispatches job "${call.job}"`).toBe(call.name);
    }
    // Convex rejects duplicate cron names at deploy time; catch it here first.
    expect(new Set(cronCalls.map((call) => call.name)).size).toBe(cronCalls.length);
  });

  test("every dispatched job exists in the JOBS registry", async () => {
    const registryJobs = new Set((await readRegistryRows()).map((row) => row.job));
    const missing = cronCalls
      .map((call) => call.job)
      .filter((job): job is string => job !== null && !registryJobs.has(job));
    expect(
      missing,
      `crons.ts dispatches jobs the ledger does not know — each would run as "Unknown job" forever: ${missing.join(", ")}`
    ).toEqual([]);
  });

  test("no registry entry is orphaned: every JOBS job is scheduled by crons.ts", async () => {
    const scheduled = new Set(cronCalls.map((call) => call.job));
    const orphaned = (await readRegistryRows())
      .map((row) => row.job)
      .filter((job) => !scheduled.has(job));
    // There is no manual-job convention in this codebase; a registry entry
    // nothing dispatches is dead weight or a schedule someone deleted by
    // accident. If a deliberately manual job ever appears, exempt it here
    // by name with a comment saying who runs it.
    expect(
      orphaned,
      `jobLedger.ts registers jobs no cron dispatches: ${orphaned.join(", ")}`
    ).toEqual([]);
  });

  test("every registry entry knows how often it should run, and the number matches the schedule", async () => {
    const rows = await readRegistryRows();
    const byJob = new Map(rows.map((row) => [row.job, row]));

    for (const row of rows) {
      // Without this the overdue flag can never fire for the job: a dead
      // sweep would sit on the screen unflagged for ever.
      expect(
        row.expectedEveryMinutes,
        `Job "${row.job}" has no EXPECTED_EVERY_MINUTES entry`
      ).toBeGreaterThan(0);
    }

    for (const call of cronCalls) {
      if (!call.job) continue;
      const expected = scheduledEveryMinutes(call);
      expect(expected, `Could not read the cadence of cron "${call.name}"`).not.toBeNull();
      // A schedule changed without its ledger entry makes "overdue" a lie in
      // one direction or the other.
      expect(
        byJob.get(call.job)?.expectedEveryMinutes,
        `Cron "${call.name}" runs every ${expected} minutes but EXPECTED_EVERY_MINUTES disagrees`
      ).toBe(expected);
    }
  });
});
