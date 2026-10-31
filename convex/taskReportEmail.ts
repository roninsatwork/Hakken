import type { EmailContent } from "./emailLayoutService";
import type { EmailPicture } from "./utils/emailPictures";
import { TASK_CHART_CID } from "./taskAlertEmail";
import { emailWording } from "./utils/emailWording";
import { signed } from "./utils/hakkenReports";
import { clockOf } from "./utils/hakkenTaskTiming";
import { pathOf } from "./utils/hakkenTaskRules";
import { ALPHA3_TO_ALPHA2 } from "./utils/countryCodes";

/**
 * A Hakken report's email (hakken-tasks-plan.md, item 4.1, board
 * EmailReportB): the pages' total change big, what it is and over which days,
 * each page with its change and its visitors in those days, and the way to
 * all of them. Built from the figures The Stat Report Agent read when it sent
 * it, so it says what was true then. Plain code, so the outbox template and
 * the dev preview build the same email.
 */
export function buildTaskReportEmail(args: {
  language: string;
  brand: { platformName: string; appUrl: string };
  payload: Record<string, unknown>;
}): { subject: string; content: EmailContent; pictures?: EmailPicture[] } | { skip: string } {
  const { brand, payload } = args;
  // A chart sent at a time (2026-10-31) is its own email: its bars, its figure, and the period before.
  if (payload.look === "analyticsChart") return buildTaskChartEmail(args);
  if (payload.look === "analyticsGroups") return buildTaskGroupsEmail(args);
  const wording = emailWording(args.language);
  const words = wording.taskReport;
  const pages = pagesOf(payload.pages);
  const day = (value: unknown) => (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);
  const from = day(payload.from);
  const to = day(payload.to);
  if (!pages || !from || !to || typeof payload.website !== "string") return { skip: "It says nothing of what the report found." };
  const direction = payload.direction === "gained" ? "gained" : "lost";
  const weekday = typeof payload.weekday === "number" ? payload.weekday : 1;
  const total = pages.reduce((sum, page) => sum + page.change, 0);
  const link = typeof payload.link === "string" && payload.link.startsWith("/") ? payload.link : "/app/hakken-tasks";
  const timeOfDay = typeof payload.timeOfDay === "string" ? payload.timeOfDay : "09:00";
  const number = (count: number) => count.toLocaleString(wording.dateLocale);
  const said = (on: string) => new Date(`${on}T12:00:00Z`).toLocaleDateString(wording.dateLocale, { day: "numeric", month: "long", timeZone: "UTC" });

  return {
    subject: pages.length > 0
      ? words.subject({ weekday, total: number(Math.abs(total)), pages: pages.length, direction })
      : words.noneMoved({ direction }),
    content: {
      kind: `${words.kind({ weekday })} · ${payload.website}`,
      ...(pages.length > 0
        ? { figure: signed(total, wording.dateLocale), verdict: words.across({ pages: pages.length }) }
        : { verdict: words.noneMoved({ direction }) }),
      lede: words.span({ from: said(from), to: said(to) }),
      facts: pages.map((page) => ({
        term: pathOf(page.page),
        value: signed(page.change, wording.dateLocale),
        note: words.visitorsThen({ count: number(page.now) }),
      })),
      actions: [{ label: words.seeAll, url: `${brand.appUrl}${link}`, emphasis: "primary" }],
      quiet: [words.youAsked({ weekday, time: args.language.startsWith("en") ? clockOf(timeOfDay) : timeOfDay, platformName: brand.platformName })],
    },
  };
}

/** The report's pages from its payload, or nothing when they are not there. */
function pagesOf(value: unknown): Array<{ page: string; now: number; change: number }> | null {
  if (!Array.isArray(value) || value.length > 10) return null;
  const pages = value.filter((entry): entry is { page: string; now: number; change: number } =>
    Boolean(entry) && typeof entry.page === "string" && typeof entry.now === "number" && typeof entry.change === "number");
  return pages.length === value.length ? pages : null;
}

/**
 * A chart sent at a time (sees-side-panel-plan-2026-10-31.md, phase 5): its whole period's figure big — the visits,
 * the conversions, or the share of visits that converted — the days it covers and the period before, the days as
 * bars in a picture that travels with the email, and the way to Google Analytics. Built from the figures read when
 * it was sent.
 */
export function buildTaskChartEmail(args: {
  language: string;
  brand: { platformName: string; appUrl: string };
  payload: Record<string, unknown>;
}): { subject: string; content: EmailContent; pictures: EmailPicture[] } | { skip: string } {
  const { brand, payload } = args;
  const wording = emailWording(args.language);
  const words = wording.taskChart;
  const day = (value: unknown) => (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);
  const from = day(payload.from);
  const to = day(payload.to);
  const measure = payload.measure === "conversions" || payload.measure === "conversionRate" ? payload.measure : "visits";
  const values = Array.isArray(payload.values) && payload.values.length <= 400 && payload.values.every((value) => typeof value === "number") ? payload.values as number[] : null;
  if (!from || !to || !values || values.length === 0 || typeof payload.website !== "string" || typeof payload.figure !== "number") return { skip: "It says nothing of what the chart showed." };
  const event = typeof payload.event === "string" ? payload.event : undefined;
  const once = payload.every === "once";
  const weekday = typeof payload.weekday === "number" ? payload.weekday : 1;
  const timeOfDay = typeof payload.timeOfDay === "string" ? payload.timeOfDay : "09:00";
  const link = typeof payload.link === "string" && payload.link.startsWith("/") ? payload.link : "/app/hakken-tasks";
  const shown = (value: number) => (measure === "conversionRate"
    ? `${value.toLocaleString(wording.dateLocale, { maximumFractionDigits: 1 })}%`
    : Math.round(value).toLocaleString(wording.dateLocale));
  const said = (on: string) => new Date(`${on}T12:00:00Z`).toLocaleDateString(wording.dateLocale, { day: "numeric", month: "long", timeZone: "UTC" });
  const title = words.title({ measure, ...(event ? { event } : {}) });
  return {
    subject: words.subject({ title, figure: shown(payload.figure) }),
    content: {
      kind: `${words.kind({ once, weekday })} · ${payload.website}`,
      figure: shown(payload.figure),
      verdict: words.figureIs({ measure }),
      lede: words.span({ from: said(from), to: said(to) }),
      picture: { cid: TASK_CHART_CID, alt: words.alt({ title, days: values.length }), from: said(from), to: said(to) },
      ...(typeof payload.figureBefore === "number" ? { paragraphs: [words.before({ figure: shown(payload.figureBefore) })] } : {}),
      actions: [{ label: words.open, url: `${brand.appUrl}${link}`, emphasis: "primary" }],
      quiet: [words.youAsked({ once, weekday, time: args.language.startsWith("en") ? clockOf(timeOfDay) : timeOfDay, platformName: brand.platformName })],
    },
    pictures: [{ cid: TASK_CHART_CID, bars: { values, marked: values.map(() => false) } }],
  };
}

/**
 * A chart of groups sent at a time (ask-hakken-every-chart-plan-2026-10-31.md, phase 3): the biggest group's figure big,
 * the period against the period before, each group a bar in a picture that travels with the email — its names and
 * figures written beside it, in the same order, so a reader who cannot see it misses nothing — and a grid's rows as
 * words: each step's highest and lowest group. Built from the figures read when it was sent.
 */
export function buildTaskGroupsEmail(args: {
  language: string;
  brand: { platformName: string; appUrl: string };
  payload: Record<string, unknown>;
}): { subject: string; content: EmailContent; pictures?: EmailPicture[] } | { skip: string } {
  const { brand, payload } = args;
  const wording = emailWording(args.language);
  const words = wording.taskChart;
  const kind = typeof payload.kind === "string" ? payload.kind : "bars";
  const by = typeof payload.by === "string" ? payload.by : "channel";
  const measure = payload.measure === "conversions" || payload.measure === "conversionRate" || payload.measure === "clicks" || payload.measure === "impressions" ? payload.measure : "visits";
  const event = typeof payload.event === "string" ? payload.event : undefined;
  const search = measure === "clicks" || measure === "impressions";
  const hours = by === "hour";
  const groups = Array.isArray(payload.groups) && payload.groups.length > 0 && payload.groups.length <= 20
    && payload.groups.every((group) => group && typeof group.name === "string" && typeof group.value === "number")
    ? payload.groups as Array<{ name: string; value: number; before?: number; visits?: number }>
    : null;
  if (!groups || typeof payload.website !== "string" || typeof payload.period !== "string") return { skip: "It says nothing of what the chart showed." };
  const rows = Array.isArray(payload.rows) ? payload.rows as Array<{ event: string; values: Array<number | null> }> : [];
  const once = payload.every === "once";
  const weekday = typeof payload.weekday === "number" ? payload.weekday : 1;
  const timeOfDay = typeof payload.timeOfDay === "string" ? payload.timeOfDay : "09:00";
  const link = typeof payload.link === "string" && payload.link.startsWith("/") ? payload.link : "/app/hakken-tasks";
  // Counts as whole numbers — a bar's clicks or visits, a grid of the week's times — and the rest as shares.
  const rate = hours ? false : measure === "conversionRate" || kind !== "bars";
  const shown = (value: number) => (rate ? `${value.toLocaleString(wording.dateLocale, { maximumFractionDigits: 1 })}%` : Math.round(value).toLocaleString(wording.dateLocale));
  // Search Console names a country by its three letters ("gbr"): said in the reader's language where it can be.
  const country = (code: string) => {
    const alpha2 = ALPHA3_TO_ALPHA2[code.toUpperCase()];
    try {
      return alpha2 ? new Intl.DisplayNames([wording.dateLocale], { type: "region" }).of(alpha2) ?? code.toUpperCase() : code.toUpperCase();
    } catch {
      return code.toUpperCase();
    }
  };
  const name = (group: string) => (group === "*" ? words.everyOther : search && by === "country" ? country(group) : group);
  const title = words.groupsTitle({ kind, by, measure, ...(event ? { event } : {}) });
  const top = groups.find((group) => group.name !== "*") ?? groups[0];
  // A scatter's groups are listed with their visits beside the rate; a grid's rows as each step's highest and lowest.
  const facts = kind === "grid"
    ? rows.map((row) => {
        const cells = row.values.map((value, at) => ({ value, name: name(groups[at]?.name ?? "") })).filter((cell): cell is { value: number; name: string } => cell.value !== null);
        const high = cells.reduce((best, cell) => (cell.value > best.value ? cell : best), cells[0]);
        const low = cells.reduce((worst, cell) => (cell.value < worst.value ? cell : worst), cells[0]);
        // A grid of the week names each row by its day, Google's Sunday 0.
        const label = hours ? words.weekday({ day: ((Number(row.event) + 6) % 7) + 1 }) : row.event.replace(/_/g, " ");
        return { term: label.charAt(0).toUpperCase() + label.slice(1), value: high ? shown(high.value) : "–", note: high && low ? words.gridRow({ high: `${high.name} ${shown(high.value)}`, low: `${low.name} ${shown(low.value)}` }) : "" };
      })
    : groups.map((group) => ({
        term: name(group.name),
        value: shown(group.value),
        note: kind === "scatter" && group.visits !== undefined
          ? `${Math.round(group.visits).toLocaleString(wording.dateLocale)} ${search ? words.timesShown : args.language.startsWith("it") ? "visite" : "visits"}`
          : group.before !== undefined ? words.before({ figure: shown(group.before) }) : "",
      }));
  const drawn = kind !== "grid";
  return {
    subject: words.subject({ title, figure: `${name(top.name)} ${shown(top.value)}` }),
    content: {
      kind: `${words.kind({ once, weekday })} · ${payload.website}`,
      figure: shown(top.value),
      verdict: words.groupsTop({ name: name(top.name) }),
      lede: words.groupsSpan({ period: payload.period }),
      ...(drawn ? { picture: { cid: TASK_CHART_CID, alt: words.groupsAlt({ title, count: groups.length }), from: name(groups[0].name), to: name(groups[groups.length - 1].name) } } : {}),
      facts,
      actions: [{ label: words.open, url: `${brand.appUrl}${link}`, emphasis: "primary" }],
      quiet: [words.youAsked({ once, weekday, time: args.language.startsWith("en") ? clockOf(timeOfDay) : timeOfDay, platformName: brand.platformName })],
    },
    ...(drawn ? { pictures: [{ cid: TASK_CHART_CID, bars: { values: groups.map((group) => group.value), marked: groups.map((group) => group.name === top.name) } }] } : {}),
  };
}
