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
import {
  UNCONFIGURED_EMAIL_ADDRESS,
  buildEmailBranding,
  buildEmailFromAddress,
  isLikelyEmailAddress,
  resolveEnvFromAddress,
} from "./emailBrandingService";

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
    // No previous record — the first save has nothing to have moved from.
    expect(buildSettingsAuditMetadata({ platformName: "New Name", brandColorHex: "#ffffff" })).toBe(
      JSON.stringify({ modifiedFields: ["platformName", "brandColorHex"] })
    );
  });

  test("records what a setting was changed from, not only that it was", () => {
    const metadata = buildSettingsAuditMetadata(
      { platformName: "Hakken", brandColorHex: "#ffffff" },
      { platformName: "Hakken", brandColorHex: "#E26D28" }
    );

    // The screen posts the whole form on every save, so a field saved as the
    // value it already held has to be dropped. Without that, every entry would
    // list forty untouched colours and the one real change would be lost in it.
    expect(JSON.parse(metadata)).toEqual({
      modifiedFields: ["platformName", "brandColorHex"],
      changes: [{ field: "brandColorHex", from: "#E26D28", to: "#ffffff" }],
    });
  });

  test("builds branded email sender fallbacks without exposing invalid addresses", () => {
    expect(isLikelyEmailAddress("hello@example.com")).toBe(true);
    expect(isLikelyEmailAddress("bad-address")).toBe(false);
    expect(
      buildEmailFromAddress({
        settings: {
          platformName: "Acme Ops",
          emailSenderAddress: "hello@example.com",
        },
      })
    ).toBe("Acme Ops <hello@example.com>");
    expect(
      buildEmailFromAddress({
        envFromAddress: "Deploy Sender <verified@example.com>",
        settings: {
          platformName: "Acme Ops",
          emailSenderAddress: "hello@example.com",
        },
      })
    ).toBe("Deploy Sender <verified@example.com>");
    // With no sender configured, fall back to an address that cannot be
    // delivered to, rather than one belonging to whoever built the platform.
    expect(buildEmailBranding({ platformName: "Acme Ops" })).toMatchObject({
      platformName: "Acme Ops",
      fromAddress: `${DEFAULT_SETTINGS.platformName} <${UNCONFIGURED_EMAIL_ADDRESS}>`,
    });
    expect(UNCONFIGURED_EMAIL_ADDRESS).toMatch(/\.invalid$/);
  });

  test("reads the sender from whichever environment variable a deployment already uses", () => {
    // Deployments already set AUTH_EMAIL; demanding a second variable for the
    // same fact would be pointless configuration.
    expect(resolveEnvFromAddress({ AUTH_EMAIL: "Acme <noreply@example.com>" })).toBe(
      "Acme <noreply@example.com>",
    );
    expect(resolveEnvFromAddress({ RESEND_FROM_EMAIL: "noreply@example.com" })).toBe(
      "noreply@example.com",
    );

    // RESEND_FROM_EMAIL is the more specific name, so it wins.
    expect(
      resolveEnvFromAddress({
        RESEND_FROM_EMAIL: "specific@example.com",
        AUTH_EMAIL: "general@example.com",
      }),
    ).toBe("specific@example.com");

    // A value that is not an address at all must be ignored rather than used as
    // a sender, which would fail silently at send time.
    expect(resolveEnvFromAddress({ AUTH_EMAIL: "not-an-address" })).toBeUndefined();
    expect(resolveEnvFromAddress({ AUTH_EMAIL: "   " })).toBeUndefined();
    expect(resolveEnvFromAddress({})).toBeUndefined();
  });

});
