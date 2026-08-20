import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  useRouter: () => ({ push: vi.fn() }),
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
}));

// The header's Run button now confirms that a job started, so the layout
// reaches for the toast provider the rest of the dashboard supplies.
vi.mock("@/src/context/ToastContext", () => ({
  useToast: () => ({ showToast: vi.fn(), showErrorToast: vi.fn(), dismissToast: vi.fn(), toasts: [] }),
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
      "tabs.instructions": "Instructions",
      "tabs.interfaces": "Interfaces",
      "tabs.settings": "Settings",
      "tabs.skills": "Skills",
      "tabs.knowledge": "Knowledge",
      "tabs.memory": "Memory",
      "tabs.prompt": "Prompt",
      "tabs.rules": "Rules",
      "tabs.integrations": "Integrations",
      "tabs.schemas": "I/O Schemas",
      "tabs.logs": "Logs",
      "tabs.observability": "Observability",
      "tabs.overview": "Overview",
      "tabs.activity": "Activity",
      "tabs.rawLogs": "Raw logs",
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
  let manualRunMock: ReturnType<typeof vi.fn>;
  let cancelRunMock: ReturnType<typeof vi.fn>;
  let activeRunMock: unknown;

  beforeEach(() => {
    vi.clearAllMocks();
    manualRunMock = vi.fn().mockResolvedValue("execution_1");
    cancelRunMock = vi.fn().mockResolvedValue(true);
    activeRunMock = null;
    let mutationCallIndex = 0;
    vi.mocked(usePathname).mockReturnValue("/admin/agents/agent_1/knowledge");
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as never);
    (useQuery as unknown as QueryMock).mockImplementation((_query, args) => {
      if (args && "paginationOpts" in args) {
        return args.status === "RUNNING" && activeRunMock
          ? { page: [activeRunMock], isDone: true, continueCursor: "" }
          : { page: [], isDone: true, continueCursor: "" };
      }
      return {
        _id: "agent_1",
        name: "Support Triage Agent",
        description: "Routes support requests.",
        avatar: "",
      };
    });
    vi.mocked(useMutation).mockImplementation(() => {
      mutationCallIndex += 1;
      if (mutationCallIndex % 2 === 1) {
        return manualRunMock as never;
      }
      return cancelRunMock as never;
    });
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

    // Logs is no longer a destination of its own: it is the deepest layer of
    // Observability, reached from a job.
    expect(screen.queryByRole("link", { name: "Logs" })).not.toBeInTheDocument();

    expect(screen.queryByRole("link", { name: "Runs" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Evals" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Skills" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Knowledge" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Memory" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Prompt" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Rules" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Integrations" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "I/O Schemas" })).not.toBeInTheDocument();

    const contextTrigger = screen.getByRole("button", { name: "Context" });
    expect(contextTrigger).toHaveClass("border-brand");
    expect(contextTrigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(contextTrigger);

    let menu = screen.getByRole("menu");
    // Runs left Context when Observability was created. Context now means only
    // the things that shape the agent, not the record of what it has done.
    expect(within(menu).queryByRole("menuitem", { name: "Runs" })).not.toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Evals" })).toHaveAttribute("href", "/admin/agents/agent_1/evals");
    expect(within(menu).getByRole("menuitem", { name: "Skills" })).toHaveAttribute("href", "/admin/agents/agent_1/skills");
    expect(within(menu).getByRole("menuitem", { name: /Knowledge/ })).toHaveAttribute("href", "/admin/agents/agent_1/knowledge");
    expect(within(menu).getByRole("menuitem", { name: "Memory" })).toHaveAttribute("href", "/admin/agents/agent_1/memory");
    expect(within(menu).getByRole("menuitem", { name: /Knowledge/ })).toHaveClass("bg-brand");
    expect(within(menu).getByLabelText("Knowledge selected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Instructions" }));

    menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Prompt" })).toHaveAttribute("href", "/admin/agents/agent_1/system-prompt");
    expect(within(menu).getByRole("menuitem", { name: "Rules" })).toHaveAttribute("href", "/admin/agents/agent_1/rules");
    expect(within(menu).queryByRole("menuitem", { name: "Knowledge" })).not.toBeInTheDocument();

    // Interfaces is one screen now, so it is a plain link rather than a group.
    expect(screen.getByRole("link", { name: "Interfaces" })).toHaveAttribute("href", "/admin/agents/agent_1/interfaces");
    expect(screen.queryByRole("button", { name: "Interfaces" })).not.toBeInTheDocument();
  });

  it("keeps the header action as Run Agent when no job is active", () => {
    render(
      <AgentDashboardLayout>
        <section>Agent body</section>
      </AgentDashboardLayout>
    );

    expect(screen.getByRole("button", { name: "Run Agent" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stop Agent" })).not.toBeInTheDocument();
  });

  /**
   * The mocked agent carries no standing job, which is exactly the case that
   * used to open a "what should it do?" form instead of starting anything
   * (Anthony, 2026-08-20: *"i want it to run"*).
   */
  it("starts the agent straight away rather than asking what it should do", async () => {
    render(
      <AgentDashboardLayout>
        <section>Agent body</section>
      </AgentDashboardLayout>
    );

    fireEvent.click(screen.getByRole("button", { name: "Run Agent" }));

    await waitFor(() => {
      expect(manualRunMock).toHaveBeenCalledWith({ agentId: "agent_1" });
    });
    expect(screen.queryByText("This agent has no job of its own, so tell it what you want this time.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run it" })).not.toBeInTheDocument();
  });

  it("turns the header Run Agent action into Stop Agent for an active job", async () => {
    activeRunMock = {
      _id: "run_1",
      objective: "Collect listings",
      status: "RUNNING",
      startedAt: Date.now(),
    };

    render(
      <AgentDashboardLayout>
        <section>Agent body</section>
      </AgentDashboardLayout>
    );

    fireEvent.click(screen.getByRole("button", { name: "Stop Agent" }));

    expect(screen.getByText("This will cancel the running job and any pending approvals or tool calls. It cannot be undone."))
      .toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Stop Agent" }).at(-1)!);

    await waitFor(() => {
      expect(cancelRunMock).toHaveBeenCalledWith({
        runId: "run_1",
        reason: "Cancelled from the agent header",
      });
    });
    expect(manualRunMock).not.toHaveBeenCalled();
  });

  /**
   * The three depths of one question — is it working, what has it done, and
   * what exactly was said — live under a single heading. Built beside each other
   * they would be two screens answering the first question, and they would drift.
   */
  it("gathers the overview, the activity and the raw logs under Observability", () => {
    render(
      <AgentDashboardLayout>
        <section>Agent body</section>
      </AgentDashboardLayout>
    );

    fireEvent.click(screen.getByRole("button", { name: "Observability" }));

    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Overview" })).toHaveAttribute(
      "href",
      "/admin/agents/agent_1/observability"
    );
    expect(within(menu).getByRole("menuitem", { name: "Activity" })).toHaveAttribute(
      "href",
      "/admin/agents/agent_1/runs"
    );
    expect(within(menu).getByRole("menuitem", { name: "Raw logs" })).toHaveAttribute(
      "href",
      "/admin/agents/agent_1/logs"
    );
  });

  it.each([
    ["/admin/agents/agent_1/observability", "Overview"],
    ["/admin/agents/agent_1/runs", "Activity"],
    ["/admin/agents/agent_1/logs", "Raw logs"],
  ])("marks Observability active on %s", (pathname, expectedItem) => {
    vi.mocked(usePathname).mockReturnValue(pathname);

    render(
      <AgentDashboardLayout>
        <section>Agent body</section>
      </AgentDashboardLayout>
    );

    const trigger = screen.getByRole("button", { name: "Observability" });
    expect(trigger).toHaveClass("border-brand");

    fireEvent.click(trigger);
    expect(within(screen.getByRole("menu")).getByLabelText(`${expectedItem} selected`)).toBeInTheDocument();
  });

  /**
   * Interfaces was a dropdown over two pages — Integrations and I/O Schemas —
   * which are two halves of one question. It is a single screen now, so the tab
   * links straight to it.
   */
  it("marks the interfaces tab active on its own route", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/agents/agent_1/interfaces");

    render(
      <AgentDashboardLayout>
        <section>Agent body</section>
      </AgentDashboardLayout>
    );

    expect(screen.getByRole("link", { name: "Interfaces" })).toHaveClass("border-brand");
  });
});
