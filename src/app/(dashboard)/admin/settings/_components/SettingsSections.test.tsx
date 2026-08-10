import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppearanceSettingsSection } from "./AppearanceSettingsSection";
import { IdentitySettingsSection } from "./IdentitySettingsSection";
import type { SystemSettingsFormData } from "./types";

vi.mock("next/image", () => ({
  default: ({ unoptimized, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => {
    void unoptimized;
    return React.createElement("img", { ...props, alt: alt ?? "" });
  },
}));

const t = (key: string) => {
  const labels: Record<string, string> = {
    "appearance.title": "Appearance",
    "appearance.typography": "Typography",
    "appearance.typographySub": "Fonts and scale",
    "appearance.headingFont": "Heading font",
    "appearance.bodyFont": "Body font",
    "appearance.headingSize": "Heading size",
    "appearance.subTextSize": "Sub text size",
    "appearance.fonts.inter": "Inter",
    "appearance.fonts.jetbrains": "JetBrains",
    "appearance.fonts.playfair": "Playfair",
    "appearance.fonts.outfit": "Outfit",
    "appearance.sizes.tighter": "Tighter",
    "appearance.sizes.standard": "Standard",
    "appearance.sizes.punchy": "Punchy",
    "appearance.sizes.editorial": "Editorial",
    "appearance.sizes.micro": "Micro",
    "appearance.sizes.readable": "Readable",
    "appearance.darkMatrix": "Dark matrix",
    "appearance.darkMatrixSub": "Dark palette",
    "appearance.lightMatrix": "Light matrix",
    "appearance.lightMatrixSub": "Light palette",
    "appearance.coreEnv": "Core",
    "appearance.semanticOps": "Semantic",
    "appearance.bgBase": "Background",
    "appearance.cardSurfaces": "Cards",
    "appearance.primaryText": "Primary",
    "appearance.secondaryText": "Secondary",
    "appearance.hoverBlocks": "Hover",
    "appearance.borders": "Borders",
    "appearance.success": "Success",
    "appearance.destructive": "Destructive",
    "appearance.focusRing": "Focus",
    "appearance.brandOrigin": "Brand origin",
    "appearance.brandOriginSub": "Brand color",
    "appearance.brandColor": "Brand",
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
    "customDomain.summary.manual": "Manual",
    "customDomain.summary.pending": "Pending",
    "customDomain.summary.ready": "Ready",
    "customDomain.summary.total": "Total",
    "identity.title": "Identity",
    "identity.platformName": "Platform name",
    "identity.platformNameSub": "Public display name",
    "identity.placeholder": "Enter platform name",
    "identity.logoLight": "Light logo",
    "identity.logoLightSub": "Shown on light surfaces",
    "identity.logoDark": "Dark logo",
    "identity.logoDarkSub": "Shown on dark surfaces",
    "identity.removeLogo": "Remove",
    "identity.removeLogoLight": "Remove the light logo",
    "identity.removeLogoDark": "Remove the dark logo",
    "whiteLabel.summary.score": "Score",
    "whiteLabel.summary.ready": "Ready",
    "whiteLabel.summary.pending": "Pending",
    "whiteLabel.summary.manual": "Manual",
    "whiteLabel.status.ready": "Ready",
    "whiteLabel.status.pending": "Pending",
    "whiteLabel.status.manual": "Review",
    "whiteLabel.open": "Open",
    "whiteLabel.items.identity.label": "Product identity",
    "whiteLabel.items.identity.ready": "The platform name has been changed from the starter default.",
    "whiteLabel.items.logos.label": "Light and dark logos",
    "whiteLabel.items.logos.ready": "Both logo variants are configured for themed surfaces.",
    "whiteLabel.items.brandColor.label": "Brand accent",
    "whiteLabel.items.brandColor.ready": "A valid global brand color is configured.",
    "whiteLabel.items.diagnostics.label": "Diagnostic routes",
    "whiteLabel.items.diagnostics.ready": "Developer diagnostic routing is disabled for product handoff.",
    "whiteLabel.items.widget.label": "Widget branding",
    "whiteLabel.items.widget.ready": "An active widget has custom brand styling, greeting, placeholder, logo, and a restricted domain allowlist.",
    "whiteLabel.items.email.label": "Email sender",
    "whiteLabel.items.email.manual": "Confirm the deployment uses the intended sender name and domain for auth, workflow, and platform alert emails.",
    "whiteLabel.items.production.label": "Production setup validation",
    "whiteLabel.items.production.manual": "Run the production setup validator before deployment handoff and keep the output with release notes.",
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
    "handoffSummary.widget.ready": "Active branded widget",
    "modulePresets.items.agentBuilderEvals": "Agent builder and evals",
    "modulePresets.items.assistantWorkspace": "Assistant workspace",
    "modulePresets.items.keepDiagnosticsDisabled": "Keep diagnostics disabled",
    "modulePresets.items.knowledgeSurfaces": "Knowledge surfaces",
    "modulePresets.items.modelDefaults": "Model defaults",
    "modulePresets.items.replaceDemoKnowledge": "Replace demo knowledge",
    "modulePresets.items.reportsOptional": "Reports only when needed",
    "modulePresets.items.runReleaseGate": "Run the release gate",
    "modulePresets.items.systemHealth": "System Health",
    "modulePresets.links.agents": "Open agents",
    "modulePresets.presets.knowledgeAssistant.summary": "A focused internal assistant backed by approved company knowledge and release gates.",
    "modulePresets.presets.knowledgeAssistant.title": "Knowledge Assistant",
    "modulePresets.sections.handoff": "Handoff checks",
    "modulePresets.sections.owner": "Owner surfaces",
    "modulePresets.sections.visible": "Visible modules",
    "navigationProfiles.items.adminCompanies": "Companies admin",
    "navigationProfiles.items.appDashboard": "App dashboard",
    "navigationProfiles.items.assistant": "Assistant",
    "navigationProfiles.items.keepServerAuthz": "Treat navigation hiding as presentation only; keep server authorization.",
    "navigationProfiles.items.organization": "Organization settings",
    "navigationProfiles.items.preserveAdminRoutes": "Keep admin routes reachable for authorized operators.",
    "navigationProfiles.items.reports": "Reports",
    "navigationProfiles.items.releaseCenter": "Release Center",
    "navigationProfiles.items.systemHealth": "System Health",
    "navigationProfiles.items.systemSettings": "System Settings",
    "navigationProfiles.items.tenantScoped": "Persist visibility per tenant or product package.",
    "navigationProfiles.profiles.customerWorkspace.summary": "A minimal internal app shell for tenant users with owner tooling kept outside the customer path.",
    "navigationProfiles.profiles.customerWorkspace.title": "Customer Workspace",
    "navigationProfiles.sections.hide": "Hide candidates",
    "navigationProfiles.sections.notes": "Implementation notes",
    "navigationProfiles.sections.owner": "Owner-only",
    "navigationProfiles.sections.visible": "Visible",
    "packagingChecklist.copied": "Copied",
    "packagingChecklist.copy": "Copy checklist",
    "packagingChecklist.loading": "Preparing packaging checklist...",
    "packagingChecklist.summary": "{productName} is {readinessPercent}% ready for white-label packaging.",
  };
  return labels[key] ?? key;
};

describe("settings sections", () => {
  it("edits identity text and uploads light and dark logos", () => {
    const setFormData = vi.fn();
    const onFileUpload = vi.fn();
    const formData: SystemSettingsFormData = {
      platformName: "Sonae",
      logoUrlLight: "/light.png",
      logoUrlDark: "/dark.png",
    };

    const { container } = render(
      <IdentitySettingsSection
        formData={formData}
        setFormData={setFormData}
        uploadingLight
        uploadingDark={false}
        onFileUpload={onFileUpload}
        onRemoveLogo={vi.fn()}
        t={t}
      />
    );

    fireEvent.change(screen.getByDisplayValue("Sonae"), { target: { value: "New Sonae" } });

    const fileInputs = container.querySelectorAll('input[type="file"]');
    fireEvent.change(fileInputs[0], { target: { files: [new File(["light"], "light.png")] } });
    fireEvent.change(fileInputs[1], { target: { files: [new File(["dark"], "dark.png")] } });

    expect(screen.getByAltText("Light mode")).toBeInTheDocument();
    expect(screen.getByAltText("Dark mode")).toBeInTheDocument();
    expect(setFormData).toHaveBeenCalledWith({ ...formData, platformName: "New Sonae" });
    expect(onFileUpload).toHaveBeenCalledWith(expect.any(Object), "light");
    expect(onFileUpload).toHaveBeenCalledWith(expect.any(Object), "dark");
  });

  it("offers to remove each logo only once there is one to remove", () => {
    const onRemoveLogo = vi.fn();

    const { rerender } = render(
      <IdentitySettingsSection
        formData={{}}
        setFormData={vi.fn()}
        uploadingLight={false}
        uploadingDark={false}
        onFileUpload={vi.fn()}
        onRemoveLogo={onRemoveLogo}
        t={t}
      />
    );

    expect(screen.queryByLabelText("Remove the light logo")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Remove the dark logo")).not.toBeInTheDocument();

    rerender(
      <IdentitySettingsSection
        formData={{ logoUrlLight: "/light.png", logoUrlDark: "/dark.png" }}
        setFormData={vi.fn()}
        uploadingLight={false}
        uploadingDark={false}
        onFileUpload={vi.fn()}
        onRemoveLogo={onRemoveLogo}
        t={t}
      />
    );

    fireEvent.click(screen.getByLabelText("Remove the light logo"));
    fireEvent.click(screen.getByLabelText("Remove the dark logo"));

    expect(onRemoveLogo).toHaveBeenNthCalledWith(1, "light");
    expect(onRemoveLogo).toHaveBeenNthCalledWith(2, "dark");
  });

  it("edits appearance typography and palette fields", () => {
    const setFormData = vi.fn();
    // Fonts are stored as named keys, never raw CSS: the old dropdown's
    // literal `var(--font-sans)` value is exactly what created the variable
    // cycle that broke the app's font.
    const formData: SystemSettingsFormData = {
      headingFontFamily: "default",
      bodyFontFamily: "default",
      headingSizeGlobal: "1.5rem",
      darkBg: "#000000",
      lightBg: "#ffffff",
      brandColorHex: "#aa5500",
    };

    render(<AppearanceSettingsSection formData={formData} setFormData={setFormData} t={t} />);

    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "mono" },
    });
    fireEvent.change(screen.getAllByRole("combobox")[2], { target: { value: "2.25rem" } });
    fireEvent.change(screen.getAllByDisplayValue("#000000")[0], { target: { value: "#111111" } });
    fireEvent.change(screen.getByDisplayValue("#ffffff"), { target: { value: "#eeeeee" } });
    fireEvent.change(screen.getByDisplayValue("#aa5500"), { target: { value: "#ff6600" } });

    expect(screen.getByText("Appearance")).toBeInTheDocument();
    expect(setFormData).toHaveBeenCalledWith({ ...formData, headingFontFamily: "mono" });
    expect(setFormData).toHaveBeenCalledWith({ ...formData, headingSizeGlobal: "2.25rem" });
    expect(setFormData).toHaveBeenCalledWith({ ...formData, darkBg: "#111111" });
    expect(setFormData).toHaveBeenCalledWith({ ...formData, lightBg: "#EEEEEE" });
    expect(setFormData).toHaveBeenCalledWith({ ...formData, brandColorHex: "#FF6600" });

    // No dropdown offers a raw CSS value any more.
    const options = Array.from(document.querySelectorAll("option")).map((option) => option.value);
    expect(options.some((value) => value.includes("var("))).toBe(false);
  });

});
