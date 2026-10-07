import type { EmailContent } from "./emailLayoutService";
import type { EmailPicture } from "./utils/emailPictures";
import { emailWording } from "./utils/emailWording";
import { lineOf, pathOf, type TaskCondition } from "./utils/hakkenTaskRules";

/**
 * A Hakken task's alert email (hakken-tasks-plan.md, items 1.4 and 3.2, board
 * EmailAlertB): the day's figure big, what it was and when, its usual day and
 * the rule they set, the four weeks to it as a picture with the days that met
 * the rule marked, and the way to the screen it came from. The subject is the
 * Watcher's checked words. Plain code, so the outbox template and the dev
 * preview (`src/app/api/email-preview`) build the same email.
 */
export function buildTaskAlertEmail(args: {
  language: string;
  brand: { platformName: string; appUrl: string };
  task: { title: string; target?: { website: string; page?: string }; condition?: TaskCondition };
  payload: Record<string, unknown>;
}): { subject: string; content: EmailContent; pictures: EmailPicture[] } | { skip: string } {
  const { brand, task, payload } = args;
  const headline = typeof payload.headline === "string" ? payload.headline : "";
  const body = typeof payload.body === "string" ? payload.body : "";
  if (!headline || !body) return { skip: "It says nothing of what happened." };
  const wording = emailWording(args.language);
  const words = wording.taskAlert;
  // An alert on AI answers or a ranking (item 4.3): what the newest answer or check said, in the Watcher's words; no chart.
  if (payload.watch && typeof payload.watch === "object") {
    const link = typeof payload.link === "string" && payload.link.startsWith("/") ? payload.link : "/app/hakken-tasks";
    return {
      subject: headline,
      content: {
        kind: task.target ? `${words.kind} · ${task.target.website}` : words.kind,
        verdict: headline,
        lede: body,
        actions: [
          { label: words.seeWhatHappened, url: `${brand.appUrl}${link}`, emphasis: "primary" },
          { label: words.askWhy({ platformName: brand.platformName }), url: `${brand.appUrl}/app/assistant`, emphasis: "secondary" },
        ],
        quiet: [words.whyYouGetIt({ platformName: brand.platformName })],
      },
      pictures: [],
    };
  }
  const value = typeof payload.value === "number" ? payload.value : null;
  const usual = typeof payload.usual === "number" ? payload.usual : null;
  const link = typeof payload.link === "string" && payload.link.startsWith("/") ? payload.link : "/app/hakken-tasks";
  const day = typeof payload.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.day) ? payload.day : null;
  const measure = payload.measure === "impressions" ? "impressions" : "visitors";
  const series = seriesOf(payload.series);
  const condition = task.condition;

  const number = (count: number) => count.toLocaleString(wording.dateLocale);
  const said = (on: string, options: Intl.DateTimeFormatOptions) => new Date(`${on}T12:00:00Z`).toLocaleDateString(wording.dateLocale, { ...options, timeZone: "UTC" });
  const what = task.target?.page ? pathOf(task.target.page) : (task.target?.website ?? task.title);
  const quiet = !condition || condition.op === "below" || condition.op === "dropBy";
  const marked = series ? series.met.filter(Boolean).length : null;
  const line = condition ? lineOf(condition, usual) : undefined;
  const lede = [
    usual !== null ? words.usually({ what, usual: number(usual), measure }) : null,
    condition ? words.youAsked({ rule: words.rule({ op: condition.op, value: number(condition.value), days: condition.days }) }) : null,
  ].filter((part): part is string => part !== null).join(" ");

  return {
    subject: headline,
    content: {
      kind: task.target ? `${words.kind} · ${task.target.website}` : words.kind,
      ...(value !== null && day
        ? { figure: number(value), verdict: (measure === "visitors" ? words.visitorsOn : words.shownOn)({ day: said(day, { weekday: "long", day: "numeric", month: "long" }) }) }
        : { verdict: headline }),
      lede: lede || body,
      ...(series && day && marked !== null
        ? {
            picture: {
              cid: TASK_CHART_CID,
              alt: words.chartAlt({ measure, marked, quiet }),
              ...(line !== undefined ? { note: words.yourLine({ value: number(line) }) } : {}),
              from: said(series.from, { day: "numeric", month: "short" }),
              to: said(day, { weekday: "short", day: "numeric", month: "short" }),
            },
          }
        : {}),
      stats: [
        ...(usual !== null ? [{ label: words.usualDay, value: number(usual) }] : []),
        ...(marked !== null ? [{ label: quiet ? words.quietDays : words.busyDays, value: number(marked) }] : []),
      ],
      actions: [
        { label: words.seeWhatHappened, url: `${brand.appUrl}${link}`, emphasis: "primary" },
        { label: words.askWhy({ platformName: brand.platformName }), url: `${brand.appUrl}/app/assistant`, emphasis: "secondary" },
      ],
      quiet: [day ? words.settles({ weekday: said(day, { weekday: "long" }), platformName: brand.platformName }) : words.whyYouGetIt({ platformName: brand.platformName })],
    },
    pictures: series && day ? [{ cid: TASK_CHART_CID, bars: { values: series.values, marked: series.met, ...(line !== undefined ? { line } : {}) } }] : [],
  };
}

/** The task alert's chart, by its content id. */
export const TASK_CHART_CID = "task-chart";

/** The alert's four weeks from its payload, or nothing when they are not there or do not line up. */
function seriesOf(value: unknown): { from: string; values: number[]; met: boolean[] } | null {
  if (!value || typeof value !== "object") return null;
  const series = value as { from?: unknown; values?: unknown; met?: unknown };
  if (typeof series.from !== "string" || !Array.isArray(series.values) || !Array.isArray(series.met)) return null;
  if (series.values.length === 0 || series.values.length !== series.met.length || series.values.length > 60) return null;
  if (!series.values.every((entry) => typeof entry === "number") || !series.met.every((entry) => typeof entry === "boolean")) return null;
  return { from: series.from, values: series.values as number[], met: series.met as boolean[] };
}

