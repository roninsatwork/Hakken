import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WidgetAppearanceSection } from "./WidgetAppearanceSection";
import { WidgetConversationStartersSection } from "./WidgetConversationStartersSection";
import { WidgetEmptyState } from "./WidgetEmptyState";
import { WidgetGreetingSection } from "./WidgetGreetingSection";
import { WidgetIntegrationSection } from "./WidgetIntegrationSection";
import { WidgetPanel } from "./WidgetPanel";
import { WidgetPreviewPanel } from "./WidgetPreviewPanel";
import { WidgetWelcomeSection } from "./WidgetWelcomeSection";

// The screen reads the configured platform name, so copy is branded per
// deployment rather than carrying a hardcoded product name.
vi.mock("@/src/context/SystemSettingsContext", () => ({
  useSystemSettings: () => ({ platformName: "Acme Copilot" }),
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));


vi.mock("next/image", () => ({
  default: ({ unoptimized, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => {
    void unoptimized;
    return React.createElement("img", { ...props, alt: alt ?? "" });
  },
}));

describe("widget configuration sections", () => {
  function mockWideLayout(matches: boolean) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  }

  beforeEach(() => {
    mockWideLayout(true);
  });

  it("renders a panel shell around arbitrary controls", () => {
    render(
      <WidgetPanel title="Security" description="Restrict usage">
        <button type="button">Save</button>
      </WidgetPanel>
    );

    expect(screen.getByRole("heading", { name: "Security" })).toBeInTheDocument();
    expect(screen.getByText("Restrict usage")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("initializes empty state and disables duplicate initialize clicks while saving", () => {
    const onInitialize = vi.fn();
    const { rerender } = render(<WidgetEmptyState isSaving={false} onInitialize={onInitialize} />);

    fireEvent.click(screen.getByRole("button", { name: "ai.widget.emptyState.action" }));

    expect(onInitialize).toHaveBeenCalledTimes(1);

    rerender(<WidgetEmptyState isSaving onInitialize={onInitialize} />);

    expect(screen.getByRole("button", { name: "ai.widget.emptyState.action" })).toBeDisabled();
  });

  it("toggles welcome screen requirements", () => {
    const setRequireName = vi.fn();
    const setRequireEmail = vi.fn();

    render(
      <WidgetWelcomeSection
        requireName={false}
        requireEmail
        setRequireName={setRequireName}
        setRequireEmail={setRequireEmail}
      />
    );

    fireEvent.click(screen.getByLabelText("ai.widget.welcome.nameInput"));
    fireEvent.click(screen.getByLabelText("ai.widget.welcome.emailInput"));

    expect(setRequireName).toHaveBeenCalledWith(true);
    expect(setRequireEmail).toHaveBeenCalledWith(false);
  });

  it("enables greeting copy only when the greeting is active", () => {
    const setEnableGreeting = vi.fn();
    const setThemeGreeting = vi.fn();
    const { rerender } = render(
      <WidgetGreetingSection
        enableGreeting={false}
        setEnableGreeting={setEnableGreeting}
        setThemeGreeting={setThemeGreeting}
        themeGreeting="Hi there"
      />
    );

    expect(screen.getByPlaceholderText("ai.widget.greeting.messagePlaceholder")).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox"));

    expect(setEnableGreeting).toHaveBeenCalledWith(true);

    rerender(
      <WidgetGreetingSection
        enableGreeting
        setEnableGreeting={setEnableGreeting}
        setThemeGreeting={setThemeGreeting}
        themeGreeting="Hi there"
      />
    );

    fireEvent.change(screen.getByPlaceholderText("ai.widget.greeting.messagePlaceholder"), {
      target: { value: "Welcome back" },
    });

    expect(setThemeGreeting).toHaveBeenCalledWith("Welcome back");
  });

  it("guards conversation starter input, add, and remove controls", () => {
    const onAddStarter = vi.fn();
    const onRemoveStarter = vi.fn();
    const setStarterInput = vi.fn();

    const { rerender } = render(
      <WidgetConversationStartersSection
        conversationStarters={[]}
        onAddStarter={onAddStarter}
        onRemoveStarter={onRemoveStarter}
        setStarterInput={setStarterInput}
        starterInput=""
      />
    );

    expect(screen.getByText("ai.widget.starters.empty")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ai.widget.starters.addButton" })).toBeDisabled();

    rerender(
      <WidgetConversationStartersSection
        conversationStarters={["Book a viewing"]}
        onAddStarter={onAddStarter}
        onRemoveStarter={onRemoveStarter}
        setStarterInput={setStarterInput}
        starterInput="Ask about pricing"
      />
    );

    fireEvent.change(screen.getByPlaceholderText("ai.widget.starters.inputPlaceholder"), {
      target: { value: "Ask about availability" },
    });
    fireEvent.keyDown(screen.getByPlaceholderText("ai.widget.starters.inputPlaceholder"), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "ai.widget.starters.addButton" }));
    fireEvent.click(screen.getAllByRole("button")[1]);

    expect(setStarterInput).toHaveBeenCalledWith("Ask about availability");
    expect(onAddStarter).toHaveBeenCalledTimes(2);
    expect(onRemoveStarter).toHaveBeenCalledWith(0);
  });

  it("edits integration domains, copies snippets, and links to the sandbox", () => {
    const onCopy = vi.fn();
    const setAllowedDomains = vi.fn();
    const setKioskEnabled = vi.fn();

    render(
      <WidgetIntegrationSection
        allowedDomains="https://example.com"
        codeSnippet="<script src='widget.js'></script>"
        copied={false}
        onCopy={onCopy}
        setAllowedDomains={setAllowedDomains}
        widgetId="widget123"
        kioskEnabled={false}
        setKioskEnabled={setKioskEnabled}
      />
    );

    fireEvent.change(screen.getByPlaceholderText("ai.widget.integration.domainsPlaceholder"), {
      target: { value: "https://app.example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ai.widget.integration.copy" }));

    expect(screen.getByText("<script src='widget.js'></script>")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ai.widget.integration.sandboxButton" })).toHaveAttribute("href", "/sandbox/widget123");
    expect(setAllowedDomains).toHaveBeenCalledWith("https://app.example.com");
    expect(onCopy).toHaveBeenCalledTimes(1);
  });

  it("offers the receptionist screen as an opt-in, with the address and health once on", () => {
    const setKioskEnabled = vi.fn();

    const { rerender } = render(
      <WidgetIntegrationSection
        allowedDomains=""
        codeSnippet=""
        copied={false}
        onCopy={vi.fn()}
        setAllowedDomains={vi.fn()}
        widgetId="widget123"
        kioskEnabled={false}
        setKioskEnabled={setKioskEnabled}
      />
    );

    // Off: no kiosk link exists to wander onto.
    expect(screen.queryByRole("link", { name: /kiosk\.open/ })).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "ai.widget.integration.kiosk.title" }));
    expect(setKioskEnabled).toHaveBeenCalledWith(true);

    rerender(
      <WidgetIntegrationSection
        allowedDomains=""
        codeSnippet=""
        copied={false}
        onCopy={vi.fn()}
        setAllowedDomains={vi.fn()}
        widgetId="widget123"
        kioskEnabled={true}
        setKioskEnabled={setKioskEnabled}
        kioskLastSeenAt={1786700000000}
        kioskSessionCount={4}
      />
    );

    expect(screen.getByRole("link", { name: "ai.widget.integration.kiosk.open" })).toHaveAttribute(
      "href",
      "/kiosk/widget123"
    );
    expect(screen.getByText(/kiosk\.lastSeen/)).toBeInTheDocument();
  });

  it("edits appearance fields, toggles options, uploads and removes custom logos", () => {
    const onLogoUpload = vi.fn();
    const setEnableSounds = vi.fn();
    const setName = vi.fn();
    const setShowPopupPreview = vi.fn();
    const setThemeLogoUrl = vi.fn();
    const setThemePlaceholder = vi.fn();
    const setThemePrimaryColor = vi.fn();

    const baseProps = {
      activeColor: "#ff0000",
      enableSounds: false,
      isUploadingLogo: false,
      logoPreviewUrl: null,
      name: "Sales Assistant",
      onLogoUpload,
      setEnableSounds,
      setName,
      setShowPopupPreview,
      setThemeLogoUrl,
      setThemePlaceholder,
      setThemePrimaryColor,
      showPopupPreview: true,
      themeLogoUrl: "",
      themePlaceholder: "Ask a question",
      themePrimaryColor: "#ff0000",
    };

    const { container, rerender } = render(<WidgetAppearanceSection {...baseProps} />);

    fireEvent.change(screen.getByDisplayValue("Sales Assistant"), { target: { value: "Support Assistant" } });
    fireEvent.change(screen.getByDisplayValue("Ask a question"), { target: { value: "How can I help?" } });
    fireEvent.change(screen.getAllByDisplayValue("#ff0000")[0], { target: { value: "#00ff00" } });
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [new File(["logo"], "logo.png", { type: "image/png" })] },
    });
    fireEvent.click(screen.getByLabelText("ai.widget.appearance.sounds"));
    fireEvent.click(screen.getByLabelText("ai.widget.appearance.popupPreview"));

    expect(setName).toHaveBeenCalledWith("Support Assistant");
    expect(setThemePlaceholder).toHaveBeenCalledWith("How can I help?");
    expect(setThemePrimaryColor).toHaveBeenCalledWith("#00ff00");
    expect(onLogoUpload).toHaveBeenCalled();
    expect(setEnableSounds).toHaveBeenCalledWith(true);
    expect(setShowPopupPreview).toHaveBeenCalledWith(false);

    rerender(<WidgetAppearanceSection {...baseProps} themeLogoUrl="blob:logo" logoPreviewUrl="/logo.png" />);

    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByAltText("ai.widget.appearance.logoAlt")).toBeInTheDocument();
    expect(setThemeLogoUrl).toHaveBeenCalledWith("");
  });

  it("previews greeting, welcome capture, starters, and simulator toggles", () => {
    const setIsSimulatorOpen = vi.fn();
    const baseProps = {
      activeColor: "#0066cc",
      conversationStarters: ["Book a demo", "Talk to sales"],
      enableGreeting: true,
      isSimulatorOpen: false,
      logoPreviewUrl: "/logo.png",
      name: "Sales Assistant",
      requireEmail: false,
      requireName: false,
      setIsSimulatorOpen,
      showPopupPreview: true,
      themeGreeting: "Welcome to the site",
      themeLogoUrl: "logo-file",
      themePlaceholder: "Ask me anything",
    };

    const { container, rerender } = render(<WidgetPreviewPanel {...baseProps} />);

    expect(screen.getAllByText("Welcome to the site")).toHaveLength(2);

    fireEvent.click(container.querySelector("button") as HTMLButtonElement);

    expect(setIsSimulatorOpen).toHaveBeenCalledWith(true);

    rerender(<WidgetPreviewPanel {...baseProps} isSimulatorOpen requireEmail requireName />);

    expect(screen.getByText("Sales Assistant")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("ai.widget.preview.fullName")).toBeDisabled();
    expect(screen.getByPlaceholderText("ai.widget.preview.emailAddress")).toBeDisabled();
    expect(screen.getByRole("button", { name: "ai.widget.preview.startChat" })).toBeDisabled();

    fireEvent.click(container.querySelector("svg.cursor-pointer") as SVGElement);

    expect(setIsSimulatorOpen).toHaveBeenCalledWith(false);

    rerender(<WidgetPreviewPanel {...baseProps} enableGreeting={false} isSimulatorOpen name="" themeLogoUrl="" />);

    expect(screen.getByText("ai.widget.preview.nameFallback")).toBeInTheDocument();
    expect(screen.getByText("Book a demo")).toBeInTheDocument();
    expect(screen.getByText("Talk to sales")).toBeInTheDocument();
    expect(screen.getByText("Ask me anything")).toBeInTheDocument();
  });
});
