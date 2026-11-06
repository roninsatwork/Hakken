import { act, cleanup, renderWithProviders as render, screen, waitFor, within } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { useScreenDay } from "@/src/test/realTime";
import { answerQueries } from "@/src/test/siteViewFixtures";
import { STATUS } from "@/src/test/googleAnalyticsFixtures";
import AnalyticsLivePage from "./page";
import AnalyticsPageScreen from "../all-pages/page/page";

/**
 * Live as Anthony chose it (docs/plans/active/live-new-page-plan-2026-11-06.md): that each part says the right thing for the figures
 * it's given, in every state a website can be in, not only that it draws. The figures are the real moment, 10:15 on 6 November 2026.
 */
const nav = vi.hoisted(() => ({ search: "" }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/analytics/site_1/live",
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));

const HOME = { name: "More Handles | Handles, Knobs & Door Furniture", people: 4, views: 11, times: 0, address: "/" };
const PRODUCT = { name: "Antique Brass Cupboard Handles", people: 2, views: 7, times: 0, address: "/cupboard-handles/antique-brass.html" };
const NOT_SAVED = { name: "A brand new product", people: 1, views: 1, times: 0, address: null };

const FIGURES = {
  ok: true,
  askedAt: Date.parse("2026-11-06T10:15:22Z"),
  now: 9,
  people: 26,
  views: 92,
  conversions: { count: 15, eventName: "add_to_cart", minutesAgo: 1 },
  minutes: [0, 2, 2, 1, 3, 1, 0, 1, 2, 4, 3, 3, 5, 2, 1, 1, 2, 3, 0, 2, 1, 2, 1, 2, 5, 4, 4, 4, 4, 2],
  places: [{ name: "London", people: 5, views: 0, times: 0 }, { name: "Leeds", people: 2, views: 0, times: 0 }],
  countries: [{ name: "GB", people: 26, views: 0, times: 0 }],
  rows: [HOME, PRODUCT, NOT_SAVED],
  pages: [HOME, PRODUCT, NOT_SAVED],
  busiestPage: HOME,
  kinds: [{ kind: "brand", name: "Brand", views: 14, pages: 5 }, { kind: "SHOP_PAGES", name: null, views: 13, pages: 10 }, { kind: "NOT_SORTED", name: null, views: 15, pages: 8 }],
  sorted: true,
  seen: { says: [], steps: [] },
};
const USUAL = {
  from: "2026-10-01", to: "2026-10-31", people: 20.7, visits: 24, views: 102.8, conversions: 18.3,
  peopleThisTime: null, viewsThisTime: null, conversionsThisTime: 23.4, dayOfWeek: 5, hour: 10, everyDevice: false, pages: [], devices: [],
};

function shows(figures: Record<string, unknown>, usual: unknown = USUAL, more: Record<string, unknown> = {}) {
  vi.mocked(useQuery).mockImplementation(answerQueries({ "googleAnalyticsConnect:googleAnalyticsStatus": STATUS, "googleAnalyticsLiveUsual:analyticsLiveUsual": usual, ...more }));
  vi.mocked(useMutation).mockImplementation((() => vi.fn()) as never);
  const answer = figures.ok === false ? figures : { ...FIGURES, ...figures };
  vi.mocked(useAction).mockImplementation((() => vi.fn(async () => answer)) as never);
  return render(<AnalyticsLivePage />);
}
const rowText = (key: string) => document.querySelector(`[data-row="${key}"]`)?.textContent ?? "";
const figure = (label: string) => within(screen.getByText(label).closest('[data-part="figure"]') as HTMLElement);

beforeEach(() => {
  useScreenDay("2026-11-06");
  nav.search = "";
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the four boxes", () => {
  it("name the busiest things, with what makes them busiest", async () => {
    shows({});
    await screen.findByText("On the website now");
    expect(figure("On the website now").getByText("9")).toBeTruthy();
    expect(figure("On the website now").getByText("In the last 5 minutes.")).toBeTruthy();
    // The home page by its name, not its long title.
    expect(figure("Busiest page").getByText("Home page")).toBeTruthy();
    expect(figure("Busiest page").getByText("4 people and 11 views.")).toBeTruthy();
    expect(figure("Busiest town").getByText("London")).toBeTruthy();
    expect(figure("Busiest town").getByText("5 of 26 people.")).toBeTruthy();
    expect(figure("Newest conversion").getByText("1 minute ago.")).toBeTruthy();
  });

  it("give any other page its own title, whole on hover", async () => {
    shows({ busiestPage: PRODUCT });
    const title = await within((await screen.findByText("Busiest page")).closest('[data-part="figure"]') as HTMLElement).findByText(PRODUCT.name);
    expect(title.getAttribute("title")).toBe(PRODUCT.name);
  });

  it("say so when nobody is here, never showing a blank or a nought as a town", async () => {
    shows({ now: 0, people: 0, views: 0, conversions: { count: 0, eventName: null, minutesAgo: null }, minutes: Array(30).fill(0), places: [], rows: [], pages: [], busiestPage: null, kinds: [] });
    await screen.findByText("No page in the last 30 minutes.");
    expect(screen.getByText("Google hasn't named a town yet.")).toBeTruthy();
    expect(screen.getByText("None in the last 30 minutes.")).toBeTruthy();
    expect(screen.getByText("No page views in the last 30 minutes.")).toBeTruthy();
    expect(screen.getByText("Nobody in the last 30 minutes.")).toBeTruthy();
  });

  it("skip a town Google can't name", async () => {
    shows({ places: [{ name: "(not set)", people: 9, views: 0, times: 0 }, { name: "Leeds", people: 2, views: 0, times: 0 }] });
    await screen.findByText("On the website now");
    expect(figure("Busiest town").getByText("Leeds")).toBeTruthy();
  });
});

describe("People each minute", () => {
  it("draws a bar for each minute, with the newest on the right and its figures", async () => {
    const { container } = shows({});
    await screen.findByText("People each minute");
    await waitFor(() => expect(container.querySelectorAll('[data-part="minute-bars"] [data-bar]')).toHaveLength(30));
    expect(container.querySelector('[data-part="minute-bars"]')!.textContent).toContain("Now");
  });
});

describe("the last half hour against usual", () => {
  it("sets each figure against what it means, and says the verdict in the line under the title", async () => {
    shows({});
    await screen.findByText("The last half hour against usual");
    expect(rowText("people")).toContain("26");
    expect(rowText("people")).toContain("About 21 in a usual half hour");
    expect(rowText("views")).toContain("About 103 in a usual half hour");
    expect(rowText("conversions")).toContain("About 18 in a usual half hour");
    expect(rowText("thisTime")).toContain("About 23 in a half hour, on a Friday at 10am in October");
    // Against this time of the week: 15 against 23 is down, where the even spread's 18 would say less.
    expect(rowText("thisTime")).toContain("36%");
    expect(screen.getByText(/More people than usual, but fewer conversions\. The bars are the last half hour, and the marks are what's usual\./)).toBeTruthy();
  });

  it("uses the website's own hours for people and views once they're saved", async () => {
    shows({}, { ...USUAL, peopleThisTime: 41, viewsThisTime: 150 });
    await screen.findByText("The last half hour against usual");
    expect(rowText("people")).toContain("About 41 in a half hour, on a Friday at 10am in October");
    expect(rowText("views")).toContain("About 150 in a half hour, on a Friday at 10am in October");
    // Fewer people than the hour's usual now, where the even spread said more.
    expect(screen.getByText(/Fewer people than usual, and fewer conversions\./)).toBeTruthy();
  });

  it("says a small website's usual in words, with no percentages and no verdict", async () => {
    shows({ people: 2, views: 3, conversions: { count: 0, eventName: null, minutesAgo: null } }, { ...USUAL, people: 0.2, views: 0.4, conversions: 0.1, conversionsThisTime: 0.2 });
    await screen.findByText("The last half hour against usual");
    expect(rowText("people")).toContain("Fewer than 1 in a usual half hour");
    expect(rowText("people")).not.toContain("%");
    expect(screen.queryByText(/than usual/)).toBeNull();
    expect(screen.getByText(/The bars are the last half hour, and the marks are what's usual\./)).toBeTruthy();
  });

  it("leaves off conversions on a website counting none", async () => {
    shows({ conversions: { count: 0, eventName: null, minutesAgo: null } }, { ...USUAL, conversions: 0, conversionsThisTime: 0 });
    await screen.findByText("The last half hour against usual");
    expect(document.querySelector('[data-row="conversions"]')).toBeNull();
    expect(document.querySelector('[data-row="thisTime"]')).toBeNull();
    expect(screen.getByText(/^More people than usual\. /)).toBeTruthy();
  });

  it("shows the bars alone with no usual yet, and says so", async () => {
    const { container } = shows({}, null);
    await screen.findByText("The last half hour against usual");
    expect(rowText("people")).toContain("No usual yet");
    expect(container.querySelector('[data-part="against-bars"] [data-mark]')).toBeNull();
    expect(screen.getByText("The bars are the last half hour. There's no usual for this website yet.")).toBeTruthy();
  });

  it("says when a device has no month of its own yet", async () => {
    nav.search = "device=tablet";
    shows({}, { ...USUAL, everyDevice: true });
    await screen.findByText("The last half hour against usual");
    expect(screen.getByText(/This device has no month saved yet, so its usual is for every device\./)).toBeTruthy();
  });
});

describe("what people are looking at", () => {
  it("names each box in the reader's words", async () => {
    shows({});
    await screen.findByText("What people are looking at");
    expect(screen.getByText("Bigger boxes had more views in the last 30 minutes. That's 92 so far.")).toBeTruthy();
  });

  it("says when the website's pages aren't sorted, in place of the map", async () => {
    shows({ sorted: false, kinds: [] });
    await screen.findByText("Your pages aren't sorted into groups yet, so there is nothing to add the views up by.");
  });
});

describe("the table", () => {
  it("shows each page's title over its address, opening its own screen, and says so with none saved", async () => {
    shows({});
    const product = await screen.findByText(PRODUCT.name, { selector: "span" });
    const row = product.closest("tr") as HTMLElement;
    const link = within(row).getByRole("link");
    expect(link.textContent).toBe("/cupboard-handles/antique-brass.html");
    expect(link.getAttribute("href")).toContain("all-pages/page");
    expect(decodeURIComponent(link.getAttribute("href")!)).toContain("key=/cupboard-handles/antique-brass.html");
    const unsaved = (await screen.findByText(NOT_SAVED.name, { selector: "span" })).closest("tr") as HTMLElement;
    expect(within(unsaved).getByText("No address saved")).toBeTruthy();
    expect(within(unsaved).queryByRole("link")).toBeNull();
    expect(screen.getByText("In the last 30 minutes. One person can be on several pages.")).toBeTruthy();
  });

  it("shows events in times, with no People column", async () => {
    nav.search = "view=events";
    shows({ rows: [{ name: "add_to_cart", people: 0, views: 0, times: 12 }] });
    await screen.findByText("12");
    const table = screen.getByRole("table");
    expect(within(table).getByText("Times")).toBeTruthy();
    expect(within(table).queryByText("People")).toBeNull();
  });

  it("shows places by their own list, with the plain line", async () => {
    nav.search = "view=places";
    shows({ rows: [{ name: "Leeds", people: 2, views: 0, times: 0 }] });
    await screen.findByText("Leeds", { selector: "td span" });
    expect(screen.getByText("In the last 30 minutes.")).toBeTruthy();
    expect(within(screen.getByRole("table")).queryByText("Views")).toBeNull();
  });
});

describe("a page's own screen, opened from the table", () => {
  it("is asked for by the page's number, found from its address, never by the address itself", async () => {
    nav.search = "key=/cupboard-handles/antique-brass.html";
    const page = vi.fn((asked: { page: string }) => asked.page);
    vi.mocked(useQuery).mockImplementation(((ref: unknown, args: unknown) => {
      const name = getFunctionName(ref as never);
      if (args === "skip") return undefined;
      if (name === "googleAnalyticsConnect:googleAnalyticsStatus") return STATUS;
      if (name === "googleAnalyticsPageReads:analyticsPageKey") return "~t";
      if (name === "googleAnalyticsPageReads:analyticsPage") page(args as { page: string });
      return undefined;
    }) as never);
    vi.mocked(useMutation).mockImplementation((() => vi.fn()) as never);
    vi.mocked(useAction).mockImplementation((() => vi.fn(async () => FIGURES)) as never);
    render(<AnalyticsPageScreen />);
    await waitFor(() => expect(page).toHaveBeenCalled());
    expect(page.mock.calls.every(([asked]) => asked.page === "~t")).toBe(true);
  });
});

describe("the update line", () => {
  it("counts down to the next minute, with the live dot and the long words a tap away", async () => {
    vi.setSystemTime(FIGURES.askedAt);
    shows({ askedAt: FIGURES.askedAt });
    const line = await screen.findByText(/^Updates every minute while this page is open\. Next update in \d+ seconds?\.$/);
    expect(line.parentElement!.querySelector('[data-part="live-dot"]')).toBeTruthy();
    expect(line.parentElement!.getAttribute("tabindex")).toBe("0");
    await act(async () => {
      line.parentElement!.focus();
    });
    expect(await screen.findByText(/count the whole Google Analytics property, in every country/)).toBeTruthy();
  });

  it("says Google couldn't answer, with no dot saying it's live", async () => {
    const { container } = shows({ ok: false, problem: "GOOGLE_BUSY" });
    await screen.findByText("Google couldn't answer just now. This page asks again in a minute.");
    expect(container.querySelector('[data-part="live-dot"]')).toBeNull();
  });

  it("says when the website isn't connected", async () => {
    shows({ ok: false, problem: "NOT_CONNECTED" });
    await screen.findByText("Google Analytics isn't connected for this website, so there are no live figures.");
  });

  it("asks nothing and says so behind another tab", async () => {
    const hidden = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const { container } = shows({});
    await screen.findByText("Waiting: this page asks Google only while it is open and in front. Bring it to the front to see who is on the website now.");
    expect(vi.mocked(useAction).mock.results.at(-1)?.value).not.toHaveBeenCalled();
    expect(container.querySelector('[data-part="live-dot"]')).toBeNull();
    hidden.mockRestore();
  });
});
