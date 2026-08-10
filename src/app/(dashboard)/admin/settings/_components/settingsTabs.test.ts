import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS_ROUTE, resolveLegacySettingsRoute } from "./settingsTabs";

/**
 * Settings was one page with `?tab=` links for its whole life, so those links
 * are in bookmarks and docs. They resolve to the routes that replaced them
 * rather than dropping the reader on a 404.
 */
describe("resolveLegacySettingsRoute", () => {
  it("sends each old tab to the screen that replaced it", () => {
    expect(resolveLegacySettingsRoute("identity")).toBe("/admin/settings/identity");
    expect(resolveLegacySettingsRoute("appearance")).toBe("/admin/settings/identity/aesthetics");
    expect(resolveLegacySettingsRoute("security")).toBe("/admin/settings/security");
    expect(resolveLegacySettingsRoute("purges")).toBe("/admin/settings/security/retention");
    expect(resolveLegacySettingsRoute("options")).toBe("/admin/settings/options");
  });

  it("falls back to the default screen for no tab and for tabs that no longer exist", () => {
    expect(resolveLegacySettingsRoute(null)).toBe(DEFAULT_SETTINGS_ROUTE);
    expect(resolveLegacySettingsRoute("")).toBe(DEFAULT_SETTINGS_ROUTE);
    // The audit trail moved to Governance; a stale link must still land somewhere.
    expect(resolveLegacySettingsRoute("audit")).toBe(DEFAULT_SETTINGS_ROUTE);
    expect(resolveLegacySettingsRoute("billing")).toBe(DEFAULT_SETTINGS_ROUTE);
  });
});
