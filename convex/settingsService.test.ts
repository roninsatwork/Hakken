import { describe, expect, test } from "vitest";
import type { Doc, Id } from "./_generated/dataModel";
import {
  buildSettingsAuditMetadata,
  buildSettingsInsertRecord,
  buildSettingsPatch,
  DEFAULT_SETTINGS,
  isStorageLogoReference,
  mergeSettingsWithDefaults,
} from "./settingsService";

describe("settings service helpers", () => {
  test("detects storage logo references without changing existing http behavior", () => {
    expect(isStorageLogoReference("storage-id")).toBe(true);
    expect(isStorageLogoReference("https://example.com/logo.png")).toBe(false);
    expect(isStorageLogoReference("http://example.com/logo.png")).toBe(false);
    expect(isStorageLogoReference(undefined)).toBe(false);
  });

  test("builds settings patches without undefined fields", () => {
    expect(
      buildSettingsPatch({
        platformName: "New Name",
        brandColorHex: undefined,
        diagnosticRoutingEnabled: false,
      })
    ).toEqual({
      platformName: "New Name",
      diagnosticRoutingEnabled: false,
    });
  });

  test("builds insert records over defaults", () => {
    expect(buildSettingsInsertRecord({ platformName: "New Name" })).toEqual({
      ...DEFAULT_SETTINGS,
      platformName: "New Name",
    });
  });

  test("merges stored settings with defaults and resolved logos", () => {
    const settings = {
      _id: "settings-1" as Id<"systemSettings">,
      _creationTime: 0,
      platformName: "Stored",
      brandColorHex: "#000000",
      logoUrlLight: "light-storage-id",
      logoUrlDark: "dark-storage-id",
    } satisfies Doc<"systemSettings">;

    expect(
      mergeSettingsWithDefaults({
        settings,
        logoUrlLight: "https://cdn.example/light.png",
        logoUrlDark: "https://cdn.example/dark.png",
      })
    ).toEqual({
      ...DEFAULT_SETTINGS,
      ...settings,
      logoUrlLight: "https://cdn.example/light.png",
      logoUrlDark: "https://cdn.example/dark.png",
    });
  });

  test("returns defaults when no settings are stored", () => {
    expect(mergeSettingsWithDefaults({ settings: null })).toEqual(DEFAULT_SETTINGS);
  });

  test("serializes settings audit metadata", () => {
    expect(buildSettingsAuditMetadata({ platformName: "New Name", brandColorHex: "#ffffff" })).toBe(
      JSON.stringify({ modifiedFields: ["platformName", "brandColorHex"] })
    );
  });
});
