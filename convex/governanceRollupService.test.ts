import { describe, expect, it } from "vitest";
import { dayKey } from "./governanceActivityService";
import {
  companyKeyOf,
  dayKeysBack,
  foldEstateRows,
  foldWindowIntoBuckets,
  governanceWindowTruncated,
  mergeBucketsForWindow,
  mergeEstateRows,
  scopeKeysFor,
} from "./governanceRollupService";

/**
 * The arithmetic behind the governance rollups, tested on its own.
 *
 * These are the figures an auditor relies on, so the folds are pure and pinned
 * here; `governanceRollups.test.ts` proves the same folds agree with a
 * from-scratch count when run through the database.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 18, 12);

const agentsById = new Map([
  ["agent_a", { id: "agent_a", name: "Front desk", risk: "LOW" }],
  ["agent_b", { id: "agent_b", name: "Researcher", risk: "HIGH" }],
]);

describe("folding a window into day buckets", () => {
  it("scopes by company and day, and reads run outcomes the way the screen does", () => {
    const buckets = foldWindowIntoBuckets({
      runs: [
        { id: "r1", companyId: "co_1", agentId: "agent_a", startedAt: NOW, status: "SUCCESS" },
        { id: "r2", companyId: "co_1", agentId: "agent_a", startedAt: NOW, status: "FAILED" },
        { id: "r3", companyId: "co_2", agentId: "agent_b", startedAt: NOW, status: "SUCCESS" },
        { id: "r4", agentId: "agent_b", startedAt: NOW - DAY, status: "CANCELLED" },
      ],
      calls: [],
      neededAPerson: new Set(["r3"]),
      agentsById,
      truncated: false,
    });

    expect(buckets).toHaveLength(3);

    const co1 = buckets.find((bucket) => bucket.companyKey === "co_1")!;
    expect(co1.date).toBe(dayKey(NOW));
    expect(co1).toMatchObject({ runsTotal: 2, finished: 1, unfinished: 1, waited: 0 });

    const co2 = buckets.find((bucket) => bucket.companyKey === "co_2")!;
    expect(co2).toMatchObject({ runsTotal: 1, finished: 1, waited: 1 });

    const none = buckets.find((bucket) => bucket.companyKey === "none")!;
    expect(none.date).toBe(dayKey(NOW - DAY));
    expect(none).toMatchObject({ runsTotal: 1, unfinished: 1 });
  });

  it("counts actions by level and remembers what each agent was seen doing, once", () => {
    const buckets = foldWindowIntoBuckets({
      runs: [],
      calls: [
        { companyId: "co_1", agentId: "agent_a", startedAt: NOW, sideEffectLevel: "READ" },
        { companyId: "co_1", agentId: "agent_a", startedAt: NOW, sideEffectLevel: "READ" },
        { companyId: "co_1", agentId: "agent_a", startedAt: NOW, sideEffectLevel: "WRITE" },
        { companyId: "co_1", agentId: "agent_b", startedAt: NOW, sideEffectLevel: "EXTERNAL" },
        // No level stamped: not counted, exactly as the live query never counted it.
        { companyId: "co_1", agentId: "agent_b", startedAt: NOW },
      ],
      neededAPerson: new Set(),
      agentsById,
      truncated: false,
    });

    const bucket = buckets[0]!;
    expect(bucket.actions).toEqual({ read: 2, write: 1, external: 1, destructive: 0, total: 4 });
    expect(bucket.perAgent.find((entry) => entry.agentId === "agent_a")?.observed).toEqual(["READ", "WRITE"]);
    expect(bucket.perAgent.find((entry) => entry.agentId === "agent_b")?.observed).toEqual(["EXTERNAL"]);
  });
});

describe("merging buckets for a window", () => {
  const bucket = (companyKey: string, date: string, over: object) => ({
    companyKey,
    date,
    finished: 0,
    waited: 0,
    unfinished: 0,
    runsTotal: 0,
    actions: { read: 0, write: 0, external: 0, destructive: 0, total: 0 },
    perAgent: [],
    truncated: false,
    ...over,
  });

  it("fills every day of the window, sums scopes, and ranks the busiest", () => {
    const merged = mergeBucketsForWindow(
      [
        bucket("co_1", dayKey(NOW), {
          finished: 3,
          runsTotal: 3,
          perAgent: [{ agentId: "agent_a", name: "Front desk", risk: "LOW", runs: 3, observed: [] }],
        }),
        bucket("none", dayKey(NOW), {
          finished: 1,
          runsTotal: 1,
          perAgent: [{ agentId: "agent_b", name: "Researcher", risk: "HIGH", runs: 1, observed: [] }],
        }),
        bucket("co_1", dayKey(NOW - DAY), {
          unfinished: 2,
          runsTotal: 2,
          actions: { read: 4, write: 0, external: 0, destructive: 0, total: 4 },
          perAgent: [{ agentId: "agent_a", name: "Old name", risk: "LOW", runs: 2, observed: [] }],
        }),
      ],
      NOW,
      3,
    );

    expect(merged.timeline).toHaveLength(3);
    expect(merged.timeline[0]).toEqual({ date: dayKey(NOW - 2 * DAY), finished: 0, waited: 0, unfinished: 0 });
    expect(merged.timeline[2]).toEqual({ date: dayKey(NOW), finished: 4, waited: 0, unfinished: 0 });
    expect(merged.runsTotal).toBe(6);
    expect(merged.unfinished).toBe(2);
    expect(merged.actions).toMatchObject({ read: 4, total: 4, readShare: 100 });
    // Ranked by runs, and the freshest bucket's name wins over the old one.
    expect(merged.busiest.map((entry) => [entry.id, entry.runs, entry.name])).toEqual([
      ["agent_a", 5, "Front desk"],
      ["agent_b", 1, "Researcher"],
    ]);
    expect(merged.truncated).toBe(false);
  });

  it("carries a truncated bucket through to the window's flag", () => {
    const merged = mergeBucketsForWindow([bucket("co_1", dayKey(NOW), { truncated: true })], NOW, 1);
    expect(merged.truncated).toBe(true);
  });
});

describe("the estate rows", () => {
  it("folds per scope and merges additively, with conformance concatenated", () => {
    const entry = (over: object) => ({
      id: "x",
      kind: "ASSISTANT" as const,
      name: "A",
      purpose: "",
      ownerName: "",
      risk: "UNRATED" as const,
      humanApproves: true,
      facesPublic: false,
      missing: ["purpose"],
      ...over,
    });

    const rows = foldEstateRows({
      entries: [
        entry({ companyId: "co_1", risk: "HIGH", humanApproves: false }),
        entry({ companyId: "co_1", facesPublic: true, missing: [] }),
        entry({ risk: "LOW", missing: [] }),
      ] as never,
      agents: [
        { id: "agent_b", companyId: "co_1", name: "Researcher", riskLevel: "LOW" },
      ],
      observedByAgent: new Map([["agent_b", ["EXTERNAL" as const]]]),
      isPartial: false,
    });

    const co1 = rows.find((row) => row.companyKey === "co_1")!;
    expect(co1).toMatchObject({ systems: 2, unattendedHighRisk: 1, publicFacing: 1, incomplete: 1 });
    // A LOW-rated agent seen reaching outside the platform is the finding.
    expect(co1.conformance).toHaveLength(1);
    expect(co1.conformance[0]).toMatchObject({ agentId: "agent_b", suggested: "HIGH" });

    const none = rows.find((row) => row.companyKey === "none")!;
    expect(none.riskMix.low).toBe(1);

    const merged = mergeEstateRows(rows);
    expect(merged.systems).toBe(3);
    expect(merged.riskMix).toEqual({ high: 1, medium: 0, low: 1, unrated: 1 });
    expect(merged.conformance).toHaveLength(1);
  });
});

describe("scope keys", () => {
  it("a workspace sees its own rows and the companyless ones; the platform sees everything", () => {
    expect(scopeKeysFor("co_1")).toEqual(["co_1", "none"]);
    expect(scopeKeysFor(undefined)).toBeUndefined();
    expect(companyKeyOf(undefined)).toBe("none");
  });

  it("the window's spine is every day, oldest first", () => {
    expect(dayKeysBack(NOW, 2)).toEqual([dayKey(NOW - DAY), dayKey(NOW)]);
  });
});

describe("deciding whether the reads behind a bucket were cut short", () => {
  const LIMIT = 100;
  const complete = { runs: 3, calls: 3, approvalsByStatus: [1, 0, 0, 0, 0] };

  it("a window inside every cap is complete", () => {
    expect(governanceWindowTruncated(complete, LIMIT)).toBe(false);
  });

  it("landing exactly on a cap is complete, because the reads take one row past it", () => {
    expect(
      governanceWindowTruncated(
        { runs: LIMIT, calls: LIMIT, approvalsByStatus: [LIMIT, LIMIT, LIMIT, LIMIT, LIMIT] },
        LIMIT,
      ),
    ).toBe(false);
  });

  it("one row past the runs cap is truncated", () => {
    expect(governanceWindowTruncated({ ...complete, runs: LIMIT + 1 }, LIMIT)).toBe(true);
  });

  it("one row past the calls cap is truncated", () => {
    expect(governanceWindowTruncated({ ...complete, calls: LIMIT + 1 }, LIMIT)).toBe(true);
  });

  // The five approvals reads build `waited`, and each has its own cap. Any one
  // of them overrunning shortens the column, which is the case both writers
  // left out of the answer entirely.
  it("one row past any single approval status is truncated", () => {
    for (let status = 0; status < 5; status += 1) {
      const approvalsByStatus = [0, 0, 0, 0, 0];
      approvalsByStatus[status] = LIMIT + 1;
      expect(governanceWindowTruncated({ runs: 1, calls: 1, approvalsByStatus }, LIMIT)).toBe(true);
    }
  });
});
