import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useQuery } from "convex/react";
import { INSIGHT_RUN_STAGES } from "@/convex/utils/insightRunStages";
import { InsightsRefreshNotice } from "./InsightsRefreshNotice";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), usePathname: () => "/app/insights" }));
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));
afterEach(cleanup);

const run = { siteId: "site", host: "morehandles.co.uk", status: "RUNNING", updatedAt: Date.parse("2026-10-26T12:00:00Z"), recorded: true, stages: INSIGHT_RUN_STAGES.map((stage) => ({ stage, status: "SUCCESS" })) };

describe("whole-section refresh wording", () => {
  test("shows continuing work even when other sections have finished", () => {
    vi.mocked(useQuery).mockReturnValue([{ ...run, stages: run.stages.map((stage) => stage.stage === "Page reviews" ? { ...stage, status: "PENDING" } : stage) }]);
    render(<InsightsRefreshNotice />);
    expect(screen.getByRole("status")).toHaveTextContent(`13 of 14 sections complete`);
    expect(screen.getByRole("status")).toHaveTextContent("Completed results remain available");
  });
  test("a run labelled successful still names its unfinished section", () => {
    vi.mocked(useQuery).mockReturnValue([{ ...run, status: "SUCCESS", stages: run.stages.map((stage) => stage.stage === "Page reviews" ? { ...stage, status: "FAILED" } : stage) }]);
    render(<InsightsRefreshNotice />);
    expect(screen.getByRole("status")).toHaveTextContent("has not fully refreshed. Unfinished: page reviews");
  });
  test("only a finished run with every required stage gets the completion message", () => {
    vi.mocked(useQuery).mockReturnValue([{ ...run, status: "SUCCESS" }]);
    render(<InsightsRefreshNotice />);
    expect(screen.getByRole("status")).toHaveTextContent("all sections refreshed");
  });
  test("older runs without section outcomes do not claim a verified refresh", () => {
    vi.mocked(useQuery).mockReturnValue([{ ...run, status: "SUCCESS", recorded: false, stages: [] }]);
    render(<InsightsRefreshNotice />);
    expect(screen.getByRole("status")).toHaveTextContent("has no complete record");
  });
});
