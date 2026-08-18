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
  let currentRole = "ADMIN";

  beforeEach(() => {
    currentRole = "ADMIN";
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

      return { role: currentRole };
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
      // The company's Dashboard tab was an AI usage report under a name nobody
      // looking for AI usage would open. It lives here now.
      ["AI Usage", "/admin/companies/company123/ai/usage"],
      ["Value", "/admin/companies/company123/ai/money"],
      // The wiki replaced Knowledge in this menu (wiki-replaces-knowledge
      // plan, stage three): importing and reading both live on the Wiki.
      ["Wiki", "/admin/companies/company123/ai/pages"],
      ["Unanswered", "/admin/companies/company123/ai/unanswered"],
      // Saved Answers and Memory folded into the Wiki (one-brain-plan.md,
      // phase 3); their addresses redirect there.
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
    expect(within(menu).queryByRole("menuitem", { name: /Saved Answers/ })).not.toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: /Memory/ })).not.toBeInTheDocument();

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

  it("offers Features to a platform administrator, after Widget", () => {
    currentRole = "SUPER_ADMIN";
    render(
      <CompanyDashboardLayout>
        <section>Company body</section>
      </CompanyDashboardLayout>
    );

    const features = screen.getByRole("link", { name: "Features" });
    expect(features).toHaveAttribute("href", "/admin/companies/company123/features");

    // Position matters: Anthony asked for it after Widget, and a tab row is
    // read in order.
    const tabRow = features.closest("div");
    const labels = Array.from(tabRow?.querySelectorAll("a, button") ?? []).map(
      (element) => element.textContent?.trim()
    );
    expect(labels.indexOf("Features")).toBe(labels.indexOf("Widget") + 1);
    expect(labels.at(-1)).toBe("Features");
  });

  it("does not offer Features to a workspace administrator", () => {
    // They would only find a refusal behind it — the screen locks them out too.
    render(
      <CompanyDashboardLayout>
        <section>Company body</section>
      </CompanyDashboardLayout>
    );

    expect(screen.queryByRole("link", { name: "Features" })).not.toBeInTheDocument();
  });
});
