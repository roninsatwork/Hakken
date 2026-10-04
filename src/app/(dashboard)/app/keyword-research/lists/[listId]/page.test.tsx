import { act, fireEvent, renderWithProviders as render, screen, within } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";

import { LIST, LOOKUPS, answerResearch } from "@/src/test/keywordResearchFixtures";
import ResearchListPage from "./page";

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
  usePathname: () => "/app/keyword-research/lists/list_1",
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: nav.replace, push: nav.push, back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ listId: "list_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));

function open(list: Partial<typeof LIST> | null = {}) {
  const mutation = answerResearch({
    "keywordResearch:researchList": list === null ? null : { ...LIST, ...list },
    "keywordResearch:pastLookups": LOOKUPS,
  });
  render(<ResearchListPage />);
  return mutation;
}

const bodyRows = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);
const rowOf = (keyword: string) => bodyRows().find((row) => row.textContent?.includes(keyword)) as HTMLElement;

/**
 * A research list (board 7 of keyword-research-plan.md): decide, then track
 * the keywords worth it. The list and the tracked searches never sync.
 */
describe("a research list", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    vi.mocked(useMutation).mockReset();
    nav.push.mockClear();
    nav.search = "";
    window.localStorage.clear();
  });

  it("draws its header, notice, figures and keywords, the most searched first", () => {
    open();

    expect(screen.getByRole("heading", { level: 1, name: /Web design – London/ })).toBeInTheDocument();
    expect(screen.getByText(/keywordResearch\.list\.description acme-agency\.test Anthony Basker/)).toBeInTheDocument();
    expect(screen.getByText("keywordResearch.list.notice acme-agency.test")).toBeInTheDocument();
    expect(screen.getByText("keywordResearch.list.keywordsDetail 1")).toBeInTheDocument();
    expect(screen.getByText("6,710")).toBeInTheDocument();

    const rows = bodyRows();
    expect(rows.map((row) => row.textContent?.includes("web design agency surrey") ? "surrey" : row.textContent?.includes("near me") ? "near me" : "agency")).toEqual(["agency", "near me", "surrey"]);
    expect(rows[0]).toHaveTextContent("keywordResearch.verdicts.IMPROVE");
    expect(rows[0]).toHaveTextContent("/custom-web-design-agency/");
    expect(rows[1]).toHaveTextContent("keywordResearch.list.noPage");
    expect(rows[1]).toHaveTextContent("sites.common.notOnPageOne");
    expect(rows[2]).toHaveTextContent("keywordResearch.list.trackedYes");
    // A keyword looked up opens its lookup.
    expect(within(rows[0]).getByRole("link", { name: "web design agency" })).toHaveAttribute("href", "/app/keyword-research/lookup_1");
    expect(screen.getByText("keywordResearch.list.note acme-agency.test")).toBeInTheDocument();
  });

  it("tracks the keywords ticked for the list's website, and says so", async () => {
    const mutation = open();

    const track = screen.getByRole("button", { name: "keywordResearch.list.tickToTrack" });
    expect(track).toBeDisabled();
    // One already tracked cannot be ticked again.
    expect(within(rowOf("web design agency surrey")).getByRole("checkbox")).toBeDisabled();

    fireEvent.click(within(rowOf("near me")).getByRole("checkbox"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "keywordResearch.list.track 1 acme-agency.test" }));
    });

    expect(mutation("trackFromResearchList")).toHaveBeenCalledWith({ listId: "list_1", keywords: ["web design agency near me"] });
    expect(screen.getByText("keywordResearch.list.nowTracked 1 acme-agency.test")).toBeInTheDocument();
  });

  it("ticks every keyword not yet tracked at once", () => {
    open();

    fireEvent.click(screen.getByRole("checkbox", { name: "keywordResearch.list.tickAll" }));

    expect(screen.getByRole("button", { name: "keywordResearch.list.track 2 acme-agency.test" })).toBeEnabled();
  });

  it("takes a keyword off the list, leaving it tracked", async () => {
    const mutation = open();

    await act(async () => {
      fireEvent.click(within(rowOf("web design agency surrey")).getByRole("button", { name: "keywordResearch.list.remove" }));
    });

    expect(mutation("removeFromResearchList")).toHaveBeenCalledWith({ listId: "list_1", items: [{ keyword: "web design agency surrey", locationCode: 2826 }] });
    expect(() => mutation("trackFromResearchList")).not.toThrow();
    expect(mutation("trackFromResearchList")).not.toHaveBeenCalled();
  });

  it("narrows to one answer, kept in the address", () => {
    nav.search = "worth=NEW_PAGE";
    open();

    expect(bodyRows()).toHaveLength(1);
    expect(bodyRows()[0]).toHaveTextContent("near me");
  });

  it("opens Rename on its own page", () => {
    open();

    fireEvent.click(screen.getByRole("button", { name: "keywordResearch.lists.rename" }));
    expect(nav.push).toHaveBeenCalledWith("/app/keyword-research/lists/list_1/rename");
  });

  it("cannot track a list measured against no website, and says why", () => {
    open({ host: null, siteId: null });

    expect(screen.getByText("keywordResearch.list.noticeNoWebsite")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "keywordResearch.list.tickToTrack" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("shows a read-only account the list, with no ticks, Track, remove or rename", () => {
    open({ canChange: false });

    expect(bodyRows()).toHaveLength(3);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "keywordResearch.list.tickToTrack" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "keywordResearch.list.remove" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "keywordResearch.lists.rename" })).not.toBeInTheDocument();
  });

  it("reads a list that is not the company's as not found", () => {
    open(null);

    expect(screen.getByText("keywordResearch.list.notFoundTitle")).toBeInTheDocument();
  });
});
