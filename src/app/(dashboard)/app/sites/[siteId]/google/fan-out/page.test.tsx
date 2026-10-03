import { act, fireEvent, renderWithProviders as render, screen, within } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import SiteTrackedFanOutPage from "./page";

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn(), push: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
// The shared mock, with the values a wording is given written after its key.
vi.mock("next-intl", async () => {
  const base = (await import("@/src/test/screenMocks")).nextIntl();
  return {
    ...base,
    useTranslations: (namespace: string) => {
      const t = (key: string, values?: Record<string, unknown>) => [`${namespace}.${key}`, ...Object.values(values ?? {})].join(" ");
      return Object.assign(t, { rich: t });
    },
  };
});
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/sites/site_1/google/fan-out",
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: nav.replace, push: nav.push, back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

const PROMPT = "who are good ai consultants for my SME in London, UK";

/** A tracked search as Your searches reads it. */
function standing(keyword: string, fromFanOut: boolean, lastPosition: number | null, verdict: string, isActive = true) {
  return {
    keyword, isActive, fromFanOut, verdict, lastPosition, previousPosition: lastPosition, bestPosition: lastPosition,
    firstCheckedDay: "2026-09-20", lastCheckedDay: "2026-09-29",
  };
}

/** What the assistants did with a tracked fan-out query: ronins.co.uk's, as drawn on 2026-10-03. */
function fanOut(keyword: string, queryText: string, engines: string[], timesSeen: number | null, prompt: string | null = PROMPT) {
  return { keyword, queryText, prompt, engines, timesSeen };
}

const STANDINGS = [
  standing("web design surrey", false, 1, "TOP_THREE"),
  standing("ai consultants for smes in london uk", true, 8, "PAGE_ONE"),
  standing("ai automation agency london uk", true, 2, "TOP_THREE"),
  standing("ai automation agencies in london uk", true, null, "NEVER_RANKED"),
  standing("chatbot builders london", true, 4, "PAGE_ONE", false),
];

const FAN_OUT = {
  rows: [
    fanOut("ai consultants for smes in london uk", "AI consultants for SMEs in London UK", ["chatgpt", "claude", "perplexity"], 4),
    fanOut("ai automation agency london uk", "AI automation agency London UK", ["claude", "perplexity"], 3),
    fanOut("ai automation agencies in london uk", "AI automation agencies in London UK", ["chatgpt"], 2),
  ],
  own: true,
  tracking: { count: 3, limit: 200 },
};

function open(answers: { standings?: unknown; fanOut?: unknown } = {}) {
  const track = vi.fn(async () => null);
  vi.mocked(useMutation).mockReturnValue(track as never);
  vi.mocked(useQuery).mockImplementation(answerQueries({
    "sites:getMySite": { host: "ronins.co.uk", placeLabel: "United Kingdom", counts: {} },
    "siteGoogle:listSearches": answers.standings ?? STANDINGS,
    "siteAngles:listTrackedFanOut": answers.fanOut ?? FAN_OUT,
  }));
  render(<SiteTrackedFanOutPage />);
  return track;
}

/** The table's rows, under its heading row. */
const bodyRows = () => screen.getAllByRole("row").slice(1);

/**
 * Tracked fan-out queries (Anthony, 2026-10-03): the fan-out queries ticked to
 * check on Google every run, as Your searches draws its searches, with the
 * assistants that ran each and how often.
 */
describe("the Tracked fan-out queries page", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    nav.push.mockClear();
    nav.search = "";
  });

  it("lists only the running searches ticked from fan-out queries, best position first, with who asked and how often", () => {
    open();

    const rows = bodyRows();
    expect(rows).toHaveLength(3);
    // Best position first; one not in the top 100 last.
    expect(rows[0]).toHaveTextContent("AI automation agency London UK");
    expect(rows[1]).toHaveTextContent("AI consultants for SMEs in London UK");
    expect(rows[2]).toHaveTextContent("AI automation agencies in London UK");
    // A search typed in, and one paused, are Your searches' alone.
    expect(screen.queryByText("web design surrey")).not.toBeInTheDocument();
    expect(screen.queryByText("chatbot builders london")).not.toBeInTheDocument();

    expect(within(rows[1]).getByText("aiEngines.chatgpt, aiEngines.claude, aiEngines.perplexity")).toBeInTheDocument();
    expect(within(rows[1]).getByText("4")).toBeInTheDocument();
    expect(within(rows[0]).getByText("aiEngines.claude, aiEngines.perplexity")).toBeInTheDocument();

    expect(screen.getByText("ui.tableBar.fanOutQueries 3")).toBeInTheDocument();
    expect(screen.getByText(/sites\.aiSearched\.trackedCount 3 200/)).toBeInTheDocument();
    expect(screen.getByText("sites.trackedFanOut.description United Kingdom")).toBeInTheDocument();
  });

  it("says how each is doing in Your searches' words", () => {
    open();

    const rows = bodyRows();
    expect(within(rows[0]).getByText("sites.googleSearches.verdicts.TOP_THREE")).toBeInTheDocument();
    expect(within(rows[1]).getByText("sites.googleSearches.verdicts.PAGE_ONE")).toBeInTheDocument();
    expect(within(rows[2]).getByText("sites.googleSearches.verdicts.NEVER_RANKED")).toBeInTheDocument();
    expect(within(rows[2]).getByText("sites.common.notOnPageOne")).toBeInTheDocument();
  });

  it("unticks one by its question and words, without opening it", async () => {
    const track = open();

    await act(async () => {
      fireEvent.click(screen.getByLabelText(/sites\.aiSearched\.untrackLabel AI automation agency London UK/));
    });
    expect(track).toHaveBeenCalledWith({ siteId: "site_1", prompt: PROMPT, queries: ["ai automation agency london uk"], track: false });
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("cannot untick one no question lists any more", () => {
    open({ fanOut: { ...FAN_OUT, rows: [fanOut("ai automation agency london uk", "AI automation agency London UK", [], null, null), ...FAN_OUT.rows.slice(0, 1)] } });
    expect(screen.getByLabelText(/untrackLabel AI automation agency London UK/)).toBeDisabled();
    expect(screen.getByLabelText(/untrackLabel AI consultants/)).not.toBeDisabled();
  });

  it("shows no tick on a competitor, which tracks nothing of its own", () => {
    open({ fanOut: { ...FAN_OUT, own: false, tracking: null } });
    expect(bodyRows()).toHaveLength(3);
    expect(screen.queryByLabelText(/untrackLabel/)).not.toBeInTheDocument();
    expect(screen.queryByText(/trackedCount/)).not.toBeInTheDocument();
  });

  it("opens a query's own screen with the way back to this page", () => {
    nav.search = "verdict=TOP_THREE";
    open();

    const link = screen.getByRole("link", { name: "AI automation agency London UK" });
    const href = new URL(link.getAttribute("href") ?? "", "https://app.test");
    expect(href.pathname).toBe("/app/sites/site_1/keywords/keyword");
    expect(href.searchParams.get("keyword")).toBe("ai automation agency london uk");
    expect(href.searchParams.get("back")).toBe("/app/sites/site_1/google/fan-out?verdict=TOP_THREE");

    fireEvent.click(bodyRows()[0]);
    expect(nav.push).toHaveBeenCalledWith(expect.stringContaining("back=%2Fapp%2Fsites%2Fsite_1%2Fgoogle%2Ffan-out"));
  });

  it("says so when no fan-out query is ticked", () => {
    open({ standings: [standing("web design surrey", false, 1, "TOP_THREE")], fanOut: { ...FAN_OUT, rows: [], tracking: { count: 0, limit: 200 } } });

    expect(screen.getByText("sites.trackedFanOut.empty")).toBeInTheDocument();
    expect(screen.getByText("ui.tableBar.fanOutQueries 0")).toBeInTheDocument();
  });
});
