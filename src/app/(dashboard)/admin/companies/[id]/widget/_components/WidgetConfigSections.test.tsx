import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WidgetAppearanceSection } from "./WidgetAppearanceSection";
import { WidgetConfigTabs } from "./WidgetConfigTabs";
import { WidgetConversationStartersSection } from "./WidgetConversationStartersSection";
import { WidgetEmptyState } from "./WidgetEmptyState";
import { WidgetGreetingSection } from "./WidgetGreetingSection";
import { WidgetIntegrationSection } from "./WidgetIntegrationSection";
import { WidgetPanel } from "./WidgetPanel";
import { WidgetPreviewPanel } from "./WidgetPreviewPanel";
import { WidgetWelcomeSection } from "./WidgetWelcomeSection";

vi.mock("next/image", () => ({
  default: ({ unoptimized, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => {
    void unoptimized;
    return React.createElement("img", { ...props, alt: alt ?? "" });
  },
}));

describe("widget configuration sections", () => {
  it("renders tab navigation and reports selected tabs", () => {
    const onTabChange = vi.fn();

    render(<WidgetConfigTabs activeTab="Appearance" onTabChange={onTabChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Integration" }));

    expect(screen.getByRole("button", { name: "Appearance" })).toHaveClass("bg-brand");
    expect(onTabChange).toHaveBeenCalledWith("Integration");
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

    fireEvent.click(screen.getByRole("button", { name: /Initialize Master Widget/i }));

    expect(onInitialize).toHaveBeenCalledTimes(1);

    rerender(<WidgetEmptyState isSaving onInitialize={onInitialize} />);

    expect(screen.getByRole("button", { name: /Initialize Master Widget/i })).toBeDisabled();
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

    fireEvent.click(screen.getByLabelText("Name input"));
    fireEvent.click(screen.getByLabelText("Email input"));

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

    expect(screen.getByPlaceholderText("Type a greeting message...")).toBeDisabled();

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

    fireEvent.change(screen.getByPlaceholderText("Type a greeting message..."), {
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

    expect(screen.getByText("No conversation starters added yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add Conversation Starter/i })).toBeDisabled();

    rerender(
      <WidgetConversationStartersSection
        conversationStarters={["Book a viewing"]}
        onAddStarter={onAddStarter}
        onRemoveStarter={onRemoveStarter}
        setStarterInput={setStarterInput}
        starterInput="Ask about pricing"
      />
    );

    fireEvent.change(screen.getByPlaceholderText("Enter a conversation starter"), {
      target: { value: "Ask about availability" },
    });
    fireEvent.keyDown(screen.getByPlaceholderText("Enter a conversation starter"), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: /Add Conversation Starter/i }));
    fireEvent.click(screen.getAllByRole("button")[1]);

    expect(setStarterInput).toHaveBeenCalledWith("Ask about availability");
    expect(onAddStarter).toHaveBeenCalledTimes(2);
    expect(onRemoveStarter).toHaveBeenCalledWith(0);
  });

  it("edits integration domains, copies snippets, and links to the sandbox", () => {
    const onCopy = vi.fn();
    const setAllowedDomains = vi.fn();

    render(
      <WidgetIntegrationSection
        allowedDomains="https://example.com"
        codeSnippet="<script src='widget.js'></script>"
        copied={false}
        onCopy={onCopy}
        setAllowedDomains={setAllowedDomains}
        widgetId="widget123"
      />
    );

    fireEvent.change(screen.getByPlaceholderText("https://example.com, https://app.example.com"), {
      target: { value: "https://app.example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Copy to clipboard" }));

    expect(screen.getByText("<script src='widget.js'></script>")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Test Widget Sandbox/i })).toHaveAttribute("href", "/sandbox/widget123");
    expect(setAllowedDomains).toHaveBeenCalledWith("https://app.example.com");
    expect(onCopy).toHaveBeenCalledTimes(1);
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
    fireEvent.click(screen.getByLabelText("Enable sound notifications"));
    fireEvent.click(screen.getByLabelText("Show pop-up message preview"));

    expect(setName).toHaveBeenCalledWith("Support Assistant");
    expect(setThemePlaceholder).toHaveBeenCalledWith("How can I help?");
    expect(setThemePrimaryColor).toHaveBeenCalledWith("#00ff00");
    expect(onLogoUpload).toHaveBeenCalled();
    expect(setEnableSounds).toHaveBeenCalledWith(true);
    expect(setShowPopupPreview).toHaveBeenCalledWith(false);

    rerender(<WidgetAppearanceSection {...baseProps} themeLogoUrl="blob:logo" logoPreviewUrl="/logo.png" />);

    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByAltText("Widget Logo")).toBeInTheDocument();
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
    expect(screen.getByPlaceholderText("Full Name")).toBeDisabled();
    expect(screen.getByPlaceholderText("Email Address")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Start Chat" })).toBeDisabled();

    fireEvent.click(container.querySelector("svg.cursor-pointer") as SVGElement);

    expect(setIsSimulatorOpen).toHaveBeenCalledWith(false);

    rerender(<WidgetPreviewPanel {...baseProps} enableGreeting={false} isSimulatorOpen name="" themeLogoUrl="" />);

    expect(screen.getByText("Website Bot")).toBeInTheDocument();
    expect(screen.getByText("Book a demo")).toBeInTheDocument();
    expect(screen.getByText("Talk to sales")).toBeInTheDocument();
    expect(screen.getByText("Ask me anything")).toBeInTheDocument();
  });
});
