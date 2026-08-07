import { describe, expect, test } from "vitest";
import { isSettingsTab } from "./settingsTabs";

describe("settings tabs", () => {
  test("accepts supported settings tab ids", () => {
    expect(isSettingsTab("identity")).toBe(true);
    expect(isSettingsTab("appearance")).toBe(true);
    expect(isSettingsTab("security")).toBe(true);
    expect(isSettingsTab("options")).toBe(true);
    expect(isSettingsTab("purges")).toBe(true);
  });

  test("rejects unknown or empty tab ids", () => {
    expect(isSettingsTab("billing")).toBe(false);
    // Retired: the audit trail moved under Governance, and a stale bookmark
    // should land on the default tab rather than an empty one.
    expect(isSettingsTab("audit")).toBe(false);
    expect(isSettingsTab("")).toBe(false);
    expect(isSettingsTab(null)).toBe(false);
  });
});
