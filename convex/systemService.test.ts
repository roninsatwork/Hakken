import { describe, expect, test } from "vitest";
import type { Id } from "./_generated/dataModel";
import {
  buildAnalyticsIdAuditMetadata,
  buildSystemConfigPatch,
  buildSystemConfigWrite,
  buildSystemPromptAuditMetadata,
  DEFAULT_SYSTEM_PII_CONFIG,
  parseSystemPiiConfig,
  trimAnalyticsTrackingId,
} from "./systemService";

describe("system service helpers", () => {
  test("trims analytics tracking IDs", () => {
    expect(trimAnalyticsTrackingId("  G-ABC123  ")).toBe("G-ABC123");
  });

  test("parses missing PII config as the admin system default", () => {
    expect(parseSystemPiiConfig(undefined)).toEqual(DEFAULT_SYSTEM_PII_CONFIG);
  });

  test("parses persisted PII config", () => {
    const config = {
      enabled: true,
      maskEmails: true,
      maskCreditCards: false,
      maskPhones: true,
      maskNinos: false,
    };

    expect(parseSystemPiiConfig(JSON.stringify(config))).toEqual(config);
  });

  test("builds system config insert and patch payloads", () => {
    const userId = "user-1" as Id<"users">;

    expect(buildSystemConfigWrite({ key: "SYSTEM_PROMPT", value: "Prompt", userId, now: 123 })).toEqual({
      key: "SYSTEM_PROMPT",
      value: "Prompt",
      updatedAt: 123,
      updatedBy: userId,
    });

    expect(buildSystemConfigPatch({ value: "Prompt", userId, now: 123 })).toEqual({
      value: "Prompt",
      updatedAt: 123,
      updatedBy: userId,
    });
  });

  test("serializes system audit metadata", () => {
    expect(buildSystemPromptAuditMetadata("hello")).toBe(JSON.stringify({ promptLength: 5 }));
    expect(buildAnalyticsIdAuditMetadata("  G-ABC123  ")).toBe(JSON.stringify({ newTrackingId: "G-ABC123" }));
  });
});
