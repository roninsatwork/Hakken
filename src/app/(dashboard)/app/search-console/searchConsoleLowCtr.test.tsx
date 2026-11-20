import { cleanup, fireEvent, renderWithProviders as render, screen, within } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScreenDay } from "@/src/test/realTime";
import { useAction, useMutation, useQuery } from "convex/react";
import { answerQueries, convexPath } from "@/src/test/siteViewFixtures";
import { PAGE_ROW, STATUS, SUMMARY, list } from "@/src/test/searchConsoleFixtures";
import SearchConsoleLowCtrPage from "./[siteId]/shown-but-not-clicked/page";

/**
 * Shown but not clicked as Anthony chose it on 20 November 2026 (Way 2; search-console-shown-but-not-clicked-way-2-plan-2026-11-20.md):
 * the country's own pages, four boxes, each position's clicks against the clicks you'd usually get, and the lean table with the
 * pages short by most clicks first.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/search-console/site_1/shown-but-not-clicked", search: "" }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: (url: string) => { nav.search = url.split("?")[1] ?? ""; }, push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

/** One page Google showed 1,500 times at position 7 that got 2 clicks, where the website usually gets 9 there. */
const ROW = { ...PAGE_ROW, key: "https://acme-shop.test/door-locks/", title: "Door Locks Guide", impressions: 1500, position: 7.2, clicks: 2, ctr: 2 / 1500, usualCtr: 0.006, expected: 9, gap: 7 };
const LOW = {
  ...SUMMARY, rows: 1, of: 40, clicks: 2, impressions: 1500, expected: 9,
  lowCtr: {
    positions: [
      { position: 6, pages: 0, clicks: 0, expected: 0, all: 3 },
      { position: 7, pages: 1, clicks: 2, expected: 9, all: 5 },
    ],
    top: [{ key: ROW.key, title: ROW.title, clicks: 2, expected: 9, impressions: 1500, position: 7.2 }],
  },
};

function answer() {
  vi.mocked(useQuery).mockImplementation(answerQueries({
    "searchConsoleConnect:searchConsoleStatus": STATUS,
    "searchConsoleLists:searchConsoleListPage": { ...list([ROW]), summary: LOW },
    "pageKinds:pageKindChoices": null,
  }));
  vi.mocked(useMutation).mockImplementation((() => vi.fn()) as never);
  vi.mocked(useAction).mockImplementation((() => vi.fn(() => new Promise(() => undefined))) as never);
}

const listAsked = () => vi.mocked(useQuery).mock.calls.filter(([reference]) => convexPath(reference).endsWith("searchConsoleListPage")).at(-1)?.[1] as Record<string, unknown> | undefined;

beforeEach(() => {
  useScreenDay("2026-09-27");
  nav.search = "";
  vi.mocked(useQuery).mockReset();
  answer();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Shown but not clicked", () => {
  it("reads the country's own pages, the most clicks short first, with no Device menu", async () => {
    render(<SearchConsoleLowCtrPage />);
    await screen.findByText("Door Locks Guide");
    expect(listAsked()).toMatchObject({ dimension: "page", view: "lowCtr", inCountry: true, sort: "gap", direction: "desc" });
    expect(screen.queryByRole("combobox", { name: "Device" })).toBeNull();
  });

  it("says the four boxes in plain words", async () => {
    render(<SearchConsoleLowCtrPage />);
    await screen.findByText("Door Locks Guide");
    const boxes = within(document.querySelector('[data-part="figures"]') as HTMLElement);
    for (const label of ["Shown a lot, clicked a little", "Times Google showed them", "Clicks they got", "Clicks you'd usually get"]) {
      expect(boxes.getByText(label)).toBeInTheDocument();
    }
    expect(boxes.getByText("Out of 40 pages Google showed")).toBeInTheDocument();
    expect(boxes.getByText("That's 7 more than they got")).toBeInTheDocument();
  });

  it("draws each position's clicks against the clicks you'd usually get, and the pages with Count", async () => {
    render(<SearchConsoleLowCtrPage />);
    expect(await screen.findByText("Clicks at each position in Google")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Count" }), { target: { value: "pages" } });
    expect(nav.search).toContain("count=pages");
  });

  it("lists each page's clicks beside the clicks it'd usually get, with no rates and no clicks short", async () => {
    render(<SearchConsoleLowCtrPage />);
    const row = (await screen.findByText("Door Locks Guide")).closest("tr") as HTMLElement;
    const headings = screen.getAllByRole("columnheader").map((heading) => heading.textContent?.trim());
    expect(headings).toEqual(expect.arrayContaining(["Page", "Shown", "Position", "Clicks", "Usually"]));
    expect(headings).not.toContain("CTR");
    expect(headings).not.toContain("Missed");
    expect(within(row).getByText("2")).toBeInTheDocument();
    expect(within(row).getByText("9")).toBeInTheDocument();
  });
});
