import { act, fireEvent, renderWithProviders as render, screen, within } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";

import { LISTS, LOOKUPS, SETUP, STARTS, answerResearch } from "@/src/test/keywordResearchFixtures";
import KeywordResearchPage from "./page";

const nav = vi.hoisted(() => ({ search: "", push: vi.fn(), replace: vi.fn() }));

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
  usePathname: () => "/app/keyword-research",
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: nav.replace, push: nav.push, back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({}),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));

function open(answers: { setup?: unknown; lookups?: unknown; lists?: unknown; starts?: unknown } = {}) {
  const mutation = answerResearch({
    "keywordResearch:researchSetup": answers.setup ?? SETUP,
    "keywordResearch:pastLookups": answers.lookups ?? LOOKUPS,
    "keywordResearch:researchLists": answers.lists ?? LISTS,
    "keywordResearchCompetitors:competitorStarts": answers.starts ?? STARTS,
  });
  render(<KeywordResearchPage />);
  return mutation;
}

/** The rows of the table under a section's title. */
const tableRows = (title: string) => {
  const section = screen.getByText(title).closest("section") as HTMLElement;
  return within(section).getAllByRole("row").slice(1);
};

/**
 * Keyword research's own page (board 1 of keyword-research-plan.md): Look
 * up, Past lookups and Research lists, each row opening a screen of its own.
 */
describe("the Keyword research page", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    vi.mocked(useMutation).mockReset();
    nav.push.mockClear();
    nav.search = "";
    window.localStorage.clear();
  });

  it("draws Look up, the company's past lookups newest first and its research lists", () => {
    open();

    expect(screen.getByText("keywordResearch.title")).toBeInTheDocument();
    expect(screen.getByText("keywordResearch.lookUp.intro 10 30")).toBeInTheDocument();
    expect(screen.getByText("keywordResearch.lookUp.cost 5")).toBeInTheDocument();
    // The country opens on the first website's home, and every website can be measured against, or none.
    expect(screen.getByLabelText("keywordResearch.lookUp.country")).toHaveValue("2826");
    expect(screen.getByRole("option", { name: "keywordResearch.lookUp.home United Kingdom" })).toBeInTheDocument();
    const site = screen.getByLabelText("keywordResearch.lookUp.measuredAgainst");
    expect(within(site).getAllByRole("option").map((option) => option.textContent)).toEqual(["acme-agency.test", "acme-agency.ie", "keywordResearch.lookUp.noWebsite"]);

    const lookups = tableRows("keywordResearch.past.title");
    expect(lookups.map((row) => within(row).getAllByRole("cell")[0].textContent)).toEqual(["web design agency", "brand identity prism", "website redesign cost"]);
    expect(lookups[0]).toHaveTextContent("3,600");
    expect(lookups[0]).toHaveTextContent("64 keywordResearch.difficulty.hard");
    expect(lookups[0]).toHaveTextContent("keywordResearch.intents.commercial");
    expect(lookups[0]).toHaveTextContent("18");
    // Read, and not in Google's top 100.
    expect(lookups[2]).toHaveTextContent("sites.common.notOnPageOne");
    expect(screen.getByText("ui.tableBar.keywords 3")).toBeInTheDocument();

    const lists = tableRows("keywordResearch.lists.title");
    expect(lists[0]).toHaveTextContent("Web design – London");
    expect(lists[0]).toHaveTextContent("acme-agency.test");
    expect(lists[1]).toHaveTextContent("keywordResearch.lists.noWebsite");
    expect(screen.getByText("ui.tableBar.lists 2")).toBeInTheDocument();
    expect(screen.getByText("keywordResearch.lists.note")).toBeInTheDocument();
  });

  it("starts from a competitor of the website chosen, each opening its gap, at no cost", () => {
    open();

    const section = screen.getByText("keywordResearch.start.title").closest("section") as HTMLElement;
    expect(within(section).getByText("keywordResearch.start.description acme-agency.test")).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: /plugandplaydesign\.co\.uk/ })).toHaveAttribute("href", "/app/keyword-research/competitor/rival_1?site=site_1");
    expect(within(section).getByText("2,310")).toBeInTheDocument();
  });

  it("follows the website chosen in Measured against, and asks Websites to prepare a gap not there yet", () => {
    const mutation = open({ starts: { preparing: true, rivals: [] } });

    expect(mutation("ensureSiteListCopy")).toHaveBeenCalledWith({ siteId: "site_1", list: "gap" });
    fireEvent.change(screen.getByLabelText("keywordResearch.lookUp.measuredAgainst"), { target: { value: "site_2" } });
    expect(screen.getByText("keywordResearch.start.description acme-agency.ie")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("keywordResearch.lookUp.measuredAgainst"), { target: { value: "" } });
    expect(screen.queryByText("keywordResearch.start.title")).not.toBeInTheDocument();
  });

  it("says plainly when the agent is in Test mode, so no figure reads as real", () => {
    open({ setup: { ...SETUP, agent: { active: true, test: true } } });

    expect(screen.getByText("keywordResearch.testMode")).toBeInTheDocument();
  });

  it("looks up what was typed, in the country and against the website chosen, and opens the first lookup", async () => {
    const mutation = open();

    fireEvent.change(screen.getByLabelText("keywordResearch.lookUp.measuredAgainst"), { target: { value: "site_2" } });
    // A website's own country is where its keywords are looked up first.
    expect(screen.getByLabelText("keywordResearch.lookUp.country")).toHaveValue("2372");
    fireEvent.change(screen.getByLabelText("keywordResearch.lookUp.keywords"), { target: { value: "web design dublin\n\nWeb design  Dublin\nwebflow agency" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "keywordResearch.lookUp.button" }));
    });

    expect(mutation("lookUp")).toHaveBeenCalledWith({ keywords: ["web design dublin", "webflow agency"], locationCode: 2372, siteId: "site_2" });
    expect(nav.push).toHaveBeenCalledWith("/app/keyword-research/lookup_new");
  });

  it("holds more keywords than the limit back, saying so", () => {
    open({ setup: { ...SETUP, limits: { ...SETUP.limits, keywordsPerLookup: 1 } } });

    fireEvent.change(screen.getByLabelText("keywordResearch.lookUp.keywords"), { target: { value: "one\ntwo" } });

    expect(screen.getByText("keywordResearch.lookUp.tooMany 2 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "keywordResearch.lookUp.button" })).toBeDisabled();
  });

  it("opens a lookup or a list from its row", () => {
    open();

    fireEvent.click(tableRows("keywordResearch.past.title")[1]);
    expect(nav.push).toHaveBeenCalledWith("/app/keyword-research/lookup_2");
    fireEvent.click(tableRows("keywordResearch.lists.title")[0]);
    expect(nav.push).toHaveBeenCalledWith("/app/keyword-research/lists/list_1");
    expect(screen.getByRole("link", { name: "web design agency" })).toHaveAttribute("href", "/app/keyword-research/lookup_1");
  });

  it("narrows past lookups to one intent, kept in the address", () => {
    nav.search = "intent=informational";
    open();

    const lookups = tableRows("keywordResearch.past.title");
    expect(lookups).toHaveLength(1);
    expect(lookups[0]).toHaveTextContent("brand identity prism");
  });

  it("opens New list and Rename on pages of their own, and asks before deleting a list", async () => {
    const mutation = open();

    fireEvent.click(screen.getByRole("button", { name: /keywordResearch\.lists\.newList/ }));
    expect(nav.push).toHaveBeenCalledWith("/app/keyword-research/lists/new");

    const first = tableRows("keywordResearch.lists.title")[0];
    fireEvent.click(within(first).getByRole("button", { name: "keywordResearch.lists.rename" }));
    expect(nav.push).toHaveBeenCalledWith("/app/keyword-research/lists/list_1/rename");

    fireEvent.click(within(first).getByRole("button", { name: "keywordResearch.lists.delete" }));
    expect(mutation("deleteResearchList")).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "keywordResearch.lists.deleteConfirm" }));
    });
    expect(mutation("deleteResearchList")).toHaveBeenCalledWith({ listId: "list_1" });
  });

  it("shows a read-only account the lookups and lists, with nothing that buys or changes", () => {
    open({ setup: { ...SETUP, canLookUp: false } });

    expect(screen.queryByText("keywordResearch.lookUp.title")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "keywordResearch.lookUp.button" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /keywordResearch\.lists\.newList/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "keywordResearch.lists.rename" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "keywordResearch.lists.delete" })).not.toBeInTheDocument();
    expect(tableRows("keywordResearch.past.title")).toHaveLength(3);
    expect(tableRows("keywordResearch.lists.title")).toHaveLength(2);
  });
});
