import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { useSearchParams } from "next/navigation";
import GlobalWidgetPage from "./page";

vi.mock("../_components/AiWorkspaceNav", () => ({
  AiWorkspaceNav: () => <nav aria-label="AI workspace">AI workspace nav</nav>,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: vi.fn(),
}));

vi.mock("@/src/app/(dashboard)/admin/_features/widget-config/WidgetAppearanceSection", () => ({
  WidgetAppearanceSection: ({ name, setName }: { name: string; setName: (value: string) => void }) => (
    <section aria-label="Appearance controls">
      <label>
        Bot name
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
    </section>
  ),
}));

vi.mock("@/src/app/(dashboard)/admin/_features/widget-config/WidgetPreviewPanel", () => ({
  WidgetPreviewPanel: ({ name }: { name: string }) => <aside>Preview {name}</aside>,
}));

vi.mock("@/src/app/(dashboard)/admin/_features/widget-config/WidgetEmptyState", () => ({
  WidgetEmptyState: ({
    actionLabel,
    isSaving,
    onInitialize,
  }: {
    actionLabel: string;
    isSaving: boolean;
    onInitialize: () => void;
  }) => (
    <button type="button" disabled={isSaving} onClick={onInitialize}>
      {actionLabel}
    </button>
  ),
}));

vi.mock("@/src/app/(dashboard)/admin/_features/widget-config/WidgetIntegrationSection", () => ({
  WidgetIntegrationSection: ({ codeSnippet, copied, onCopy }: { codeSnippet: string; copied: boolean; onCopy: () => void }) => (
    <section aria-label="Integration controls">
      <code>{codeSnippet}</code>
      <button type="button" onClick={onCopy}>{copied ? "Copied" : "Copy"}</button>
    </section>
  ),
}));

vi.mock("@/src/app/(dashboard)/admin/_features/widget-config/WidgetWelcomeSection", () => ({
  WidgetWelcomeSection: () => <section aria-label="Welcome controls">Welcome controls</section>,
}));

vi.mock("@/src/app/(dashboard)/admin/_features/widget-config/WidgetConversationStartersSection", () => ({
  WidgetConversationStartersSection: () => <section aria-label="Starter controls">Starter controls</section>,
}));

vi.mock("@/src/app/(dashboard)/admin/_features/widget-config/WidgetGreetingSection", () => ({
  WidgetGreetingSection: () => <section aria-label="Greeting controls">Greeting controls</section>,
}));

const widget = {
  _id: "global_widget_1",
  _creationTime: 1,
  name: "Existing Global Bot",
  allowedDomains: ["https://example.com"],
  themeGreeting: "Hello",
  themePrimaryColor: "#123456",
  themeLogoUrl: "",
  themePlaceholder: "Ask",
  enableSounds: true,
  showPopupPreview: true,
  requireName: false,
  requireEmail: true,
  enableGreeting: true,
  conversationStarters: ["Book a demo"],
};

function getConvexPath(functionReference: unknown) {
  try {
    return getFunctionName(functionReference as never);
  } catch {
    const maybeReference = functionReference as { _path?: unknown; name?: unknown };
    return typeof maybeReference._path === "string" ? maybeReference._path : typeof maybeReference.name === "string" ? maybeReference.name : "";
  }
}

describe("GlobalWidgetPage", () => {
  const saveWidget = vi.fn();
  const generateUploadUrl = vi.fn();
  const writeText = vi.fn();
  const navigationState = { section: "" };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, { clipboard: { writeText } });
    navigationState.section = "";
    vi.mocked(useSearchParams).mockImplementation(() => (
      new URLSearchParams(navigationState.section ? `section=${navigationState.section}` : "") as never
    ));
    vi.mocked(useQuery).mockReturnValue(widget);
    vi.mocked(useMutation).mockImplementation((mutationFn: unknown) => {
      const path = getConvexPath(mutationFn);
      if (path.includes("saveWidget")) return saveWidget as unknown as ReturnType<typeof useMutation>;
      return generateUploadUrl as unknown as ReturnType<typeof useMutation>;
    });
    saveWidget.mockResolvedValue(undefined);
  });

  it("renders loading, empty initialize, and populated save states", async () => {
    vi.mocked(useQuery).mockReturnValue(undefined);
    const { container, rerender } = render(<GlobalWidgetPage />);

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();

    vi.mocked(useQuery).mockReturnValue(null);
    rerender(<GlobalWidgetPage />);
    fireEvent.click(screen.getByRole("button", { name: "Initialize Master Widget" }));

    await waitFor(() => {
      expect(saveWidget).toHaveBeenCalledWith(expect.objectContaining({ isGlobal: true, widgetId: undefined, name: "Sonae Intercept Bot" }));
    });
    expect(saveWidget.mock.calls.at(-1)?.[0]).not.toHaveProperty("companyId");

    vi.mocked(useQuery).mockReturnValue(widget);
    rerender(<GlobalWidgetPage />);
    await screen.findByDisplayValue("Existing Global Bot");
    fireEvent.change(screen.getByLabelText("Bot name"), { target: { value: "Global Support Bot" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Configuration/i }));

    await waitFor(() => {
      expect(saveWidget).toHaveBeenCalledWith(expect.objectContaining({ isGlobal: true, widgetId: "global_widget_1", name: "Global Support Bot" }));
    });
    expect(saveWidget.mock.calls.at(-1)?.[0]).not.toHaveProperty("companyId");
  });

  it("builds and copies the integration snippet for the global widget", async () => {
    navigationState.section = "integration";
    render(<GlobalWidgetPage />);

    expect(screen.queryByRole("navigation", { name: "Widget tabs" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Widget section/i })).not.toBeInTheDocument();
    expect(screen.getByText(/global_widget_1/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining("global_widget_1"));
    });
  });

  it.each([
    ["", "Appearance controls"],
    ["welcome-screen", "Welcome controls"],
    ["conversation-starters", "Starter controls"],
    ["greeting", "Greeting controls"],
    ["integration", "Integration controls"],
  ])("selects the %s widget section from the URL query", (section, accessibleName) => {
    navigationState.section = section;
    render(<GlobalWidgetPage />);

    expect(screen.getByRole("region", { name: accessibleName })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Widget section/i })).not.toBeInTheDocument();
  });

  it("keeps widget section content full-width instead of restoring the old side rail", () => {
    navigationState.section = "integration";
    const { container } = render(<GlobalWidgetPage />);

    const integrationPanel = screen.getByRole("region", { name: "Integration controls" });
    const contentColumn = integrationPanel.parentElement;
    const layoutWrapper = contentColumn?.parentElement;

    expect(contentColumn).toHaveClass("flex-1", "w-full", "min-w-0");
    expect(layoutWrapper).toHaveClass("flex", "flex-col");
    expect(layoutWrapper).not.toHaveClass("2xl:flex-row");
    expect(container.querySelector("[aria-label^='Widget section']")).not.toBeInTheDocument();
  });
});
