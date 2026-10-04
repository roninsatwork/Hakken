import { act, fireEvent, renderWithProviders as render, screen, within } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";

import { ANSWERS, IDEAS, LISTS, OVERVIEW, SETUP, answerResearch } from "@/src/test/keywordResearchFixtures";
import LookupLayout from "../layout";
import LookupIdeasPage from "./page";

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
  usePathname: () => "/app/keyword-research/lookup_1/ideas",
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: nav.replace, push: nav.push, back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ lookupId: "lookup_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));

async function open(ideas: Partial<typeof IDEAS> = {}, overview: Partial<typeof OVERVIEW> = {}) {
  const mutation = answerResearch({
    "keywordResearch:lookupOverview": { ...OVERVIEW, ...overview },
    "keywordResearch:researchSetup": SETUP,
    "keywordResearch:researchLists": LISTS,
    "keywordResearchIdeas:lookupIdeas": { ...IDEAS, ...ideas },
    "keywordResearchAnswers:lookupAnswers": ANSWERS,
  });
  await act(async () => {
    render(<LookupLayout><LookupIdeasPage /></LookupLayout>);
  });
  return mutation;
}

const bodyRows = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);
const rowOf = (keyword: string) => bodyRows().find((row) => row.textContent?.includes(keyword)) as HTMLElement;

/**
 * Keyword ideas (board 5 of keyword-research-plan.md): terms match,
 * questions and what the top pages also rank for, in the lookup's menu; tick
 * to add to a list, open one to look it up.
 */
describe("a lookup's Keyword ideas", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    vi.mocked(useMutation).mockReset();
    vi.mocked(useAction).mockReset();
    nav.push.mockClear();
    nav.search = "";
    window.localStorage.clear();
  });

  it("lists the ideas of the kind in the address, the most searched first, with where the website stands", async () => {
    nav.search = "kind=questions";
    await open();

    const menu = screen.getByRole("navigation", { name: "keywordResearch.lookup.menu" });
    expect(within(menu).getByRole("link", { name: /keywordResearch\.lookup\.ideaKinds\.questions/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { level: 1, name: /keywordResearch\.ideas\.kinds\.questions\.title/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "keywordResearch.ideas.kindWithCount keywordResearch.ideas.kinds.questions.title 86" })).toHaveAttribute("aria-checked", "true");

    const rows = bodyRows();
    expect(rows[0]).toHaveTextContent("web design agency near me");
    expect(rows[0]).toHaveTextContent("2,900");
    expect(rows[0]).toHaveTextContent("$7.10");
    expect(rows[0]).toHaveTextContent("keywordResearch.ideas.noPage");
    expect(rowOf("web design agency london")).toHaveTextContent("/web-design-london/");
    expect(screen.getByText("ui.tableBar.ideas 4")).toBeInTheDocument();
  });

  it("buys what is missing once, as it opens", async () => {
    const mutation = await open();

    expect(mutation("openIdeas")).toHaveBeenCalledTimes(1);
    expect(mutation("openIdeas")).toHaveBeenCalledWith({ lookupId: "lookup_1" });
  });

  it("narrows to the ideas the website ranks for, and by difficulty, kept in the address", async () => {
    nav.search = "you=ranks&kd=easy";
    await open();

    expect(bodyRows().map((row) => within(row).getAllByRole("cell")[1].textContent)).toEqual(["how to choose a web design agency", "web design agency surrey"]);
  });

  it("adds the ticked ideas to a list, or opens New list with them", async () => {
    const mutation = await open();

    const add = screen.getByLabelText("keywordResearch.add.label");
    expect(add).toBeDisabled();
    fireEvent.click(within(rowOf("near me")).getByRole("checkbox"));
    fireEvent.click(within(rowOf("surrey")).getByRole("checkbox"));
    // Ticking, or clicking a row's figures, buys nothing: only the keyword itself opens a lookup.
    fireEvent.click(within(rowOf("surrey")).getAllByRole("cell").at(-1)!);
    expect(mutation("lookUp")).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.change(add, { target: { value: "list_1" } });
    });
    expect(mutation("addToResearchList")).toHaveBeenCalledWith({
      listId: "list_1",
      items: [{ keyword: "web design agency near me", locationCode: 2826 }, { keyword: "web design agency surrey", locationCode: 2826 }],
    });
    expect(screen.getByText("keywordResearch.ideas.added 1 Web design – London")).toBeInTheDocument();

    fireEvent.click(within(rowOf("london")).getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("keywordResearch.add.label"), { target: { value: "new" } });
    expect(nav.push).toHaveBeenCalledWith(
      "/app/keyword-research/lists/new?keyword=web+design+agency+london&country=2826&site=site_1&back=%2Fapp%2Fkeyword-research%2Flookup_1%2Fideas%3Fkind%3Dterms",
    );
  });

  it("looks an idea up when it is opened, at the usual cost", async () => {
    const mutation = await open();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "web design agency surrey" }));
    });
    expect(mutation("lookUp")).toHaveBeenCalledWith({ keywords: ["web design agency surrey"], locationCode: 2826, siteId: "site_1" });
    expect(nav.push).toHaveBeenCalledWith("/app/keyword-research/lookup_new");
  });

  it("waits while the ideas are bought, says why when they could not be, and never passes samples off as real", async () => {
    await open({ state: "WAITING", rows: [], counts: { TERMS: null, QUESTIONS: null, ALSO_RANK: null } });
    expect(screen.getByText("keywordResearch.ideas.waiting")).toBeInTheDocument();
    expect(screen.getByText("keywordResearch.ideas.waitingRow")).toBeInTheDocument();
  });

  it("says why the ideas failed", async () => {
    await open({ state: "FAILED", problem: "The ideas could not be read." });
    expect(screen.getByText("The ideas could not be read.")).toBeInTheDocument();
  });

  it("never passes sample ideas off as real", async () => {
    await open({ sample: true });
    expect(screen.getByText("keywordResearch.sample")).toBeInTheDocument();
  });

  it("shows a read-only account the ideas, with nothing that buys or changes", async () => {
    const mutation = await open({}, { canLookUp: false });

    expect(bodyRows()).toHaveLength(4);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("keywordResearch.add.label")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "web design agency surrey" })).not.toBeInTheDocument();
    expect(mutation("openIdeas")).not.toHaveBeenCalled();
  });
});
