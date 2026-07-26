import { describe, expect, test } from "vitest";
import type { Doc, Id } from "./_generated/dataModel";
import {
  buildWhiteLabelCustomDomainChecklist,
  buildSettingsAuditMetadata,
  buildSettingsInsertRecord,
  buildSettingsPatch,
  buildWhiteLabelHandoffSummary,
  buildWhiteLabelPackagingChecklist,
  buildWhiteLabelReadiness,
  DEFAULT_SETTINGS,
  getWhiteLabelModulePresets,
  getWhiteLabelNavigationProfiles,
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
    expect(buildSettingsAuditMetadata({ platformName: "New Name", brandColorHex: "#ffffff" })).toBe(
      JSON.stringify({ modifiedFields: ["platformName", "brandColorHex"] })
    );
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
      fromAddress: `Sonae <${UNCONFIGURED_EMAIL_ADDRESS}>`,
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

  test("builds code-backed white-label readiness from settings and widget evidence", () => {
    const pending = buildWhiteLabelReadiness({
      settings: {
        platformName: "Sonae",
        brandColorHex: "orange",
        diagnosticRoutingEnabled: true,
      },
      activeWidget: null,
    });
    expect(pending.readyCount).toBe(0);
    expect(pending.pendingCount).toBe(5);
    expect(pending.manualCount).toBe(2);
    expect(pending.nextActions).toEqual(["identity", "logos", "brandColor"]);

    const ready = buildWhiteLabelReadiness({
      settings: {
        platformName: "Acme Ops",
        logoUrlLight: "https://cdn.example/light.png",
        logoUrlDark: "https://cdn.example/dark.png",
        brandColorHex: "#123456",
        diagnosticRoutingEnabled: false,
        emailSenderAddress: "ops@example.com",
      },
      activeWidget: {
        isActive: true,
        allowedDomains: ["https://acme.example"],
        themePrimaryColor: "#123456",
        themeGreeting: "Hello from Acme",
        themeLogoUrl: "https://cdn.example/widget.png",
        themePlaceholder: "Ask Acme",
      },
    });

    expect(ready.readyCount).toBe(6);
    expect(ready.pendingCount).toBe(0);
    expect(ready.manualCount).toBe(1);
    expect(ready.score).toBeCloseTo(6 / 7);
    expect(ready.items.find((item) => item.key === "widget")).toMatchObject({
      status: "ready",
      evidence: "active-branded-widget",
    });
  });

  test("returns code-backed white-label module presets with stable handoff dependencies", () => {
    const presets = getWhiteLabelModulePresets();

    expect(presets.map((preset) => preset.key)).toEqual([
      "knowledgeAssistant",
      "supportWidget",
      "operatorWorkspace",
    ]);
    expect(presets[0]).toMatchObject({
      href: "/admin/agents",
      linkLabelKey: "agents",
      readinessDependencies: ["identity", "logos", "brandColor", "diagnostics", "production"],
      visible: ["assistantWorkspace", "knowledgeSurfaces", "reportsOptional"],
    });
    expect(presets.flatMap((preset) => preset.handoff)).toContain("reviewWidgetBranding");
    expect(presets.every((preset) =>
      preset.visible.length === 3 &&
      preset.owner.length === 3 &&
      preset.handoff.length === 3
    )).toBe(true);
  });

  test("builds a white-label handoff summary from readiness, presets, and email branding", () => {
    const readiness = buildWhiteLabelReadiness({
      settings: {
        platformName: "Acme Ops",
        logoUrlLight: "https://cdn.example/light.png",
        logoUrlDark: "https://cdn.example/dark.png",
        brandColorHex: "#123456",
        diagnosticRoutingEnabled: false,
        emailSenderAddress: "ops@example.com",
      },
      activeWidget: {
        isActive: true,
        allowedDomains: ["https://acme.example"],
        themePrimaryColor: "#123456",
        themeGreeting: "Hello from Acme",
        themeLogoUrl: "https://cdn.example/widget.png",
        themePlaceholder: "Ask Acme",
      },
    });

    const summary = buildWhiteLabelHandoffSummary({
      settings: {
        platformName: "Acme Ops",
        logoUrlLight: "https://cdn.example/light.png",
        logoUrlDark: "https://cdn.example/dark.png",
        brandColorHex: "#123456",
        diagnosticRoutingEnabled: false,
      },
      activeWidget: null,
      readiness,
      presets: getWhiteLabelModulePresets(),
      emailFromAddress: "Acme Ops <ops@example.com>",
    });

    expect(summary).toMatchObject({
      productName: "Acme Ops",
      brandColorHex: "#123456",
      logoMode: "light-and-dark",
      emailFromAddress: "Acme Ops <ops@example.com>",
      widgetStatus: "ready",
      diagnosticsStatus: "ready",
      productionStatus: "manual",
      nextActions: ["production"],
      recommendedPresetKeys: ["knowledgeAssistant", "supportWidget", "operatorWorkspace"],
    });
    expect(summary.readinessScore).toBeCloseTo(6 / 7);
  });

  test("returns code-backed white-label navigation profiles for starter route planning", () => {
    const profiles = getWhiteLabelNavigationProfiles();

    expect(profiles.map((profile) => profile.key)).toEqual([
      "customerWorkspace",
      "supportWidget",
      "operatorConsole",
    ]);
    expect(profiles[0]).toMatchObject({
      visible: ["appDashboard", "assistant", "reports", "organization"],
      owner: ["systemSettings", "systemHealth"],
      hide: ["adminCompanies", "releaseCenter", "apiKeys", "webhookDeliveries"],
    });
    expect(profiles.flatMap((profile) => profile.implementationNotes)).toContain("keepServerAuthz");
    expect(profiles.every((profile) =>
      profile.visible.length > 0 &&
      profile.owner.length > 0 &&
      profile.hide.length > 0 &&
      profile.implementationNotes.length > 0
    )).toBe(true);
  });

  test("builds a copy-ready white-label packaging checklist", () => {
    const readiness = buildWhiteLabelReadiness({
      settings: {
        platformName: "Acme Ops",
        logoUrlLight: "https://cdn.example/light.png",
        logoUrlDark: "https://cdn.example/dark.png",
        brandColorHex: "#123456",
        diagnosticRoutingEnabled: false,
        emailSenderAddress: "ops@example.com",
      },
      activeWidget: {
        isActive: true,
        allowedDomains: ["https://acme.example"],
        themePrimaryColor: "#123456",
        themeGreeting: "Hello from Acme",
        themeLogoUrl: "https://cdn.example/widget.png",
        themePlaceholder: "Ask Acme",
      },
    });
    const modulePresets = getWhiteLabelModulePresets();
    const handoffSummary = buildWhiteLabelHandoffSummary({
      settings: {
        platformName: "Acme Ops",
        logoUrlLight: "https://cdn.example/light.png",
        logoUrlDark: "https://cdn.example/dark.png",
        brandColorHex: "#123456",
      },
      readiness,
      emailFromAddress: "Acme Ops <ops@example.com>",
      presets: modulePresets,
    });

    const checklist = buildWhiteLabelPackagingChecklist({
      handoffSummary,
      readiness,
      modulePresets,
      navigationProfiles: getWhiteLabelNavigationProfiles(),
    });

    expect(checklist).toMatchObject({
      title: "Acme Ops white-label packaging checklist",
      productName: "Acme Ops",
      readinessPercent: 86,
    });
    expect(checklist.sections.map((section) => section.key)).toEqual([
      "brand",
      "readiness",
      "modules",
      "navigation",
      "developerFollowUp",
    ]);
    expect(checklist.markdown).toContain("# Acme Ops white-label packaging checklist");
    expect(checklist.markdown).toContain("Runtime sender: Acme Ops <ops@example.com>");
    expect(checklist.markdown).toContain("Keep navigation hiding as presentation only");
  });

  test("builds custom domain readiness from widget allowlists and email sender evidence", () => {
    const checklist = buildWhiteLabelCustomDomainChecklist({
      settings: {
        emailSenderAddress: "ops@example.com",
      },
      activeWidget: {
        isActive: true,
        allowedDomains: ["https://app.example.com", "*"],
      },
    });

    expect(checklist).toMatchObject({
      readyCount: 2,
      manualCount: 4,
      pendingCount: 0,
      totalCount: 6,
    });
    expect(checklist.items.find((item) => item.key === "widgetDomains")).toMatchObject({
      status: "ready",
      evidence: "https://app.example.com",
    });
    expect(checklist.items.find((item) => item.key === "emailDomain")).toMatchObject({
      status: "ready",
      evidence: "example.com",
    });

    const pending = buildWhiteLabelCustomDomainChecklist({
      settings: {},
      activeWidget: null,
    });
    expect(pending.items.find((item) => item.key === "widgetDomains")).toMatchObject({
      status: "pending",
      evidence: "needs-restricted-widget-domain-allowlist",
    });
    expect(pending.items.find((item) => item.key === "emailDomain")).toMatchObject({
      status: "manual",
      command: "RESEND_FROM_EMAIL",
    });
  });
});
