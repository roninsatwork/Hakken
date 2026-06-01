import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import CompanyWidgetPage from "./page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "company_1" }),
}));

vi.mock("./_components/WidgetConfigTabs", () => ({
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

vi.mock("./_components/WidgetAppearanceSection", () => ({
  WidgetAppearanceSection: ({ name, setName }: { name: string; setName: (value: string) => void }) => (
    <label>
      Bot name
      <input value={name} onChange={(event) => setName(event.target.value)} />
    </label>
  ),
}));

vi.mock("./_components/WidgetPreviewPanel", () => ({
  WidgetPreviewPanel: ({ name }: { name: string }) => <aside>Preview {name}</aside>,
}));

vi.mock("./_components/WidgetEmptyState", () => ({
  WidgetEmptyState: ({ isSaving, onInitialize }: { isSaving: boolean; onInitialize: () => void }) => (
    <button type="button" disabled={isSaving} onClick={onInitialize}>
      Initialize Widget
    </button>
  ),
}));

vi.mock("./_components/WidgetIntegrationSection", () => ({
  WidgetIntegrationSection: ({ codeSnippet, copied, onCopy }: { codeSnippet: string; copied: boolean; onCopy: () => void }) => (
    <section>
      <code>{codeSnippet}</code>
      <button type="button" onClick={onCopy}>{copied ? "Copied" : "Copy"}</button>
    </section>
  ),
}));

vi.mock("./_components/WidgetWelcomeSection", () => ({
  WidgetWelcomeSection: () => <section>Welcome controls</section>,
}));

vi.mock("./_components/WidgetConversationStartersSection", () => ({
  WidgetConversationStartersSection: () => <section>Starter controls</section>,
}));

vi.mock("./_components/WidgetGreetingSection", () => ({
  WidgetGreetingSection: () => <section>Greeting controls</section>,
}));

const widget = {
  _id: "widget_1",
  _creationTime: 1,
  name: "Existing Bot",
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

describe("CompanyWidgetPage", () => {
  const saveWidget = vi.fn();
  const generateUploadUrl = vi.fn();
  const writeText = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, { clipboard: { writeText } });
    vi.mocked(useQuery).mockReturnValue([widget]);
    vi.mocked(useMutation).mockImplementation((mutationFn: unknown) => {
      const path = getConvexPath(mutationFn);
      if (path.includes("saveWidget")) return saveWidget as unknown as ReturnType<typeof useMutation>;
      return generateUploadUrl as unknown as ReturnType<typeof useMutation>;
    });
    saveWidget.mockResolvedValue(undefined);
  });

  it("renders loading, empty initialize, and populated publish states", async () => {
    vi.mocked(useQuery).mockReturnValue(undefined);
    const { container, rerender } = render(<CompanyWidgetPage />);

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();

    vi.mocked(useQuery).mockReturnValue([]);
    rerender(<CompanyWidgetPage />);
    fireEvent.click(screen.getByRole("button", { name: "Initialize Widget" }));

    await waitFor(() => {
      expect(saveWidget).toHaveBeenCalledWith(expect.objectContaining({ companyId: "company_1", widgetId: undefined, name: "Website Bot" }));
    });

    vi.mocked(useQuery).mockReturnValue([widget]);
    rerender(<CompanyWidgetPage />);
    await screen.findByDisplayValue("Existing Bot");
    fireEvent.change(screen.getByLabelText("Bot name"), { target: { value: "Support Bot" } });
    fireEvent.click(screen.getByRole("button", { name: /Publish Configuration/i }));

    await waitFor(() => {
      expect(saveWidget).toHaveBeenCalledWith(expect.objectContaining({ companyId: "company_1", widgetId: "widget_1", name: "Support Bot" }));
    });
  });

  it("builds and copies the integration snippet for the widget", async () => {
    render(<CompanyWidgetPage />);

    fireEvent.click(screen.getByRole("button", { name: "Integration" }));
    expect(screen.getByText(/widget_1/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining("widget_1"));
    });
  });
});
