import { vi } from "vitest";

/**
 * A Google Analytics property faked at the network, for the tests of its
 * collection and its screens' reads (docs/plans/active/google-analytics-plan.md
 * §4, §5): a log of visits answered as the Data API answers — split by the
 * dimensions asked, filtered by address, event and dates, added up. Nothing
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
  deviceCategory: (visit) => visit.device,
  sessionDefaultChannelGroup: (visit) => visit.channel,
  sessionSource: (visit) => visit.source,
  landingPage: (visit) => visit.landing,
  pagePath: (visit) => visit.page,
  hostName: (visit) => visit.host ?? "www.acme-shop.test",
};

export type Google = { visits: Visit[]; reportStatus?: number; calls: { url: string; body: string }[] };

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
      const byEvent = names.includes("eventName");
      const sums = new Map<string, { keys: string[]; values: number[] }>();
      for (const visit of google.visits) {
        if (visit.date < startDate || visit.date > endDate) continue;
        const lines: Array<{ eventName?: string; values: number[] }> = byEvent
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
      const rows = [...sums.values()].map((sum) => ({
        dimensionValues: sum.keys.map((value) => ({ value })),
        metricValues: sum.values.map((value) => ({ value: String(value) })),
      }));
      return Response.json({ rows, rowCount: rows.length, metadata: {} });
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

