import { fireEvent, renderWithProviders as render, screen, within } from "@/src/test/renderWithProviders";
import { describe, expect, it, vi } from "vitest";
import { Activity, BrainCircuit, Database, Settings } from "lucide-react";
import { DetailTabs } from "./DetailTabs";
import { usePathname, useSearchParams } from "next/navigation";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
}));

describe("DetailTabs", () => {
  const tabs = [
    { label: "Dashboard", href: "/admin/agents/agent-1", icon: Activity },
    { label: "Settings", href: "/admin/agents/agent-1/settings", icon: Settings },
  ];

  it("marks only the root tab active on the exact root route", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/agents/agent-1");
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as never);

    render(<DetailTabs tabs={tabs} rootHref="/admin/agents/agent-1" />);

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveClass("border-brand");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveClass("border-transparent");
  });

  it("marks nested tabs active by prefix", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/agents/agent-1/settings");
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as never);

    render(<DetailTabs tabs={tabs} rootHref="/admin/agents/agent-1" />);

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveClass("border-transparent");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveClass("border-brand");
  });

  it("renders dropdown tabs as closed menu buttons with active child state", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/agents/agent-1/ai/knowledge/document-1");
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as never);

    render(
      <DetailTabs
        rootHref="/admin/agents/agent-1"
        tabs={[
          ...tabs,
          {
            label: "AI",
            href: "/admin/agents/agent-1/ai",
            icon: BrainCircuit,
            dropdownItems: [
              {
                label: "Overview",
                href: "/admin/agents/agent-1/ai",
                icon: Activity,
                matches: (pathname) => pathname === "/admin/agents/agent-1/ai",
              },
              {
                label: "Knowledge",
                href: "/admin/agents/agent-1/ai/knowledge",
                icon: Database,
              },
            ],
          },
        ]}
      />
    );

    const aiTrigger = screen.getByRole("button", { name: "AI" });

    expect(aiTrigger).toHaveAttribute("aria-expanded", "false");
    expect(aiTrigger).toHaveClass("border-brand");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(aiTrigger);

    const menu = screen.getByRole("menu");
    const overviewItem = within(menu).getByRole("menuitem", { name: "Overview" });
    const knowledgeItem = within(menu).getByRole("menuitem", { name: /Knowledge/ });

    expect(aiTrigger).toHaveAttribute("aria-expanded", "true");
    expect(overviewItem).toHaveAttribute("href", "/admin/agents/agent-1/ai");
    expect(knowledgeItem).toHaveAttribute("href", "/admin/agents/agent-1/ai/knowledge");
    expect(knowledgeItem).toHaveClass("bg-brand");
    expect(within(menu).getByLabelText("Knowledge selected")).toBeInTheDocument();
    expect(within(menu).queryByLabelText("Overview selected")).not.toBeInTheDocument();

    fireEvent.click(knowledgeItem);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes an open dropdown on outside pointer down and Escape", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/agents/agent-1/ai");
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as never);

    render(
      <div>
        <button type="button">Outside</button>
        <DetailTabs
          rootHref="/admin/agents/agent-1"
          tabs={[
            ...tabs,
            {
              label: "AI",
              href: "/admin/agents/agent-1/ai",
              icon: BrainCircuit,
              dropdownItems: [
                {
                  label: "Overview",
                  href: "/admin/agents/agent-1/ai",
                  icon: Activity,
                },
              ],
            },
          ]}
        />
      </div>
    );

    const aiTrigger = screen.getByRole("button", { name: "AI" });

    fireEvent.click(aiTrigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(aiTrigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("matches dropdown items by query string when sections share one route", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/agents/agent-1/widget");
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams("section=integration") as never);

    render(
      <DetailTabs
        rootHref="/admin/agents/agent-1"
        tabs={[
          ...tabs,
          {
            label: "Widget",
            href: "/admin/agents/agent-1/widget",
            icon: Settings,
            dropdownItems: [
              {
                label: "Appearance",
                href: "/admin/agents/agent-1/widget",
                icon: Activity,
                matches: (pathname, searchParams) => (
                  pathname === "/admin/agents/agent-1/widget"
                  && !searchParams.get("section")
                ),
              },
              {
                label: "Integration",
                href: "/admin/agents/agent-1/widget?section=integration",
                icon: Settings,
                query: { section: "integration" },
              },
            ],
          },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Widget" }));

    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /Integration/ })).toHaveClass("bg-brand");
    expect(within(menu).getByLabelText("Integration selected")).toBeInTheDocument();
    expect(within(menu).queryByLabelText("Appearance selected")).not.toBeInTheDocument();
  });
});
