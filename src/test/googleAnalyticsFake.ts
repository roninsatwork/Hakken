import { vi } from "vitest";

/**
 * A Google Analytics property faked at the network, for the tests of its
 * collection and its screens' reads (docs/plans/active/google-analytics-plan.md
 * §4, §5): a log of visits answered as the Data API answers — split by the
 * dimensions asked, filtered by address, event, country and dates, added up. Nothing
 * reaches Google.
 */

export const PROPERTY = "properties/312456789";
export const NEWEST = "2026-10-08";

function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** One line of the fake property's log: a day's visits on one device, channel, source, landing page and page. */
export type Visit = {
  date: string;
  device: string;
  channel: string;
  source: string;
  landing: string;
  page: string;
  host?: string;
  /** Google's two-letter `countryId`: the United Kingdom unless a test says otherwise. */
  country?: string;
  /** The page's title: "Title of <page>" unless a test says otherwise. */
  title?: string;
  /** The page viewed just before (`pageReferrer`): none unless a test says otherwise. */
  referrer?: string;
  /** A shop's products on the line (§18.6.6): each looked at, added to the basket, bought, and its revenue. */
  items?: Array<{ name: string; category: string; viewed: number; added: number; bought: number; revenue: number }>;
  /** Who the visitors were (§18.6.6): new, on Chrome and Windows, their age, gender and interests unknown, unless a test says otherwise. */
  visitor?: "new" | "returning";
  browser?: string;
  system?: string;
  age?: string;
  gender?: string;
  interest?: string;
  /** The channel that first brought the visitor (`firstUserDefaultChannelGroup`, Insights I35): the visit's own unless a test says otherwise. */
  firstChannel?: string;
  /** A tagged link's campaign, medium and words (`utm_campaign`, `utm_medium`, `utm_term`): none unless a test says otherwise. */
  campaign?: string;
  medium?: string;
  term?: string;
  /**
   * What the line's events were about (§18.6.5): the link a click followed,
   * the file downloaded, the words searched, how far a scroll went, the video.
   * Each of the line's events carries it.
   */
  about?: Partial<Record<"linkUrl" | "fileName" | "searchTerm" | "percentScrolled" | "videoTitle", string>>;
  sessions: number;
  engaged: number;
  seconds: number;
  views: number;
  purchases?: number;
  revenue?: number;
  events?: Record<string, [number, number]>;
};

const FIELD: Record<string, (visit: Visit) => string> = {
  date: (visit) => visit.date.replaceAll("-", ""),
  yearMonth: (visit) => visit.date.slice(0, 7).replace("-", ""),
  deviceCategory: (visit) => visit.device,
  sessionDefaultChannelGroup: (visit) => visit.channel,
  firstUserDefaultChannelGroup: (visit) => visit.firstChannel ?? visit.channel,
  firstUserSource: (visit) => visit.source,
  sessionSource: (visit) => visit.source,
  landingPage: (visit) => visit.landing,
  pagePath: (visit) => visit.page,
  hostName: (visit) => visit.host ?? "www.acme-shop.test",
  countryId: (visit) => visit.country ?? "GB",
  pageTitle: (visit) => visit.title ?? `Title of ${visit.page}`,
  pageReferrer: (visit) => visit.referrer ?? "",
  newVsReturning: (visit) => visit.visitor ?? "new",
  browser: (visit) => visit.browser ?? "Chrome",
  operatingSystem: (visit) => visit.system ?? "Windows",
  userAgeBracket: (visit) => visit.age ?? "unknown",
  userGender: (visit) => visit.gender ?? "unknown",
  brandingInterest: (visit) => visit.interest ?? "unknown",
  sessionCampaignName: (visit) => visit.campaign ?? (visit.channel === "Direct" ? "(direct)" : "(organic)"),
  sessionMedium: (visit) => visit.medium ?? "(none)",
  sessionManualTerm: (visit) => visit.term ?? "(not set)",
  linkUrl: (visit) => visit.about?.linkUrl ?? "(not set)",
  fileName: (visit) => visit.about?.fileName ?? "(not set)",
  searchTerm: (visit) => visit.about?.searchTerm ?? "(not set)",
  percentScrolled: (visit) => visit.about?.percentScrolled ?? "(not set)",
  videoTitle: (visit) => visit.about?.videoTitle ?? "(not set)",
};

/** The figures a log line carries, in the order asked before the second round. */
const BASE_METRICS = ["sessions", "engagedSessions", "userEngagementDuration", "screenPageViews", "ecommercePurchases", "purchaseRevenue"];

/** Someone on the website in the last 30 minutes, for Google's live figures (§18.6.7). */
export type LivePerson = { minutesAgo: number; city: string; page: string; device: string; views: number; country?: string; events?: Record<string, number> };

export type Google = { visits: Visit[]; live?: LivePerson[]; reportStatus?: number; calls: { url: string; body: string }[] };

type Filter = { filter?: { fieldName: string; inListFilter?: { values: string[] }; stringFilter?: { value: string } }; andGroup?: { expressions: Filter[] } };

function passes(visit: Visit, filter: Filter | undefined, eventName?: string): boolean {
  if (!filter) return true;
  if (filter.andGroup) return filter.andGroup.expressions.every((one) => passes(visit, one, eventName));
  const field = filter.filter!;
  const value = field.fieldName === "eventName" ? eventName ?? "" : FIELD[field.fieldName](visit);
  if (field.inListFilter) return field.inListFilter.values.map((entry) => entry.toLowerCase()).includes(value.toLowerCase());
  return value.toLowerCase() === (field.stringFilter?.value ?? "").toLowerCase();
}

export function fakeGoogle(visits: Visit[]): Google {
  const google: Google = { visits, calls: [] };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? init.body : "";
    google.calls.push({ url, body });
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "ya29.renewed", expires_in: 3599 });
    if (url === `https://analyticsdata.googleapis.com/v1beta/${PROPERTY}:runReport`) {
      if (google.reportStatus) return new Response("refused", { status: google.reportStatus });
      const ask = JSON.parse(body) as {
        dateRanges: { startDate: string; endDate: string }[];
        dimensions: { name: string }[];
        metrics: { name: string }[];
        dimensionFilter?: Filter;
        offset: number;
      };
      if (ask.offset > 0) return Response.json({ rows: [], rowCount: 0 });
      const { startDate, endDate } = ask.dateRanges[0];
      const names = ask.dimensions.map((dimension) => dimension.name);
      const metrics = ask.metrics.map((metric) => metric.name);
      // A product list (§18.6.6): each product of each line, by its own name and category, never mixed with visits.
      if (metrics.includes("itemsViewed")) {
        const items = new Map<string, { keys: string[]; values: number[] }>();
        for (const visit of google.visits) {
          if (visit.date < ask.dateRanges[0].startDate || visit.date > ask.dateRanges[0].endDate || !passes(visit, ask.dimensionFilter)) continue;
          for (const item of visit.items ?? []) {
            const keys = ask.dimensions.map(({ name }) => (name === "itemName" ? item.name : name === "itemCategory" ? item.category : FIELD[name](visit)));
            const sum = items.get(keys.join("|")) ?? { keys, values: [0, 0, 0, 0] };
            [item.viewed, item.added, item.bought, item.revenue].forEach((value, at) => (sum.values[at] += value));
            items.set(keys.join("|"), sum);
          }
        }
        const rows = [...items.values()].map((sum) => ({ dimensionValues: sum.keys.map((value) => ({ value })), metricValues: sum.values.map((value) => ({ value: String(value) })) }));
        return Response.json({ rows, rowCount: rows.length, metadata: {} });
      }
      // Every event, as Events asks (§18.6.5): times, people and visits — a line's page views and visit starts among them.
      const everyEvent = metrics.includes("eventCount");
      const byEvent = names.includes("eventName") || everyEvent;
      const sums = new Map<string, { keys: string[]; values: number[] }>();
      for (const visit of google.visits) {
        if (visit.date < startDate || visit.date > endDate) continue;
        const happened: Array<[string, number]> = everyEvent
          ? [["page_view", visit.views], ["session_start", visit.sessions], ...Object.entries(visit.events ?? {}).map(([eventName, [count]]) => [eventName, count] as [string, number])]
          : [];
        const lines: Array<{ eventName?: string; values: number[] }> = everyEvent
          ? happened.filter(([, count]) => count > 0).map(([eventName, count]) => ({
            eventName,
            values: metrics.map((metric) => (metric === "eventCount" ? count : metric === "totalUsers" ? Math.ceil(count / 2) : metric === "sessions" ? Math.min(count, visit.sessions) : 0)),
          }))
          : byEvent
            ? Object.entries(visit.events ?? {}).map(([eventName, [count, value]]) => ({ eventName, values: [count, value] }))
            : [{ values: [visit.sessions, visit.engaged, visit.seconds, visit.views, visit.purchases ?? 0, visit.revenue ?? 0] }];
        for (const line of lines) {
          if (!passes(visit, ask.dimensionFilter, line.eventName)) continue;
          const keys = names.map((name) => (name === "eventName" ? line.eventName! : FIELD[name](visit)));
          const sum = sums.get(keys.join("|")) ?? { keys, values: line.values.map(() => 0) };
          line.values.forEach((value, index) => (sum.values[index] += value));
          sums.set(keys.join("|"), sum);
        }
      }
      // People, as Google counts them, from each row's own visits taken whole: a group of rows has fewer people than its
      // rows' people added up, so a test can tell a whole ask from one added up (google-analytics-plan.md §18.6.2).
      const metricOf = (name: string, values: number[]): number => {
        const [sessions] = values;
        if (name === "totalUsers") return Math.ceil(Math.sqrt(sessions) * 10);
        if (name === "newUsers") return Math.floor(Math.sqrt(sessions) * 7);
        if (name === "averageSessionDuration") return sessions > 0 ? 75 : 0;
        return values[BASE_METRICS.indexOf(name)] ?? 0;
      };
      const rows = [...sums.values()].map((sum) => ({
        dimensionValues: sum.keys.map((value) => ({ value })),
        metricValues: (byEvent ? sum.values : ask.metrics.map((metric) => metricOf(metric.name, sum.values))).map((value) => ({ value: String(value) })),
      }));
      return Response.json({ rows, rowCount: rows.length, metadata: {} });
    }
    // Google's live figures (§18.6.7): each person counted once, their views and events added up.
    if (url === `https://analyticsdata.googleapis.com/v1beta/${PROPERTY}:runRealtimeReport`) {
      const ask = JSON.parse(body) as { dimensions: { name: string }[]; metrics: { name: string }[]; dimensionFilter?: Filter; minuteRanges?: { startMinutesAgo: number; endMinutesAgo: number }[] };
      const range = ask.minuteRanges?.[0] ?? { startMinutesAgo: 29, endMinutesAgo: 0 };
      const field = (person: LivePerson, name: string, eventName?: string) => (
        name === "minutesAgo" ? String(person.minutesAgo).padStart(2, "0") : name === "city" ? person.city : name === "unifiedScreenName" ? person.page
          : name === "deviceCategory" ? person.device : name === "countryId" ? person.country ?? "GB" : name === "eventName" ? eventName ?? "" : "");
      const keep = (person: LivePerson, filter: Filter | undefined, eventName?: string): boolean => {
        if (!filter) return true;
        if (filter.andGroup) return filter.andGroup.expressions.every((one) => keep(person, one, eventName));
        const value = field(person, filter.filter!.fieldName, eventName).toLowerCase();
        return filter.filter!.inListFilter ? filter.filter!.inListFilter.values.map((one) => one.toLowerCase()).includes(value) : value === (filter.filter!.stringFilter?.value ?? "").toLowerCase();
      };
      const names = ask.dimensions.map(({ name }) => name);
      const byEvent = names.includes("eventName") || ask.metrics.some(({ name }) => name === "eventCount");
      const sums = new Map<string, { keys: string[]; values: number[] }>();
      for (const person of google.live ?? []) {
        if (person.minutesAgo > range.startMinutesAgo || person.minutesAgo < range.endMinutesAgo) continue;
        const lines = byEvent ? Object.entries(person.events ?? {}).map(([eventName, count]) => ({ eventName, count })) : [{ eventName: undefined, count: 0 }];
        for (const line of lines) {
          if (!keep(person, ask.dimensionFilter, line.eventName)) continue;
          const keys = names.map((name) => field(person, name, line.eventName));
          const sum = sums.get(keys.join("|")) ?? { keys, values: ask.metrics.map(() => 0) };
          ask.metrics.forEach(({ name }, at) => (sum.values[at] += name === "activeUsers" ? 1 : name === "screenPageViews" ? person.views : name === "eventCount" ? line.count : 0));
          sums.set(keys.join("|"), sum);
        }
      }
      const rows = [...sums.values()].map((sum) => ({ dimensionValues: sum.keys.map((value) => ({ value })), metricValues: sum.values.map((value) => ({ value: String(value) })) }));
      return Response.json({ rows, rowCount: rows.length });
    }
    // Google's funnel report (§18.6.5): the people of each line with the first event, and of those lines the ones with a later one too.
    if (url === `https://analyticsdata.googleapis.com/v1alpha/${PROPERTY}:runFunnelReport`) {
      type Step = { filterExpression: { funnelEventFilter?: { eventName: string }; orGroup?: { expressions: { funnelEventFilter: { eventName: string } }[] } } };
      const ask = JSON.parse(body) as { dateRanges: { startDate: string; endDate: string }[]; funnel: { steps: Step[] }; dimensionFilter?: Filter };
      const { startDate, endDate } = ask.dateRanges[0];
      const namesOf = (step: Step) => step.filterExpression.funnelEventFilter
        ? [step.filterExpression.funnelEventFilter.eventName]
        : (step.filterExpression.orGroup?.expressions ?? []).map((one) => one.funnelEventFilter.eventName);
      const [first, then] = ask.funnel.steps.map(namesOf);
      let did = 0;
      let after = 0;
      for (const visit of google.visits) {
        if (visit.date < startDate || visit.date > endDate || !passes(visit, ask.dimensionFilter)) continue;
        const count = first.reduce((sum, name) => sum + (visit.events?.[name]?.[0] ?? 0), 0);
        if (count === 0) continue;
        did += Math.ceil(count / 2);
        if (then.some((name) => (visit.events?.[name]?.[0] ?? 0) > 0)) after += Math.ceil(count / 2);
      }
      const row = (step: string, people: number) => ({ dimensionValues: [{ value: step }], metricValues: [{ value: String(people) }] });
      return Response.json({ funnelTable: { rows: [row("1. did", did), row("2. then", after)] } });
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  }));
  return google;
}

/** A plain day on the website: two devices, two channels, a lead from organic search. */
export function dayOf(date: string, scale = 1): Visit[] {
  return [
    {
      date, device: "mobile", channel: "Organic Search", source: "google", landing: "/", page: "/",
      sessions: 10 * scale, engaged: 6 * scale, seconds: 300 * scale, views: 20 * scale, events: { generate_lead: [1 * scale, 0] },
    },
    {
      date, device: "desktop", channel: "Referral", source: "perplexity.ai", landing: "/ai-agency/", page: "/ai-agency/",
      sessions: 4 * scale, engaged: 3 * scale, seconds: 200 * scale, views: 9 * scale, events: { click_tel: [1 * scale, 0] },
    },
    {
      date, device: "desktop", channel: "Direct", source: "(direct)", landing: "/contact/?utm=x", page: "/contact/",
      sessions: 2 * scale, engaged: 2 * scale, seconds: 90 * scale, views: 3 * scale,
    },
    // Another address in the property: never read.
    {
      date, device: "desktop", channel: "Direct", source: "(direct)", landing: "/", page: "/", host: "staging.acme-shop.test",
      sessions: 50, engaged: 50, seconds: 50, views: 50,
    },
  ];
}

export function history(days: number, newest = NEWEST): Visit[] {
  const out: Visit[] = [];
  for (let at = 0; at < days; at += 1) out.push(...dayOf(shiftDay(newest, -at)));
  return out;
}

