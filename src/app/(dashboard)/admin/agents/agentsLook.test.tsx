import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, describe, it, vi } from "vitest";
import { usePaginatedQuery, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import { pagedResult } from "@/src/test/screenMocks";
import { expectApprovedLook } from "@/src/test/lookOutline";
import AgentsPage from "./page";

/**
 * Agents holds to the look drawn and liked on 2026-10-16 (Anthony: "ok ty this
 * is good"; docs/plans/active/agents-and-clarity-plan.md, Part 5; the board in
 * docs/plans/assets/agents-and-clarity/): rendered with sample agents in
 * English, read as the outline saved beside the board.
 */

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/agents",
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());

const agent = (id: string, name: string, systemKey?: string) => ({ _id: id, name, description: `${name}'s work.`, modelId: "m", isActive: true, ...(systemKey ? { systemKey } : {}) });
const AGENTS = [
  agent("a1", "Search Console: Collector Agent", "SEARCH_CONSOLE_COLLECTOR"),
  agent("a2", "Insights: Editor", "INSIGHTS_EDITOR"),
  agent("a3", "The Hakken Watcher Agent", "HAKKEN_WATCHER"),
  agent("a4", "Nightly report"),
];

afterEach(cleanup);

describe("Agents' approved look", () => {
  it("Agents, filters down the left", async () => {
    vi.mocked(usePaginatedQuery).mockImplementation((() => pagedResult(AGENTS)) as never);
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "agents:getAgentFilterCounts": { total: 4, capped: false, what: { all: 4, collect: 1, insights: 1, tasks: 1, own: 1 }, when: { all: 4, schedule: 2, team: 1, asked: 1 }, status: { all: 4, active: 4 } },
      "scheduler:getSchedules": [{ _id: "s1", name: "Search Console", agentId: "a1", intervalStr: "daily", isActive: true, createdAt: 1 }],
      "aiModels:getActiveModels": [],
      "agents:getInheritedAgentModels": { agent: { modelId: "m", providerKey: "google", displayName: "Gemini 3.8 Flash" }, workflow: null },
      "agentRuns:getWorkingAgentIds": [],
    }));
    const { container } = render(<AgentsPage />);
    await screen.findByText("Insights: Editor");
    await expectApprovedLook(container, "agents-and-clarity", "Agents", "Admin → Agents");
  });
});
