import { act, cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";

import { expectApprovedLook } from "@/src/test/lookOutline";
import { ANSWERS, CONSOLE_SERIES, CONSOLE_STATUS, GAP, IDEAS, LIST, LISTS, LOOKUPS, OVERVIEW, RESULTS, SETUP, STARTS, answerResearch } from "@/src/test/keywordResearchFixtures";
import KeywordResearchPage from "./page";
import LookupLayout from "./[lookupId]/layout";
import LookupOverviewPage from "./[lookupId]/page";
import LookupResultsPage from "./[lookupId]/results/page";
import ResearchListPage from "./lists/[listId]/page";
import LookupIdeasPage from "./[lookupId]/ideas/page";
import LookupAnswersPage from "./[lookupId]/ai/page";
import CompetitorStartPage from "./competitor/[rivalSiteId]/page";

/**
 * Keyword research holds to the looks Anthony approved on the "Keyword
 * research" canvas, 2026-10-04 (docs/plans/active/keyword-research-plan.md;
 * design-drift-plan D4): each screen, rendered with sample rows
 * in English, reads as the outline saved beside its board in
 * docs/plans/assets/keyword-research/look/.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/keyword-research", params: {} as Record<string, string>, search: "" }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => nav.params,
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

const PLAN = "keyword-research";

function answer() {
  answerResearch(
    {
      "keywordResearch:researchSetup": SETUP,
      "keywordResearch:pastLookups": LOOKUPS,
      "keywordResearch:researchLists": LISTS,
      "keywordResearch:lookupOverview": OVERVIEW,
      "keywordResearch:lookupResults": RESULTS,
      "keywordResearch:researchList": LIST,
      "searchConsoleConnect:searchConsoleStatus": CONSOLE_STATUS,
      "keywordResearchIdeas:lookupIdeas": IDEAS,
      "keywordResearchAnswers:lookupAnswers": ANSWERS,
      "keywordResearchCompetitors:competitorStarts": STARTS,
      "keywordResearchCompetitors:competitorGap": GAP,
    },
    { "searchConsoleLists:searchConsoleKeySeries": CONSOLE_SERIES },
  );
}

function at(pathname: string, params: Record<string, string> = {}, search = "") {
  nav.pathname = pathname;
  nav.params = params;
  nav.search = search;
}

beforeEach(() => {
  vi.mocked(useQuery).mockReset();
  vi.mocked(useMutation).mockReset();
  vi.mocked(useAction).mockReset();
  window.localStorage.clear();
  answer();
});
afterEach(cleanup);

describe("Keyword research's approved looks", () => {
  it("Main", async () => {
    at("/app/keyword-research");
    const { container } = render(<KeywordResearchPage />);
    await screen.findByText("brand identity prism");
    await expectApprovedLook(container, PLAN, "Main", "Discovery → Keyword research");
  });

  it("Overview", async () => {
    at("/app/keyword-research/lookup_1", { lookupId: "lookup_1" });
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(<LookupLayout><LookupOverviewPage /></LookupLayout>));
    });
    await screen.findByText("Improve your page");
    await expectApprovedLook(container, PLAN, "Overview", "Discovery → Keyword research → a keyword's Overview");
  });

  it("Results", async () => {
    at("/app/keyword-research/lookup_1/results", { lookupId: "lookup_1" });
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(<LookupLayout><LookupResultsPage /></LookupLayout>));
    });
    await screen.findByText("MadeByShape: Web Design Agency");
    await expectApprovedLook(container, PLAN, "Results", "Discovery → Keyword research → a keyword's Google's results");
  });

  it("Ideas", async () => {
    at("/app/keyword-research/lookup_1/ideas", { lookupId: "lookup_1" }, "kind=terms");
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(<LookupLayout><LookupIdeasPage /></LookupLayout>));
    });
    await screen.findAllByText("web design agency near me");
    await expectApprovedLook(container, PLAN, "Ideas", "Discovery → Keyword research → a keyword's Keyword ideas");
  });

  it("Ai", async () => {
    at("/app/keyword-research/lookup_1/ai", { lookupId: "lookup_1" });
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(<LookupLayout><LookupAnswersPage /></LookupLayout>));
    });
    await screen.findByText("“Which web design agency should I use in the UK?”");
    await expectApprovedLook(container, PLAN, "Ai", "Discovery → Keyword research → a keyword's What the AI says");
  });

  it("StartFrom", async () => {
    at("/app/keyword-research/competitor/rival_1", { rivalSiteId: "rival_1" }, "site=site_1");
    const { container } = render(<CompetitorStartPage />);
    await screen.findByText("how much does a website cost uk");
    await expectApprovedLook(container, PLAN, "StartFrom", "Discovery → Keyword research → Start from a competitor");
  });

  it("List", async () => {
    at("/app/keyword-research/lists/list_1", { listId: "list_1" });
    const { container } = render(<ResearchListPage />);
    await screen.findByText("web design agency near me");
    await expectApprovedLook(container, PLAN, "List", "Discovery → Keyword research → a research list");
  });
});
