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
      "modulePresets.links.health": "Open health",
      "modulePresets.links.launch": "Open launch",
      "modulePresets.links.widget": "Open widget",
      "modulePresets.presets.knowledgeAssistant.handoff.0": "Replace demo knowledge",
      "modulePresets.presets.knowledgeAssistant.handoff.1": "Run the release gate",
      "modulePresets.presets.knowledgeAssistant.handoff.2": "Keep diagnostics disabled",
      "modulePresets.presets.knowledgeAssistant.owner.0": "Agent builder and evals",
      "modulePresets.presets.knowledgeAssistant.owner.1": "Model defaults",
      "modulePresets.presets.knowledgeAssistant.owner.2": "System Health",
      "modulePresets.presets.knowledgeAssistant.summary": "A focused internal assistant backed by approved company knowledge and release gates.",
      "modulePresets.presets.knowledgeAssistant.title": "Knowledge Assistant",
      "modulePresets.presets.knowledgeAssistant.visible.0": "Assistant workspace",
      "modulePresets.presets.knowledgeAssistant.visible.1": "Knowledge surfaces",
      "modulePresets.presets.knowledgeAssistant.visible.2": "Reports only when needed",
      "modulePresets.presets.operatorWorkspace.handoff.0": "Confirm role access",
      "modulePresets.presets.operatorWorkspace.handoff.1": "Set schedule owners",
      "modulePresets.presets.operatorWorkspace.handoff.2": "Export health report",
      "modulePresets.presets.operatorWorkspace.owner.0": "Release Center",
      "modulePresets.presets.operatorWorkspace.owner.1": "System Health",
      "modulePresets.presets.operatorWorkspace.owner.2": "Audit ledger",
      "modulePresets.presets.operatorWorkspace.summary": "A heavier admin/operator starter for workflows, schedules, run review, and operational reporting.",
      "modulePresets.presets.operatorWorkspace.title": "Operator Workspace",
      "modulePresets.presets.operatorWorkspace.visible.0": "Dashboard and reports",
      "modulePresets.presets.operatorWorkspace.visible.1": "Workflows and schedules",
      "modulePresets.presets.operatorWorkspace.visible.2": "Approvals and runs",
      "modulePresets.presets.supportWidget.handoff.0": "Set allowed domains",
      "modulePresets.presets.supportWidget.handoff.1": "Review widget branding",
      "modulePresets.presets.supportWidget.handoff.2": "Test escalation policy",
      "modulePresets.presets.supportWidget.owner.0": "Widget setup",
      "modulePresets.presets.supportWidget.owner.1": "Connector marketplace",
      "modulePresets.presets.supportWidget.owner.2": "Approvals inbox",
      "modulePresets.presets.supportWidget.summary": "A public chat widget starter with governed escalation, knowledge, and domain controls.",
      "modulePresets.presets.supportWidget.title": "Support Widget",
      "modulePresets.presets.supportWidget.visible.0": "Public widget",
      "modulePresets.presets.supportWidget.visible.1": "Customer chat history",
      "modulePresets.presets.supportWidget.visible.2": "Knowledge QA",
      "modulePresets.sections.handoff": "Handoff checks",
      "modulePresets.sections.owner": "Owner surfaces",
      "modulePresets.sections.visible": "Visible modules",
      "modulePresets.subtitle": "Use these starter bundles to decide which app and operator surfaces belong in a vertical build.",
      "modulePresets.title": "Module Presets",
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
      "whiteLabel.open": "Open",
      "whiteLabel.status.manual": "Review",
      "whiteLabel.status.pending": "Pending",
      "whiteLabel.status.ready": "Ready",
      "whiteLabel.subtitle": "Review the configuration needed before this starter becomes a customer-facing product.",
      "whiteLabel.summary.manual": "Manual",
      "whiteLabel.summary.pending": "Pending",
      "whiteLabel.summary.ready": "Ready",
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
    expect(screen.getByText("Module Presets")).toBeInTheDocument();
    expect(screen.getByText("Knowledge Assistant")).toBeInTheDocument();
    expect(screen.getByText("Support Widget")).toBeInTheDocument();
    expect(screen.getByText("Operator Workspace")).toBeInTheDocument();
    expect(screen.getByText("Replace demo knowledge")).toBeInTheDocument();
  });
});
