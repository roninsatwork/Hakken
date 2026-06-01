import { describe, expect, test } from "vitest";
import {
  appendTranscript,
  buildUnsupportedFileMessage,
  canStartAssistantThread,
  getGreetingKey,
} from "./assistantWelcomeUtils";

describe("assistant welcome utils", () => {
  test("maps the current hour to the expected greeting bucket", () => {
    expect(getGreetingKey(new Date("2026-06-01T08:00:00"))).toBe("morning");
    expect(getGreetingKey(new Date("2026-06-01T13:00:00"))).toBe("afternoon");
    expect(getGreetingKey(new Date("2026-06-01T19:00:00"))).toBe("evening");
    expect(getGreetingKey(new Date("2026-06-01T22:00:00"))).toBe("night");
  });

  test("appends voice transcripts with a spacer only when needed", () => {
    expect(appendTranscript("", "hello")).toBe("hello");
    expect(appendTranscript("hello", "there")).toBe("hello there");
  });

  test("builds upload error copy only for invalid files", () => {
    expect(buildUnsupportedFileMessage([])).toBeNull();
    expect(buildUnsupportedFileMessage(["bad.exe (blocked)"])).toBe("Unsupported file(s): bad.exe (blocked)");
  });

  test("allows thread start with either content or files while not submitting", () => {
    expect(canStartAssistantThread("", 0, false)).toBe(false);
    expect(canStartAssistantThread("  hello  ", 0, false)).toBe(true);
    expect(canStartAssistantThread("", 1, false)).toBe(true);
    expect(canStartAssistantThread("hello", 0, true)).toBe(false);
  });
});
