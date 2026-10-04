import { act, fireEvent, renderWithProviders as render, screen, within } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";

import { ANSWERS, CONSOLE_SERIES, CONSOLE_STATUS, IDEAS, OVERVIEW, SETUP, answerResearch } from "@/src/test/keywordResearchFixtures";
import LookupLayout from "./layout";
import LookupOverviewPage from "./page";

const nav = vi.hoisted(() => ({ pathname: "/app/keyword-research/lookup_1", push: vi.fn(), replace: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
// The shared mock, with the values a wording is given written after its key.
vi.mock("next-intl", async () => {
  const base = (await import("@/src/test/screenMocks")).nextIntl();
  return {
    ...base,
    useTranslations: (namespace: string) => {
      const t = (key: string, values?: Record<string, unknown>) => [`${namespace}.${key}`, ...Object.values(values ?? {})].join(" ");
      return Object.assign(t, { rich: t, has: () => false });
    },
  };
});
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ replace: nav.replace, push: nav.push, back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ lookupId: "lookup_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

type Overview = typeof OVERVIEW;

async function open(overview: Partial<Overview> = {}, consoleStatus: unknown = CONSOLE_STATUS, held: { ideas?: unknown; answers?: unknown } = {}) {
  const mutation = answerResearch(
    {
      "keywordResearch:lookupOverview": { ...OVERVIEW, ...overview },
      "keywordResearch:researchSetup": SETUP,
      "searchConsoleConnect:searchConsoleStatus": consoleStatus,
      "keywordResearchIdeas:lookupIdeas": "ideas" in held ? held.ideas : IDEAS,
      "keywordResearchAnswers:lookupAnswers": "answers" in held ? held.answers : ANSWERS,
    },
    { "searchConsoleLists:searchConsoleKeySeries": CONSOLE_SERIES },
  );
  await act(async () => {
    render(<LookupLayout><LookupOverviewPage /></LookupLayout>);
  });
  return mutation;
}

/** The card a title heads. */
const card = (title: string) => screen.getByRole("heading", { name: title }).closest("section") as HTMLElement;

/**
 * A keyword's overview (board 2 of keyword-research-plan.md), in the
 * lookup's own header and menu: its figures, what it means for the website,
 * its months, its countries and Google's top five.
 */
describe("a lookup's Overview", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    vi.mocked(useMutation).mockReset();
    vi.mocked(useAction).mockReset();
    nav.push.mockClear();
    nav.pathname = "/app/keyword-research/lookup_1";
  });

  it("wears the lookup's header and menu: the keyword, where and against what, when and at what cost", async () => {
    await open();

    expect(screen.getByRole("heading", { level: 1, name: /web design agency/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "keywordResearch.lookup.back" })).toHaveAttribute("href", "/app/keyword-research");
    expect(screen.getByText("keywordResearch.lookup.lookedUpIn keywordResearch.placeInOther United Kingdom acme-agency.test")).toBeInTheDocument();
    expect(screen.getByText(/keywordResearch\.lookup\.lookedUpWhenCost .* \$0\.34/)).toBeInTheDocument();

    const menu = screen.getByRole("navigation", { name: "keywordResearch.lookup.menu" });
    expect(within(menu).getByRole("link", { name: "keywordResearch.lookup.overview" })).toHaveAttribute("aria-current", "page");
    expect(within(menu).getByRole("link", { name: /keywordResearch\.lookup\.results/ })).toHaveTextContent("10");
    // What the AI says and the three kinds of ideas, each with its number once held.
    expect(within(menu).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/app/keyword-research/lookup_1",
      "/app/keyword-research/lookup_1/results",
      "/app/keyword-research/lookup_1/ai",
      "/app/keyword-research/lookup_1/ideas?kind=terms",
      "/app/keyword-research/lookup_1/ideas?kind=questions",
      "/app/keyword-research/lookup_1/ideas?kind=also",
    ]);
    expect(within(menu).getByRole("link", { name: /keywordResearch\.lookup\.ai/ })).toHaveTextContent("1/4");
    expect(within(menu).getByRole("link", { name: /keywordResearch\.lookup\.ideaKinds\.terms/ })).toHaveTextContent("1,000");
  });

  it("draws the figures, the answer for the website and why, its page, what Google counted and its competitors", async () => {
    await open();

    const volume = screen.getByText("keywordResearch.overview.volume").closest("[data-part='figure']") as HTMLElement;
    expect(within(volume).getByText("3,600")).toBeInTheDocument();
    expect(within(volume).getByText("keywordResearch.overview.volumeDetail United Kingdom $6.20")).toBeInTheDocument();
    const difficulty = screen.getByText("keywordResearch.overview.difficulty").closest("[data-part='figure']") as HTMLElement;
    expect(within(difficulty).getByText("keywordResearch.difficulty.hard")).toBeInTheDocument();
    expect(within(difficulty).getByText("keywordResearch.overview.difficultyDetail 180")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /keywordResearch\.overview\.topVisits/ })).toHaveAttribute("href", "/app/keyword-research/lookup_1/results");
    expect(screen.getByText("keywordResearch.overview.topVisitsDetail 122 madebyshape.co.uk")).toBeInTheDocument();
    const intent = screen.getByText("keywordResearch.overview.intent").closest("[data-part='figure']") as HTMLElement;
    expect(within(intent).getByText("keywordResearch.intents.commercial")).toBeInTheDocument();

    const verdict = card("keywordResearch.overview.forHost acme-agency.test");
    expect(within(verdict).getByText("keywordResearch.verdicts.IMPROVE")).toBeInTheDocument();
    expect(within(verdict).getByText("keywordResearch.overview.reasons.ranks /custom-web-design-agency/ 18 2")).toBeInTheDocument();
    expect(within(verdict).getByText("keywordResearch.overview.reasons.linkingWithin 180 acme-agency.test 312")).toBeInTheDocument();

    const yours = card("keywordResearch.overview.yourPage");
    expect(within(yours).getByRole("link", { name: "keywordResearch.overview.openInWebsites" })).toHaveAttribute(
      "href",
      "/app/sites/site_1/keywords/keyword?keyword=web%20design%20agency",
    );

    const counted = card("keywordResearch.overview.counted");
    expect(within(counted).getByText("1,180")).toBeInTheDocument();
    expect(within(counted).getByText("16.2")).toBeInTheDocument();
    expect(vi.mocked(useAction).mock.results.at(-1)?.value).toHaveBeenCalledWith(expect.objectContaining({
      siteId: "site_1", searchType: "web", dimension: "query", key: "web design agency", from: "2026-09-04", to: "2026-10-01",
    }));

    const rivals = card("keywordResearch.overview.competitors");
    expect(within(rivals).getByText("plugandplaydesign.co.uk")).toBeInTheDocument();
    expect(within(rivals).getByText("sites.common.notOnPageOne")).toBeInTheDocument();
  });

  it("says a website not connected to Search Console is not, in place of its figures", async () => {
    await open({}, { ...CONSOLE_STATUS, connection: null });

    expect(within(card("keywordResearch.overview.counted")).getByText("keywordResearch.overview.notConnected")).toBeInTheDocument();
  });

  it("draws the 24 months, the searches by country and Google's top five", async () => {
    await open();

    expect(card("keywordResearch.overview.chartTitle keywordResearch.placeInOther United Kingdom")).toBeInTheDocument();
    const countries = card("keywordResearch.overview.byCountry");
    expect(within(countries).getByText("14,800")).toBeInTheDocument();
    expect(within(countries).getByText("keywordResearch.overview.home")).toBeInTheDocument();

    const top = card("keywordResearch.overview.results");
    expect(within(top).getAllByRole("row")).toHaveLength(6);
    expect(within(top).getByRole("link", { name: "keywordResearch.overview.seeAll" })).toHaveAttribute("href", "/app/keyword-research/lookup_1/results");
  });

  it("shows the first ideas and what the AI says once held, opening a keyword by looking it up", async () => {
    const mutation = await open();

    const ideas = screen.getByText("keywordResearch.overview.ideasTitle").closest("section") as HTMLElement;
    expect(within(ideas).getAllByRole("row").slice(1)).toHaveLength(4);
    expect(within(ideas).getByText("keywordResearch.overview.ideasShowing 1 4 1,000")).toBeInTheDocument();
    expect(within(ideas).getByRole("radio", { name: "keywordResearch.ideas.kindWithCount keywordResearch.ideas.kinds.questions.title 86" })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(ideas).getByRole("button", { name: "web design agency london" }));
    });
    expect(mutation("lookUp")).toHaveBeenCalledWith({ keywords: ["web design agency london"], locationCode: 2826, siteId: "site_1" });
    expect(nav.push).toHaveBeenCalledWith("/app/keyword-research/lookup_new");

    const ai = card("keywordResearch.overview.aiTitle");
    expect(within(ai).getByText("keywordResearch.overview.aiAsked Which web design agency should I use in the UK?")).toBeInTheDocument();
    expect(within(ai).getAllByText("keywordResearch.ai.namesYou")).toHaveLength(1);
    expect(within(ai).getByRole("link", { name: "keywordResearch.overview.aiWhoInstead" })).toHaveAttribute("href", "/app/keyword-research/lookup_1/ai");
  });

  it("never buys ideas or asks the AI just because it opened, saying what each costs", async () => {
    const empty = { ...IDEAS, counts: { TERMS: null, QUESTIONS: null, ALSO_RANK: null }, rows: [], state: null, boughtAt: null };
    const mutation = await open({}, CONSOLE_STATUS, { ideas: empty, answers: { ...ANSWERS, figures: null, engines: [], question: null, state: null, askedAt: null } });

    expect(screen.getByText("keywordResearch.overview.ideasNotYet 4")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "keywordResearch.overview.ideasOpen" })).toHaveAttribute("href", "/app/keyword-research/lookup_1/ideas?kind=terms");
    expect(screen.getByText("keywordResearch.overview.aiNotYet 20")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "keywordResearch.overview.aiOpen" })).toHaveAttribute("href", "/app/keyword-research/lookup_1/ai");
    expect(() => mutation("openIdeas")).toThrow();
    expect(() => mutation("openAnswers")).toThrow();
  });

  it("waits quietly while the agent buys, and fills in by itself", async () => {
    await open({ state: "WAITING" as never, overview: null as never, top: null as never, topResult: null as never });

    expect(screen.getByText("keywordResearch.lookup.waiting")).toBeInTheDocument();
    expect(screen.getByText("keywordResearch.lookup.waitingNotice")).toBeInTheDocument();
    expect(screen.queryByText("keywordResearch.overview.volume")).not.toBeInTheDocument();
  });

  it("says why a lookup failed, with Look up again", async () => {
    const mutation = await open({ state: "FAILED" as never, problem: "DataForSEO did not answer.", overview: null as never });

    const notice = screen.getByText("DataForSEO did not answer.").closest("[data-part='notice']") as HTMLElement;
    await act(async () => {
      fireEvent.click(within(notice).getByRole("button", { name: "keywordResearch.lookup.again" }));
    });
    expect(mutation("lookUpAgain")).toHaveBeenCalledWith({ lookupId: "lookup_1" });
  });

  it("never passes sample figures off as real", async () => {
    await open({ sample: true });

    expect(screen.getByText("keywordResearch.sample")).toBeInTheDocument();
  });

  it("adds the keyword to a list, or opens New list with it", async () => {
    const mutation = await open();

    await act(async () => {
      fireEvent.change(screen.getByLabelText("keywordResearch.lookup.addToListLabel"), { target: { value: "list_1" } });
    });
    expect(mutation("addToResearchList")).toHaveBeenCalledWith({ listId: "list_1", items: [{ keyword: "web design agency", locationCode: 2826 }] });
    expect(screen.getByText("keywordResearch.lookup.addedTo Web design – London")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("keywordResearch.lookup.addToListLabel"), { target: { value: "new" } });
    expect(nav.push).toHaveBeenCalledWith("/app/keyword-research/lists/new?keyword=web+design+agency&country=2826&lookup=lookup_1&site=site_1");
  });

  it("looks up again, against another website, in another country, or another keyword", async () => {
    const mutation = await open();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "keywordResearch.lookup.again" }));
    });
    expect(mutation("lookUpAgain")).toHaveBeenCalledWith({ lookupId: "lookup_1" });

    await act(async () => {
      fireEvent.change(screen.getByLabelText("keywordResearch.lookup.measuredAgainst"), { target: { value: "" } });
    });
    expect(mutation("lookUp")).toHaveBeenCalledWith({ keywords: ["web design agency"], locationCode: 2826 });

    fireEvent.change(screen.getByLabelText("keywordResearch.overview.anotherCountry"), { target: { value: "2372" } });
    await act(async () => {
      fireEvent.click(within(card("keywordResearch.overview.byCountry")).getByRole("button", { name: "keywordResearch.overview.lookUpCountry" }));
    });
    expect(mutation("lookUpInCountry")).toHaveBeenCalledWith({ lookupId: "lookup_1", locationCode: 2372 });

    fireEvent.change(screen.getByLabelText("keywordResearch.lookup.another"), { target: { value: "webflow agency" } });
    await act(async () => {
      fireEvent.submit(screen.getByLabelText("keywordResearch.lookup.another").closest("form") as HTMLFormElement);
    });
    expect(mutation("lookUp")).toHaveBeenLastCalledWith({ keywords: ["webflow agency"], locationCode: 2826, siteId: "site_1" });
    expect(nav.push).toHaveBeenCalledWith("/app/keyword-research/lookup_new");
  });

  it("shows a read-only account the whole overview, with nothing that buys or changes", async () => {
    await open({ canLookUp: false });

    expect(screen.getAllByText("3,600").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "keywordResearch.lookup.again" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("keywordResearch.lookup.addToListLabel")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("keywordResearch.lookup.measuredAgainst")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("keywordResearch.lookup.another")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("keywordResearch.overview.anotherCountry")).not.toBeInTheDocument();
  });

  it("reads a lookup that is not the company's as not found", async () => {
    answerResearch({ "keywordResearch:lookupOverview": null });
    await act(async () => {
      render(<LookupLayout><LookupOverviewPage /></LookupLayout>);
    });

    expect(screen.getByText("keywordResearch.lookup.notFoundTitle")).toBeInTheDocument();
  });
});
