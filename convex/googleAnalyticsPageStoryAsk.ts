import type { ActionCtx } from "./_generated/server";
import { ask, askList, numberPages, type CollectTarget, type Session } from "./googleAnalyticsCollect";
import { channelKey, emptyRow, type ListRow } from "./googleAnalyticsLists";
import type { ReportAsk, ReportRow } from "./googleAnalyticsApi";
import type { AnalyticsList } from "./googleAnalyticsSchema";
import { CLICK_EVENTS, READ_EVENTS, joined, referrerUrls } from "./utils/analyticsPageStory";

/**
 * A page's story, asked of Google when its All pages screen opens
 * (docs/plans/active/analytics-page-screen-plan.md §4, PS3) and held until
 * the next collection, as its views a day and the page before each view are
 * (GA23). Free: Google charges nothing. Each answer is a list of its own,
 * read back by `googleAnalyticsPageStory.ts`.
 */

/** The lists a page's story is held as, each by its own name (`pageAsk`). */
export const STORY_LISTS = [
  "storySourcePages", "storyPagesSeen", "storyBack", "storyRead", "storyPageRead", "storyPageVisits", "storyNext",
  "storyDevices", "storyWeekdays", "storyCountries", "storyAges", "storyAgesConverted",
  "storyGenders", "storyGendersConverted", "storyClicks", "storyGroupRead",
] as const;
export type StoryList = (typeof STORY_LISTS)[number];

type Flags = { folded: boolean; thresholded: boolean; cut: boolean };
type Write = (name: StoryList | "channel", list: AnalyticsList, rows: ListRow[], flags: Flags) => Promise<void>;
type Failure = { ok: false; reason: string };

/**
 * Every question of a page's story, asked side by side, each answer written
 * as it comes. `paths` are the page as Analytics may name it, slashed or not;
 * `counted`, the events the company counts as conversions. A refusal stops
 * the rest and is answered as the screen's other live asks are.
 */
export async function askPageStory(
  ctx: ActionCtx,
  session: Session,
  target: CollectTarget,
  range: { from: string; to: string },
  paths: string[],
  counted: readonly string[],
  device: string | undefined,
  write: Write,
): Promise<{ ok: true } | Failure> {
  const property = target.property!;
  const landed = { dimension: "landingPage", values: paths };
  const viewed = { dimension: "pagePath", values: paths };
  const base: Omit<ReportAsk, "dimensions" | "metrics"> = {
    startDate: range.from,
    endDate: range.to,
    hostNames: target.addresses,
    countries: [target.country],
    ...(device ? { device } : {}),
  };
  const flagsOf = (answer: Flags): Flags => ({ folded: answer.folded, thresholded: answer.thresholded, cut: answer.cut });
  const rowsOf = (rows: readonly ReportRow[], fill: (row: ListRow, answer: ReportRow) => void, keyOf = (answer: ReportRow) => joined(...answer.keys)) => {
    const held = new Map<string, ListRow>();
    for (const answer of rows) {
      const key = keyOf(answer);
      const row = held.get(key) ?? emptyRow(key);
      fill(row, answer);
      held.set(key, row);
    }
    return [...held.values()];
  };
  const source = (answer: ReportRow) => channelKey(answer.keys[0] ?? "", answer.keys[1] ?? "");

  const asks: Array<() => Promise<{ ok: true } | Failure>> = [
    // Each source's visits that started here: their figures and the conversions they went on to make (the channel list, as the
    // Landing pages screen asks it, under the same name).
    async () => {
      const channels = await askList(session, target, "channel", [], range, { landingPage: paths, ...(device ? { device } : {}) });
      if (!channels.ok) return channels;
      await write("channel", "channel", [...channels.groups.values()].flat(), channels.flags);
      return { ok: true };
    },
    // The pages visits that started here saw: each page once a visit, by source and by page (different pages a visit).
    async () => {
      const answer = await ask(session, property, { ...base, dimensions: ["sessionDefaultChannelGroup", "sessionSource", "pagePath"], metrics: ["sessions", "screenPageViews"], only: landed });
      if (!answer.ok) return answer;
      await write("storySourcePages", "channel", rowsOf(answer.rows, (row, one) => {
        row.visits += one.values[0] ?? 0;
        row.views += one.values[1] ?? 0;
      }, source), flagsOf(answer));
      const pages = rowsOf(answer.rows, (row, one) => {
        row.visits += one.values[0] ?? 0;
        row.views += one.values[1] ?? 0;
      }, (one) => one.keys[2] ?? "");
      await write("storyPagesSeen", "page", await numberPages(ctx, target, pages, "page"), flagsOf(answer));
      return { ok: true };
    },
    // Each source's visits by people new and back again: the visits that started here, by visits, never by people — one
    // person can be both, a first visit and then back.
    async () => {
      const answer = await ask(session, property, { ...base, dimensions: ["sessionDefaultChannelGroup", "sessionSource", "newVsReturning"], metrics: ["sessions"], only: landed });
      if (!answer.ok) return answer;
      await write("storyBack", "channel", rowsOf(answer.rows, (row, one) => { row.visits += one.values[0] ?? 0; }, (one) => joined(source(one), one.keys[2] ?? "")), flagsOf(answer));
      return { ok: true };
    },
    // Each source's views of this page, and those read past 90% down, in visits that started here.
    async () => {
      const answer = await ask(session, property, { ...base, dimensions: ["sessionDefaultChannelGroup", "sessionSource", "eventName"], metrics: ["eventCount"], eventNames: [...READ_EVENTS], only: [landed, viewed] });
      if (!answer.ok) return answer;
      await write("storyRead", "event", rowsOf(answer.rows, (row, one) => { row.times = (row.times ?? 0) + (one.values[0] ?? 0); }, (one) => joined(source(one), one.keys[2] ?? "")), flagsOf(answer));
      return { ok: true };
    },
    // This page's views, and those read past 90% down, from every visit.
    async () => {
      const answer = await ask(session, property, { ...base, dimensions: ["eventName"], metrics: ["eventCount"], eventNames: [...READ_EVENTS], only: viewed });
      if (!answer.ok) return answer;
      await write("storyPageRead", "event", rowsOf(answer.rows, (row, one) => { row.times = (row.times ?? 0) + (one.values[0] ?? 0); }), flagsOf(answer));
      return { ok: true };
    },
    // The visits that saw this page, and its views: its views a visit, and so its repeats.
    async () => {
      const answer = await ask(session, property, { ...base, dimensions: [], metrics: ["sessions", "screenPageViews"], only: viewed });
      if (!answer.ok) return answer;
      await write("storyPageVisits", "page", rowsOf(answer.rows, (row, one) => {
        row.visits += one.values[0] ?? 0;
        row.views += one.values[1] ?? 0;
      }, () => "all"), flagsOf(answer));
      return { ok: true };
    },
    // The website's pages viewed straight after this one: their page before is this page's address.
    async () => {
      const answer = await ask(session, property, { ...base, dimensions: ["pagePath"], metrics: ["screenPageViews"], only: { dimension: "pageReferrer", values: referrerUrls(target.addresses, paths[0]) } });
      if (!answer.ok) return answer;
      const rows = rowsOf(answer.rows, (row, one) => { row.views += one.values[0] ?? 0; }, (one) => one.keys[0] ?? "");
      // A view of this page whose page before is itself is one of its repeats, counted apart.
      const onward = rows.filter((row) => !paths.includes(row.key));
      await write("storyNext", "page", await numberPages(ctx, target, onward, "page"), flagsOf(answer));
      return { ok: true };
    },
    // Its views on each device: every device, whatever the screen is set to.
    async () => {
      const { device: _device, ...everyDevice } = base;
      const answer = await ask(session, property, { ...everyDevice, dimensions: ["deviceCategory"], metrics: ["screenPageViews"], only: viewed });
      if (!answer.ok) return answer;
      await write("storyDevices", "page", rowsOf(answer.rows, (row, one) => { row.views += one.values[0] ?? 0; }, (one) => (one.keys[0] ?? "").toLowerCase()), flagsOf(answer));
      return { ok: true };
    },
    // Its views by day of the week.
    async () => {
      const answer = await ask(session, property, { ...base, dimensions: ["dayOfWeek"], metrics: ["screenPageViews"], only: viewed });
      if (!answer.ok) return answer;
      await write("storyWeekdays", "page", rowsOf(answer.rows, (row, one) => { row.views += one.values[0] ?? 0; }), flagsOf(answer));
      return { ok: true };
    },
    // Its readers in every country, whatever the screen's home country (PS8).
    async () => {
      const { countries: _countries, ...everyCountry } = base;
      const answer = await ask(session, property, { ...everyCountry, dimensions: ["countryId"], metrics: ["totalUsers", "screenPageViews"], only: viewed });
      if (!answer.ok) return answer;
      await write("storyCountries", "page", rowsOf(answer.rows, (row, one) => {
        row.people += one.values[0] ?? 0;
        row.views += one.values[1] ?? 0;
      }, (one) => (one.keys[0] ?? "").toUpperCase()), flagsOf(answer));
      return { ok: true };
    },
    // Its readers' age and gender, and the conversions from visits that started here by each, where Google can tell (PS7).
    ...(["userAgeBracket", "userGender"] as const).flatMap((dimension) => {
      const [readers, converted]: [StoryList, StoryList] = dimension === "userAgeBracket" ? ["storyAges", "storyAgesConverted"] : ["storyGenders", "storyGendersConverted"];
      return [
        async (): Promise<{ ok: true } | Failure> => {
          const answer = await ask(session, property, { ...base, dimensions: [dimension], metrics: ["totalUsers"], only: viewed });
          if (!answer.ok) return answer;
          await write(readers, dimension === "userAgeBracket" ? "age" : "gender", rowsOf(answer.rows, (row, one) => { row.people += one.values[0] ?? 0; }, (one) => (one.keys[0] ?? "").toLowerCase()), flagsOf(answer));
          return { ok: true };
        },
        async (): Promise<{ ok: true } | Failure> => {
          if (counted.length === 0) {
            await write(converted, "event", [], { folded: false, thresholded: false, cut: false });
            return { ok: true };
          }
          // Split by event too, as every ask of the counted events is (`askList`), and added up: Google's own count of each,
          // or its visits for one counted once a visit (conversions-back-in-time-plan.md BT1, BT6).
          const answer = await ask(session, property, { ...base, dimensions: [dimension, "eventName"], metrics: ["eventCount", "sessions"], eventNames: [...counted], only: landed });
          if (!answer.ok) return answer;
          const perVisit = new Set(target.perVisit);
          const countOf = (one: ReportRow) => (perVisit.has(one.keys[1] ?? "") ? one.values[1] : one.values[0]) ?? 0;
          await write(converted, "event", rowsOf(answer.rows, (row, one) => { row.times = (row.times ?? 0) + countOf(one); }, (one) => (one.keys[0] ?? "").toLowerCase()), flagsOf(answer));
          return { ok: true };
        },
      ];
    }),
    // The links out and downloads its readers clicked.
    async () => {
      const answer = await ask(session, property, { ...base, dimensions: ["eventName", "linkUrl"], metrics: ["eventCount"], eventNames: [...CLICK_EVENTS], only: viewed });
      if (!answer.ok) return answer;
      await write("storyClicks", "event", rowsOf(answer.rows, (row, one) => { row.times = (row.times ?? 0) + (one.values[0] ?? 0); }), flagsOf(answer));
      return { ok: true };
    },
    // Every page's readers past 90% down, for its page group's share against its views (PS5).
    async () => {
      const answer = await ask(session, property, { ...base, dimensions: ["pagePath"], metrics: ["eventCount"], eventNames: ["scroll"] });
      if (!answer.ok) return answer;
      const rows = rowsOf(answer.rows, (row, one) => { row.times = (row.times ?? 0) + (one.values[0] ?? 0); }, (one) => one.keys[0] ?? "");
      await write("storyGroupRead", "event", await numberPages(ctx, target, rows, "page"), flagsOf(answer));
      return { ok: true };
    },
  ];
  const answers = await Promise.all(asks.map((one) => one()));
  return answers.find((answer): answer is Failure => !answer.ok) ?? { ok: true };
}
