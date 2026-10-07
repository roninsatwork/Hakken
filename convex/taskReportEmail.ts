import type { EmailContent } from "./emailLayoutService";
import { emailWording } from "./utils/emailWording";
import { signed } from "./utils/hakkenReports";
import { clockOf } from "./utils/hakkenTaskTiming";
import { pathOf } from "./utils/hakkenTaskRules";

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
}): { subject: string; content: EmailContent } | { skip: string } {
  const { brand, payload } = args;
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
