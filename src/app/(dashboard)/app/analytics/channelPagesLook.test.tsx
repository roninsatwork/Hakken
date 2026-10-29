import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import { CHANNEL, ROW, STATUS, list } from "@/src/test/googleAnalyticsFixtures";
import { channelPageSees, channelsPageSees } from "@/convex/utils/sees/analyticsChannel";
import AnalyticsChannelsPage from "./[siteId]/channels/page";
import AnalyticsChannelPage from "./[siteId]/channels/channel/page";
import { openHakkenSees } from "@/src/test/openHakkenSees";

/**
 * Channels and a channel's own page hold to the looks Anthony approved on
 * 2026-10-13 (docs/plans/active/ga-channel-pages-plan.md; the boards in
 * docs/plans/assets/ga-channel-pages/): Channels with its figures, the
 * channels a day, the channel map and what a visit is worth above the table;
 * a channel's page with its figures, the channel a day, where it lands, the
 * pages behind the change and its table in each view; AI assistants with
 * their own parts. Each, rendered with sample figures in English, reads as
 * the outline saved in docs/plans/assets/ga-channel-pages/look/.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/analytics/site_1", search: "" }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

const PLAN = "ga-channel-pages";

const DAYS = Array.from({ length: 30 }, (_, at) => `2026-09-${String(at + 1).padStart(2, "0")}`);

const CHANNELS_TOP = {
  state: "READY" as const,
  figures: {
    visits: 248, visitsBefore: 199, conversions: 3, conversionsBefore: 4, value: 75_000, seconds: 11_000,
    best: { channel: "AI assistants", rate: 0.059, siteRate: 0.015, visits: 254 },
    uncounted: [{ eventName: "form_submit", count: 7, enquiry: true }],
  },
  map: {
    kinds: [{ kind: "SERVICE", name: null }, { kind: "ARTICLE", name: null }, { kind: "NO_PAGE", name: null }],
    rows: [
      { channel: "Organic Search", visits: 192, cells: [{ kind: "SERVICE", visits: 69, conversions: 0 }, { kind: "ARTICLE", visits: 53, conversions: 0 }, { kind: "NO_PAGE", visits: 32, conversions: 0 }] },
      { channel: "Direct", visits: 40, cells: [{ kind: "SERVICE", visits: 6, conversions: 0 }, { kind: "ARTICLE", visits: 0, conversions: 0 }, { kind: "NO_PAGE", visits: 4, conversions: 0 }] },
    ],
  },
  worth: {
    siteRate: 0.015, few: 100,
    rows: [{ channel: "AI assistants", visits: 254, conversions: 15, value: 30_000, fewVisits: false }, { channel: "Organic Search", visits: 3305, conversions: 36, value: 72_000, fewVisits: false }],
  },
  everyDevice: false,
  seen: channelsPageSees({
    rows: [
      { channel: "Organic Search", visits: 192, visitsBefore: 150, conversions: 0, conversionsBefore: 3 },
      { channel: "Direct", visits: 40, visitsBefore: 33, conversions: 3, conversionsBefore: 0 },
    ],
    best: { channel: "AI assistants", rate: 0.059, siteRate: 0.015 },
    uncounted: [{ eventName: "form_submit", count: 7, enquiry: true, channel: "Organic Search" }],
    noPage: 38,
    ai: null,
  }),
};

const CHANNEL_CHART = {
  live: false, channels: ["Organic Search", "Direct"], rest: false,
  points: DAYS.map((day, at) => ({ day, visits: [6, 1], conversions: [0, at % 10 === 0 ? 1 : 0] })),
};

const KINDS = [
  { kind: "SERVICE", name: null, pages: 19, visits: 69, visitsBefore: 83, conversions: 0, conversionsBefore: 2 },
  { kind: "ARTICLE", name: null, pages: 15, visits: 53, visitsBefore: 29, conversions: 0, conversionsBefore: 0 },
  { kind: "NO_PAGE", name: null, pages: 1, visits: 32, visitsBefore: 15, conversions: 0, conversionsBefore: 0 },
];

function channelTop(channel: string) {
  return {
    state: "READY" as const, from: "2026-09-13", to: "2026-10-12",
    figures: {
      visits: 192, visitsBefore: 150, engaged: 146, seconds: 9_600, people: 138, newPeople: 128, conversions: 0, conversionsBefore: 3,
      value: 0, valueBefore: 60_000, started: 0, startedBefore: 4, siteVisits: 248, siteEngaged: 190, siteSeconds: 11_600, siteConversions: 3, elsewhere: 0,
    },
    kinds: KINDS,
    movers: [
      { key: "~1", address: "https://www.acme-shop.test/blog/a/", visits: 17, visitsBefore: 9 },
      { key: "~0", address: "https://www.acme-shop.test/ai-agency/", visits: 33, visitsBefore: 49 },
    ],
    assistants: channel === "AI assistants"
      ? [{ name: "ChatGPT", visits: 221, visitsBefore: 114, conversions: 14, filed: [{ channel: "Referral", visits: 120 }, { channel: "AI Assistant", visits: 41 }] }]
      : [],
    everyDevice: false,
    everyAssistant: true,
    seen: channelPageSees({
      channel,
      figures: { visits: 192, visitsBefore: 150, engaged: 146, people: 138, newPeople: 128, conversions: 0, conversionsBefore: 3, started: 0 },
      kinds: KINDS,
      pages: [{ key: "/ai-agency/", visits: 33, visitsBefore: 49, conversions: 0, conversionsBefore: 2 }],
      noPage: { visits: 32, engaged: 1 },
      uncounted: [],
      copies: [],
      ai: null,
      spans: null,
    }),
  };
}

const DAY = (day: string) => ({ day, visits: 6, engaged: 5, seconds: 300, conversions: 0, events: [1, 0], sources: [5, 1] });
const CHANNEL_DAYS = {
  live: false, liveBefore: false, from: "2026-09-01", to: "2026-09-30",
  events: [{ eventName: "form_submit", counted: false }, { eventName: "generate_lead", counted: true }],
  sources: ["google", "bing"], rest: false,
  now: DAYS.map(DAY), before: DAYS.map(DAY),
};

const EVENTS = {
  rows: [
    { eventName: "form_submit", counted: false, count: 6, countBefore: 3, value: 0, landed: [{ address: "https://www.acme-shop.test/ai-agency/", count: 2 }], landedMore: 2 },
    { eventName: "generate_lead", counted: true, count: 0, countBefore: 3, value: 0, landed: [], landedMore: 0 },
  ],
};

function answer(queries: Record<string, unknown>) {
  vi.mocked(useQuery).mockImplementation(answerQueries(queries));
  vi.mocked(useMutation).mockImplementation((() => vi.fn()) as never);
  vi.mocked(useAction).mockImplementation((() => vi.fn(() => new Promise(() => undefined))) as never);
}

function channelPage(channel: string, rows: unknown[]) {
  answer({
    "googleAnalyticsConnect:googleAnalyticsStatus": STATUS,
    "googleAnalyticsChannelReads:analyticsChannelTop": channelTop(channel),
    "googleAnalyticsChannelReads:analyticsChannelDays": CHANNEL_DAYS,
    "googleAnalyticsChannelReads:analyticsChannelEvents": EVENTS,
    "googleAnalyticsReads:analyticsListPage": list(rows),
    "pageKinds:pageKindChoices": null,
  });
}

beforeEach(() => {
  vi.mocked(useQuery).mockReset();
  vi.mocked(useMutation).mockReset();
  vi.mocked(useAction).mockReset();
});
afterEach(cleanup);

describe("Channels and a channel's own page: the approved looks", () => {
  it("Channels", async () => {
    nav.pathname = "/app/analytics/site_1/channels";
    nav.search = "";
    answer({
      "googleAnalyticsConnect:googleAnalyticsStatus": STATUS,
      "googleAnalyticsChannelReads:analyticsChannelsTop": CHANNELS_TOP,
      "googleAnalyticsChartReads:analyticsChannelChart": CHANNEL_CHART,
      "googleAnalyticsReads:analyticsListPage": list([{ ...CHANNEL, started: 0, landsMost: { kind: "SERVICE", name: null, share: 0.359 } }]),
      "pageKinds:pageKindChoices": null,
    });
    const { container } = render(<AnalyticsChannelsPage />);
    await openHakkenSees();
    await screen.findByText(/Organic Search brought the most visits, 82\.8% of them, but none converted/);
    await expectApprovedLook(container, PLAN, "Main", "Google Analytics → Channels");
  });

  it("a channel's own page, on its landing pages", async () => {
    nav.pathname = "/app/analytics/site_1/channels/channel";
    nav.search = "key=Organic+Search";
    channelPage("Organic Search", [{ ...ROW, kind: "SERVICE" }]);
    const { container } = render(<AnalyticsChannelPage />);
    await openHakkenSees();
    await screen.findByText(/Organic Search brought 192 visits, up from 150, but no conversions, down from 3\./);
    await screen.findByText("Conversions it started");
    await expectApprovedLook(container, PLAN, "Organic", "Google Analytics → a channel's page, its landing pages");
  });

  it("a channel's own page, on its classifications", async () => {
    nav.pathname = "/app/analytics/site_1/channels/channel";
    nav.search = "key=Organic+Search&view=groups";
    channelPage("Organic Search", [{ ...ROW, key: "SERVICE", label: "SERVICE", members: 19 }]);
    const { container } = render(<AnalyticsChannelPage />);
    await screen.findByText("19 pages");
    await expectApprovedLook(container, PLAN, "OrganicGroups", "Google Analytics → a channel's page, its classifications");
  });

  it("a channel's own page, on every key event", async () => {
    nav.pathname = "/app/analytics/site_1/channels/channel";
    nav.search = "key=Organic+Search&view=events";
    channelPage("Organic Search", []);
    const { container } = render(<AnalyticsChannelPage />);
    await screen.findByText("+2 more");
    await expectApprovedLook(container, PLAN, "OrganicConversions", "Google Analytics → a channel's page, its key events");
  });

  it("a channel's own page, on its sources", async () => {
    nav.pathname = "/app/analytics/site_1/channels/channel";
    nav.search = "key=Organic+Search&view=sources";
    channelPage("Organic Search", [{ ...CHANNEL, key: "google", label: "google" }]);
    const { container } = render(<AnalyticsChannelPage />);
    await screen.findByText("google");
    await expectApprovedLook(container, PLAN, "OrganicSources", "Google Analytics → a channel's page, its sources");
  });

  it("AI assistants, with their own parts", async () => {
    nav.pathname = "/app/analytics/site_1/channels/channel";
    nav.search = "key=AI+assistants";
    channelPage("AI assistants", [{ ...CHANNEL, key: "ChatGPT", label: "ChatGPT", elsewhere: 180 }]);
    const { container } = render(<AnalyticsChannelPage />);
    await screen.findAllByText("Filed elsewhere");
    await expectApprovedLook(container, PLAN, "AiAssistants", "Google Analytics → AI assistants");
  });
});
