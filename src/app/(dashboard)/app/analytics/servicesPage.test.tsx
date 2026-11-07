import { cleanup, fireEvent, renderWithProviders as render, screen, within } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScreenDay } from "@/src/test/realTime";
import { useAction, useMutation, useQuery } from "convex/react";
import { convexPath } from "@/src/test/siteViewFixtures";
import { STATUS } from "@/src/test/googleAnalyticsFixtures";
import { readFixture } from "@/src/test/readFixture";
import { SERVICE_GROUPS, groupNameInEnglish, openingSplit } from "@/convex/utils/serviceGroups";
import type { ServicesAnswer } from "@/convex/googleAnalyticsServiceReads";
import AnalyticsServicesPage from "./[siteId]/services/page";

/**
 * What each control on Services means (docs/plans/active/services-new-page-plan-2026-11-07.md, step 8), on Ronins' own saved figures
 * for every date the menu offers (`src/test/fixtures/roninsServices.json`, read 7 November 2026). The month chart, the dots and the map
 * are stood in for, so a test can read the figures handed to them; every part they're drawn with has tests of its own.
 */

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn(), push: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/analytics/site_1/services",
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: nav.replace, push: nav.push, back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));
vi.mock("@/src/ui/components/screens/DaysChart", async (real) => {
  const { ExplorerToolbar } = await import("@/src/ui/components/screens/ChartExplorer");
  return {
    ...(await real<object>()),
    DaysChart: ({ title, lines, controls }: { title: string; lines: unknown; controls: never[] }) => (
      <section aria-label="the month chart" data-lines={JSON.stringify(lines)}><h3>{title}</h3><ExplorerToolbar controls={controls} /></section>
    ),
  };
});
vi.mock("@/src/ui/components/screens/DotGroups", async (real) => ({
  ...(await real<object>()),
  DotGroups: ({ points, split, names }: { points: unknown; split: unknown; names: unknown }) => <div aria-label="the dots" data-points={JSON.stringify(points)} data-split={JSON.stringify(split)} data-names={JSON.stringify(names)} />,
}));
vi.mock("@/src/ui/components/screens/PageMap", async (real) => ({
  ...(await real<object>()),
  PageMap: ({ boxes, onOpen }: { boxes: Array<{ id: string }>; onOpen?: (id: string) => void }) => (
    <div aria-label="the map" data-boxes={JSON.stringify(boxes)}>{boxes.slice(0, 1).map((box) => <button key={box.id} type="button" onClick={() => onOpen?.(box.id)}>open the first box</button>)}</div>
  ),
}));

const PERIODS = ["thisWeek", "lastWeek", "thisMonth", "lastMonth", "last3Months", "last6Months", "last12Months"] as const;
const SAVED = readFixture<Record<(typeof PERIODS)[number], ServicesAnswer>>("roninsServices");
/** Each service's page number, as the read gives it: the test file leaves them out. */
const withPages = (answer: ServicesAnswer): ServicesAnswer => ({ ...answer, services: answer.services.map((service, at) => ({ ...service, page: `~${at}`, refs: [`~${at}`] })) });
const YEAR = withPages(SAVED.last12Months);
const KEY = (path: string) => `https://www.small-agency.test${path}`;

/** Two months of the ticked services, each [visits, page views, events], with channels when asked. */
function daysOf(args: { services: Array<{ key: string }>; channels: boolean }) {
  const figures: Record<string, number[][]> = { [KEY("/ai-agency/")]: [[60, 300, 1], [40, 200, 0]], [KEY("/venture-studio/")]: [[20, 90, 1], [10, 50, 1]] };
  const channel = (now: number[][]) => [{ channel: "Organic Search", now: now.map(([visits, , events]) => [Math.max(0, visits - 5), events]), before: null }, { channel: "Direct", now: now.map(() => [5, 0]), before: null }];
  return {
    state: "ready",
    points: [{ day: "2026-09-01", lastDay: "2026-09-30" }, { day: "2026-10-01", lastDay: "2026-10-31" }],
    before: { points: [{ day: "2025-09-01", lastDay: "2025-09-30" }, { day: "2025-10-01", lastDay: "2025-10-31" }] },
    services: args.services.map((one) => {
      const now = figures[one.key] ?? [[1, 2, 0], [1, 2, 0]];
      return { key: one.key, now, before: now.map(([visits, views, events]) => [visits / 2, views / 2, events]), channels: args.channels ? channel(now) : null };
    }),
    website: { now: [[400, 2000, 6], [300, 1500, 5]], before: null, channels: args.channels ? [{ channel: "Organic Search", now: [[300, 5], [200, 4]], before: null }, { channel: "Direct", now: [[100, 1], [100, 1]], before: null }] : null },
    leftOut: 0,
  };
}

let asked: Array<{ path: string; args: Record<string, unknown> }> = [];
function open(search = "", answer: ServicesAnswer = YEAR) {
  nav.search = search;
  // The same ask has the same answer, as Convex keeps it.
  const kept = new Map<string, unknown>();
  vi.mocked(useQuery).mockImplementation(((reference: unknown, args: unknown) => {
    if (args === "skip") return undefined;
    const path = convexPath(reference);
    asked.push({ path, args: args as Record<string, unknown> });
    if (path.endsWith("googleAnalyticsStatus")) return { ...STATUS, host: "small-agency.test" };
    if (path.endsWith("analyticsServices")) return answer;
    if (path.endsWith("analyticsServiceDays")) {
      const ask = JSON.stringify(args);
      if (!kept.has(ask)) kept.set(ask, daysOf(args as never));
      return kept.get(ask);
    }
    return undefined;
  }) as never);
  return render(<AnalyticsServicesPage />);
}

const linesDrawn = () => JSON.parse(screen.getByLabelText("the month chart").getAttribute("data-lines")!) as Array<{ key: string; name: string; points: Array<{ value: number }>; per?: Array<{ value: number }>; under?: boolean }>;
const valuesOf = (key: string) => linesDrawn().find((line) => line.key === key)?.points.map((one) => one.value);
const boxesDrawn = () => JSON.parse(screen.getByLabelText("the map").getAttribute("data-boxes")!) as Array<{ name: string; size: number }>;
const dotsDrawn = () => JSON.parse(screen.getByLabelText("the dots").getAttribute("data-points")!) as Array<{ label: string; x: number; y: number }>;
/** A box's words: its name, how many services, their visits and events. */
const boxOf = (name: string) => screen.getAllByText(name).map((one) => one.closest("[data-part='figure']")).find(Boolean)!;
const boxText = (name: string) => boxOf(name).textContent;
const tableRows = () => within(screen.getByRole("table")).getAllByRole("row").slice(1).map((row) => row.textContent ?? "");

beforeEach(() => {
  useScreenDay("2026-11-07");
  asked = [];
  nav.replace.mockReset();
  nav.push.mockReset();
  vi.mocked(useQuery).mockReset();
  vi.mocked(useMutation).mockImplementation((() => vi.fn()) as never);
  vi.mocked(useAction).mockImplementation((() => vi.fn(() => new Promise(() => undefined))) as never);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the four boxes", () => {
  it("name each group by its numbers, with how many services, their visits and their events (Ronins, last 12 months)", () => {
    open();
    expect(boxText("30 visits or more, and 1.6 or more events for every 100")).toContain("12 services");
    expect(boxText("30 visits or more, and 1.6 or more events for every 100")).toContain("739 visits and 31 events.");
    expect(boxText("30 visits or more, and under 1.6 events for every 100")).toContain("1,175 visits and 12 events.");
    expect(boxText("Under 30 visits, and 1.6 or more events for every 100")).toContain("45 visits and 3 events.");
    expect(boxText("Under 30 visits, and under 1.6 events for every 100")).toContain("16 services");
    expect(document.body.textContent).not.toMatch(/busy|quiet/i);
  });

  it("pressing one shows just that group, and pressing it again shows them all", () => {
    open();
    const first = boxOf("30 visits or more, and 1.6 or more events for every 100");
    expect(first.getAttribute("href")).toContain("group=rightHigh");
    cleanup();
    open("group=rightHigh");
    expect(boxOf("30 visits or more, and 1.6 or more events for every 100").getAttribute("href")).not.toContain("group=");
    expect(boxesDrawn()).toHaveLength(12);
  });

  it("Ask Hakken's groups are the screen's, on every date the menu offers", () => {
    for (const period of PERIODS) {
      const answer = withPages(SAVED[period]);
      const { unmount } = open(`period=${period}`, answer);
      // Ask Hakken's groups (`servicesOpeningSplit`, `assistantServiceReads.ts`) are this split.
      const split = openingSplit(answer.services, answer.website);
      for (const group of SERVICE_GROUPS) {
        const list = split.groups[group];
        const words = boxText(groupNameInEnglish(group, split.split))!;
        expect(words, `${period} ${group}`).toContain(`${list.length} ${list.length === 1 ? "service" : "services"}`);
        const visits = list.reduce((sum, service) => sum + service.now.visits, 0);
        const events = list.reduce((sum, service) => sum + service.now.events, 0);
        expect(words, `${period} ${group}`).toContain(`${visits.toLocaleString("en-GB")} ${visits === 1 ? "visit" : "visits"} and ${events} ${events === 1 ? "event" : "events"}.`);
      }
      unmount();
    }
  });
});

describe("the month chart", () => {
  it("opens on the five busiest services, a line each, and asks only for theirs", () => {
    open();
    expect(linesDrawn().map((line) => line.name)).toEqual(["AI Agency", "Venture Studio", "AI Consultancy", "Web Design London", "AI Software Development Company"]);
    expect(valuesOf(`s:${KEY("/ai-agency/")}`)).toEqual([60, 40]);
    const days = asked.find((one) => one.path.endsWith("analyticsServiceDays"))!;
    expect((days.args.services as Array<{ key: string }>).map((one) => one.key)).toHaveLength(5);
    expect(days.args.channels).toBe(false);
    expect(screen.getByText("Visits to each service, each day")).toBeTruthy();
  });

  it("Show: events, page views, or events for every 100 visits worked out from both sides", () => {
    const { unmount } = open("show=events");
    expect(valuesOf(`s:${KEY("/ai-agency/")}`)).toEqual([1, 0]);
    unmount();
    const views = open("show=views");
    expect(valuesOf(`s:${KEY("/ai-agency/")}`)).toEqual([300, 200]);
    // Page views aren't split by channel: the menu goes.
    expect(within(screen.getByLabelText("the month chart")).queryByLabelText("Channels")).toBeNull();
    views.unmount();
    open("show=rate");
    const rate = linesDrawn().find((line) => line.key === `s:${KEY("/ai-agency/")}`)!;
    expect(rate.points.map((one) => one.value)).toEqual([1, 0]);
    expect(rate.per!.map((one) => one.value)).toEqual([60, 40]);
  });

  it("Lines: one for each channel, or just one, read the split by channel only when it's needed", () => {
    const { unmount } = open("lines=channel");
    expect(linesDrawn().map((line) => line.name)).toEqual(YEAR.channels);
    // AI Agency 55 and 35 from Organic Search, Venture Studio 15 and 5, and the other three ticked 0 each.
    expect(valuesOf("c:Organic Search")).toEqual([70, 40]);
    expect(asked.filter((one) => one.path.endsWith("analyticsServiceDays")).at(-1)!.args.channels).toBe(true);
    unmount();
    open("lines=one");
    expect(linesDrawn().map((line) => line.name)).toEqual(["These services"]);
    expect(valuesOf("one")).toEqual([60 + 20 + 3, 40 + 10 + 3]);
  });

  it("Compare with: the dates before, laid under, or the whole website", () => {
    const { unmount } = open("period=last12Months&against=before");
    const under = linesDrawn().filter((line) => line.under);
    expect(under.map((line) => line.name)[0]).toBe("AI Agency, the 12 months before");
    expect(under[0].points.map((one) => one.value)).toEqual([30, 20]);
    unmount();
    open("against=website");
    expect(valuesOf("website")).toEqual([400, 300]);
  });

  it("with channels ticked, it counts the visits that started on the service from them, and says so", () => {
    open("channels=Direct");
    expect(valuesOf(`s:${KEY("/ai-agency/")}`)).toEqual([5, 5]);
    expect(asked.filter((one) => one.path.endsWith("analyticsServiceDays")).at(-1)!.args.channels).toBe(true);
  });

  it("with nothing ticked, it says what to tick", () => {
    open("services=-");
    expect(screen.getByLabelText("the month chart")).toBeTruthy();
    expect(asked.some((one) => one.path.endsWith("analyticsServiceDays"))).toBe(false);
  });
});

describe("the dots", () => {
  it("draw every service with visits, split at the middle service's visits and the website's events for every 100", () => {
    open();
    expect(dotsDrawn()).toHaveLength(38);
    expect(JSON.parse(screen.getByLabelText("the dots").getAttribute("data-split")!)).toEqual({ x: 30, y: 1.6 });
    const chatbot = dotsDrawn().find((one) => one.label === "ChatBot Agency")!;
    expect([chatbot.x, chatbot.y]).toEqual([78, 10.3]);
  });

  it("Visits from and Events from move the lines, and the boxes follow", () => {
    open("across=twice&up=half");
    expect(JSON.parse(screen.getByLabelText("the dots").getAttribute("data-split")!)).toEqual({ x: 60, y: 0.8 });
    expect(boxText("60 visits or more, and 0.8 or more events for every 100")).toContain("services");
  });

  it("Count: page views, and Show: scrolling to the bottom, which aren't split by channel", () => {
    open("dots=views&doing=scrolled");
    const ai = dotsDrawn().find((one) => one.label === "AI Agency")!;
    expect(ai.x).toBe(YEAR.services.find((one) => one.name === "AI Agency")!.now.views);
    expect(within(screen.getByLabelText("the dots").closest("section") ?? document.body).queryByLabelText("Channels")).toBeNull();
  });
});

describe("the map and the table", () => {
  it("the map shows every service with visits, the biggest first, and Show picks a group", () => {
    const { unmount } = open();
    expect(boxesDrawn()).toHaveLength(38);
    expect(boxesDrawn()[0]).toMatchObject({ name: "AI Agency", size: 793 });
    unmount();
    open("group=leftLow");
    expect(boxesDrawn()).toHaveLength(16);
  });

  it("the table lists the most visits first, searches, and holds to the group pressed", () => {
    const { unmount } = open();
    expect(screen.getByText("38 services")).toBeTruthy();
    expect(tableRows()[0]).toContain("AI Agency");
    expect(tableRows()[0]).toContain("1.3 per 100 visits");
    unmount();
    const searched = open("q=agency");
    expect(tableRows().every((row) => /agency/i.test(row))).toBe(true);
    searched.unmount();
    open("group=rightHigh");
    expect(tableRows()).toHaveLength(12);
  });

  it("a row, or a box on the map, opens that page's own screen, with the way back to Services as it was", () => {
    open("group=rightHigh&sort=name");
    fireEvent.click(screen.getByText("open the first box"));
    const opened = String(nav.push.mock.calls.at(-1)?.[0]);
    expect(opened).toContain("/app/analytics/site_1/all-pages/page?");
    expect(new URLSearchParams(opened.split("?")[1]).get("from")).toContain("services?");
    expect(new URLSearchParams(opened.split("?")[1]).get("from")).toContain("group=rightHigh");
  });
});

describe("a website with no service pages", () => {
  it("says why, and draws nothing else", () => {
    open("", { ...YEAR, state: "noServices", services: [], classifications: [] });
    expect(screen.getByText(/has no service pages yet/)).toBeTruthy();
    expect(screen.queryByLabelText("the month chart")).toBeNull();
  });
});
