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
