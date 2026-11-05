import { v, type Infer } from "convex/values";

/**
 * A chart from the page a conversation started on (ask-hakken-every-chart-page-plan-2026-11-03.md, shared work 9):
 * every chart on a page registers what it draws — its title and the figures its download holds (`ChartCard`'s `csv`)
 * — and a conversation started from the eye's panel carries them (`startedOn.charts`), so Ask Hakken can redraw any of
 * them another way — bars, a pie, a line, the top ten, against the span before — from those same figures, never from
 * its own. Plain code, free of any Convex function, so the screens and the server read the same shape.
 */

/** Charts a conversation carries at most, rows of each, and columns of each: every chart a page draws. */
export const MOST_PAGE_CHARTS = 12;
export const MOST_PAGE_CHART_ROWS = 200;
export const MOST_PAGE_CHART_COLUMNS = 10;
/** Groups a redrawn chart draws at most: a top ten, or a line's days, or a map's boxes. */
const MOST_GROUPS = 20;
const MOST_BOXES = 40;
const MOST_POINTS = 200;

/** A chart as the page drew it: its title, and its download's columns and rows. */
export const pageChartTableValidator = v.object({
  title: v.string(),
  columns: v.array(v.string()),
  rows: v.array(v.array(v.union(v.string(), v.number(), v.null()))),
});
export type PageChartTable = Infer<typeof pageChartTableValidator>;

export const PAGE_CHART_KINDS = ["bars", "pie", "line", "stacked", "map"] as const;
export type PageChartKind = (typeof PAGE_CHART_KINDS)[number];

/** A page's chart, redrawn under an answer: its figures the page's own, kept on the message. */
export const pageChartValidator = v.object({
  look: v.literal("pageChart"),
  kind: v.union(...PAGE_CHART_KINDS.map((kind) => v.literal(kind))),
  /** The page's own title for the chart, and the column drawn. */
  title: v.string(),
  measure: v.string(),
  /** The column set against it as the span before, where one was asked for. */
  against: v.optional(v.string()),
  groups: v.array(v.object({ name: v.string(), value: v.number(), before: v.optional(v.number()) })),
  /** The page the figures came from. */
  link: v.string(),
});
export type PageChart = Infer<typeof pageChartValidator>;

/**
 * A chart's download read back into columns and rows (`toCsv`, `siteFormat.ts`): quoted cells, doubled quotes, and the
 * quote a cell starting like a formula is kept behind. A number reads as a number; an empty cell as nothing.
 */
export function tableFromCsv(title: string, csv: string): PageChartTable | null {
  const lines = splitCsv(csv);
  if (lines.length < 2) return null;
  const [head, ...body] = lines;
  const columns = head.slice(0, MOST_PAGE_CHART_COLUMNS).map((cell) => cell.trim());
  if (columns.length === 0) return null;
  const rows = body.slice(0, MOST_PAGE_CHART_ROWS).map((line) => columns.map((_, at) => cellValue(line[at] ?? "")));
  return { title: title.slice(0, 120), columns, rows };
}

function cellValue(raw: string): string | number | null {
  const text = /^'[=+\-@\t\r]/.test(raw) ? raw.slice(1) : raw;
  if (text.trim() === "") return null;
  const number = Number(text);
  return /^-?\d+(\.\d+)?$/.test(text.trim()) && Number.isFinite(number) ? number : text.slice(0, 120);
}

function splitCsv(csv: string): string[][] {
  const lines: string[][] = [];
  let line: string[] = [];
  let cell = "";
  let quoted = false;
  for (let at = 0; at < csv.length; at += 1) {
    const char = csv[at];
    if (quoted) {
      if (char === '"' && csv[at + 1] === '"') {
        cell += '"';
        at += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      line.push(cell);
      cell = "";
    } else if (char === "\n") {
      line.push(cell);
      lines.push(line);
      line = [];
      cell = "";
    } else if (char !== "\r") cell += char;
  }
  line.push(cell);
  lines.push(line);
  return lines.filter((one) => one.some((value) => value.trim() !== ""));
}

/** A column's place by its name, as the page names it, whatever its case. */
const columnAt = (table: PageChartTable, name: string | undefined) => (name ? table.columns.findIndex((column) => column.toLowerCase() === name.trim().toLowerCase()) : -1);
const isNumberColumn = (table: PageChartTable, at: number) => table.rows.some((row) => typeof row[at] === "number") && table.rows.every((row) => row[at] === null || typeof row[at] === "number");
const DAY = /^\d{4}-\d{2}(-\d{2})?$/;

/**
 * A page's chart redrawn: `measure` the column drawn (the first column of figures when none is named), `against` a
 * column set beside it as the span before, `top` the biggest so many, `only` one thing's rows (a page's routes on Funnel),
 * `kind` bars, a pie, a line, stacked bars or a map. The rows are named by the first column of words; a line or a chart of days keeps the page's order, every other kind the biggest first.
 */
export function pageChartFrom(whole: PageChartTable, ask: { kind?: string; measure?: string; against?: string; top?: number; only?: string; link: string }): { ok: true; chart: PageChart } | { ok: false; problem: string } {
  const figures = whole.columns.map((_, at) => at).filter((at) => isNumberColumn(whole, at));
  const words = whole.columns.map((_, at) => at).filter((at) => !isNumberColumn(whole, at));
  if (words.length === 0 || figures.length === 0) return { ok: false, problem: `"${whole.title}" holds no figures to draw.` };
  // One thing's rows, such as a page's routes: named by the next column of words, the same name added up.
  const wanted = ask.only?.trim().toLowerCase();
  const says = (row: PageChartTable["rows"][number], at: number) => typeof row[at] === "string" && (row[at] as string).trim().toLowerCase() === wanted;
  const heldIn = wanted ? words.find((at) => whole.rows.some((row) => says(row, at))) : undefined;
  if (wanted && heldIn === undefined) return { ok: false, problem: `"${whole.title}" has no rows for "${ask.only}".` };
  const table = heldIn === undefined ? whole : { ...whole, rows: whole.rows.filter((row) => says(row, heldIn)) };
  const named = heldIn === undefined ? words[0] : (words.find((at) => at !== heldIn) ?? heldIn);
  // Two columns of words name a row together when the first alone repeats: a route is its from and its to.
  const firstNames = table.rows.map((row) => String(row[named] ?? ""));
  const nameBoth = heldIn === undefined && words.length > 1 && new Set(firstNames).size < firstNames.length;
  const nameOf = (row: PageChartTable["rows"][number]) => (nameBoth ? `${String(row[named])} · ${String(row[words[1]])}` : String(row[named]));
  const value = ask.measure ? columnAt(table, ask.measure) : figures[0];
  if (value < 0 || !figures.includes(value)) return { ok: false, problem: `"${table.title}" has no column of figures called "${ask.measure}". Its columns: ${table.columns.join(", ")}.` };
  const before = ask.against ? columnAt(table, ask.against) : -1;
  if (ask.against && (before < 0 || !figures.includes(before))) return { ok: false, problem: `"${table.title}" has no column of figures called "${ask.against}". Its columns: ${table.columns.join(", ")}.` };
  const dated = table.rows.every((row) => typeof row[named] === "string" && DAY.test(row[named] as string));
  const kind: PageChartKind = (PAGE_CHART_KINDS as readonly string[]).includes(ask.kind ?? "") ? (ask.kind as PageChartKind) : dated ? "line" : "bars";
  let groups = table.rows
    .filter((row) => typeof row[value] === "number" && row[named] !== null)
    .map((row) => ({ name: nameOf(row), value: row[value] as number, ...(before >= 0 && typeof row[before] === "number" ? { before: row[before] as number } : {}) }));
  if (heldIn !== undefined) {
    const added = new Map<string, (typeof groups)[number]>();
    for (const group of groups) {
      const held = added.get(group.name);
      if (held) added.set(group.name, { ...held, value: held.value + group.value, ...(group.before !== undefined ? { before: (held.before ?? 0) + group.before } : {}) });
      else added.set(group.name, group);
    }
    groups = [...added.values()];
  }
  // Days stay in order, whatever they're drawn as, unless only the biggest few were asked for.
  const inDayOrder = kind === "line" || (dated && !ask.top);
  if (!inDayOrder) groups = [...groups].sort((left, right) => right.value - left.value);
  const held = kind === "map" ? MOST_BOXES : MOST_GROUPS;
  const most = inDayOrder ? MOST_POINTS : Math.min(held, ask.top && ask.top > 0 ? Math.floor(ask.top) : held);
  groups = groups.slice(0, most);
  if (groups.length === 0) return { ok: false, problem: `"${table.title}" has no rows with "${table.columns[value]}" to draw.` };
  return {
    ok: true,
    chart: { look: "pageChart", kind, title: table.title, measure: table.columns[value], ...(before >= 0 ? { against: table.columns[before] } : {}), groups, link: ask.link },
  };
}

/** A page's charts as a conversation keeps them: at most so many, each held to its rows and columns. */
export function keptCharts(charts: readonly PageChartTable[]): PageChartTable[] {
  return charts.slice(0, MOST_PAGE_CHARTS).map((chart) => ({
    title: chart.title.slice(0, 120),
    columns: chart.columns.slice(0, MOST_PAGE_CHART_COLUMNS).map((column) => column.slice(0, 80)),
    rows: chart.rows.slice(0, MOST_PAGE_CHART_ROWS).map((row) => row.slice(0, MOST_PAGE_CHART_COLUMNS).map((cell) => (typeof cell === "string" ? cell.slice(0, 120) : cell))),
  }));
}

/** The page's charts as Ask Hakken is told them: each by its number, title and columns, for it to name one. */
export function pageChartLines(charts: readonly PageChartTable[]): string[] {
  return charts.slice(0, MOST_PAGE_CHARTS).map((chart, at) => `${at + 1}. ${chart.title} — columns: ${chart.columns.join(", ")} (${chart.rows.length} rows)`);
}
