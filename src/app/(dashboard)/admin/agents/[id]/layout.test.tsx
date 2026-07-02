import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useMutation, useQuery } from "convex/react";
import { usePathname, useSearchParams } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AgentDashboardLayout from "./layout";

type QueryMock = {
  mockImplementation: (implementation: (_query: unknown, args?: Record<string, unknown>) => unknown) => void;
};

vi.mock("convex/react", () => ({
  useMutation: vi.fn(() => vi.fn()),
  useQuery: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "agent_1" }),
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const labels: Record<string, string> = {
      "tabs.dashboard": "Dashboard",
      "tabs.runs": "Runs",
      "tabs.evals": "Evals",
      "tabs.context": "Context",
      "tabs.governance": "Governance",
      "tabs.interfaces": "Interfaces",
      "tabs.settings": "Settings",
      "tabs.skills": "Skills",
      "tabs.knowledge": "Knowledge",
      "tabs.memory": "Memory",
      "tabs.prompt": "Prompt",
      "tabs.rules": "AI Rules",
      "tabs.integrations": "Integrations",
      "tabs.schemas": "I/O Schemas",
      "tabs.logs": "Logs",
      backButton: "Back to Agents",
      loading: "Loading agent...",
      noDescription: "No description provided.",
      notFound: "Agent not found",
      unnamed: "Unnamed Agent",
    };

    return (key: string) => labels[key] ?? key;
  },
}));

describe("AgentDashboardLayout navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePathname).mockReturnValue("/admin/agents/agent_1/knowledge");
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as never);
    (useQuery as unknown as QueryMock).mockImplementation(() => ({
      _id: "agent_1",
      name: "Support Triage Agent",
      description: "Routes support requests.",
      avatar: "",
    }));
    vi.mocked(useMutation).mockReturnValue(vi.fn() as never);
  });

  it("groups dense agent sections into secondary dropdown tabs", () => {
    render(
      <AgentDashboardLayout>
        <section>Agent body</section>
      </AgentDashboardLayout>
    );

    expect(screen.getByRole("heading", { name: "Support Triage Agent" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/admin/agents/agent_1");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/admin/agents/agent_1/settings");
    expect(screen.getByRole("link", { name: "Logs" })).toHaveAttribute("href", "/admin/agents/agent_1/logs");

    expect(screen.queryByRole("link", { name: "Runs" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Evals" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Skills" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Knowledge" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Memory" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Prompt" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "AI Rules" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Integrations" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "I/O Schemas" })).not.toBeInTheDocument();

    const contextTrigger = screen.getByRole("button", { name: "Context" });
    expect(contextTrigger).toHaveClass("border-brand");
    expect(contextTrigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(contextTrigger);

    let menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Runs" })).toHaveAttribute("href", "/admin/agents/agent_1/runs");
    expect(within(menu).getByRole("menuitem", { name: "Evals" })).toHaveAttribute("href", "/admin/agents/agent_1/evals");
    expect(within(menu).getByRole("menuitem", { name: "Skills" })).toHaveAttribute("href", "/admin/agents/agent_1/skills");
    expect(within(menu).getByRole("menuitem", { name: /Knowledge/ })).toHaveAttribute("href", "/admin/agents/agent_1/knowledge");
    expect(within(menu).getByRole("menuitem", { name: "Memory" })).toHaveAttribute("href", "/admin/agents/agent_1/memory");
    expect(within(menu).getByRole("menuitem", { name: /Knowledge/ })).toHaveClass("bg-brand");
    expect(within(menu).getByLabelText("Knowledge selected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Governance" }));

    menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Prompt" })).toHaveAttribute("href", "/admin/agents/agent_1/system-prompt");
    expect(within(menu).getByRole("menuitem", { name: "AI Rules" })).toHaveAttribute("href", "/admin/agents/agent_1/rules");
    expect(within(menu).queryByRole("menuitem", { name: "Knowledge" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Interfaces" }));

    menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Integrations" })).toHaveAttribute("href", "/admin/agents/agent_1/integrations");
    expect(within(menu).getByRole("menuitem", { name: "I/O Schemas" })).toHaveAttribute("href", "/admin/agents/agent_1/schemas");
    expect(within(menu).queryByRole("menuitem", { name: "AI Rules" })).not.toBeInTheDocument();
  });

  it("marks interface child routes active through the grouped trigger", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/agents/agent_1/schemas");

    render(
      <AgentDashboardLayout>
        <section>Agent body</section>
      </AgentDashboardLayout>
    );

    const interfacesTrigger = screen.getByRole("button", { name: "Interfaces" });
    expect(interfacesTrigger).toHaveClass("border-brand");

    fireEvent.click(interfacesTrigger);

    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /I\/O Schemas/ })).toHaveClass("bg-brand");
    expect(within(menu).getByLabelText("I/O Schemas selected")).toBeInTheDocument();
  });
});
