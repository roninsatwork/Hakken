import { describe, expect, test } from "vitest";
import {
  assertWithinMessageRateLimit,
  countRecentUserMessages,
  isChatQuotaExceeded,
  resolveTargetAgentId,
  type ChatQuota,
} from "./chatService";
import type { Id } from "./_generated/dataModel";

describe("chat service helpers", () => {
  test("counts only recent user messages for rate limiting", () => {
    const now = Date.parse("2026-05-31T12:00:00.000Z");
    const messages = [
      { role: "user" as const, createdAt: now - 1000 },
      { role: "assistant" as const, createdAt: now - 1000 },
      { role: "user" as const, createdAt: now - 61000 },
      { role: "user" as const, createdAt: now - 30000 },
    ];

    expect(countRecentUserMessages(messages, now)).toBe(2);
  });

  test("throws when the message rate limit is reached", () => {
    const now = Date.parse("2026-05-31T12:00:00.000Z");
    const messages = Array.from({ length: 10 }, () => ({ role: "user" as const, createdAt: now - 1000 }));

    expect(() => assertWithinMessageRateLimit(messages, now)).toThrow("429 Too Many Requests");
  });

  test("recognizes exhausted finite quotas but not unlimited quotas", () => {
    expect(isChatQuotaExceeded({ messageLimit: 10, messagesUsed: 10 } satisfies ChatQuota)).toBe(true);
    expect(isChatQuotaExceeded({ messageLimit: 10, messagesUsed: 9 } satisfies ChatQuota)).toBe(false);
    expect(isChatQuotaExceeded({ messageLimit: -1, messagesUsed: 999 } satisfies ChatQuota)).toBe(false);
  });

  test("resolves dynamic agent overrides", () => {
    const current = "agent-current" as Id<"agents">;
    const next = "agent-next" as Id<"agents">;

    expect(resolveTargetAgentId(current, undefined)).toBe(current);
    expect(resolveTargetAgentId(current, null)).toBeUndefined();
    expect(resolveTargetAgentId(current, next)).toBe(next);
  });
});
