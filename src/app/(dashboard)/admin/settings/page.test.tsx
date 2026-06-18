import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import SystemSettingsPage from "./page";

type HookMock = {
  mockImplementation: (implementation: (...args: unknown[]) => unknown) => void;
  mockReturnValue: (value: unknown) => void;
};

const replaceMock = vi.hoisted(() => vi.fn());
const searchTabMock = vi.hoisted(() => vi.fn(() => null as string | null));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => ({ get: searchTabMock }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const labels: Record<string, string> = {
      "appearance.title": "Appearance",
      "audit.title": "Audit Trail",
      "identity.title": "Identity",
      save: "Save",
      saving: "Saving...",
      "security.maskEmails": "Mask emails",
      "security.maskPhones": "Mask phones",
      "security.masterToggle": "Enable PII",
      "security.masterToggleSub": "Protect sensitive data",
      "security.purgeEngine": "Audit purge",
      "security.purgeSub": "Audit retention",
      "security.purgeToggle": "Enable audit purge",
      "security.purgeToggleSub": "Schedule cleanup",
      "security.redaction": "Redaction",
      "security.redactionSub": "Mask PII",
      "security.title": "Security",
      subtitle: "System controls",
      success: "Saved",
      "tabs.appearance": "Appearance",
      "tabs.audit": "Audit",
      "tabs.identity": "Identity",
      "tabs.options": "Options",
      "tabs.purges": "Purges",
      "tabs.security": "Security",
      title: "Settings",
      "handoffSummary.diagnostics.ready": "Disabled for handoff",
      "handoffSummary.emailNote": "Used by runtime email helpers unless the deployment overrides RESEND_FROM_EMAIL.",
      "handoffSummary.empty.nextActions": "No automatic next action is currently queued.",
      "handoffSummary.empty.recommendedPresets": "Complete more readiness checks before a preset is marked ready.",
      "handoffSummary.fields.diagnostics": "Diagnostics",
      "handoffSummary.fields.email": "Runtime sender",
      "handoffSummary.fields.nextActions": "Next actions",
      "handoffSummary.fields.product": "Product",
      "handoffSummary.fields.production": "Production gate",
      "handoffSummary.fields.readiness": "Readiness score",
      "handoffSummary.fields.recommendedPresets": "Ready presets",
      "handoffSummary.fields.widget": "Widget posture",
      "handoffSummary.logoModes.light-and-dark": "Light and dark logo variants are configured.",
      "handoffSummary.production.manual": "Run setup validation before handoff",
      "handoffSummary.subtitle": "Confirm the identity, widget, and email posture that will travel with a vertical starter.",
      "handoffSummary.title": "Brand Handoff Summary",
      "handoffSummary.widget.ready": "Active branded widget",
      "customDomain.items.appHost.label": "Primary app host",
      "customDomain.items.appHost.manual": "Confirm the production app domain with the hosting provider.",
      "customDomain.items.dnsTls.label": "DNS and TLS",
      "customDomain.items.dnsTls.manual": "Validate DNS records and TLS certificates outside the app.",
      "customDomain.items.emailDomain.label": "Email sender domain",
      "customDomain.items.emailDomain.ready": "A branded sender domain is configured.",
      "customDomain.items.redirects.label": "Redirect policy",
      "customDomain.items.redirects.manual": "Confirm apex, www, and legacy route redirect behavior.",
      "customDomain.items.tenantIsolation.label": "Tenant routing isolation",
      "customDomain.items.tenantIsolation.manual": "Confirm custom domains map to the correct tenant and preserve server authorization.",
      "customDomain.items.widgetDomains.label": "Widget domain allowlist",
      "customDomain.items.widgetDomains.ready": "The active widget has restricted allowed domains.",
      "customDomain.loading": "Preparing custom domain readiness...",
      "customDomain.note": "These checks are planning evidence only.",
      "customDomain.status.manual": "Review",
      "customDomain.status.pending": "Pending",
      "customDomain.status.ready": "Ready",
      "customDomain.subtitle": "Plan the host, widget, email, DNS, TLS, redirect, and tenant-routing checks for a branded deployment.",
      "customDomain.summary.manual": "Manual",
      "customDomain.summary.pending": "Pending",
      "customDomain.summary.ready": "Ready",
      "customDomain.summary.total": "Total",
      "customDomain.title": "Custom Domain Readiness",
      "modulePresets.links.health": "Open health",
      "modulePresets.links.launch": "Open App Kits",
      "modulePresets.links.widget": "Open widget",
      "modulePresets.items.agentBuilderEvals": "Agent builder and evals",
      "modulePresets.items.approvalsInbox": "Approvals inbox",
      "modulePresets.items.approvalsRuns": "Approvals and runs",
      "modulePresets.items.assistantWorkspace": "Assistant workspace",
      "modulePresets.items.auditLedger": "Audit ledger",
      "modulePresets.items.confirmRoleAccess": "Confirm role access",
      "modulePresets.items.connectorMarketplace": "Connector marketplace",
      "modulePresets.items.customerChatHistory": "Customer chat history",
      "modulePresets.items.dashboardReports": "Dashboard and reports",
      "modulePresets.items.exportHealthReport": "Export health report",
      "modulePresets.items.keepDiagnosticsDisabled": "Keep diagnostics disabled",
      "modulePresets.items.knowledgeQa": "Knowledge QA",
      "modulePresets.items.knowledgeSurfaces": "Knowledge surfaces",
      "modulePresets.items.modelDefaults": "Model defaults",
      "modulePresets.items.publicWidget": "Public widget",
      "modulePresets.items.releaseCenter": "Release Center",
      "modulePresets.items.replaceDemoKnowledge": "Replace demo knowledge",
      "modulePresets.items.reportsOptional": "Reports only when needed",
      "modulePresets.items.reviewWidgetBranding": "Review widget branding",
      "modulePresets.items.runReleaseGate": "Run the release gate",
      "modulePresets.items.setAllowedDomains": "Set allowed domains",
      "modulePresets.items.setScheduleOwners": "Set schedule owners",
      "modulePresets.items.systemHealth": "System Health",
      "modulePresets.items.testEscalationPolicy": "Test escalation policy",
      "modulePresets.items.widgetSetup": "Widget setup",
      "modulePresets.items.workflowsSchedules": "Workflows and schedules",
      "modulePresets.presets.knowledgeAssistant.summary": "A focused internal assistant backed by approved company knowledge and release gates.",
      "modulePresets.presets.knowledgeAssistant.title": "Knowledge Assistant",
      "modulePresets.presets.operatorWorkspace.summary": "A heavier admin/operator starter for workflows, schedules, run review, and operational reporting.",
      "modulePresets.presets.operatorWorkspace.title": "Operator Workspace",
      "modulePresets.presets.supportWidget.summary": "A public chat widget starter with governed escalation, knowledge, and domain controls.",
      "modulePresets.presets.supportWidget.title": "Support Widget",
      "modulePresets.sections.handoff": "Handoff checks",
      "modulePresets.sections.owner": "Owner surfaces",
      "modulePresets.sections.visible": "Visible modules",
      "modulePresets.subtitle": "Use these starter bundles to decide which app and operator surfaces belong in a vertical build.",
      "modulePresets.title": "Module Presets",
      "navigationProfiles.items.adminCompanies": "Companies admin",
      "navigationProfiles.items.adminDashboard": "Admin dashboard",
      "navigationProfiles.items.agent": "Agent",
      "navigationProfiles.items.agents": "Agents",
      "navigationProfiles.items.apiKeys": "API keys",
      "navigationProfiles.items.appDashboard": "App dashboard",
      "navigationProfiles.items.approvals": "Approvals",
      "navigationProfiles.items.arcade": "Arcade",
      "navigationProfiles.items.assistant": "Assistant",
      "navigationProfiles.items.auditLogs": "Audit logs",
      "navigationProfiles.items.auditRouteChanges": "Audit route visibility changes.",
      "navigationProfiles.items.chatLogs": "Chat logs",
      "navigationProfiles.items.customerChatHistory": "Customer chat history",
      "navigationProfiles.items.diagnostics": "Diagnostics",
      "navigationProfiles.items.documentHiddenRoutes": "Document hidden routes in the build handoff.",
      "navigationProfiles.items.domainAllowlist": "Pair public routes with widget domain allowlists.",
      "navigationProfiles.items.emailSender": "Confirm the runtime sender before customer-facing email.",
      "navigationProfiles.items.globalKnowledge": "Global Knowledge",
      "navigationProfiles.items.keepServerAuthz": "Treat navigation hiding as presentation only; keep server authorization.",
      "navigationProfiles.items.knowledgeQa": "Knowledge QA",
      "navigationProfiles.items.organization": "Organization settings",
      "navigationProfiles.items.preserveAdminRoutes": "Keep admin routes reachable for authorized operators.",
      "navigationProfiles.items.properties": "Properties",
      "navigationProfiles.items.publicWidget": "Public widget",
      "navigationProfiles.items.releaseCenter": "Release Center",
      "navigationProfiles.items.reports": "Reports",
      "navigationProfiles.items.runObservatory": "Run Observatory",
      "navigationProfiles.items.superAdminOnly": "Keep owner-only routes scoped to super-admin operators.",
      "navigationProfiles.items.systemHealth": "System Health",
      "navigationProfiles.items.systemSettings": "System Settings",
      "navigationProfiles.items.tenantScoped": "Persist visibility per tenant or product package.",
      "navigationProfiles.items.webhookDeliveries": "Webhook deliveries",
      "navigationProfiles.items.widgetBranding": "Review widget branding before exposing public chat.",
      "navigationProfiles.items.widgetSetup": "Widget setup",
      "navigationProfiles.items.workflows": "Workflows",
      "navigationProfiles.profiles.customerWorkspace.summary": "A minimal internal app shell for tenant users with owner tooling kept outside the customer path.",
      "navigationProfiles.profiles.customerWorkspace.title": "Customer Workspace",
      "navigationProfiles.profiles.operatorConsole.summary": "A governed admin console for teams managing agents, workflows, approvals, releases, and observability.",
      "navigationProfiles.profiles.operatorConsole.title": "Operator Console",
      "navigationProfiles.profiles.supportWidget.summary": "A public support starter focused on the widget, conversation review, and knowledge quality.",
      "navigationProfiles.profiles.supportWidget.title": "Support Widget",
      "navigationProfiles.sections.hide": "Hide candidates",
      "navigationProfiles.sections.notes": "Implementation notes",
      "navigationProfiles.sections.owner": "Owner-only",
      "navigationProfiles.sections.visible": "Visible",
      "navigationProfiles.subtitle": "Preview which route groups a vertical starter should show, reserve for operators, or hide during packaging.",
      "navigationProfiles.title": "Navigation Profiles",
      "packagingChecklist.copied": "Copied",
      "packagingChecklist.copy": "Copy checklist",
      "packagingChecklist.loading": "Preparing packaging checklist...",
      "packagingChecklist.subtitle": "Copy a developer handoff artifact that combines brand, readiness, module, and navigation evidence.",
      "packagingChecklist.summary": "{productName} is {readinessPercent}% ready for white-label packaging.",
      "packagingChecklist.title": "Packaging Checklist",
      "whiteLabel.items.brandColor.label": "Brand accent",
      "whiteLabel.items.brandColor.pending": "Set a six-digit HEX brand accent in Global Aesthetics.",
      "whiteLabel.items.brandColor.ready": "A valid global brand color is configured.",
      "whiteLabel.items.diagnostics.label": "Diagnostic routes",
      "whiteLabel.items.diagnostics.pending": "Disable diagnostic routing unless this build is still in engineering review.",
      "whiteLabel.items.diagnostics.ready": "Developer diagnostic routing is disabled for product handoff.",
      "whiteLabel.items.email.label": "Email sender",
      "whiteLabel.items.email.manual": "Confirm the deployment uses the intended sender name and domain.",
      "whiteLabel.items.identity.label": "Product identity",
      "whiteLabel.items.identity.pending": "Set a customer-facing product name in Core Identity.",
      "whiteLabel.items.identity.ready": "The platform name has been changed from the starter default.",
      "whiteLabel.items.logos.label": "Light and dark logos",
      "whiteLabel.items.logos.pending": "Upload both light and dark logo variants before handoff.",
      "whiteLabel.items.logos.ready": "Both logo variants are configured for themed surfaces.",
      "whiteLabel.items.production.label": "Production setup validation",
      "whiteLabel.items.production.manual": "Run the production setup validator before deployment handoff.",
      "whiteLabel.items.widget.label": "Widget branding",
      "whiteLabel.items.widget.manual": "Review the public chat widget name, greeting, color, logo, placeholder, starters, and domain allowlist.",
      "whiteLabel.items.widget.pending": "Configure an active widget with custom branding and a restricted domain allowlist.",
      "whiteLabel.items.widget.ready": "An active widget has custom brand styling, greeting, placeholder, logo, and a restricted domain allowlist.",
      "whiteLabel.open": "Open",
      "whiteLabel.status.manual": "Review",
      "whiteLabel.status.pending": "Pending",
      "whiteLabel.status.ready": "Ready",
      "whiteLabel.subtitle": "Review the configuration needed before this starter becomes a customer-facing product.",
      "whiteLabel.summary.manual": "Manual",
      "whiteLabel.summary.pending": "Pending",
      "whiteLabel.summary.ready": "Ready",
      "whiteLabel.summary.score": "Score",
      "whiteLabel.title": "White-label readiness",
    };
    return labels[key] ?? key;
  },
}));

vi.mock("./_components/IdentitySettingsSection", () => ({
  IdentitySettingsSection: ({ formData, setFormData }: { formData: { platformName?: string }; setFormData: (value: Record<string, string>) => void }) => (
    <label>
      Platform name
      <input value={formData.platformName ?? ""} onChange={(event) => setFormData({ ...formData, platformName: event.target.value })} />
    </label>
  ),
}));

vi.mock("./_components/AppearanceSettingsSection", () => ({
  AppearanceSettingsSection: () => <section>Appearance panel</section>,
}));

vi.mock("./_components/PurgesSettingsSection", () => ({
  PurgesSettingsSection: () => <section>Purges panel</section>,
}));

vi.mock("./_components/AuditLogsTable", () => ({
  AuditLogsSection: ({ logs }: { logs: unknown[] }) => <section>Audit rows {logs.length}</section>,
}));

const settings = {
  _id: "settings_1",
  _creationTime: 1,
  platformName: "Sonae",
  logoUrlLight: "",
  logoUrlDark: "",
};
const piiConfig = { enabled: false, maskEmails: false };
const auditConfig = { enabled: false, retentionDays: 30, dayOfMonth: 1, hourOfDay: 2 };
const recentLogs = [{ _id: "log_1" }];
const whiteLabelReadiness = {
  score: 2 / 7,
  readyCount: 2,
  pendingCount: 3,
  manualCount: 2,
  totalCount: 7,
  nextActions: ["identity", "logos", "widget"],
  items: [
    { key: "identity", status: "pending", evidence: "Sonae" },
    { key: "logos", status: "pending", evidence: "missing-logo-variant" },
    { key: "brandColor", status: "ready", evidence: "#E26D28" },
    { key: "diagnostics", status: "ready", evidence: "disabled" },
    { key: "widget", status: "pending", href: "/admin/ai/widget", evidence: "needs-widget-branding-review" },
    { key: "email", status: "manual", command: "RESEND_FROM_EMAIL", evidence: "confirm-deployment-sender" },
    { key: "production", status: "manual", command: "npm run setup:validate -- --profile=production", evidence: "requires-production-runbook" },
  ],
};
const whiteLabelModulePresets = [
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
const whiteLabelHandoffSummary = {
  productName: "Acme Ops",
  brandColorHex: "#123456",
  readinessScore: 6 / 7,
  logoMode: "light-and-dark",
  emailFromAddress: "Acme Ops <ops@example.com>",
  widgetStatus: "ready",
  widgetEvidence: "active-branded-widget",
  diagnosticsStatus: "ready",
  productionStatus: "manual",
  nextActions: ["production"],
  recommendedPresetKeys: ["knowledgeAssistant", "supportWidget", "operatorWorkspace"],
};
const whiteLabelNavigationProfiles = [
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
const whiteLabelCustomDomainChecklist = {
  readyCount: 2,
  pendingCount: 0,
  manualCount: 4,
  totalCount: 6,
  items: [
    { key: "appHost", status: "manual", evidence: "confirm-primary-app-host", command: "hosting-provider-domain" },
    { key: "widgetDomains", status: "ready", evidence: "https://acme.example" },
    { key: "emailDomain", status: "ready", evidence: "example.com" },
    { key: "dnsTls", status: "manual", evidence: "confirm-dns-and-tls-with-hosting-provider", command: "dns-and-tls-validation" },
    { key: "redirects", status: "manual", evidence: "confirm-apex-www-and-legacy-redirects" },
    { key: "tenantIsolation", status: "manual", evidence: "confirm-domain-to-tenant-routing-before-runtime-hiding" },
  ],
};
const whiteLabelPackagingChecklist = {
  title: "Acme Ops white-label packaging checklist",
  productName: "Acme Ops",
  readinessPercent: 86,
  sections: [
    {
      key: "brand",
      title: "Brand handoff",
      items: ["Product name: Acme Ops", "Runtime sender: Acme Ops <ops@example.com>"],
    },
    {
      key: "developerFollowUp",
      title: "Developer follow-up",
      items: ["Run npm run setup:validate -- --profile=production and attach output to release notes."],
    },
  ],
  markdown: "# Acme Ops white-label packaging checklist\n\n## Brand handoff\n- Product name: Acme Ops",
};

function getConvexPath(functionReference: unknown) {
  try {
    return getFunctionName(functionReference as never);
  } catch {
    const maybeReference = functionReference as { _path?: unknown; name?: unknown };
    return typeof maybeReference._path === "string" ? maybeReference._path : typeof maybeReference.name === "string" ? maybeReference.name : "";
  }
}

describe("SystemSettingsPage", () => {
  const updateSettings = vi.fn();
  const generateUploadUrl = vi.fn();
  const updatePiiConfig = vi.fn();
  const updateAuditConfig = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    searchTabMock.mockReturnValue(null);
    (useQuery as unknown as HookMock).mockImplementation((queryFn: unknown) => {
      const path = getConvexPath(queryFn);
      if (path.includes("settings:getWhiteLabelReadiness")) return whiteLabelReadiness;
      if (path.includes("settings:getWhiteLabelModulePresets")) return whiteLabelModulePresets;
      if (path.includes("settings:getWhiteLabelNavigationProfiles")) return whiteLabelNavigationProfiles;
      if (path.includes("settings:getWhiteLabelCustomDomainChecklist")) return whiteLabelCustomDomainChecklist;
      if (path.includes("settings:getWhiteLabelHandoffSummary")) return whiteLabelHandoffSummary;
      if (path.includes("settings:getWhiteLabelPackagingChecklist")) return whiteLabelPackagingChecklist;
      if (path.includes("settings:get")) return settings;
      if (path.includes("getPiiConfig")) return piiConfig;
      if (path.includes("getConfig")) return auditConfig;
      if (path.includes("getRecentLogs")) return recentLogs;
      return settings;
    });
    vi.mocked(useMutation).mockImplementation((mutationFn: unknown) => {
      const path = getConvexPath(mutationFn);
      if (path.includes("settings:update")) return updateSettings as unknown as ReturnType<typeof useMutation>;
      if (path.includes("generateUploadUrl")) return generateUploadUrl as unknown as ReturnType<typeof useMutation>;
      if (path.includes("updatePiiConfig")) return updatePiiConfig as unknown as ReturnType<typeof useMutation>;
      return updateAuditConfig as unknown as ReturnType<typeof useMutation>;
    });
    updateSettings.mockResolvedValue(undefined);
    updatePiiConfig.mockResolvedValue(undefined);
    updateAuditConfig.mockResolvedValue(undefined);
  });

  it("renders loading then saves identity settings", async () => {
    (useQuery as unknown as HookMock).mockReturnValue(undefined);
    const { container, rerender } = render(<SystemSettingsPage />);

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();

    (useQuery as unknown as HookMock).mockImplementation((queryFn: unknown) => {
      const path = getConvexPath(queryFn);
      if (path.includes("settings:getWhiteLabelReadiness")) return whiteLabelReadiness;
      if (path.includes("settings:getWhiteLabelModulePresets")) return whiteLabelModulePresets;
      if (path.includes("settings:getWhiteLabelNavigationProfiles")) return whiteLabelNavigationProfiles;
      if (path.includes("settings:getWhiteLabelCustomDomainChecklist")) return whiteLabelCustomDomainChecklist;
      if (path.includes("settings:getWhiteLabelHandoffSummary")) return whiteLabelHandoffSummary;
      if (path.includes("settings:getWhiteLabelPackagingChecklist")) return whiteLabelPackagingChecklist;
      if (path.includes("settings:get")) return settings;
      if (path.includes("getPiiConfig")) return piiConfig;
      if (path.includes("getConfig")) return auditConfig;
      if (path.includes("getRecentLogs")) return recentLogs;
      return settings;
    });
    rerender(<SystemSettingsPage />);
    fireEvent.change(screen.getByLabelText("Platform name"), { target: { value: "Sonae Pro" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith(expect.objectContaining({ platformName: "Sonae Pro" }));
    });
  });

  it("routes tabs and saves security settings through the correct mutations", async () => {
    render(<SystemSettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: /Security/i }));
    expect(replaceMock).toHaveBeenCalledWith("/admin/settings?tab=security", { scroll: false });
    fireEvent.click(screen.getByText("Enable PII").closest("div")?.parentElement?.querySelector("button") as HTMLButtonElement);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updatePiiConfig).toHaveBeenCalledWith({ configStr: expect.stringContaining('"enabled":true') });
      expect(updateAuditConfig).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole("button", { name: /Audit/i }));
    expect(screen.getByText("Audit rows 1")).toBeInTheDocument();
  });

  it("shows white-label readiness checks in system options", () => {
    render(<SystemSettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: /Options/i }));

    expect(screen.getByText("White-label readiness")).toBeInTheDocument();
    expect(screen.getByText("Product identity")).toBeInTheDocument();
    expect(screen.getByText("Set a customer-facing product name in Core Identity.")).toBeInTheDocument();
    expect(screen.getByText("Widget branding")).toBeInTheDocument();
    expect(screen.getByText("npm run setup:validate -- --profile=production")).toBeInTheDocument();
    expect(screen.getByText("Brand Handoff Summary")).toBeInTheDocument();
    expect(screen.getByText("Acme Ops <ops@example.com>")).toBeInTheDocument();
    expect(screen.getByText("Active branded widget")).toBeInTheDocument();
    expect(screen.getByText("Module Presets")).toBeInTheDocument();
    expect(screen.getAllByText("Knowledge Assistant").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Support Widget").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Operator Workspace").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Replace demo knowledge")).toBeInTheDocument();
    expect(screen.getByText("Navigation Profiles")).toBeInTheDocument();
    expect(screen.getByText("Customer Workspace")).toBeInTheDocument();
    expect(screen.getByText("Operator Console")).toBeInTheDocument();
    expect(screen.getByText("Treat navigation hiding as presentation only; keep server authorization.")).toBeInTheDocument();
    expect(screen.getByText("Custom Domain Readiness")).toBeInTheDocument();
    expect(screen.getByText("Widget domain allowlist")).toBeInTheDocument();
    expect(screen.getByText("https://acme.example")).toBeInTheDocument();
    expect(screen.getByText("Packaging Checklist")).toBeInTheDocument();
    expect(screen.getByText("Acme Ops white-label packaging checklist")).toBeInTheDocument();
    expect(screen.getByText("Acme Ops is 86% ready for white-label packaging.")).toBeInTheDocument();
  });
});
