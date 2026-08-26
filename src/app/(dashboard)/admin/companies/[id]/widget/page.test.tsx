import React from "react";
import { NextIntlClientProvider } from "next-intl";
import { ToastProvider } from "@/src/context/ToastContext";
import { fireEvent, render as renderBase, screen, waitFor } from "@testing-library/react";
import messages from "../../../../../../../messages/en.json";

// The widget screen resolves its copy through the catalogue, so the page
// renders inside the same intl provider the root layout supplies.
function render(ui: React.ReactElement) {
  return renderBase(ui, {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <NextIntlClientProvider locale="en" messages={messages}>
        <ToastProvider>{children}</ToastProvider>
      </NextIntlClientProvider>
    ),
  });
}
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import CompanyWidgetPage from "./page";

const navigationState = vi.hoisted(() => ({ section: "" }));

// The shared widget screen reads the configured platform name for the
// default bot name, so copy is branded per deployment.
vi.mock("@/src/context/SystemSettingsContext", () => ({
  useSystemSettings: () => ({ platformName: "Acme Copilot" }),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "company_1" }),
  useSearchParams: () => new URLSearchParams(navigationState.section ? `section=${navigationState.section}` : ""),
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
  WidgetEmptyState: ({ isSaving, onInitialize }: { isSaving: boolean; onInitialize: () => void }) => (
    <button type="button" disabled={isSaving} onClick={onInitialize}>
      Initialize Widget
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
    navigationState.section = "";
    Object.assign(navigator, { clipboard: { writeText } });
    vi.mocked(useQuery).mockReturnValue(widget);
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

    vi.mocked(useQuery).mockReturnValue(null);
    rerender(<CompanyWidgetPage />);
    fireEvent.click(screen.getByRole("button", { name: "Initialize Widget" }));

    await waitFor(() => {
      expect(saveWidget).toHaveBeenCalledWith(expect.objectContaining({ companyId: "company_1", widgetId: undefined, name: "Website Bot" }));
    });

    vi.mocked(useQuery).mockReturnValue(widget);
    rerender(<CompanyWidgetPage />);
    await screen.findByDisplayValue("Existing Bot");
    expect(screen.queryByRole("button", { name: /Widget section/i })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Bot name"), { target: { value: "Support Bot" } });
    fireEvent.click(screen.getByRole("button", { name: /Publish Configuration/i }));

    await waitFor(() => {
      expect(saveWidget).toHaveBeenCalledWith(expect.objectContaining({ companyId: "company_1", widgetId: "widget_1", name: "Support Bot" }));
    });
  });

  it("builds and copies the integration snippet for the widget", async () => {
    navigationState.section = "integration";

    render(<CompanyWidgetPage />);

    expect(screen.getByText(/widget_1/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining("widget_1"));
    });
  });
});
