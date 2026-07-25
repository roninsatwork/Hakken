import type { Doc } from "./_generated/dataModel";

export const DEFAULT_SETTINGS = {
  platformName: "Sonae",
  brandColorHex: "#E26D28",
  fontFamily: undefined as string | undefined,
  headingFontFamily: undefined as string | undefined,
  bodyFontFamily: undefined as string | undefined,
  fontSizeBase: undefined as string | undefined,
  headingSizeGlobal: undefined as string | undefined,
  subTextSizeGlobal: undefined as string | undefined,
  borderRadius: undefined as string | undefined,
  logoUrlLight: undefined as string | undefined,
  logoUrlDark: undefined as string | undefined,
  emailSenderName: undefined as string | undefined,
  emailSenderAddress: undefined as string | undefined,
  salesContactEmail: undefined as string | undefined,
  navigationProfileKey: undefined as string | undefined,

  lightBg: undefined as string | undefined,
  lightFg: undefined as string | undefined,
  lightCardBg: undefined as string | undefined,
  lightCardFg: undefined as string | undefined,
  lightBorder: undefined as string | undefined,
  lightMuted: undefined as string | undefined,
  lightMutedFg: undefined as string | undefined,
  lightSuccess: undefined as string | undefined,
  lightDestructive: undefined as string | undefined,
  lightRing: undefined as string | undefined,

  darkBg: undefined as string | undefined,
  darkFg: undefined as string | undefined,
  darkCardBg: undefined as string | undefined,
  darkCardFg: undefined as string | undefined,
  darkBorder: undefined as string | undefined,
  darkMuted: undefined as string | undefined,
  darkMutedFg: undefined as string | undefined,
  darkSuccess: undefined as string | undefined,
  darkDestructive: undefined as string | undefined,
  darkRing: undefined as string | undefined,
  diagnosticRoutingEnabled: false as boolean,
};

export type SettingsPatchInput = Record<string, string | number | boolean | undefined>;

export function isStorageLogoReference(value: string | undefined) {
  return Boolean(value && !value.startsWith("http"));
}

export function buildSettingsPatch<T extends SettingsPatchInput>(args: T) {
  return Object.fromEntries(
    Object.entries(args).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

export function buildSettingsInsertRecord<T extends SettingsPatchInput>(patch: Partial<T>) {
  return {
    ...DEFAULT_SETTINGS,
    ...patch,
  };
}

export function mergeSettingsWithDefaults(args: {
  settings?: Doc<"systemSettings"> | null;
  logoUrlLight?: string;
  logoUrlDark?: string;
}) {
  if (!args.settings) return DEFAULT_SETTINGS;

  return {
    ...DEFAULT_SETTINGS,
    ...args.settings,
    logoUrlLight: args.logoUrlLight,
    logoUrlDark: args.logoUrlDark,
  };
}

export function buildSettingsAuditMetadata(patch: Record<string, unknown>) {
  return JSON.stringify({ modifiedFields: Object.keys(patch) });
}

export type WhiteLabelReadinessStatus = "ready" | "pending" | "manual";

export type WhiteLabelReadinessItem = {
  key: "identity" | "logos" | "brandColor" | "diagnostics" | "widget" | "email" | "production";
  status: WhiteLabelReadinessStatus;
  href?: string;
  command?: string;
  evidence: string;
};

export type WhiteLabelModulePresetKey = "knowledgeAssistant" | "supportWidget" | "operatorWorkspace";

export type WhiteLabelModulePreset = {
  key: WhiteLabelModulePresetKey;
  href: string;
  linkLabelKey: "launch" | "widget" | "health";
  readinessDependencies: Array<WhiteLabelReadinessItem["key"]>;
  visible: string[];
  owner: string[];
  handoff: string[];
};

export type WhiteLabelNavigationProfileKey = "customerWorkspace" | "supportWidget" | "operatorConsole";

export type WhiteLabelNavigationProfile = {
  key: WhiteLabelNavigationProfileKey;
  visible: string[];
  owner: string[];
  hide: string[];
  implementationNotes: string[];
};

export type WhiteLabelCustomDomainStatus = "ready" | "pending" | "manual";

export type WhiteLabelCustomDomainItemKey =
  | "appHost"
  | "widgetDomains"
  | "emailDomain"
  | "dnsTls"
  | "redirects"
  | "tenantIsolation";

export type WhiteLabelCustomDomainItem = {
  key: WhiteLabelCustomDomainItemKey;
  status: WhiteLabelCustomDomainStatus;
  evidence: string;
  command?: string;
};

export type WhiteLabelCustomDomainChecklist = {
  readyCount: number;
  manualCount: number;
  pendingCount: number;
  totalCount: number;
  items: WhiteLabelCustomDomainItem[];
};

type WidgetReadinessInput = {
  name?: string;
  isActive?: boolean;
  allowedDomains?: string[];
  themePrimaryColor?: string;
  themeGreeting?: string;
  themeLogoUrl?: string;
  themePlaceholder?: string;
};

const DEFAULT_PLATFORM_NAMES = new Set(["sonae"]);

function isPresent(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function isHexColor(value: unknown) {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value);
}

function isLikelyEmailAddress(value: unknown) {
  return typeof value === "string" && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value.trim());
}

function hasWidgetBrandingEvidence(widget: WidgetReadinessInput | undefined) {
  if (!widget || widget.isActive === false) return false;
  return Boolean(
    isHexColor(widget.themePrimaryColor) &&
    isPresent(widget.themeGreeting) &&
    isPresent(widget.themeLogoUrl) &&
    isPresent(widget.themePlaceholder) &&
    Array.isArray(widget.allowedDomains) &&
    widget.allowedDomains.some((domain) => domain.trim() && domain.trim() !== "*")
  );
}

export function buildWhiteLabelReadiness(args: {
  settings?: Partial<Doc<"systemSettings">> | null;
  activeWidget?: WidgetReadinessInput | null;
}) {
  const settings = { ...DEFAULT_SETTINGS, ...(args.settings ?? {}) };
  const platformName = typeof settings.platformName === "string" ? settings.platformName.trim() : "";
  const hasCustomName = platformName.length > 0 && !DEFAULT_PLATFORM_NAMES.has(platformName.toLowerCase());
  const hasLogos = isPresent(settings.logoUrlLight) && isPresent(settings.logoUrlDark);
  const hasBrandColor = isHexColor(settings.brandColorHex);
  const diagnosticsDisabled = settings.diagnosticRoutingEnabled !== true;
  const hasEmailSender = isLikelyEmailAddress(settings.emailSenderAddress);
  const widgetReady = hasWidgetBrandingEvidence(args.activeWidget ?? undefined);

  const items: WhiteLabelReadinessItem[] = [
    {
      key: "identity",
      status: hasCustomName ? "ready" : "pending",
      evidence: hasCustomName ? platformName : DEFAULT_SETTINGS.platformName,
    },
    {
      key: "logos",
      status: hasLogos ? "ready" : "pending",
      evidence: hasLogos ? "light+dark" : "missing-logo-variant",
    },
    {
      key: "brandColor",
      status: hasBrandColor ? "ready" : "pending",
      evidence: settings.brandColorHex || "missing-brand-color",
    },
    {
      key: "diagnostics",
      status: diagnosticsDisabled ? "ready" : "pending",
      evidence: diagnosticsDisabled ? "disabled" : "enabled",
    },
    {
      key: "widget",
      status: widgetReady ? "ready" : "pending",
      href: "/admin/ai/widget",
      evidence: widgetReady ? "active-branded-widget" : "needs-widget-branding-review",
    },
    {
      key: "email",
      status: hasEmailSender ? "ready" : "manual",
      command: hasEmailSender ? undefined : "RESEND_FROM_EMAIL",
      evidence: hasEmailSender ? settings.emailSenderAddress || "stored-sender" : "confirm-deployment-sender",
    },
    {
      key: "production",
      status: "manual",
      command: "npm run setup:validate -- --profile=production",
      evidence: "requires-production-runbook",
    },
  ];

  const readyCount = items.filter((item) => item.status === "ready").length;
  const pendingCount = items.filter((item) => item.status === "pending").length;
  const manualCount = items.filter((item) => item.status === "manual").length;

  return {
    score: readyCount / items.length,
    readyCount,
    pendingCount,
    manualCount,
    totalCount: items.length,
    items,
    nextActions: items
      .filter((item) => item.status !== "ready")
      .slice(0, 3)
      .map((item) => item.key),
  };
}

export function getWhiteLabelModulePresets(): WhiteLabelModulePreset[] {
  return [
    {
      key: "knowledgeAssistant",
      href: "/admin/app-kits",
      linkLabelKey: "launch",
      readinessDependencies: ["identity", "logos", "brandColor", "diagnostics", "production"],
      visible: ["assistantWorkspace", "knowledgeSurfaces", "reportsOptional"],
      owner: ["agentBuilderEvals", "modelDefaults", "systemHealth"],
      handoff: ["replaceDemoKnowledge", "runReleaseGate", "keepDiagnosticsDisabled"],
    },
    {
      key: "supportWidget",
      href: "/admin/ai/widget",
      linkLabelKey: "widget",
      readinessDependencies: ["identity", "brandColor", "widget", "email", "production"],
      visible: ["publicWidget", "customerChatHistory", "knowledgeQa"],
      owner: ["widgetSetup", "connectorMarketplace", "approvalsInbox"],
      handoff: ["setAllowedDomains", "reviewWidgetBranding", "testEscalationPolicy"],
    },
    {
      key: "operatorWorkspace",
      href: "/admin/settings/system-health",
      linkLabelKey: "health",
      readinessDependencies: ["identity", "logos", "diagnostics", "email", "production"],
      visible: ["dashboardReports", "workflowsSchedules", "approvalsRuns"],
      owner: ["releaseCenter", "systemHealth", "auditLedger"],
      handoff: ["confirmRoleAccess", "setScheduleOwners", "exportHealthReport"],
    },
  ];
}

export function getWhiteLabelNavigationProfiles(): WhiteLabelNavigationProfile[] {
  return [
    {
      key: "customerWorkspace",
      visible: ["appDashboard", "assistant", "reports", "organization"],
      owner: ["systemSettings", "systemHealth"],
      hide: ["adminCompanies", "releaseCenter", "apiKeys", "webhookDeliveries"],
      implementationNotes: ["tenantScoped", "preserveAdminRoutes", "keepServerAuthz"],
    },
    {
      key: "supportWidget",
      visible: ["publicWidget", "customerChatHistory", "knowledgeQa"],
      owner: ["widgetSetup", "globalKnowledge", "chatLogs"],
      hide: ["properties", "arcade", "diagnostics"],
      implementationNotes: ["domainAllowlist", "widgetBranding", "emailSender"],
    },
    {
      key: "operatorConsole",
      visible: ["adminDashboard", "agents", "workflows", "approvals", "runObservatory"],
      owner: ["releaseCenter", "systemHealth", "auditLogs"],
      hide: ["properties", "arcade", "publicWidget"],
      implementationNotes: ["superAdminOnly", "auditRouteChanges", "documentHiddenRoutes"],
    },
  ];
}

function getAllowedWidgetDomains(widget: WidgetReadinessInput | undefined) {
  return (widget?.allowedDomains ?? [])
    .map((domain) => domain.trim())
    .filter((domain) => domain.length > 0 && domain !== "*");
}

function getEmailDomain(value: unknown) {
  if (!isLikelyEmailAddress(value)) return undefined;
  return String(value).trim().split("@")[1]?.toLowerCase();
}

export function buildWhiteLabelCustomDomainChecklist(args: {
  settings?: Partial<Doc<"systemSettings">> | null;
  activeWidget?: WidgetReadinessInput | null;
}): WhiteLabelCustomDomainChecklist {
  const settings = { ...DEFAULT_SETTINGS, ...(args.settings ?? {}) };
  const widgetDomains = getAllowedWidgetDomains(args.activeWidget ?? undefined);
  const emailDomain = getEmailDomain(settings.emailSenderAddress);
  const items: WhiteLabelCustomDomainItem[] = [
    {
      key: "appHost",
      status: "manual",
      evidence: "confirm-primary-app-host",
      command: "hosting-provider-domain",
    },
    {
      key: "widgetDomains",
      status: widgetDomains.length > 0 ? "ready" : "pending",
      evidence: widgetDomains.length > 0 ? widgetDomains.join(", ") : "needs-restricted-widget-domain-allowlist",
    },
    {
      key: "emailDomain",
      status: emailDomain ? "ready" : "manual",
      evidence: emailDomain || "confirm-branded-email-domain",
      command: emailDomain ? undefined : "RESEND_FROM_EMAIL",
    },
    {
      key: "dnsTls",
      status: "manual",
      evidence: "confirm-dns-and-tls-with-hosting-provider",
      command: "dns-and-tls-validation",
    },
    {
      key: "redirects",
      status: "manual",
      evidence: "confirm-apex-www-and-legacy-redirects",
    },
    {
      key: "tenantIsolation",
      status: "manual",
      evidence: "confirm-domain-to-tenant-routing-before-runtime-hiding",
    },
  ];

  return {
    readyCount: items.filter((item) => item.status === "ready").length,
    manualCount: items.filter((item) => item.status === "manual").length,
    pendingCount: items.filter((item) => item.status === "pending").length,
    totalCount: items.length,
    items,
  };
}

export type WhiteLabelHandoffSummary = {
  productName: string;
  brandColorHex: string;
  readinessScore: number;
  logoMode: "light-and-dark" | "partial" | "missing";
  emailFromAddress: string;
  widgetStatus: "ready" | "needs-review";
  widgetEvidence: string;
  diagnosticsStatus: "ready" | "needs-review";
  productionStatus: "manual";
  nextActions: Array<WhiteLabelReadinessItem["key"]>;
  recommendedPresetKeys: WhiteLabelModulePresetKey[];
};

export type WhiteLabelPackagingChecklistSection = {
  key: "brand" | "readiness" | "modules" | "navigation" | "domains" | "developerFollowUp";
  title: string;
  items: string[];
};

export type WhiteLabelPackagingChecklist = {
  title: string;
  productName: string;
  readinessPercent: number;
  sections: WhiteLabelPackagingChecklistSection[];
  markdown: string;
};

export function buildWhiteLabelHandoffSummary(args: {
  settings?: Partial<Doc<"systemSettings">> | null;
  activeWidget?: WidgetReadinessInput | null;
  emailFromAddress: string;
  readiness?: ReturnType<typeof buildWhiteLabelReadiness>;
  presets?: WhiteLabelModulePreset[];
}): WhiteLabelHandoffSummary {
  const settings = { ...DEFAULT_SETTINGS, ...(args.settings ?? {}) };
  const readiness = args.readiness ?? buildWhiteLabelReadiness({
    settings,
    activeWidget: args.activeWidget,
  });
  const presets = args.presets ?? getWhiteLabelModulePresets();
  const readyKeys = new Set(
    readiness.items
      .filter((item) => item.status === "ready")
      .map((item) => item.key)
  );
  const widgetItem = readiness.items.find((item) => item.key === "widget");
  const diagnosticsItem = readiness.items.find((item) => item.key === "diagnostics");
  const hasLightLogo = isPresent(settings.logoUrlLight);
  const hasDarkLogo = isPresent(settings.logoUrlDark);
  const logoMode = hasLightLogo && hasDarkLogo ? "light-and-dark" : hasLightLogo || hasDarkLogo ? "partial" : "missing";
  const recommendedPresetKeys = presets
    .filter((preset) =>
      preset.readinessDependencies.every((dependency) =>
        dependency === "production" || readyKeys.has(dependency)
      )
    )
    .map((preset) => preset.key);

  return {
    productName: (settings.platformName || DEFAULT_SETTINGS.platformName).trim(),
    brandColorHex: settings.brandColorHex || DEFAULT_SETTINGS.brandColorHex,
    readinessScore: readiness.score,
    logoMode,
    emailFromAddress: args.emailFromAddress,
    widgetStatus: widgetItem?.status === "ready" ? "ready" : "needs-review",
    widgetEvidence: widgetItem?.evidence || "needs-widget-branding-review",
    diagnosticsStatus: diagnosticsItem?.status === "ready" ? "ready" : "needs-review",
    productionStatus: "manual",
    nextActions: readiness.nextActions,
    recommendedPresetKeys,
  };
}

function formatChecklistSection(section: WhiteLabelPackagingChecklistSection) {
  return [`## ${section.title}`, ...section.items.map((item) => `- ${item}`)].join("\n");
}

export function buildWhiteLabelPackagingChecklist(args: {
  handoffSummary: WhiteLabelHandoffSummary;
  readiness: ReturnType<typeof buildWhiteLabelReadiness>;
  modulePresets: WhiteLabelModulePreset[];
  navigationProfiles: WhiteLabelNavigationProfile[];
  customDomainChecklist?: WhiteLabelCustomDomainChecklist;
}): WhiteLabelPackagingChecklist {
  const readinessPercent = Math.round(args.handoffSummary.readinessScore * 100);
  const readyItems = args.readiness.items
    .filter((item) => item.status === "ready")
    .map((item) => `${item.key}: ${item.evidence}`);
  const reviewItems = args.readiness.items
    .filter((item) => item.status !== "ready")
    .map((item) => `${item.key}: ${item.evidence}`);
  const readyPresets = args.modulePresets
    .filter((preset) => args.handoffSummary.recommendedPresetKeys.includes(preset.key))
    .map((preset) => `${preset.key}: ${preset.handoff.join(", ")}`);
  const profileItems = args.navigationProfiles.map((profile) =>
    `${profile.key}: show ${profile.visible.join(", ")}; owner ${profile.owner.join(", ")}; hide candidates ${profile.hide.join(", ")}`
  );
  const sections: WhiteLabelPackagingChecklistSection[] = [
    {
      key: "brand",
      title: "Brand handoff",
      items: [
        `Product name: ${args.handoffSummary.productName}`,
        `Brand color: ${args.handoffSummary.brandColorHex}`,
        `Logo mode: ${args.handoffSummary.logoMode}`,
        `Runtime sender: ${args.handoffSummary.emailFromAddress}`,
        `Widget posture: ${args.handoffSummary.widgetStatus} (${args.handoffSummary.widgetEvidence})`,
      ],
    },
    {
      key: "readiness",
      title: "Readiness evidence",
      items: [
        `Readiness score: ${readinessPercent}%`,
        ...readyItems.map((item) => `Ready - ${item}`),
        ...reviewItems.map((item) => `Review - ${item}`),
      ],
    },
    {
      key: "modules",
      title: "Module presets",
      items: readyPresets.length > 0
        ? readyPresets
        : ["No module preset is fully ready yet; complete readiness actions before packaging."],
    },
    {
      key: "navigation",
      title: "Navigation profile previews",
      items: profileItems,
    },
    ...(args.customDomainChecklist ? [{
      key: "domains" as const,
      title: "Custom domain readiness",
      items: args.customDomainChecklist.items.map((item) =>
        `${item.status} - ${item.key}: ${item.evidence}${item.command ? ` (${item.command})` : ""}`
      ),
    }] : []),
    {
      key: "developerFollowUp",
      title: "Developer follow-up",
      items: [
        "Run npm run setup:validate -- --profile=production and attach output to release notes.",
        "Keep navigation hiding as presentation only until server authorization and audit behavior are reviewed.",
        "Confirm widget domain allowlists, runtime email sender, and any customer-specific routes before handoff.",
      ],
    },
  ];
  const title = `${args.handoffSummary.productName} white-label packaging checklist`;
  const markdown = [`# ${title}`, ...sections.map(formatChecklistSection)].join("\n\n");

  return {
    title,
    productName: args.handoffSummary.productName,
    readinessPercent,
    sections,
    markdown,
  };
}
