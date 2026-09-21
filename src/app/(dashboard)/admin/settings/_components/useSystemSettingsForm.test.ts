import { describe, expect, it } from "vitest";
import {
  AESTHETICS_SETTINGS_FIELDS,
  DIAGNOSTICS_SETTINGS_FIELDS,
  IDENTITY_SETTINGS_FIELDS,
  pickSettingsFields,
} from "./useSystemSettingsForm";
import type { SystemSettingsFormData } from "./types";

/**
 * The save used to post the entire merged form. Logo fields arrive from
 * `settings.get` already resolved from storage IDs to URLs, so saving the
 * Aesthetics screen rewrote stored logo IDs as expiring URLs — and every
 * screen committed the others' half-edited state. The allowlist is the fix;
 * these tests are the regression net.
 */
describe("pickSettingsFields", () => {
  const form: SystemSettingsFormData = {
    platformName: "Hakken",
    emailSenderName: "Hakken",
    logoUrlLight: "https://storage.example/resolved-url-1",
    logoUrlDark: "https://storage.example/resolved-url-2",
    brandColorHex: "#E26D28",
    darkBg: "#222224",
    diagnosticRoutingEnabled: true,
  };

  it("an aesthetics save carries no logo or identity fields", () => {
    const payload = pickSettingsFields(form, AESTHETICS_SETTINGS_FIELDS);
    expect(payload).toEqual({ brandColorHex: "#E26D28", darkBg: "#222224" });
    expect(payload).not.toHaveProperty("logoUrlLight");
    expect(payload).not.toHaveProperty("logoUrlDark");
    expect(payload).not.toHaveProperty("platformName");
    expect(payload).not.toHaveProperty("diagnosticRoutingEnabled");
  });

  it("an identity save carries no colours and no logos either", () => {
    // Logos save themselves at upload time through their own mutation calls;
    // riding along here would rewrite stored storage IDs as resolved URLs.
    const payload = pickSettingsFields(form, IDENTITY_SETTINGS_FIELDS);
    expect(payload).toEqual({ platformName: "Hakken", emailSenderName: "Hakken" });
  });

  it("a diagnostics save carries exactly its one switch", () => {
    expect(pickSettingsFields(form, DIAGNOSTICS_SETTINGS_FIELDS)).toEqual({
      diagnosticRoutingEnabled: true,
    });
  });

  it("no allowlist contains logo fields", () => {
    for (const list of [IDENTITY_SETTINGS_FIELDS, AESTHETICS_SETTINGS_FIELDS, DIAGNOSTICS_SETTINGS_FIELDS]) {
      expect(list).not.toContain("logoUrlLight");
      expect(list).not.toContain("logoUrlDark");
    }
  });
});
