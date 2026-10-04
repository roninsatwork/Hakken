import { act, fireEvent, renderWithProviders as render, screen, within } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";

import { GAP, LISTS, SETUP, STARTS, answerResearch } from "@/src/test/keywordResearchFixtures";
import CompetitorStartPage from "./page";

const nav = vi.hoisted(() => ({ search: "site=site_1", push: vi.fn(), replace: vi.fn() }));

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
  usePathname: () => "/app/keyword-research/competitor/rival_1",
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: nav.replace, push: nav.push, back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ rivalSiteId: "rival_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));

function open(gap: Partial<typeof GAP> | null = {}, setup: Partial<typeof SETUP> = {}) {
  const mutation = answerResearch({
    "keywordResearch:researchSetup": { ...SETUP, ...setup },
    "keywordResearch:researchLists": LISTS,
    "keywordResearchCompetitors:competitorStarts": STARTS,
    "keywordResearchCompetitors:competitorGap": gap === null ? null : { ...GAP, ...gap },
  });
  render(<CompetitorStartPage />);
  return mutation;
}

const bodyRows = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);

/**
 * Start from a competitor (board 6 of keyword-research-plan.md): what a
 * competitor ranks for that the website doesn't, from what Websites holds.
 */
describe("Start from a competitor", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    vi.mocked(useMutation).mockReset();
    nav.push.mockClear();
    nav.search = "site=site_1";
    window.localStorage.clear();
  });

  it("lists the competitor's searches the website doesn't rank for, the most searched first, at no cost", () => {
    open();

    expect(screen.getByText("keywordResearch.start.pageDescription plugandplaydesign.co.uk acme-agency.test")).toBeInTheDocument();
    expect(screen.getByText("keywordResearch.start.noCost")).toBeInTheDocument();
    expect(screen.getByLabelText("keywordResearch.start.competitor")).toHaveValue("rival_1");

    const rows = bodyRows();
    expect(rows.map((row) => within(row).getAllByRole("cell")[1].textContent)).toEqual([
      "how much does a website cost uk",
      "web design agency london",
      "web design guildford",
    ]);
    expect(rows[0]).toHaveTextContent("12");
    expect(rows[0]).toHaveTextContent("sites.common.intents.RESEARCHING");
    expect(screen.getByText("keywordResearch.start.note acme-agency.test")).toBeInTheDocument();
    expect(screen.getByText("ui.tableBar.keywords 3")).toBeInTheDocument();
  });

  it("opens another competitor on its own address", () => {
    open();

    fireEvent.change(screen.getByLabelText("keywordResearch.start.competitor"), { target: { value: "rival_2" } });
    expect(nav.push).toHaveBeenCalledWith("/app/keyword-research/competitor/rival_2?site=site_1");
  });

  it("asks Websites to prepare the gap while it is not there, and waits", () => {
    const mutation = open({ preparing: true, rows: [] });

    expect(mutation("ensureSiteListCopy")).toHaveBeenCalledWith({ siteId: "site_1", list: "gap" });
    expect(screen.queryByText("how much does a website cost uk")).not.toBeInTheDocument();
  });

  it("looks a keyword up in the website's own country when it is opened, and adds the ticked ones to a list", async () => {
    const mutation = open();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "web design guildford" }));
    });
    expect(mutation("lookUp")).toHaveBeenCalledWith({ keywords: ["web design guildford"], locationCode: 2826, siteId: "site_1" });
    expect(nav.push).toHaveBeenCalledWith("/app/keyword-research/lookup_new");

    // Ticking, or clicking a row's figures, buys nothing more: only the keyword itself opens a lookup.
    fireEvent.click(within(bodyRows()[0]).getByRole("checkbox"));
    fireEvent.click(within(bodyRows()[0]).getAllByRole("cell").at(-1)!);
    expect(mutation("lookUp")).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.change(screen.getByLabelText("keywordResearch.add.label"), { target: { value: "list_2" } });
    });
    expect(mutation("addToResearchList")).toHaveBeenCalledWith({ listId: "list_2", items: [{ keyword: "how much does a website cost uk", locationCode: 2826 }] });
    expect(screen.getByText("keywordResearch.start.added 1 AI services")).toBeInTheDocument();
  });

  it("reads a competitor not watched beside the website as not found", () => {
    open(null);

    expect(screen.getByText("keywordResearch.start.notFoundTitle")).toBeInTheDocument();
  });

  it("shows a read-only account the gap, with nothing that buys or changes", () => {
    open({}, { canLookUp: false });

    expect(bodyRows()).toHaveLength(3);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("keywordResearch.add.label")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "web design guildford" })).not.toBeInTheDocument();
  });
});
