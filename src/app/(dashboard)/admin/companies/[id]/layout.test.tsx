import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useQuery } from "convex/react";
import { usePathname, useSearchParams } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CompanyDashboardLayout from "./layout";

type QueryMock = {
  mockImplementation: (implementation: (_query: unknown, args?: Record<string, unknown>) => unknown) => void;
};

vi.mock("convex/react", () => ({
  useMutation: vi.fn(() => vi.fn()),
  useQuery: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "company123" }),
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("CompanyDashboardLayout navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePathname).mockReturnValue("/admin/companies/company123/ai/models");
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as never);
    (useQuery as unknown as QueryMock).mockImplementation((_query, args) => {
      if (args?.id === "company123") {
        return {
          _id: "company123",
          name: "Ronins Website",
          description: "Ronins Website Knowledge",
        };
      }

      return { role: "ADMIN" };
    });
  });

  it("uses an AI dropdown in the company workspace tab row", () => {
    render(
      <CompanyDashboardLayout>
        <section>Company body</section>
      </CompanyDashboardLayout>
    );

    expect(screen.getByRole("heading", { name: "Ronins Website Workspace" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "AI" })).not.toBeInTheDocument();

    const aiTrigger = screen.getByRole("button", { name: "AI" });
    expect(aiTrigger).toHaveClass("border-brand");
    expect(aiTrigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(aiTrigger);

    const menu = screen.getByRole("menu");
    const expectedItems = [
      ["Overview", "/admin/companies/company123/ai"],
      ["Knowledge", "/admin/companies/company123/ai/knowledge"],
      ["Memory", "/admin/companies/company123/ai/memory"],
      ["Skills", "/admin/companies/company123/ai/skills"],
      ["Prompt", "/admin/companies/company123/ai/prompt"],
      ["AI Rules", "/admin/companies/company123/ai/rules"],
      ["AI Models", "/admin/companies/company123/ai/models"],
      ["Evals", "/admin/companies/company123/ai/evals"],
      ["Chat Logs", "/admin/companies/company123/ai/chat-logs"],
    ];

    for (const [label, href] of expectedItems) {
      expect(within(menu).getByRole("menuitem", { name: new RegExp(label) })).toHaveAttribute("href", href);
    }

    expect(within(menu).getByRole("menuitem", { name: /AI Models/ })).toHaveClass("bg-brand");
    expect(within(menu).getByLabelText("AI Models selected")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /AI section/i })).not.toBeInTheDocument();
  });

  it("uses dropdowns for directory and widget sections too", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/companies/company123/widget");
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams("section=integration") as never);

    render(
      <CompanyDashboardLayout>
        <section>Company body</section>
      </CompanyDashboardLayout>
    );

    expect(screen.queryByRole("link", { name: "Directory" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Widget" })).not.toBeInTheDocument();

    const directoryTrigger = screen.getByRole("button", { name: "Directory" });
    fireEvent.click(directoryTrigger);

    let menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Directory" })).toHaveAttribute(
      "href",
      "/admin/companies/company123/directory/users"
    );
    expect(within(menu).getByRole("menuitem", { name: "Invites" })).toHaveAttribute(
      "href",
      "/admin/companies/company123/directory/invites"
    );

    fireEvent.keyDown(document, { key: "Escape" });

    const widgetTrigger = screen.getByRole("button", { name: "Widget" });
    expect(widgetTrigger).toHaveClass("border-brand");

    fireEvent.click(widgetTrigger);
    menu = screen.getByRole("menu");

    expect(within(menu).getByRole("menuitem", { name: "Appearance" })).toHaveAttribute(
      "href",
      "/admin/companies/company123/widget"
    );
    expect(within(menu).getByRole("menuitem", { name: "Welcome Screen" })).toHaveAttribute(
      "href",
      "/admin/companies/company123/widget?section=welcome-screen"
    );
    expect(within(menu).getByRole("menuitem", { name: "Conversation Starters" })).toHaveAttribute(
      "href",
      "/admin/companies/company123/widget?section=conversation-starters"
    );
    expect(within(menu).getByRole("menuitem", { name: "Greeting" })).toHaveAttribute(
      "href",
      "/admin/companies/company123/widget?section=greeting"
    );
    expect(within(menu).getByRole("menuitem", { name: /Integration/ })).toHaveAttribute(
      "href",
      "/admin/companies/company123/widget?section=integration"
    );
    expect(within(menu).getByRole("menuitem", { name: /Integration/ })).toHaveClass("bg-brand");
    expect(within(menu).getByLabelText("Integration selected")).toBeInTheDocument();
  });
});
