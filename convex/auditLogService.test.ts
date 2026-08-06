import { describe, expect, test } from "vitest";
import type { Doc, Id } from "./_generated/dataModel";
import {
  buildAuditPurgeConfigPayload,
  calculateAuditPurgeCutoff,
  calculateFollowingMonthlyAuditPurgeRun,
  calculateNextAuditPurgeRun,
  DEFAULT_AUDIT_PURGE_CONFIG,
  parseAuditPurgeConfig,
  serializeAuditPurgeConfig,
  withAuditLogActorName,
  AUDIT_PURGE_ACTION,
  AUDIT_VALUE_LIMIT,
  auditChangesFrom,
  auditDetailsFrom,
  buildAgentActionAuditMetadata,
  buildAgentRunAuditMetadata,
  buildAuditPurgeSummary,
  isAuditableAgentAction,
  isAuditPurgeRecord,
  auditFieldWords,
  describeAuditChange,
  summariseAuditValue,
} from "./auditLogService";

describe("audit log service helpers", () => {
  test("parses missing audit purge config as defaults", () => {
    expect(parseAuditPurgeConfig(undefined)).toEqual(DEFAULT_AUDIT_PURGE_CONFIG);
  });

  test("parses persisted audit purge config", () => {
    const config = {
      enabled: true,
      retentionDays: 45,
      dayOfMonth: 10,
      hourOfDay: 3,
      nextRunTimestamp: 123,
    };

    expect(parseAuditPurgeConfig(JSON.stringify(config))).toEqual(config);
  });

  test("schedules next audit purge this month or next month", () => {
    expect(calculateNextAuditPurgeRun(10, 3, new Date("2026-06-01T12:00:00.000Z"))).toBe(
      Date.parse("2026-06-10T03:00:00.000Z")
    );
    expect(calculateNextAuditPurgeRun(1, 3, new Date("2026-06-01T12:00:00.000Z"))).toBe(
      Date.parse("2026-07-01T03:00:00.000Z")
    );
  });

  test("schedules following monthly audit purge", () => {
    expect(calculateFollowingMonthlyAuditPurgeRun(10, 3, new Date("2026-06-01T12:00:00.000Z"))).toBe(
      Date.parse("2026-07-10T03:00:00.000Z")
    );
  });

  test("builds and serializes audit purge config payload", () => {
    const payload = buildAuditPurgeConfigPayload(
      {
        enabled: true,
        retentionDays: 60,
        dayOfMonth: 12,
        hourOfDay: 4,
        nextRunTimestamp: 999,
      },
      new Date("2026-06-01T12:00:00.000Z")
    );

    expect(payload).toEqual({
      enabled: true,
      retentionDays: 60,
      dayOfMonth: 12,
      hourOfDay: 4,
      nextRunTimestamp: Date.parse("2026-06-12T04:00:00.000Z"),
    });
    expect(serializeAuditPurgeConfig(payload)).toBe(JSON.stringify(payload));
  });

  test("calculates audit purge cutoff", () => {
    expect(calculateAuditPurgeCutoff(30, Date.parse("2026-06-01T12:00:00.000Z"))).toBe(
      Date.parse("2026-05-02T12:00:00.000Z")
    );
  });

  test("adds audit log actor names with fallback", () => {
    const log = {
      _id: "log-1" as Id<"auditLogs">,
      _creationTime: 0,
      actorId: "user-1" as Id<"users">,
      actionType: "TEST",
      entityType: "systemConfig",
      timestamp: 123,
    } satisfies Doc<"auditLogs">;

    const actor = {
      _id: "user-1" as Id<"users">,
      _creationTime: 0,
      name: "Admin User",
      email: "admin@test.com",
    } satisfies Doc<"users">;

    expect(withAuditLogActorName(log, actor).actorName).toBe("Admin User");
    expect(withAuditLogActorName(log, { ...actor, name: undefined }).actorName).toBe("admin@test.com");
    expect(withAuditLogActorName(log, null).actorName).toBe("Unknown Admin");
  });
});

describe("what a change looked like, for somebody reading the trail", () => {
  test("reads the before and after a new entry records", () => {
    const metadata = JSON.stringify({
      changes: [{ field: "description", from: "", to: "Researches companies" }],
    });

    expect(auditChangesFrom(metadata)).toEqual([
      { field: "description", from: null, to: "Researches companies" },
    ]);
    expect(describeAuditChange(metadata)).toBe("Purpose: nothing → Researches companies");
  });

  test("still reads the shape risk changes have always used", () => {
    // That one was written properly from the start, and its entries have to
    // keep rendering rather than being reformatted into silence.
    const metadata = JSON.stringify({ from: null, to: "MEDIUM", summary: "…" });

    expect(describeAuditChange(metadata)).toBe("Risk rating: nothing → MEDIUM");
  });

  test("an old entry says which field moved and does not invent where to", () => {
    // The values were never recorded, so nothing can recover them. Saying
    // "changed" is the honest limit of what that entry knows.
    expect(describeAuditChange(JSON.stringify({ updatedFields: ["description"] }))).toBe(
      "Purpose changed",
    );
  });

  test("several changes name the first and count the rest", () => {
    const metadata = JSON.stringify({ updatedFields: ["description", "ownerId", "name"] });

    expect(describeAuditChange(metadata)).toBe("Purpose changed and 2 more");
  });

  test("metadata that will not parse is left for the screen to show raw", () => {
    // Swallowing it would hide an entry, which on this screen is the worst
    // possible failure.
    expect(auditChangesFrom("not json at all")).toEqual([]);
    expect(describeAuditChange(undefined)).toBe("");
  });

  test("long values are cut down so the trail does not become a copy of them", () => {
    const prompt = "x".repeat(400);
    const summarised = summariseAuditValue(prompt);

    expect(summarised).toHaveLength(AUDIT_VALUE_LIMIT + 1);
    expect(summarised?.endsWith("…")).toBe(true);
  });

  test("a short value is kept whole", () => {
    expect(summariseAuditValue("Medium")).toBe("Medium");
  });

  test("nothing recorded reads as nothing rather than as an empty string", () => {
    expect(summariseAuditValue("")).toBeNull();
    expect(summariseAuditValue(undefined)).toBeNull();
  });

  test("field names are put in words a person would use", () => {
    expect(auditFieldWords("ownerId")).toBe("Accountable person");
    // Anything nobody has named is put into words rather than shown as itself.
    // A table naming every key the platform has ever written goes stale the day
    // somebody adds one, and "sourceFilename" is nobody's idea of English.
    expect(auditFieldWords("sourceFilename")).toBe("Source filename");
  });
});

describe("entries that are not before-and-after values", () => {
  test("a sign-in reads as a sign-in rather than as nothing recorded", () => {
    // This is the blank Anthony was looking at on 2026-08-06. The record held
    // the address and the place it came from the whole time.
    const metadata = JSON.stringify({ ip: "81.2.3.4", location: "London" });

    expect(describeAuditChange(metadata, "SYSTEM_AUTHENTICATION")).toBe(
      "Signed in — IP address: 81.2.3.4, Where from: London",
    );
  });

  test("an evidence pack export reads its period as dates and its counts as counts", () => {
    const metadata = JSON.stringify({
      periodFrom: Date.parse("2026-07-01T00:00:00.000Z"),
      periodTo: Date.parse("2026-07-31T00:00:00.000Z"),
      counts: { systems: 12, runs: 340 },
    });

    expect(describeAuditChange(metadata, "EXPORT_EVIDENCE_PACK")).toBe(
      "Exported an evidence pack — Period from: 1 Jul 2026, Period to: 31 Jul 2026, Covering: 12 systems, 340 runs",
    );
  });

  test("identifiers stay in the record and out of the sentence", () => {
    // `mh71mxwkegfxgxc6avhf9zyapd8btcbg` in a sentence is worse than no
    // sentence. The detail screen still shows the record in full.
    const metadata = JSON.stringify({ agentId: "mh71mxwke", scriptName: "Repair orphans" });

    expect(auditDetailsFrom(metadata)).toEqual([{ key: "scriptName", value: "Repair orphans" }]);
  });

  test("stored codes read as words and prose is left alone", () => {
    expect(describeAuditChange(JSON.stringify({ action: "explicit_logout" }), "SYSTEM_DISCONNECTION")).toBe(
      "Signed out — Action: Explicit logout",
    );

    // Prose somebody wrote on purpose stays exactly as they wrote it.
    const written = JSON.stringify({ reason: "Retired the old widget key" });
    expect(auditDetailsFrom(written)).toEqual([
      { key: "reason", value: "Retired the old widget key" },
    ]);
  });

  test("a single fact that is already a sentence is not labelled twice", () => {
    const metadata = JSON.stringify({ summary: "Produced everything held about someone@example.com." });

    expect(describeAuditChange(metadata, "EXPORT_PERSONAL_DATA")).toBe(
      "Exported everything held about a person — Produced everything held about someone@example.com.",
    );
  });

  test("a clear-out says how much went, how old it was, and under which rule", () => {
    const metadata = buildAuditPurgeSummary({
      recordsRemoved: 512,
      retentionDays: 30,
      oldestRemovedAt: Date.parse("2026-05-02T00:00:00.000Z"),
    });

    expect(describeAuditChange(metadata, AUDIT_PURGE_ACTION)).toBe(
      "Removed audit records past their retention date — Records removed: 512, Kept for: 30 days, Oldest removed: 2 May 2026",
    );
  });

  test("the record of a clear-out is never itself cleared out", () => {
    // A summary a later run could remove would leave the same hole one month
    // further on, which is the hole the summary exists to close.
    expect(isAuditPurgeRecord(AUDIT_PURGE_ACTION)).toBe(true);
    expect(isAuditPurgeRecord("UPDATE_AGENT")).toBe(false);
  });

  test("starting and stopping work in a workspace read as different things", () => {
    expect(describeAuditChange(JSON.stringify({ workspace: "Comax" }), "IMPERSONATE_COMPANY")).toBe(
      "Started working inside a workspace — Workspace: Comax",
    );
    expect(describeAuditChange(JSON.stringify({}), "END_IMPERSONATION")).toBe(
      "Stopped working inside a workspace",
    );
  });

  test("a refused sign-in names the account it was aimed at", () => {
    const metadata = JSON.stringify({ attemptedEmail: "someone@example.com", method: "one-time code" });

    expect(describeAuditChange(metadata, "SIGN_IN_FAILED")).toBe(
      "A sign-in was refused — Account: someone@example.com, Method: one-time code",
    );
  });

  test("an agent's own action reads as something a person can judge", () => {
    const metadata = buildAgentActionAuditMetadata({
      agentName: "Housekeeping Agent",
      tool: "company_overview_write",
      sideEffectLevel: "DESTRUCTIVE",
      status: "SUCCESS",
      wasApproved: true,
    });

    // The tool name reads as words on the line, and the record keeps it exactly
    // as written for anyone matching it against the tool registry.
    expect(describeAuditChange(metadata, "AGENT_ACTION")).toBe(
      "An agent acted on its own — Agent: Housekeeping Agent, Did: deleted something, Using: Company overview write and 2 more",
    );
  });

  test("reads never reach the trail and everything else does", () => {
    // An agent answering a question by looking something up is the bulk of what
    // agents do, and all of it on the trail is a trail nobody can read.
    expect(isAuditableAgentAction("READ")).toBe(false);
    expect(isAuditableAgentAction("WRITE")).toBe(true);
    expect(isAuditableAgentAction("DESTRUCTIVE")).toBe(true);
    expect(isAuditableAgentAction("EXTERNAL")).toBe(true);
  });

  test("approval is noted only when it happened", () => {
    // "Approved by a person: no" against every unattended call reads as a
    // finding rather than as the norm.
    const unattended = JSON.parse(
      buildAgentActionAuditMetadata({
        tool: "send_email",
        sideEffectLevel: "EXTERNAL",
        status: "SUCCESS",
      }),
    );

    expect(unattended).toEqual({
      did: "sent something outside",
      using: "send_email",
      outcome: "SUCCESS",
    });
  });

  test("a finished run says what it was asked and how long it took", () => {
    const metadata = buildAgentRunAuditMetadata({
      agentName: "Housekeeping Agent",
      objective: "Tidy the register.",
      status: "SUCCESS",
      durationMs: 42_000,
    });

    expect(describeAuditChange(metadata, "AGENT_RUN_FINISHED")).toBe(
      "An agent run finished — Agent: Housekeeping Agent, Outcome: SUCCESS, Asked to: Tidy the register. and 1 more",
    );
  });

  test("an action nobody has written a phrase for still reads as words", () => {
    expect(describeAuditChange(undefined, "UPDATE_AGENT_RISK")).toBe("Update agent risk");
  });

  test("only an entry holding genuinely nothing comes back empty", () => {
    expect(describeAuditChange(undefined)).toBe("");
    expect(describeAuditChange(JSON.stringify({ agentId: "mh71mxwke" }), undefined)).toBe("");
  });

  test("a long line names the first few facts and counts the rest", () => {
    const metadata = JSON.stringify({ a: 1, b: 2, c: 3, d: 4, e: 5 });

    expect(describeAuditChange(metadata, "SOMETHING_NEW")).toBe(
      "Something new — A: 1, B: 2, C: 3 and 2 more",
    );
  });

  test("before-and-after values still win over the plainer reading", () => {
    // An entry that carries both should read as the change, not as a list of
    // whatever else happens to be in the record.
    const metadata = JSON.stringify({
      changes: [{ field: "description", from: "", to: "Researches companies" }],
      agentId: "mh71mxwke",
      scope: "global",
    });

    expect(describeAuditChange(metadata, "UPDATE_AGENT")).toBe(
      "Purpose: nothing → Researches companies",
    );
  });

  test("settings entries written before values were kept still render", () => {
    expect(describeAuditChange(JSON.stringify({ modifiedFields: ["brandColorHex"] }))).toBe(
      "Brand colour changed",
    );
  });
});
