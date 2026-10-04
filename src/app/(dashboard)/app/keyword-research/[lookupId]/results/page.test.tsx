import { act, renderWithProviders as render, screen, within } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";

import { OVERVIEW, RESULTS, SETUP, answerResearch } from "@/src/test/keywordResearchFixtures";
import LookupLayout from "../layout";
import LookupResultsPage from "./page";

const nav = vi.hoisted(() => ({ search: "", push: vi.fn(), replace: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
// The shared mock, with the values a wording is given written after its key.
vi.mock("next-intl", async () => {
  const base = (await import("@/src/test/screenMocks")).nextIntl();
  return {
    ...base,
    useTranslations: (namespace: string) => {
      const t = (key: string, values?: Record<string, unknown>) => [`${namespace}.${key}`, ...Object.values(values ?? {})].join(" ");
      // Sites' page kinds are named; the countries fall back to the server's names.
      return Object.assign(t, { rich: t, has: () => namespace === "sites.common.pageTypes" });
    },
  };
});
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/keyword-research/lookup_1/results",
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: nav.replace, push: nav.push, back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ lookupId: "lookup_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));

async function open(results: Partial<typeof RESULTS> = {}, overview: Partial<typeof OVERVIEW> = {}) {
  const mutation = answerResearch({
    "keywordResearch:lookupOverview": { ...OVERVIEW, ...overview },
    "keywordResearch:lookupResults": { ...RESULTS, ...results },
    "keywordResearch:researchSetup": SETUP,
  });
  await act(async () => {
    render(<LookupLayout><LookupResultsPage /></LookupLayout>);
  });
  return mutation;
}

/** The results table's rows, under its heading row. */
const resultRows = () => within(screen.getAllByRole("table")[0]).getAllByRole("row").slice(1);

/**
 * Google's results (board 3 of keyword-research-plan.md): the top ten with
 * each page's figures, the website's own and its competitors' marked, then
 * where each of them is in the top 100.
 */
describe("a lookup's Google's results", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    vi.mocked(useMutation).mockReset();
    vi.mocked(useAction).mockReset();
    nav.search = "";
    window.localStorage.clear();
  });

  it("lists the top ten in Google's order with each page's figures, competitors marked, under the lookup's menu", async () => {
    await open();

    const menu = screen.getByRole("navigation", { name: "keywordResearch.lookup.menu" });
    expect(within(menu).getByRole("link", { name: /keywordResearch\.lookup\.results/ })).toHaveAttribute("aria-current", "page");

    const rows = resultRows();
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("MadeByShape: Web Design Agency");
    expect(rows[0]).toHaveTextContent("madebyshape.co.uk/");
    expect(rows[0]).toHaveTextContent("sites.common.pageTypes.HOME");
    expect(rows[0]).toHaveTextContent("72");
    expect(rows[0]).toHaveTextContent("2,100");
    expect(rows[0]).toHaveTextContent("9,400");
    expect(rows[2]).toHaveTextContent("keywordResearch.results.rival");
    expect(screen.getByText("keywordResearch.results.note")).toBeInTheDocument();
    expect(screen.getByText(/keywordResearch\.results\.checked/)).toBeInTheDocument();
  });

  it("says where the website and its competitors are in the top 100", async () => {
    await open();

    const where = screen.getByRole("heading", { name: "keywordResearch.results.whereTitle" }).closest("section") as HTMLElement;
    const rows = within(where).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("acme-agency.test");
    expect(rows[0]).toHaveTextContent("keywordResearch.results.you");
    expect(rows[0]).toHaveTextContent("18");
    expect(rows[2]).toHaveTextContent("sites.common.notOnPageOne");
  });

  it("buys the top ten's figures once, as it opens", async () => {
    const mutation = await open();

    expect(mutation("openResults")).toHaveBeenCalledTimes(1);
    expect(mutation("openResults")).toHaveBeenCalledWith({ lookupId: "lookup_1" });
  });

  it("shows only the website and its competitors when asked, kept in the address", async () => {
    nav.search = "show=ours";
    await open();

    const rows = resultRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Plug & Play");
  });

  it("waits while the figures are bought, and says why when they could not be", async () => {
    await open({ state: "WAITING" });
    expect(screen.getByText("keywordResearch.results.waiting")).toBeInTheDocument();
  });

  it("says why reading the pages failed", async () => {
    await open({ state: "FAILED", problem: "STOPPED" });
    expect(screen.getByText("keywordResearch.problems.STOPPED")).toBeInTheDocument();
  });

  it("waits for the lookup itself before asking for anything", async () => {
    const mutation = await open({ rows: [], beyond: [] }, { state: "WAITING" as never });

    expect(screen.getByText("keywordResearch.lookup.waitingNotice")).toBeInTheDocument();
    expect(screen.getByText("keywordResearch.results.empty")).toBeInTheDocument();
    expect(() => mutation("openResults")).not.toThrow();
    expect(mutation("openResults")).not.toHaveBeenCalled();
  });

  it("never passes sample figures off as real", async () => {
    await open({ sample: true });
    expect(screen.getByText("keywordResearch.sample")).toBeInTheDocument();
  });

  it("buys nothing for a read-only account, which still reads the results", async () => {
    const mutation = await open({}, { canLookUp: false });

    expect(mutation("openResults")).not.toHaveBeenCalled();
    expect(resultRows()).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "keywordResearch.lookup.again" })).not.toBeInTheDocument();
  });
});
