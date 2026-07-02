import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import GlobalWidgetPage from "./page";

vi.mock("../_components/AiWorkspaceNav", () => ({
  AiWorkspaceNav: () => <nav aria-label="AI workspace">AI workspace nav</nav>,
}));

vi.mock("@/src/app/(dashboard)/admin/_features/widget-config/WidgetConfigTabs", () => ({
  WidgetConfigTabs: ({ activeTab, onTabChange }: { activeTab: string; onTabChange: (tab: string) => void }) => (
    <nav aria-label="Widget tabs">
      {["Appearance", "Welcome Screen", "Conversation Starters", "Greeting", "Integration"].map((tab) => (
        <button key={tab} type="button" aria-pressed={activeTab === tab} onClick={() => onTabChange(tab)}>
          {tab}
        </button>
      ))}
    </nav>
  ),
}));

vi.mock("@/src/app/(dashboard)/admin/_features/widget-config/WidgetAppearanceSection", () => ({
  WidgetAppearanceSection: ({ name, setName }: { name: string; setName: (value: string) => void }) => (
    <label>
      Bot name
      <input value={name} onChange={(event) => setName(event.target.value)} />
    </label>
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
    <section>
      <code>{codeSnippet}</code>
      <button type="button" onClick={onCopy}>{copied ? "Copied" : "Copy"}</button>
    </section>
  ),
}));

vi.mock("@/src/app/(dashboard)/admin/_features/widget-config/WidgetWelcomeSection", () => ({
  WidgetWelcomeSection: () => <section>Welcome controls</section>,
}));

vi.mock("@/src/app/(dashboard)/admin/_features/widget-config/WidgetConversationStartersSection", () => ({
  WidgetConversationStartersSection: () => <section>Starter controls</section>,
}));

vi.mock("@/src/app/(dashboard)/admin/_features/widget-config/WidgetGreetingSection", () => ({
  WidgetGreetingSection: () => <section>Greeting controls</section>,
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

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, { clipboard: { writeText } });
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
    render(<GlobalWidgetPage />);

    fireEvent.click(screen.getByRole("button", { name: "Integration" }));
    expect(screen.getByText(/global_widget_1/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining("global_widget_1"));
    });
  });
});
