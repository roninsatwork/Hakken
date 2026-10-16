import React from "react";
import { render as renderBare, fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import AgentsPage from "./page";

import { ToastProvider } from "@/src/context/ToastContext";

/**
 * Agents (agents-and-clarity-plan.md, Part 5; drawn and liked 2026-10-16): the
 * filters down the left with their counts, the list's work and Runs read from
 * each agent's role and schedule, the model it really runs, delete only where a
 * person made the agent, and an exact total — "Showing 1–15 of 15" beside
 * "Page 1 of 2" before.
 */

// The screen reports failures through the house action runner, which reads
// the toast context the root layout always supplies.
const render = (ui: Parameters<typeof renderBare>[0]) => renderBare(ui, { wrapper: ToastProvider });

const address = vi.hoisted(() => ({ search: "" }));

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
  usePaginatedQuery: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/agents",
  useSearchParams: () => new URLSearchParams(address.search),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (key === "table.showing") return `Showing ${values?.start}–${values?.end} of ${values?.total}`;
    if (key === "table.platformDefaultNotSet") return "Platform default · none set";
    return key;
  },
}));

const activeModels = [
  { _id: "model_default", modelId: "platform-agent-model", friendlyName: "Platform Agent Model", displayName: "Platform Agent Model", providerKey: "google", isEnabled: true },
  { _id: "model_pinned", modelId: "pinned-agent-model", friendlyName: "Pinned Agent Model", displayName: "Pinned Agent Model", providerKey: "google", isEnabled: true },
];

const made = [
  // The state that once made the model column lie: a stored model left over from before
  // the agent was set to follow the platform default.
  { _id: "agent_inheriting", name: "Inheriting Agent", description: "Follows the platform default.", modelId: "retired-agent-model", modelSelectionMode: "inherit", isActive: true },
  // Older still — no mode stored at all, which the runtime treats as inherit.
  { _id: "agent_unset", name: "Older Agent", description: "No mode stored.", modelId: "retired-agent-model", isActive: false },
  { _id: "agent_override", name: "Pinned Agent", description: "Has a model of its own.", modelId: "pinned-agent-model", modelSelectionMode: "override", isActive: true },
];
const roles = [
  { _id: "agent_sc", name: "Search Console: Collector Agent", description: "Collects daily.", modelId: "x", systemKey: "SEARCH_CONSOLE_COLLECTOR", isActive: true },
  { _id: "agent_watcher", name: "The Hakken Watcher Agent", description: "Checks alerts.", modelId: "x", systemKey: "HAKKEN_WATCHER", isActive: true },
  { _id: "agent_editor", name: "Insights: Editor", description: "Checks every figure.", modelId: "x", systemKey: "INSIGHTS_EDITOR", isActive: true },
];
const schedules = [{ _id: "s1", name: "Search Console", agentId: "agent_sc", intervalStr: "daily", isActive: false, createdAt: 1, targetName: "Search Console: Collector Agent" }];

let agents: Array<Record<string, unknown>> = [...made, ...roles];
let counts: { total: number; capped: boolean; what: Record<string, number>; when: Record<string, number>; status: Record<string, number> } = {
  total: 6, capped: false,
  what: { all: 6, collect: 1, insights: 1, tasks: 1, own: 3 },
  when: { all: 6, schedule: 2, team: 1, asked: 3 },
  status: { all: 6, active: 5, working: 1, draft: 1 },
};

const inheritedModels = {
  agent: { modelId: "platform-agent-model", providerKey: "google", displayName: "Platform Agent Model" },
  workflow: null,
};

const rowOf = (name: string) => screen.getByText(name).closest("tr") as HTMLElement;

describe("Agents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    address.search = "";
    agents = [...made, ...roles];
    // The server narrows and pages the list (`getPaginatedAgents`); here it answers as the filters in the address ask.
    vi.mocked(usePaginatedQuery).mockImplementation(((_query: unknown, args: { what?: string }) => ({
      results: args.what === "insights" ? agents.filter((agent) => String(agent.systemKey ?? "").startsWith("INSIGHTS_")) : agents,
      status: "Exhausted",
      loadMore: vi.fn(),
      isLoading: false,
    })) as unknown as typeof usePaginatedQuery);
    vi.mocked(useQuery).mockImplementation((...args: Parameters<typeof useQuery>) => {
      const path = getFunctionName(args[0]);
      if (path === "agents:getAgentFilterCounts") return counts as unknown as ReturnType<typeof useQuery>;
      if (path === "scheduler:getSchedules") return schedules as unknown as ReturnType<typeof useQuery>;
      if (path === "aiModels:getActiveModels") return activeModels as unknown as ReturnType<typeof useQuery>;
      if (path === "agents:getInheritedAgentModels") return inheritedModels as unknown as ReturnType<typeof useQuery>;
      if (path === "agentRuns:getWorkingAgentIds") return ["agent_watcher"] as unknown as ReturnType<typeof useQuery>;
      return undefined as unknown as ReturnType<typeof useQuery>;
    });
    vi.mocked(useMutation).mockReturnValue(vi.fn() as unknown as ReturnType<typeof useMutation>);
  });

  /**
   * The column once printed `agent.modelId` whatever the agent's mode was. The
   * runtime only applies an agent's own model when the mode is "override", so
   * every inheriting agent was listed against a leftover value.
   */
  it("never shows a stored model for an agent that follows the platform default, and shows its own for one that has one", () => {
    render(<AgentsPage />);
    expect(screen.queryByText(/retired-agent-model/)).not.toBeInTheDocument();
    expect(within(rowOf("Inheriting Agent")).getByText("Platform Agent Model")).toBeInTheDocument();
    expect(within(rowOf("Inheriting Agent")).getByText("table.platformDefault")).toBeInTheDocument();
    expect(within(rowOf("Pinned Agent")).getByText("Pinned Agent Model")).toBeInTheDocument();
    expect(within(rowOf("Pinned Agent")).queryByText("table.platformDefault")).not.toBeInTheDocument();
  });

  it("says what each agent does and when it runs: its schedule, its timer, the team's run, or when someone asks", () => {
    render(<AgentsPage />);
    expect(within(rowOf("Search Console: Collector Agent")).getByText("what.collect")).toBeInTheDocument();
    // The collector's schedule row is paused, and says so.
    expect(within(rowOf("Search Console: Collector Agent")).getByText("runs.paused")).toBeInTheDocument();
    expect(within(rowOf("The Hakken Watcher Agent")).getByText("runs.everyMinutes")).toBeInTheDocument();
    expect(within(rowOf("The Hakken Watcher Agent")).getByText("table.working")).toBeInTheDocument();
    expect(within(rowOf("Insights: Editor")).getByText("runs.team")).toBeInTheDocument();
    expect(within(rowOf("Pinned Agent")).getByText("what.own")).toBeInTheDocument();
    expect(within(rowOf("Pinned Agent")).getByText("runs.asked")).toBeInTheDocument();
  });

  it("offers delete only on an agent a person made: one holding a role is switched off, never deleted", async () => {
    render(<AgentsPage />);
    expect(within(rowOf("Search Console: Collector Agent")).queryByRole("button", { name: "buttons.delete" })).not.toBeInTheDocument();
    fireEvent.click(within(rowOf("Pinned Agent")).getByRole("button", { name: "buttons.delete" }));
    expect(await screen.findByText("modal.deleteConfirm")).toBeInTheDocument();
    expect(screen.getByText("modal.undone")).toBeInTheDocument();
  });

  it("asks the server for the choices in the address, lights them, and shows each choice's count", () => {
    address.search = "what=insights";
    counts = { ...counts, total: 1, when: { all: 1, team: 1 } };
    render(<AgentsPage />);
    expect(vi.mocked(usePaginatedQuery).mock.calls.at(-1)?.[1]).toMatchObject({ what: "insights" });
    expect(screen.getByText("Insights: Editor")).toBeInTheDocument();
    expect(screen.queryByText("Pinned Agent")).not.toBeInTheDocument();
    const menu = screen.getByRole("navigation", { name: "filters.label" });
    expect(within(menu).getByRole("link", { name: /what\.insights/ })).toHaveAttribute("aria-current", "true");
    expect(within(menu).getByRole("link", { name: /what\.all/ })).toHaveTextContent("6");
    expect(within(menu).getByRole("link", { name: /when\.team/ })).toHaveTextContent("1");
    expect(within(menu).getByRole("link", { name: /when\.schedule/ })).toHaveTextContent("0");
    expect(within(menu).getByRole("link", { name: /what\.collect/ })).toHaveAttribute("href", "/admin/agents?what=collect");
    // The table's bar names what it lists.
    expect(screen.getByRole("heading", { name: "what.insights" })).toBeInTheDocument();
  });

  it("lists 15 a page and says the exact total, from the server's count", () => {
    agents = Array.from({ length: 20 }, (_, at) => ({ _id: `agent_${at}`, name: `Agent ${String(at).padStart(2, "0")}`, modelId: "x", isActive: true }));
    counts = { ...counts, total: 20 };
    render(<AgentsPage />);
    expect(screen.getByText("Showing 1–15 of 20")).toBeInTheDocument();
    expect(screen.getAllByRole("row").filter((row) => within(row).queryByText(/^Agent \d+$/))).toHaveLength(15);
  });
});
