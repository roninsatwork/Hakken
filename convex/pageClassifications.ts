import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { includesSearchTerm, normalizeSearchTerm, paginateItems } from "./adminQueryService";
import { FAN_OUT_LIMITS, readFanOutLimits, type FanOutLimits } from "./fanOutLimits";
import { classificationLineKindValidator, classificationTypeValidator } from "./pagesSchema";
import { superAdminMutation, superAdminQuery, type TenantMutationCtx } from "./tenantFunctions";
import { appError } from "./utils/appError";
import {
  classifierFor,
  normalisePage,
  type ClassificationLine,
  type ClassificationLineKind,
  type ClassificationPick,
  type PageClassification,
} from "./utils/pageClassification";
import { suggestClassifications } from "./utils/suggestClassifications";
import { isTrackedHold } from "./utils/websitePairing";

/**
 * A company's own classifications of its website's pages (docs/plans/active/
 * page-groups-plan.md, decision 6): each a name and a type, the address lines
 * that catch pages for it, and pages set by hand. Set only in admin for now,
 * on the Page classification page — so every read and write here takes a
 * website (the company's hold) and stays inside it, and the helpers are
 * exported for the client's own screens to call later behind their own
 * access check.
 *
 * - **One rule**, `classifierFor`: a page set by hand keeps it, a page taken
 *   out by hand is Not sorted, otherwise the more exact line wins. No order
 *   to manage.
 * - **Removing a page's classification**: one set by hand goes back to what
 *   its lines give it; one a line gave is taken out of the line, Not sorted
 *   until it is set again.
 * - **A competitor has none**: refused, read and write.
 * - **Limits** (`fanOutLimits.ts`): classifications, address lines (all
 *   together) and pages set by hand or taken out, per website. At a limit a
 *   write is refused, naming the limit and where to raise it; a list already
 *   past a lowered limit may still be edited down.
 */

type Reader = { db: QueryCtx["db"] };
type HoldId = Id<"companyWebsites">;
type ClassificationId = Id<"pageClassifications">;
type LineInput = { kind: ClassificationLineKind; value: string };

/**
 * Pages read for one website, most clicks first. Showing a page's
 * classification, filtering by one and counting Not sorted all mean
 * classifying the whole list, so it is read whole — up to this many, the
 * most a read can hold beside its classifications, lines and picks within
 * Convex's per-read limits. Past it, the pages with the fewest clicks are
 * left out, and the screen says so (`summary.cut`).
 */
export const PAGES_READ = 10_000;
/** Pages a classification's own page lists as its lines are edited, most clicks first; the rest are counted. */
export const PREVIEW_PAGES = 25;
const NAME_LENGTH = 60;
const LINE_LENGTH = 200;
/** The most rows one page of the Pages view may ask for. */
const ROWS_MOST = 100;
/** Pages named in one audit entry for a bulk set; the rest are counted. */
const AUDIT_PAGES = 20;

/** Each list is read up to its limit's largest choice, so a limit lowered later never hides what was set under a higher one. */
const mostOf = (key: "classificationsPerSite" | "classificationLinesPerSite" | "classifiedPagesPerSite") =>
  Math.max(...FAN_OUT_LIMITS[key].choices);

const GONE = "That website is no longer held by this company.";
const COMPETITOR = "A competitor has no classifications: only the company's own websites have their pages classified.";
const NOT_ITS_OWN = "That classification is not one of this website's.";

// ── The website and what it has set ───────────────────────────────────────

/** One of the company's own websites; null when it is no longer held. A competitor is refused. */
async function ownHold(ctx: Reader, companyWebsiteId: HoldId): Promise<Doc<"companyWebsites"> | null> {
  const hold = await ctx.db.get(companyWebsiteId);
  if (!hold) return null;
  if (isTrackedHold(hold)) throw appError("INVALID_INPUT", COMPETITOR);
  return hold;
}

async function requireOwnHold(ctx: Reader, companyWebsiteId: HoldId): Promise<Doc<"companyWebsites">> {
  const hold = await ownHold(ctx, companyWebsiteId);
  if (!hold) throw appError("NOT_FOUND", GONE);
  return hold;
}

/** A classification of this website, or refused: another website's is never touched through this one. */
async function requireItsClassification(ctx: Reader, companyWebsiteId: HoldId, classificationId: ClassificationId) {
  const classification = await ctx.db.get(classificationId);
  if (!classification || classification.companyWebsiteId !== companyWebsiteId) throw appError("NOT_FOUND", NOT_ITS_OWN);
  return classification;
}

export type ClassificationSetup = {
  classifications: Doc<"pageClassifications">[];
  lines: Doc<"pageClassificationLines">[];
  picks: Doc<"pageClassificationPicks">[];
};

/** A website's classifications, their lines and its pages set by hand, each in the order added. */
export async function readClassificationSetup(ctx: Reader, companyWebsiteId: HoldId): Promise<ClassificationSetup> {
  const [classifications, lines, picks] = await Promise.all([
    ctx.db.query("pageClassifications").withIndex("by_hold", (q) => q.eq("companyWebsiteId", companyWebsiteId)).take(mostOf("classificationsPerSite")),
    ctx.db.query("pageClassificationLines").withIndex("by_hold", (q) => q.eq("companyWebsiteId", companyWebsiteId)).take(mostOf("classificationLinesPerSite")),
    ctx.db.query("pageClassificationPicks").withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", companyWebsiteId)).take(mostOf("classifiedPagesPerSite")),
  ]);
  return { classifications, lines, picks };
}

const asLine = (line: Doc<"pageClassificationLines">): ClassificationLine<ClassificationId> =>
  ({ classificationId: line.classificationId, kind: line.kind, value: line.value });

/** The website's lines and picks as the rule reads them, keeping only those of classifications it still has. Shared with the charts' reads (`pageKinds.ts`). */
export function ruleInputs(setup: ClassificationSetup) {
  const known = new Set<string>(setup.classifications.map((classification) => classification._id));
  return {
    lines: setup.lines.filter((line) => known.has(line.classificationId)).map(asLine),
    picks: setup.picks
      .filter((pick) => pick.classificationId === undefined || known.has(pick.classificationId))
      .map((pick): ClassificationPick<ClassificationId> => ({ page: pick.page, classificationId: pick.classificationId ?? null })),
  };
}

/** The pages of a website, most clicks first, up to `PAGES_READ`. */
async function readHoldPages(ctx: Reader, companyWebsiteId: HoldId) {
  const rows = await ctx.db
    .query("holdPages")
    .withIndex("by_hold_clicks", (q) => q.eq("companyWebsiteId", companyWebsiteId))
    .order("desc")
    .take(PAGES_READ + 1);
  return { pages: rows.slice(0, PAGES_READ), cut: rows.length > PAGES_READ };
}

export type ClassifiedPage = {
  page: string;
  clicks: number;
  sitemapFile: string | null;
  result: PageClassification<ClassificationId>;
  /** What its lines give it without its pick: where removing a hand-set classification returns it. */
  underneath: ClassificationId | null;
};

/** Every page with its classification and how it was set, most clicks first, then A to Z. */
export function classifyPages(setup: ClassificationSetup, pages: readonly Pick<Doc<"holdPages">, "page" | "clicks" | "sitemapFile">[]): ClassifiedPage[] {
  const inputs = ruleInputs(setup);
  const classify = classifierFor(inputs.lines, inputs.picks);
  const byLines = classifierFor(inputs.lines, []);
  return pages
    .map((row) => {
      const sitemapFile = row.sitemapFile ?? null;
      const result = classify(row.page, sitemapFile);
      const picked = result.how === "BY_HAND" || result.how === "TAKEN_OUT";
      return { page: row.page, clicks: row.clicks, sitemapFile, result, underneath: picked ? byLines(row.page, sitemapFile).classificationId : null };
    })
    .sort((left, right) => right.clicks - left.clicks || left.page.localeCompare(right.page));
}

function summarise(classified: readonly ClassifiedPage[], setup: ClassificationSetup, limits: FanOutLimits, cut: boolean) {
  const sorted = classified.filter((row) => row.result.classificationId !== null).length;
  return {
    pages: classified.length,
    sorted,
    notSorted: classified.length - sorted,
    cut,
    pagesRead: PAGES_READ,
    classifications: setup.classifications.length,
    lines: setup.lines.length,
    picks: setup.picks.length,
    limits: {
      classifications: limits.classificationsPerSite,
      lines: limits.classificationLinesPerSite,
      picks: limits.classifiedPagesPerSite,
    },
  };
}

// ── Checking what is written ──────────────────────────────────────────────

/** Why a line cannot be kept. The screen says each in its own words; a write refuses with the English below. */
export type LineProblem = "EMPTY" | "TOO_LONG" | "SPACES" | "EVERY_PAGE" | "NO_WORD" | "AFTER_MARK" | "TWICE" | "TAKEN";

const WORD = /[\p{L}\p{N}]/u;

/**
 * A line as it is kept: an address or its start as a path (`normalisePage`),
 * a part in lower case, a sitemap file by its own name (`post-sitemap.xml`,
 * whatever address it was pasted as). Refused when it could catch nothing,
 * or every page.
 */
export function tidyLine(kind: ClassificationLineKind, raw: string): { value: string } | { problem: LineProblem } {
  const trimmed = raw.trim();
  if (trimmed === "") return { problem: "EMPTY" };
  if (trimmed.length > LINE_LENGTH) return { problem: "TOO_LONG" };
  if (/\s/.test(trimmed)) return { problem: "SPACES" };
  switch (kind) {
    case "STARTS_WITH": {
      const value = normalisePage(trimmed);
      return value === "/" ? { problem: "EVERY_PAGE" } : { value };
    }
    case "EXACT":
      return { value: normalisePage(trimmed) };
    case "CONTAINS": {
      if (/[#?]/.test(trimmed)) return { problem: "AFTER_MARK" };
      const value = trimmed.toLowerCase();
      return WORD.test(value) ? { value } : { problem: "NO_WORD" };
    }
    case "SITEMAP_FILE": {
      const value = (trimmed.split(/[?#]/)[0].split("/").filter(Boolean).pop() ?? "").toLowerCase();
      return WORD.test(value) ? { value } : { problem: "NO_WORD" };
    }
  }
}

function problemSentence(problem: LineProblem, kind: ClassificationLineKind, on: string | null): string {
  switch (problem) {
    case "EMPTY":
    case "NO_WORD":
      if (kind === "SITEMAP_FILE") return "Write the sitemap file's name, such as post-sitemap.xml.";
      return problem === "EMPTY" ? "Write the part of the address to look for, such as /hub/." : '"Contains" needs a word or a number to look for, such as brand.';
    case "TOO_LONG": return `Keep a line to ${LINE_LENGTH} characters.`;
    case "SPACES": return "An address has no spaces, so a line with one would catch nothing.";
    case "EVERY_PAGE": return '"Starts with /" would catch every page. Use "Is exactly /" for the home page, or a longer start such as /hub/.';
    case "AFTER_MARK": return 'Pages are compared without anything after "#" or "?", so a line can\'t look for it.';
    case "TWICE": return "That line is listed twice.";
    case "TAKEN": return `That line is already on "${on ?? ""}".`;
  }
}

type ReviewedLine = LineInput & { problem: LineProblem | null; on: string | null };

/**
 * Each line tidied and checked. `others` are the website's lines on every
 * other classification: the same line on two would tie, so the second is
 * refused (`TAKEN`), naming the one it is on.
 */
function reviewLines(lines: readonly LineInput[], others: readonly Doc<"pageClassificationLines">[], setup: ClassificationSetup): ReviewedLine[] {
  const nameOf = new Map<string, string>(setup.classifications.map((classification) => [classification._id, classification.name]));
  const taken = new Map(others.map((line) => [`${line.kind} ${line.value}`, nameOf.get(line.classificationId) ?? ""]));
  const seen = new Set<string>();
  return lines.map((line) => {
    const tidy = tidyLine(line.kind, line.value);
    if ("problem" in tidy) return { ...line, problem: tidy.problem, on: null };
    const key = `${line.kind} ${tidy.value}`;
    const owner = taken.get(key);
    if (owner !== undefined) return { ...line, problem: "TAKEN", on: owner };
    if (seen.has(key)) return { ...line, problem: "TWICE", on: null };
    seen.add(key);
    return { kind: line.kind, value: tidy.value, problem: null, on: null };
  });
}

/** The lines as kept, or refused at the first that cannot be. */
function checkedLines(lines: readonly LineInput[], others: readonly Doc<"pageClassificationLines">[], setup: ClassificationSetup): LineInput[] {
  const reviewed = reviewLines(lines, others, setup);
  const wrong = reviewed.find((line) => line.problem !== null);
  if (wrong?.problem) throw appError("INVALID_INPUT", problemSentence(wrong.problem, wrong.kind, wrong.on));
  return reviewed.map(({ kind, value }) => ({ kind, value }));
}

function checkedName(raw: string, setup: ClassificationSetup, self: ClassificationId | null): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name === "") throw appError("INVALID_INPUT", "Give the classification a name.");
  if (name.length > NAME_LENGTH) throw appError("INVALID_INPUT", `Keep the name to ${NAME_LENGTH} characters.`);
  if (name.toLowerCase() === "not sorted") {
    throw appError("INVALID_INPUT", '"Not sorted" is what a page with no classification shows, so it can\'t be a classification\'s name.');
  }
  const clash = setup.classifications.find((classification) => classification._id !== self && classification.name.toLowerCase() === name.toLowerCase());
  if (clash) throw appError("INVALID_INPUT", `This website already has a classification called "${clash.name}".`);
  return name;
}

function holdToClassifications(count: number, limit: number) {
  if (count < limit) return;
  throw appError(
    "INVALID_INPUT",
    `This website can have ${limit} classifications${count > limit ? `, and already has ${count}` : ""}. Raise "Classifications per website" on its Limits page to add more.`,
  );
}

/** More lines than the limit can't be added, though a list already past a lowered limit can still be cut down. */
function holdToLines(before: number, after: number, limit: number) {
  if (after <= limit || after <= before) return;
  throw appError(
    "INVALID_INPUT",
    `This website's classifications can have ${limit} address lines in all, and this would make ${after}. Raise "Address lines per website" on its Limits page to add more.`,
  );
}

function holdToPicks(before: number, after: number, limit: number) {
  if (after <= limit || after <= before) return;
  throw appError(
    "INVALID_INPUT",
    `This website can have ${limit} pages set by hand or taken out of a line, and this would make ${after}. Raise "Pages set by hand per website" on its Limits page, or catch these pages with an address line instead.`,
  );
}

async function audit(
  ctx: TenantMutationCtx,
  hold: Doc<"companyWebsites">,
  actionType: string,
  entity: { type: "pageClassifications" | "companyWebsites"; id: string },
  metadata: Record<string, unknown>,
) {
  await ctx.db.insert("auditLogs", {
    actorId: ctx.userId,
    actionType,
    entityId: entity.id,
    entityType: entity.type,
    companyId: hold.companyId,
    metadata: JSON.stringify(metadata),
    timestamp: Date.now(),
  });
}

const linesOf = (setup: ClassificationSetup, classificationId: ClassificationId) =>
  setup.lines.filter((line) => line.classificationId === classificationId);

const plainLines = (lines: readonly LineInput[]) => lines.map(({ kind, value }) => ({ kind, value }));

// ── Reads ─────────────────────────────────────────────────────────────────

const howValidator = v.union(v.literal("BY_HAND"), v.literal("BY_LINE"), v.literal("TAKEN_OUT"), v.literal("NONE"));
const lineValueShape = v.object({ kind: classificationLineKindValidator, value: v.string() });
const savedLineShape = v.object({ _id: v.id("pageClassificationLines"), kind: classificationLineKindValidator, value: v.string() });
const classificationShape = v.object({ _id: v.id("pageClassifications"), name: v.string(), type: classificationTypeValidator });
const problemValidator = v.union(
  v.literal("EMPTY"), v.literal("TOO_LONG"), v.literal("SPACES"), v.literal("EVERY_PAGE"),
  v.literal("NO_WORD"), v.literal("AFTER_MARK"), v.literal("TWICE"), v.literal("TAKEN"),
);
const summaryShape = v.object({
  /** Pages read: every page of the website, up to `pagesRead`. */
  pages: v.number(),
  sorted: v.number(),
  notSorted: v.number(),
  /** True when the website has more pages than `pagesRead`: those with the fewest clicks are left out. */
  cut: v.boolean(),
  pagesRead: v.number(),
  classifications: v.number(),
  lines: v.number(),
  picks: v.number(),
  limits: v.object({ classifications: v.number(), lines: v.number(), picks: v.number() }),
});

const shapeClassification = (classification: Doc<"pageClassifications">) =>
  ({ _id: classification._id, name: classification.name, type: classification.type });

const shapeLine = (line: Doc<"pageClassificationLines">) => ({ _id: line._id, kind: line.kind, value: line.value });

/**
 * The Pages view: every page of a website with its classification and how it
 * was set — by hand, by a line (and which), taken out of its line, or none —
 * most clicks first, a page at a time, with a search, a filter by one
 * classification or by Not sorted, and how many are sorted.
 */
export const pageClassificationPages = superAdminQuery({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    search: v.optional(v.string()),
    /** One classification, or the pages none catches. */
    classification: v.optional(v.union(v.id("pageClassifications"), v.literal("NOT_SORTED"))),
    page: v.number(),
    rows: v.number(),
  },
  returns: v.union(
    v.null(),
    v.object({
      rows: v.array(v.object({
        page: v.string(),
        clicks: v.number(),
        sitemapFile: v.union(v.string(), v.null()),
        classificationId: v.union(v.id("pageClassifications"), v.null()),
        how: howValidator,
        /** The line that caught it, when a line did. */
        line: v.union(lineValueShape, v.null()),
        underneath: v.union(v.id("pageClassifications"), v.null()),
      })),
      page: v.number(),
      totalPages: v.number(),
      /** Pages matching the search and filter. */
      total: v.number(),
      classifications: v.array(classificationShape),
      summary: summaryShape,
    }),
  ),
  handler: async (ctx, args) => {
    const hold = await ownHold(ctx, args.companyWebsiteId);
    if (!hold) return null;
    const [setup, held, limits] = await Promise.all([
      readClassificationSetup(ctx, hold._id),
      readHoldPages(ctx, hold._id),
      readFanOutLimits(ctx, hold.companyId, hold._id),
    ]);
    const classified = classifyPages(setup, held.pages);
    const term = normalizeSearchTerm(args.search);
    const wanted = args.classification;
    const filtered = classified.filter((row) => {
      if (term && !includesSearchTerm(row.page, term)) return false;
      if (wanted === undefined) return true;
      return wanted === "NOT_SORTED" ? row.result.classificationId === null : row.result.classificationId === wanted;
    });
    const rows = Math.min(ROWS_MOST, Math.max(1, Math.floor(args.rows) || 1));
    const lastPage = Math.max(1, Math.ceil(filtered.length / rows));
    const page = Math.min(lastPage, Math.max(1, Math.floor(args.page) || 1));
    const slice = paginateItems(filtered, page, rows);
    return {
      rows: slice.data.map((row) => ({
        page: row.page,
        clicks: row.clicks,
        sitemapFile: row.sitemapFile,
        classificationId: row.result.classificationId,
        how: row.result.how,
        line: row.result.how === "BY_LINE" ? { kind: row.result.line.kind, value: row.result.line.value } : null,
        underneath: row.underneath,
      })),
      page,
      totalPages: slice.totalPages,
      total: slice.totalCount,
      classifications: setup.classifications.map(shapeClassification),
      summary: summarise(classified, setup, limits, held.cut),
    };
  },
});

/** The Classifications view: each classification with its type, how many pages it has (and how many by hand), and its lines. */
export const pageClassificationList = superAdminQuery({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.union(
    v.null(),
    v.object({
      classifications: v.array(v.object({
        _id: v.id("pageClassifications"),
        name: v.string(),
        type: classificationTypeValidator,
        pages: v.number(),
        byHand: v.number(),
        lines: v.array(savedLineShape),
      })),
      summary: summaryShape,
    }),
  ),
  handler: async (ctx, args) => {
    const hold = await ownHold(ctx, args.companyWebsiteId);
    if (!hold) return null;
    const [setup, held, limits] = await Promise.all([
      readClassificationSetup(ctx, hold._id),
      readHoldPages(ctx, hold._id),
      readFanOutLimits(ctx, hold.companyId, hold._id),
    ]);
    const classified = classifyPages(setup, held.pages);
    const pages = new Map<string, number>();
    const byHand = new Map<string, number>();
    for (const row of classified) {
      const id = row.result.classificationId;
      if (id === null) continue;
      pages.set(id, (pages.get(id) ?? 0) + 1);
      if (row.result.how === "BY_HAND") byHand.set(id, (byHand.get(id) ?? 0) + 1);
    }
    return {
      classifications: setup.classifications.map((classification) => ({
        ...shapeClassification(classification),
        pages: pages.get(classification._id) ?? 0,
        byHand: byHand.get(classification._id) ?? 0,
        lines: linesOf(setup, classification._id).map(shapeLine),
      })),
      summary: summarise(classified, setup, limits, held.cut),
    };
  },
});

/** One classification as saved, for its own page. Null when it is not this website's. */
export const pageClassificationDetail = superAdminQuery({
  args: { companyWebsiteId: v.id("companyWebsites"), classificationId: v.id("pageClassifications") },
  returns: v.union(v.null(), v.object({
    _id: v.id("pageClassifications"),
    name: v.string(),
    type: classificationTypeValidator,
    lines: v.array(savedLineShape),
  })),
  handler: async (ctx, args) => {
    const hold = await ownHold(ctx, args.companyWebsiteId);
    if (!hold) return null;
    const classification = await ctx.db.get(args.classificationId);
    if (!classification || classification.companyWebsiteId !== hold._id) return null;
    const lines = await ctx.db
      .query("pageClassificationLines")
      .withIndex("by_hold_classification", (q) => q.eq("companyWebsiteId", hold._id).eq("classificationId", classification._id))
      .take(mostOf("classificationLinesPerSite"));
    return { ...shapeClassification(classification), lines: lines.map(shapeLine) };
  },
});

/** Stands for a classification not yet saved, in a preview. */
const NEW_CLASSIFICATION = "new";

/**
 * A classification's own page, before it is saved: the pages its lines would
 * give it as they are edited, with every other classification's lines and
 * the pages set by hand as they are — so the more exact line wins here as
 * everywhere — and, per line, how many pages it catches or why it can't be
 * kept. Lines that can't be kept catch nothing.
 */
export const pageClassificationPreview = superAdminQuery({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    /** Omitted for a classification not yet saved. */
    classificationId: v.optional(v.id("pageClassifications")),
    lines: v.array(lineValueShape),
  },
  returns: v.union(v.null(), v.object({
    rows: v.array(v.object({
      page: v.string(),
      clicks: v.number(),
      how: v.union(v.literal("BY_HAND"), v.literal("BY_LINE")),
      line: v.union(lineValueShape, v.null()),
    })),
    /** Every page it would have. */
    total: v.number(),
    byHand: v.number(),
    /** Per line, in the order given. */
    lines: v.array(v.object({ catches: v.number(), problem: v.union(problemValidator, v.null()), on: v.union(v.string(), v.null()) })),
    cut: v.boolean(),
  })),
  handler: async (ctx, args) => {
    const hold = await ownHold(ctx, args.companyWebsiteId);
    if (!hold) return null;
    if (args.lines.length > mostOf("classificationLinesPerSite")) {
      throw appError("INVALID_INPUT", `A classification can't have more than ${mostOf("classificationLinesPerSite")} address lines.`);
    }
    const self: string = args.classificationId ?? NEW_CLASSIFICATION;
    if (args.classificationId) {
      const classification = await ctx.db.get(args.classificationId);
      if (!classification || classification.companyWebsiteId !== hold._id) return null;
    }
    const [setup, held] = await Promise.all([readClassificationSetup(ctx, hold._id), readHoldPages(ctx, hold._id)]);
    const others = setup.lines.filter((line) => line.classificationId !== self);
    const reviewed = reviewLines(args.lines, others, setup);

    const inputs = ruleInputs({ ...setup, lines: others });
    const edited = new Map<ClassificationLine, number>();
    reviewed.forEach((line, index) => {
      if (line.problem === null) edited.set({ classificationId: self, kind: line.kind, value: line.value }, index);
    });
    const classify = classifierFor<string>([...inputs.lines, ...edited.keys()], inputs.picks);

    const catches = reviewed.map(() => 0);
    const rows: Array<{ page: string; clicks: number; how: "BY_HAND" | "BY_LINE"; line: LineInput | null }> = [];
    let byHand = 0;
    for (const page of held.pages) {
      const result = classify(page.page, page.sitemapFile ?? null);
      if (result.classificationId !== self) continue;
      if (result.how === "BY_LINE") {
        const index = edited.get(result.line);
        if (index !== undefined) catches[index] += 1;
        rows.push({ page: page.page, clicks: page.clicks, how: "BY_LINE", line: { kind: result.line.kind, value: result.line.value } });
      } else if (result.how === "BY_HAND") {
        byHand += 1;
        rows.push({ page: page.page, clicks: page.clicks, how: "BY_HAND", line: null });
      }
    }
    rows.sort((left, right) => right.clicks - left.clicks || left.page.localeCompare(right.page));
    return {
      rows: rows.slice(0, PREVIEW_PAGES),
      total: rows.length,
      byHand,
      lines: reviewed.map((line, index) => ({ catches: catches[index], problem: line.problem, on: line.on })),
      cut: held.cut,
    };
  },
});

// ── Writes ────────────────────────────────────────────────────────────────

/** Add a classification: its name, its type and the lines that catch its pages. */
export const createPageClassification = superAdminMutation({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    name: v.string(),
    type: classificationTypeValidator,
    lines: v.array(lineValueShape),
  },
  returns: v.id("pageClassifications"),
  handler: async (ctx, args) => {
    const hold = await requireOwnHold(ctx, args.companyWebsiteId);
    const [setup, limits] = await Promise.all([readClassificationSetup(ctx, hold._id), readFanOutLimits(ctx, hold.companyId, hold._id)]);
    holdToClassifications(setup.classifications.length, limits.classificationsPerSite);
    const name = checkedName(args.name, setup, null);
    const lines = checkedLines(args.lines, setup.lines, setup);
    holdToLines(setup.lines.length, setup.lines.length + lines.length, limits.classificationLinesPerSite);

    const now = Date.now();
    const classificationId = await ctx.db.insert("pageClassifications", { companyWebsiteId: hold._id, name, type: args.type, createdAt: now, updatedAt: now });
    for (const line of lines) {
      await ctx.db.insert("pageClassificationLines", { companyWebsiteId: hold._id, classificationId, ...line, createdAt: now });
    }
    await audit(ctx, hold, "CREATE_PAGE_CLASSIFICATION", { type: "pageClassifications", id: classificationId }, { name, type: args.type, lines });
    return classificationId;
  },
});

/**
 * Change a classification — the Save on its own page: its name, its type,
 * and its lines as they now read (lines kept as they were, those gone
 * removed, new ones added). Whatever is left out stays as it was.
 */
export const updatePageClassification = superAdminMutation({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    classificationId: v.id("pageClassifications"),
    name: v.optional(v.string()),
    type: v.optional(classificationTypeValidator),
    lines: v.optional(v.array(lineValueShape)),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hold = await requireOwnHold(ctx, args.companyWebsiteId);
    const classification = await requireItsClassification(ctx, hold._id, args.classificationId);
    const [setup, limits] = await Promise.all([readClassificationSetup(ctx, hold._id), readFanOutLimits(ctx, hold.companyId, hold._id)]);
    const name = args.name === undefined ? classification.name : checkedName(args.name, setup, classification._id);
    const type = args.type ?? classification.type;
    const own = linesOf(setup, classification._id);

    let added: LineInput[] = [];
    let removed: Doc<"pageClassificationLines">[] = [];
    if (args.lines !== undefined) {
      const lines = checkedLines(args.lines, setup.lines.filter((line) => line.classificationId !== classification._id), setup);
      const wanted = new Set(lines.map((line) => `${line.kind} ${line.value}`));
      const kept = new Set(own.map((line) => `${line.kind} ${line.value}`));
      added = lines.filter((line) => !kept.has(`${line.kind} ${line.value}`));
      removed = own.filter((line) => !wanted.has(`${line.kind} ${line.value}`));
      holdToLines(setup.lines.length, setup.lines.length - removed.length + added.length, limits.classificationLinesPerSite);
    }

    const renamed = name !== classification.name || type !== classification.type;
    if (!renamed && added.length === 0 && removed.length === 0) return null;
    const now = Date.now();
    for (const line of removed) await ctx.db.delete(line._id);
    for (const line of added) {
      await ctx.db.insert("pageClassificationLines", { companyWebsiteId: hold._id, classificationId: classification._id, ...line, createdAt: now });
    }
    await ctx.db.patch(classification._id, { name, type, updatedAt: now });
    await audit(ctx, hold, "UPDATE_PAGE_CLASSIFICATION", { type: "pageClassifications", id: classification._id }, {
      before: { name: classification.name, type: classification.type, lines: plainLines(own) },
      after: { name, type },
      linesAdded: added,
      linesRemoved: plainLines(removed),
    });
    return null;
  },
});

/** Add one line to a classification. */
export const addPageClassificationLine = superAdminMutation({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    classificationId: v.id("pageClassifications"),
    kind: classificationLineKindValidator,
    value: v.string(),
  },
  returns: v.id("pageClassificationLines"),
  handler: async (ctx, args) => {
    const hold = await requireOwnHold(ctx, args.companyWebsiteId);
    const classification = await requireItsClassification(ctx, hold._id, args.classificationId);
    const [setup, limits] = await Promise.all([readClassificationSetup(ctx, hold._id), readFanOutLimits(ctx, hold.companyId, hold._id)]);
    const [line] = checkedLines([{ kind: args.kind, value: args.value }], setup.lines, setup);
    holdToLines(setup.lines.length, setup.lines.length + 1, limits.classificationLinesPerSite);
    const now = Date.now();
    const lineId = await ctx.db.insert("pageClassificationLines", { companyWebsiteId: hold._id, classificationId: classification._id, ...line, createdAt: now });
    await ctx.db.patch(classification._id, { updatedAt: now });
    await audit(ctx, hold, "ADD_PAGE_CLASSIFICATION_LINE", { type: "pageClassifications", id: classification._id }, { name: classification.name, line });
    return lineId;
  },
});

/** Remove one line from a classification: the pages it caught go to the next most exact line, or Not sorted. */
export const removePageClassificationLine = superAdminMutation({
  args: { companyWebsiteId: v.id("companyWebsites"), lineId: v.id("pageClassificationLines") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hold = await requireOwnHold(ctx, args.companyWebsiteId);
    const line = await ctx.db.get(args.lineId);
    if (!line || line.companyWebsiteId !== hold._id) throw appError("NOT_FOUND", "That line is not one of this website's.");
    const classification = await requireItsClassification(ctx, hold._id, line.classificationId);
    await ctx.db.delete(line._id);
    await ctx.db.patch(classification._id, { updatedAt: Date.now() });
    await audit(ctx, hold, "REMOVE_PAGE_CLASSIFICATION_LINE", { type: "pageClassifications", id: classification._id }, {
      name: classification.name,
      line: { kind: line.kind, value: line.value },
    });
    return null;
  },
});

/**
 * Remove a classification: its lines go, and the pages set to it by hand
 * lose it — each shows what another classification's line gives it, or Not
 * sorted. A page taken out of a line stays taken out.
 */
export const removePageClassification = superAdminMutation({
  args: { companyWebsiteId: v.id("companyWebsites"), classificationId: v.id("pageClassifications") },
  returns: v.object({ lines: v.number(), pagesByHand: v.number() }),
  handler: async (ctx, args) => {
    const hold = await requireOwnHold(ctx, args.companyWebsiteId);
    const classification = await requireItsClassification(ctx, hold._id, args.classificationId);
    const [lines, picks] = await Promise.all([
      ctx.db
        .query("pageClassificationLines")
        .withIndex("by_hold_classification", (q) => q.eq("companyWebsiteId", hold._id).eq("classificationId", classification._id))
        .take(mostOf("classificationLinesPerSite")),
      ctx.db
        .query("pageClassificationPicks")
        .withIndex("by_hold_classification", (q) => q.eq("companyWebsiteId", hold._id).eq("classificationId", classification._id))
        .take(mostOf("classifiedPagesPerSite")),
    ]);
    for (const row of [...lines, ...picks]) await ctx.db.delete(row._id);
    await ctx.db.delete(classification._id);
    await audit(ctx, hold, "REMOVE_PAGE_CLASSIFICATION", { type: "pageClassifications", id: classification._id }, {
      name: classification.name,
      type: classification.type,
      lines: plainLines(lines),
      pagesByHand: picks.length,
    });
    return { lines: lines.length, pagesByHand: picks.length };
  },
});

/** Set one page's classification by hand, or several at once (the ticked pages): it beats every line. */
export const setPageClassification = superAdminMutation({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    classificationId: v.id("pageClassifications"),
    pages: v.array(v.string()),
  },
  returns: v.object({ set: v.number() }),
  handler: async (ctx, args) => {
    const hold = await requireOwnHold(ctx, args.companyWebsiteId);
    const classification = await requireItsClassification(ctx, hold._id, args.classificationId);
    const pages = [...new Set(args.pages.map((page) => page.trim()).filter(Boolean).map(normalisePage))];
    if (pages.length === 0) throw appError("INVALID_INPUT", "Choose at least one page.");
    const [setup, limits] = await Promise.all([readClassificationSetup(ctx, hold._id), readFanOutLimits(ctx, hold.companyId, hold._id)]);
    const picked = new Map(setup.picks.map((pick) => [pick.page, pick]));
    const fresh = pages.filter((page) => !picked.has(page)).length;
    holdToPicks(setup.picks.length, setup.picks.length + fresh, limits.classifiedPagesPerSite);

    const now = Date.now();
    for (const page of pages) {
      const pick = picked.get(page);
      if (!pick) await ctx.db.insert("pageClassificationPicks", { companyWebsiteId: hold._id, page, classificationId: classification._id, updatedAt: now });
      else if (pick.classificationId !== classification._id) await ctx.db.patch(pick._id, { classificationId: classification._id, updatedAt: now });
    }
    await audit(ctx, hold, "SET_PAGE_CLASSIFICATION", { type: "companyWebsites", id: hold._id }, {
      classification: classification.name,
      count: pages.length,
      pages: pages.slice(0, AUDIT_PAGES),
    });
    return { set: pages.length };
  },
});

/**
 * Remove a page's classification. Set by hand, it goes back to whatever its
 * lines give it; given by a line, it is taken out of the line and shows as
 * Not sorted until it is set again. Returns what the page shows now.
 */
export const removeClassificationFromPage = superAdminMutation({
  args: { companyWebsiteId: v.id("companyWebsites"), page: v.string() },
  returns: v.object({ classificationId: v.union(v.id("pageClassifications"), v.null()), how: howValidator }),
  handler: async (ctx, args) => {
    const hold = await requireOwnHold(ctx, args.companyWebsiteId);
    const page = normalisePage(args.page);
    const [setup, limits, listed] = await Promise.all([
      readClassificationSetup(ctx, hold._id),
      readFanOutLimits(ctx, hold.companyId, hold._id),
      ctx.db.query("holdPages").withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", hold._id).eq("page", args.page.trim())).first(),
    ]);
    const sitemapFile = listed?.sitemapFile ?? null;
    const inputs = ruleInputs(setup);
    const before = classifierFor(inputs.lines, inputs.picks)(page, sitemapFile);
    const byLines = classifierFor(inputs.lines, [])(page, sitemapFile);
    const pick = setup.picks.find((row) => row.page === page);
    const name = (id: ClassificationId | null) => setup.classifications.find((classification) => classification._id === id)?.name ?? null;

    if (before.how === "BY_HAND" && pick) {
      await ctx.db.delete(pick._id);
      await audit(ctx, hold, "REMOVE_PAGE_CLASSIFICATION_FROM_PAGE", { type: "companyWebsites", id: hold._id }, {
        page, was: name(before.classificationId), now: name(byLines.classificationId),
      });
      return { classificationId: byLines.classificationId, how: byLines.how };
    }
    if (before.how === "BY_LINE") {
      holdToPicks(setup.picks.length, setup.picks.length + 1, limits.classifiedPagesPerSite);
      await ctx.db.insert("pageClassificationPicks", { companyWebsiteId: hold._id, page, updatedAt: Date.now() });
      await audit(ctx, hold, "REMOVE_PAGE_CLASSIFICATION_FROM_PAGE", { type: "companyWebsites", id: hold._id }, {
        page, was: name(before.classificationId), now: null, takenOutOf: { kind: before.line.kind, value: before.line.value },
      });
      return { classificationId: null, how: "TAKEN_OUT" as const };
    }
    // Nothing to remove: it has no classification already.
    return { classificationId: before.classificationId, how: before.how };
  },
});

/**
 * The suggested start (page-groups-plan.md): classifications made from the
 * website's own sitemap files and first-level folders
 * (`utils/suggestClassifications.ts`), each named in words with a guessed
 * type and the line that catches its pages — to rename or remove. Names and
 * lines the website has already are skipped, and so is anything past its
 * limits for classifications and address lines; no page is set by hand.
 * Pages at the top level, such as service pages, are left to classify.
 */
export const suggestPageClassifications = superAdminMutation({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.object({
    created: v.number(),
    names: v.array(v.string()),
    /** Suggestions left out because a limit was reached. */
    overLimit: v.number(),
  }),
  handler: async (ctx, args) => {
    const hold = await requireOwnHold(ctx, args.companyWebsiteId);
    const [setup, held, limits] = await Promise.all([
      readClassificationSetup(ctx, hold._id),
      readHoldPages(ctx, hold._id),
      readFanOutLimits(ctx, hold.companyId, hold._id),
    ]);
    const names = new Set(setup.classifications.map((classification) => classification.name.toLowerCase()));
    const lines = new Set(setup.lines.map((line) => `${line.kind} ${line.value}`));
    let classifications = setup.classifications.length;
    let lineCount = setup.lines.length;
    let overLimit = 0;
    const created: Array<{ name: string; type: Doc<"pageClassifications">["type"]; lines: LineInput[] }> = [];
    const now = Date.now();

    for (const suggestion of suggestClassifications(held.pages.map((row) => ({ page: row.page, sitemapFile: row.sitemapFile ?? null })))) {
      if (names.has(suggestion.name.toLowerCase())) continue;
      const fresh = suggestion.lines.flatMap((line): LineInput[] => {
        const tidy = tidyLine(line.kind, line.value);
        return "value" in tidy && !lines.has(`${line.kind} ${tidy.value}`) ? [{ kind: line.kind, value: tidy.value }] : [];
      });
      if (fresh.length === 0) continue;
      if (classifications >= limits.classificationsPerSite || lineCount + fresh.length > limits.classificationLinesPerSite) {
        overLimit += 1;
        continue;
      }
      const classificationId = await ctx.db.insert("pageClassifications", { companyWebsiteId: hold._id, name: suggestion.name, type: suggestion.type, createdAt: now, updatedAt: now });
      for (const line of fresh) {
        await ctx.db.insert("pageClassificationLines", { companyWebsiteId: hold._id, classificationId, ...line, createdAt: now });
        lines.add(`${line.kind} ${line.value}`);
      }
      names.add(suggestion.name.toLowerCase());
      classifications += 1;
      lineCount += fresh.length;
      created.push({ name: suggestion.name, type: suggestion.type, lines: fresh });
    }
    if (created.length > 0) {
      await audit(ctx, hold, "SUGGEST_PAGE_CLASSIFICATIONS", { type: "companyWebsites", id: hold._id }, { created, overLimit });
    }
    return { created: created.length, names: created.map((entry) => entry.name), overLimit };
  },
});

/** A website's classifications, lines and picks, removed with it. Each is held to its limit's largest choice, so one call clears them. */
export async function purgeHoldClassifications(ctx: { db: MutationCtx["db"] }, companyWebsiteId: HoldId): Promise<void> {
  const setup = await readClassificationSetup(ctx, companyWebsiteId);
  for (const row of [...setup.picks, ...setup.lines, ...setup.classifications]) await ctx.db.delete(row._id);
}
