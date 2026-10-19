import { cleanup, fireEvent, renderWithProviders as render, screen, waitFor, within } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";

import { AutoSetupScreen } from "./AutoSetupScreen";

/**
 * Auto Setup's own page under Setup (docs/plans/active/auto-setup-plan.md,
 * boards 1–3 as redrawn on 2026-10-19): the page's orange Run Auto Setup, one
 * box saying what is empty and a run's limits — or how far it has got, or what
 * it cost and left for a person — and every setup box, with who filled it.
 */

const { push, start } = vi.hoisted(() => ({ push: vi.fn(), start: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));
vi.mock("next/navigation", async () => ({
  ...(await import("@/src/test/screenMocks")).nextNavigation({ id: "company_nec" }),
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

const COMPANY = "company_nec" as never;
const LIMITS = { pages: 6, webSearches: 10, searches: 25, questions: 10, runCapUsd: 2, dayCapUsd: 10 };
const company = (profile: string) => ({ id: "company_nec", kind: "COMPANY", name: "National Extension College", against: null, names: "NONE", namesCount: 0, profile, searches: "NONE", searchesCount: 0, questions: "NONE", questionsCount: 0, countries: "NONE" });
const own = (state: string, counts = { names: 0, searches: 0, questions: 0 }) => ({
  id: "hold_own", kind: "OWN", name: "nec.ac.uk", against: null,
  names: state, namesCount: counts.names, profile: state, searches: state, searchesCount: counts.searches, questions: state, questionsCount: counts.questions, countries: state,
});
const rival = (host: string, names: string) => ({ id: host, kind: "RIVAL", name: host, against: "nec.ac.uk", names, namesCount: 0, profile: "NONE", searches: "NONE", searchesCount: 0, questions: "NONE", questionsCount: 0, countries: "NONE" });

const showing = (status: unknown) => vi.mocked(useQuery).mockReturnValue(status as never);
const noticeText = () => screen.queryAllByRole("status").map((notice) => notice.textContent ?? "").join(" | ");
const rowOf = (name: string) => screen.getByText(name).closest("tr") as HTMLElement;

beforeEach(() => {
  push.mockReset();
  start.mockReset().mockResolvedValue("STARTED");
  vi.mocked(useMutation).mockImplementation((() => start) as never);
});
afterEach(cleanup);

describe("Auto Setup's page", () => {
  it("says what is empty and what a run does at most, lists every box, and starts from its header", async () => {
    showing({ readiness: "ON", agentId: "agent_1", rows: [company("EMPTY"), own("EMPTY"), rival("wolseyhalloxford.org.uk", "EMPTY"), rival("academy21.co.uk", "EMPTY")], limits: LIMITS, run: null });
    render(<AutoSetupScreen companyId={COMPANY} />);

    expect(noticeText()).toContain("8 boxes are empty: nec.ac.uk's names, profile, Google searches, AI questions and home countries, the company's description and 2 rivals' names.");
    expect(noticeText()).toContain("It stops at $2.00 a run and $10.00 a day, set in Agents.");
    expect(within(rowOf("nec.ac.uk")).getAllByText("Empty")).toHaveLength(5);
    expect(within(rowOf("wolseyhalloxford.org.uk")).getByText("Rival of nec.ac.uk")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Run Auto Setup" }));
    await waitFor(() => expect(start).toHaveBeenCalledWith({ companyId: COMPANY }));
    expect(await screen.findByText("Auto Setup has started.")).toBeInTheDocument();
  });

  it("while it works, says how far it has got and what it is doing now, with a bar that moves with each piece of work", () => {
    showing({
      readiness: "ON", agentId: "agent_1",
      rows: [company("HAKKEN"), own("HAKKEN", { names: 3, searches: 0, questions: 0 }), rival("wolseyhalloxford.org.uk", "WRITING")],
      limits: LIMITS,
      run: {
        status: "WORKING", total: 9, done: 0, pieces: 16, piecesDone: 6,
        doing: { what: "RANKINGS", host: "wolseyhalloxford.org.uk", at: 3, of: 8 },
        finishedAt: null, stopped: null, agentRunId: "run_1", costUsd: 0.2, forPerson: [],
      },
    });
    render(<AutoSetupScreen companyId={COMPANY} />);

    expect(screen.getByRole("button", { name: "Working: 0 of 9 done" })).toBeDisabled();
    expect(noticeText()).toContain("Auto Setup is working: 0 of 9 websites done.");
    expect(noticeText()).toContain("Now: looking up wolseyhalloxford.org.uk's Google rankings (3 of 8).");
    // Still on its first website, the bar has moved: 6 of its 16 pieces of work are done.
    const bar = screen.getAllByRole("status")[0].querySelector("[aria-hidden] > span") as HTMLElement;
    expect(bar.style.width).toBe("37.5%");
    expect(within(rowOf("wolseyhalloxford.org.uk")).getByText("Writing")).toBeInTheDocument();
    expect(within(rowOf("nec.ac.uk")).getByText("3 by Hakken")).toBeInTheDocument();
  });

  it("says each thing it does in words", () => {
    const saying = (doing: unknown) => {
      showing({ readiness: "ON", agentId: "agent_1", rows: [own("WRITING")], limits: LIMITS, run: { status: "WORKING", total: 2, done: 0, pieces: 9, piecesDone: 1, doing, finishedAt: null, stopped: null, agentRunId: "run_1", costUsd: 0, forPerson: [] } });
      const { unmount } = render(<AutoSetupScreen companyId={COMPANY} />);
      const said = noticeText();
      unmount();
      return said.slice(said.indexOf("Now: "));
    };
    expect(saying({ what: "READ_PAGES", host: "nec.ac.uk", at: null, of: null })).toBe("Now: reading nec.ac.uk's pages.");
    expect(saying({ what: "SEARCH_ASKS", host: "nec.ac.uk", at: null, of: null })).toBe("Now: searching the web for what nec.ac.uk's customers ask.");
    expect(saying({ what: "WRITE_PROFILE", host: "nec.ac.uk", at: null, of: null })).toBe("Now: writing nec.ac.uk's names, profile and home countries.");
    expect(saying({ what: "NAME_RIVALS", host: null, at: null, of: 8 })).toBe("Now: naming 8 rivals.");
  });

  it("once done, says when, what it cost and what is left for a person, and opens its run", () => {
    showing({
      readiness: "ON", agentId: "agent_1",
      rows: [company("HAKKEN"), own("HAKKEN", { names: 3, searches: 25, questions: 10 }), rival("academy21.co.uk", "PERSON")],
      limits: LIMITS,
      run: { status: "DONE", total: 2, done: 2, finishedAt: Date.UTC(2026, 9, 19, 15, 42), stopped: null, agentRunId: "run_1", costUsd: 0.35, forPerson: ["COLLECTION", "SEARCH_CONSOLE"] },
    });
    render(<AutoSetupScreen companyId={COMPANY} />);

    expect(noticeText()).toMatch(/Finished at \d\d:\d\d for \$0\.35\. Still for a person: switch collection on in Schedules and connect Search Console\./);
    expect(within(rowOf("academy21.co.uk")).getByText("Filled")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "See its run" }));
    expect(push).toHaveBeenCalledWith("/admin/agents/agent_1/observability/run_1");
  });

  it("cannot start while switched off in Agents, and says so", () => {
    showing({ readiness: "AGENT_OFF", agentId: "agent_1", rows: [company("EMPTY"), own("EMPTY")], limits: LIMITS, run: null });
    render(<AutoSetupScreen companyId={COMPANY} />);

    expect(noticeText()).toMatch(/switched off in Agents, so it can't start/);
    expect(screen.getByRole("button", { name: "Run Auto Setup" })).toBeDisabled();
  });

  it("says why its last run stopped", () => {
    showing({ readiness: "ON", agentId: "agent_1", rows: [company("EMPTY"), own("EMPTY")], limits: LIMITS, run: { status: "STOPPED", total: 2, done: 0, finishedAt: 1, stopped: "Auto Setup reached its spend cap for a run, so it stopped.", agentRunId: "run_1", costUsd: 2, forPerson: [] } });
    render(<AutoSetupScreen companyId={COMPANY} />);

    expect(noticeText()).toContain("Auto Setup stopped: Auto Setup reached its spend cap for a run, so it stopped.");
  });

  it("with every box filled and no run yet, says there is nothing to write", () => {
    showing({ readiness: "ON", agentId: null, rows: [company("PERSON"), own("PERSON")], limits: LIMITS, run: null });
    render(<AutoSetupScreen companyId={COMPANY} />);

    expect(noticeText()).toMatch(/Every setup box is filled, so there is nothing for Auto Setup to write/);
  });
});
