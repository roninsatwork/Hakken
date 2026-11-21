import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { adminMutation, adminQuery } from "./tenantFunctions";
import { assertAdminCanAccessCompany } from "./authz";
import { appError } from "./utils/appError";
import { getSelfImprovementConfig } from "./selfImprovementConfig";
import {
  WIKI_CHECKUP_STEPS,
  addFound,
  nextPercent,
  parseFound,
  stepNumber,
  summariseFound,
  type WikiCheckupStepKey,
  isDueForRecheck,
} from "./wikiCheckupRules";
import { relevantPassages, subjectWords } from "./wikiRewriteService";
import { documentFullText } from "./wikiDocumentText";
import { isKnowledgeArticlePage } from "./utils/knowledgePageGuard";

/** How much of each source the check-up reads for one page: the parts
 * about that page, up to this many characters. */
export const WIKI_SOURCE_PASSAGE_CHARS = 6_000;

/**
 * The daily check-up's records (wiki-daily-checkup-plan.md): which wikis
 * exist, one run row per check-up — the live progress bar while it works and
 * the Health screen's evidence once it is done — and the rota reads that let
 * every night cover its share of every page.
 *
 * The model work lives in wikiCheckupActions.ts; nothing here calls a model.
 */

type WikiScope = Id<"companies"> | undefined;

const stepKeyValidator = v.union(
  v.literal("INTAKE"),
  v.literal("RELINK"),
  v.literal("GAPS"),
  v.literal("REFILE"),
  v.literal("TAGS"),
  v.literal("CORRECT"),
  v.literal("TIDY")
);

const foundPatchValidator = v.object({
  documentsRead: v.optional(v.number()),
  sourcesFollowed: v.optional(v.number()),
  websitePagesQueued: v.optional(v.number()),
  linksFixed: v.optional(v.number()),
  linksAdded: v.optional(v.number()),
  pagesWritten: v.optional(v.number()),
  pagesRefiled: v.optional(v.number()),
  tagsChanged: v.optional(v.number()),
  factsSettled: v.optional(v.number()),
  disagreementsKept: v.optional(v.number()),
  claimsCorrected: v.optional(v.number()),
  questionsRaised: v.optional(v.number()),
  pagesTidied: v.optional(v.number()),
  pagesMerged: v.optional(v.number()),
});

/** A run that has not moved for this long has died with its action. */
const STALE_RUN_MS = 30 * 60 * 1000;

/** A wiki whose last nightly check-up is older than this is late. */
const LATE_AFTER_MS = 36 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Which wikis exist.
// ---------------------------------------------------------------------------

/** The most companies one night's round looks through for a wiki. */
const WIKI_SCOPE_COMPANIES = 5_000;

/**
 * Every wiki on the platform: each company with at least one page, and the
 * shared shelf (`null`) when it has any.
 *
 * Every company is asked, one indexed read each. The rounds used to find
 * companies from the newest thousand pages on the whole platform, so a wiki
 * that had gone quiet — exactly the one most likely to have gone stale —
 * could drop out of every nightly job without anyone noticing.
 */
export async function findWikiScopes(ctx: QueryCtx): Promise<Array<Id<"companies"> | null>> {
  const scopes: Array<Id<"companies"> | null> = [];
  const read = await ctx.db.query("companies").take(WIKI_SCOPE_COMPANIES + 1);
  // Past the cap the rest would never be visited, so the log says so loudly rather than quietly skipping them.
  if (read.length > WIKI_SCOPE_COMPANIES) console.error(`The nightly check-up reached ${WIKI_SCOPE_COMPANIES} companies; the rest were not visited`);
  const companies = read.slice(0, WIKI_SCOPE_COMPANIES);
  for (const company of companies) {
    const page = await ctx.db
      .query("wikiPages")
      .withIndex("by_company_updated", (q) => q.eq("companyId", company._id))
      .first();
    if (page) scopes.push(company._id);
  }
  const globalPage = await ctx.db
    .query("wikiPages")
    .withIndex("by_company_updated", (q) => q.eq("companyId", undefined))
    .first();
  if (globalPage) scopes.push(null);
  return scopes;
}

export const listWikiScopesInternal = internalQuery({
  args: {},
  handler: async (ctx): Promise<Array<Id<"companies"> | null>> => await findWikiScopes(ctx),
});

/** The switch: may the wiki settle facts by itself? Starts on. */
export const isAutonomousWikiInternal = internalQuery({
  args: {},
  handler: async (ctx): Promise<boolean> => (await getSelfImprovementConfig(ctx.db)).autonomousWiki,
});

// ---------------------------------------------------------------------------
// Runs.
// ---------------------------------------------------------------------------

async function latestRun(ctx: QueryCtx, companyId: WikiScope): Promise<Doc<"wikiCheckupRuns"> | null> {
  return await ctx.db
    .query("wikiCheckupRuns")
    .withIndex("by_company_started", (q) => q.eq("companyId", companyId))
    .order("desc")
    .first();
}

/**
 * Open a run, unless this wiki already has one going. A second press while
 * a check-up runs starts nothing; a run that stopped moving long ago is
 * closed as failed so it cannot block the next one for ever.
 */
async function beginRun(
  ctx: MutationCtx,
  args: {
    companyId: WikiScope;
    trigger: "NIGHTLY" | "MANUAL";
    mode: "SLICE" | "FULL";
    startedBy?: Id<"users">;
  }
): Promise<{ runId: Id<"wikiCheckupRuns">; alreadyRunning: boolean }> {
  const now = Date.now();
  const current = await latestRun(ctx, args.companyId);
  if (current && current.status === "RUNNING") {
    if (now - current.updatedAt < STALE_RUN_MS) {
      return { runId: current._id, alreadyRunning: true };
    }
    await ctx.db.patch(current._id, {
      status: "FAILED",
      error: "It stopped responding and was closed.",
      finishedAt: now,
      updatedAt: now,
    });
  }
  const runId = await ctx.db.insert("wikiCheckupRuns", {
    ...(args.companyId ? { companyId: args.companyId } : {}),
    trigger: args.trigger,
    mode: args.mode,
    status: "RUNNING",
    step: 1,
    stepKey: WIKI_CHECKUP_STEPS[0].key,
    doneUnits: 0,
    totalUnits: 0,
    percent: 0,
    foundJson: JSON.stringify({}),
    ...(args.startedBy ? { startedBy: args.startedBy } : {}),
    startedAt: now,
    updatedAt: now,
  });
  return { runId, alreadyRunning: false };
}

export const beginRunInternal = internalMutation({
  args: {
    companyId: v.optional(v.id("companies")),
    trigger: v.union(v.literal("NIGHTLY"), v.literal("MANUAL")),
    mode: v.union(v.literal("SLICE"), v.literal("FULL")),
  },
  handler: async (ctx, args) => await beginRun(ctx, { ...args, companyId: args.companyId }),
});

export const getRunInternal = internalQuery({
  args: { runId: v.id("wikiCheckupRuns") },
  handler: async (ctx, args) => await ctx.db.get(args.runId),
});

/**
 * Move the bar: which step, how much work is planned and done, and what has
 * been found. The percentage only ever rises (`nextPercent`).
 */
export const advanceRunInternal = internalMutation({
  args: {
    runId: v.id("wikiCheckupRuns"),
    stepKey: v.optional(stepKeyValidator),
    addDone: v.optional(v.number()),
    addTotal: v.optional(v.number()),
    found: v.optional(foundPatchValidator),
    note: v.optional(v.string()),
    /** A floor for work done: a finished step's planned share. */
    atLeastDone: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<void> => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.status !== "RUNNING") return;
    const totalUnits = run.totalUnits + Math.max(0, args.addTotal ?? 0);
    const doneUnits = Math.min(
      totalUnits,
      Math.max(run.doneUnits + Math.max(0, args.addDone ?? 0), args.atLeastDone ?? 0)
    );
    const found = args.found ? addFound(parseFound(run.foundJson), args.found) : parseFound(run.foundJson);
    const stepKey = args.stepKey ?? (run.stepKey as WikiCheckupStepKey);
    await ctx.db.patch(run._id, {
      stepKey,
      step: stepNumber(stepKey),
      totalUnits,
      doneUnits,
      percent: nextPercent({ previous: run.percent, done: doneUnits, total: totalUnits }),
      foundJson: JSON.stringify(found),
      ...(args.note ? { notes: [...(run.notes ?? []), args.note.slice(0, 200)].slice(-10) } : {}),
      updatedAt: Date.now(),
    });
  },
});

/** Close a run. Success fills the bar; a failure stops it where it got to. */
export const finishRunInternal = internalMutation({
  args: {
    runId: v.id("wikiCheckupRuns"),
    status: v.union(v.literal("SUCCESS"), v.literal("FAILED")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ summary: string } | null> => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.status !== "RUNNING") return null;
    const now = Date.now();
    const summary = summariseFound(parseFound(run.foundJson));
    await ctx.db.patch(run._id, {
      status: args.status,
      summary,
      ...(args.status === "SUCCESS"
        ? { percent: 100, doneUnits: run.totalUnits }
        : { error: (args.error ?? "Something went wrong part-way through.").slice(0, 400) }),
      finishedAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actionType: args.status === "SUCCESS" ? "WIKI_CHECKUP_FINISHED" : "WIKI_CHECKUP_FAILED",
      entityType: "wikiCheckupRuns",
      entityId: run._id.toString(),
      ...(run.companyId ? { companyId: run.companyId } : {}),
      timestamp: now,
      metadata: JSON.stringify({ trigger: run.trigger, mode: run.mode, summary }),
    });
    return { summary };
  },
});

// ---------------------------------------------------------------------------
// The button: one press runs every fix on one wiki.
// ---------------------------------------------------------------------------

const startResultShape = v.object({
  runId: v.id("wikiCheckupRuns"),
  alreadyRunning: v.boolean(),
});

async function startManualCheckup(
  ctx: MutationCtx,
  args: { companyId: WikiScope; userId: Id<"users"> }
): Promise<{ runId: Id<"wikiCheckupRuns">; alreadyRunning: boolean }> {
  const result = await beginRun(ctx, {
    companyId: args.companyId,
    trigger: "MANUAL",
    mode: "FULL",
    startedBy: args.userId,
  });
  if (!result.alreadyRunning) {
    await ctx.scheduler.runAfter(0, internal.wikiCheckupActions.runCheckupStep, {
      runId: result.runId,
      stepKey: "INTAKE",
    });
    await ctx.db.insert("auditLogs", {
      actorId: args.userId,
      actionType: "WIKI_CHECKUP_STARTED",
      entityType: "wikiCheckupRuns",
      entityId: result.runId.toString(),
      ...(args.companyId ? { companyId: args.companyId } : {}),
      timestamp: Date.now(),
      metadata: JSON.stringify({ trigger: "MANUAL", mode: "FULL" }),
    });
  }
  return result;
}

export const startWikiCheckupForCompany = adminMutation({
  args: { companyId: v.id("companies") },
  returns: startResultShape,
  handler: async (ctx, args) => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    return await startManualCheckup(ctx, { companyId: args.companyId, userId: ctx.userId });
  },
});

export const startWikiCheckupForGlobal = adminMutation({
  args: {},
  returns: startResultShape,
  handler: async (ctx) => {
    if (ctx.user.role !== "SUPER_ADMIN") {
      throw appError("UNAUTHORIZED", "Unauthorized access to the platform wiki");
    }
    return await startManualCheckup(ctx, { companyId: undefined, userId: ctx.userId });
  },
});

const runViewShape = v.union(
  v.null(),
  v.object({
    runId: v.id("wikiCheckupRuns"),
    status: v.union(v.literal("RUNNING"), v.literal("SUCCESS"), v.literal("FAILED")),
    trigger: v.union(v.literal("NIGHTLY"), v.literal("MANUAL")),
    step: v.number(),
    stepCount: v.number(),
    stepKey: v.string(),
    doneUnits: v.number(),
    totalUnits: v.number(),
    percent: v.number(),
    found: v.object({
      linksFixed: v.number(),
      factsSettled: v.number(),
      pagesWritten: v.number(),
      claimsCorrected: v.number(),
      pagesRefiled: v.number(),
      tagsChanged: v.number(),
    }),
    summary: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
    startedAt: v.number(),
    finishedAt: v.union(v.number(), v.null()),
  })
);

function runView(run: Doc<"wikiCheckupRuns"> | null) {
  if (!run) return null;
  const found = parseFound(run.foundJson);
  // A run whose action died shows as failed, never as for ever spinning.
  const stale = run.status === "RUNNING" && Date.now() - run.updatedAt >= STALE_RUN_MS;
  return {
    runId: run._id,
    status: stale ? ("FAILED" as const) : run.status,
    trigger: run.trigger,
    step: run.step,
    stepCount: WIKI_CHECKUP_STEPS.length,
    stepKey: run.stepKey,
    doneUnits: run.doneUnits,
    totalUnits: run.totalUnits,
    percent: run.percent,
    found: {
      linksFixed: found.linksFixed + found.linksAdded,
      factsSettled: found.factsSettled,
      pagesWritten: found.pagesWritten,
      claimsCorrected: found.claimsCorrected,
      pagesRefiled: found.pagesRefiled,
      tagsChanged: found.tagsChanged,
    },
    summary: run.summary ?? null,
    error: stale ? "It stopped responding." : (run.error ?? null),
    startedAt: run.startedAt,
    finishedAt: run.finishedAt ?? null,
  };
}

export const getLatestCheckupForCompany = adminQuery({
  args: { companyId: v.id("companies") },
  returns: runViewShape,
  handler: async (ctx, args) => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    return runView(await latestRun(ctx, args.companyId));
  },
});

export const getLatestCheckupForGlobal = adminQuery({
  args: {},
  returns: runViewShape,
  handler: async (ctx) => {
    if (ctx.user.role !== "SUPER_ADMIN" && ctx.user.role !== "READ_ONLY") {
      throw appError("UNAUTHORIZED", "Unauthorized access to the platform wiki");
    }
    return runView(await latestRun(ctx, undefined));
  },
});

// ---------------------------------------------------------------------------
// Health: every wiki's last check-up, in plain states.
// ---------------------------------------------------------------------------

const healthRowShape = v.object({
  companyId: v.union(v.id("companies"), v.null()),
  name: v.string(),
  state: v.union(v.literal("OK"), v.literal("FAILED"), v.literal("LATE"), v.literal("RUNNING"), v.literal("NOT_YET")),
  lastFinishedAt: v.union(v.number(), v.null()),
  summary: v.union(v.string(), v.null()),
  error: v.union(v.string(), v.null()),
});

export const listCheckupHealth = adminQuery({
  args: {},
  returns: v.array(healthRowShape),
  handler: async (ctx) => {
    if (ctx.user.role !== "SUPER_ADMIN" && ctx.user.role !== "READ_ONLY") {
      throw appError("UNAUTHORIZED", "Unauthorized access to platform maintenance");
    }
    const now = Date.now();
    const scopes = await findWikiScopes(ctx);
    const rows = [];
    for (const scope of scopes) {
      const companyId = scope ?? undefined;
      const company = scope ? await ctx.db.get(scope) : null;
      const latest = await latestRun(ctx, companyId);
      const recent = await ctx.db
        .query("wikiCheckupRuns")
        .withIndex("by_company_started", (q) => q.eq("companyId", companyId))
        .order("desc")
        .take(10);
      const lastNightly = recent.find((run) => run.trigger === "NIGHTLY" && run.status !== "RUNNING");
      const view = runView(latest);
      let state: "OK" | "FAILED" | "LATE" | "RUNNING" | "NOT_YET";
      if (!view) state = "NOT_YET";
      else if (view.status === "FAILED") state = "FAILED";
      else if (view.status === "RUNNING") state = "RUNNING";
      else if (lastNightly && now - (lastNightly.finishedAt ?? lastNightly.startedAt) > LATE_AFTER_MS) state = "LATE";
      else state = "OK";
      rows.push({
        companyId: scope,
        name: company?.name ?? "Shared wiki",
        state,
        lastFinishedAt: latest?.finishedAt ?? null,
        summary: latest?.summary ?? null,
        error: view?.error ?? null,
      });
    }
    const rank = { FAILED: 0, LATE: 1, RUNNING: 2, NOT_YET: 3, OK: 4 } as const;
    return rows.sort((left, right) => rank[left.state] - rank[right.state] || left.name.localeCompare(right.name));
  },
});

// ---------------------------------------------------------------------------
// The rota: counts, the pages due, and the stamps.
// ---------------------------------------------------------------------------

/** Page counts by kind, a page of the wiki at a time (source notes are big). */
export const countPagesInternal = internalQuery({
  args: { companyId: v.optional(v.id("companies")), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("wikiPages")
      .withIndex("by_company_updated", (q) => q.eq("companyId", args.companyId))
      .paginate(args.paginationOpts);
    const counts: Record<string, number> = {};
    for (const page of result.page) {
      if (page.subjectKey.endsWith("-index")) continue;
      counts[page.kind] = (counts[page.kind] ?? 0) + 1;
    }
    return { counts, isDone: result.isDone, continueCursor: result.continueCursor };
  },
});

type RotaPage = {
  pageId: Id<"wikiPages">;
  kind: Doc<"wikiPages">["kind"];
  subjectKey: string;
  title: string;
  excerpt: string;
  links: string[];
  pinned: string[];
  updatedAt: number;
};

function rotaPage(page: Doc<"wikiPages">, excerptChars: number): RotaPage {
  return {
    pageId: page._id,
    kind: page.kind,
    subjectKey: page.subjectKey,
    title: page.title,
    excerpt: page.content.slice(0, excerptChars),
    links: page.links,
    pinned: page.pinnedCorrections.map((correction) => correction.text),
    updatedAt: page.updatedAt,
  };
}

const kindRotaValidator = v.union(
  v.literal("CONTRADICTIONS"),
  v.literal("SOURCES"),
  v.literal("REFILE"),
  v.literal("TAGS")
);

const pageKindValidator = v.union(
  v.literal("CUSTOMER"),
  v.literal("PRODUCT"),
  v.literal("POLICY"),
  v.literal("ISSUE"),
  v.literal("CLIENT"),
  v.literal("SOURCE"),
  v.literal("GOAL")
);

/**
 * The next pages a kind-based rota should visit: least recently visited
 * first (never visited sorts first), stopping at the first page stamped at
 * or after `before` — in a nightly slice that is "not yet due", in a full
 * run "already visited this run".
 */
export const getKindRotaInternal = internalQuery({
  args: {
    companyId: v.optional(v.id("companies")),
    rota: kindRotaValidator,
    kinds: v.array(pageKindValidator),
    before: v.number(),
    limit: v.number(),
    excerptChars: v.optional(v.number()),
    /** A hand-run full check: no page is passed over for being recent. */
    full: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<RotaPage[]> => {
    const out: RotaPage[] = [];
    const limit = Math.max(0, Math.min(200, args.limit));
    if (limit === 0) return out;
    const indexFor = {
      CONTRADICTIONS: "by_company_kind_contradiction",
      SOURCES: "by_company_kind_verified",
      REFILE: "by_company_kind_refile",
      TAGS: "by_company_kind_tag",
    } as const;
    const stampOf = (page: Doc<"wikiPages">): number | undefined => {
      switch (args.rota) {
        case "CONTRADICTIONS":
          return page.lastContradictionCheckedAt;
        case "SOURCES":
          return page.lastVerifiedAt;
        case "REFILE":
          return page.lastRefileCheckedAt;
        case "TAGS":
          return page.lastTagCheckedAt;
      }
    };
    const now = Date.now();
    // Pages changed lately, newest first: on a big wiki the unchanged pages
    // at the front of a rota (passed over below) must not hide them.
    const recentlyChanged = args.full
      ? []
      : await ctx.db
          .query("wikiPages")
          .withIndex("by_company_updated", (q) => q.eq("companyId", args.companyId))
          .order("desc")
          .take(100);
    const perKind: RotaPage[][] = [];
    for (const kind of args.kinds) {
      const byStamp = await ctx.db
        .query("wikiPages")
        .withIndex(indexFor[args.rota], (q) => q.eq("companyId", args.companyId).eq("kind", kind))
        .take(args.full ? limit * 2 + 10 : 200);
      const seen = new Set<string>();
      const rows = [...byStamp, ...recentlyChanged.filter((page) => page.kind === kind)].filter((page) => {
        if (seen.has(page._id)) return false;
        seen.add(page._id);
        return true;
      });
      const due: RotaPage[] = [];
      for (const page of rows) {
        const stamp = stampOf(page);
        if (stamp !== undefined && stamp >= args.before) continue;
        // An unchanged page waits for the slow safety pass (2026-11-12);
        // a hand-run full check passes over nothing.
        if (!args.full && !isDueForRecheck(page, stamp, now)) continue;
        if (page.subjectKey.endsWith("-index")) continue;
        if (args.rota === "SOURCES") {
          // Only pages that documents taught can be checked against
          // documents. On a nightly slice, a page a document wrote today
          // needs no check tonight; a page a person or a conversation
          // changed does, and a hand-run full check passes over nothing.
          const writtenFromDocumentToday =
            Date.now() - page.updatedAt < 24 * 60 * 60 * 1000 && page.lastRewriteSource.startsWith("DOCUMENT:");
          if (!args.full && writtenFromDocumentToday) continue;
          const receipt = await ctx.db
            .query("wikiPageSources")
            .withIndex("by_page", (q) => q.eq("pageId", page._id))
            .take(20);
          if (!receipt.some((row) => row.kind === "DOCUMENT")) continue;
        }
        due.push(rotaPage(page, args.excerptChars ?? 700));
        if (due.length >= limit) break;
      }
      perKind.push(due);
    }
    // Interleaved across kinds so a small kind is not starved by a big one.
    for (let index = 0; out.length < limit; index += 1) {
      let added = false;
      for (const list of perKind) {
        if (list[index]) {
          out.push(list[index]);
          added = true;
          if (out.length >= limit) break;
        }
      }
      if (!added) break;
    }
    return out;
  },
});

/** Pages whose links are due a check, least recently checked first. */
export const getLinkRotaInternal = internalQuery({
  args: { companyId: v.optional(v.id("companies")), before: v.number(), limit: v.number() },
  handler: async (ctx, args): Promise<Array<Id<"wikiPages">>> => {
    const rows = await ctx.db
      .query("wikiPages")
      .withIndex("by_company_link_checked", (q) => q.eq("companyId", args.companyId))
      .take(Math.max(0, Math.min(100, args.limit)));
    const out: Array<Id<"wikiPages">> = [];
    for (const page of rows) {
      if (page.lastLinkCheckedAt !== undefined && page.lastLinkCheckedAt >= args.before) break;
      out.push(page._id);
    }
    return out;
  },
});

export const stampRotaInternal = internalMutation({
  args: {
    pageIds: v.array(v.id("wikiPages")),
    rota: v.union(kindRotaValidator, v.literal("LINKS")),
  },
  handler: async (ctx, args): Promise<void> => {
    const now = Date.now();
    const field = {
      LINKS: "lastLinkCheckedAt",
      CONTRADICTIONS: "lastContradictionCheckedAt",
      SOURCES: "lastVerifiedAt",
      REFILE: "lastRefileCheckedAt",
      TAGS: "lastTagCheckedAt",
    }[args.rota] as "lastLinkCheckedAt";
    for (const pageId of args.pageIds) {
      const page = await ctx.db.get(pageId);
      if (page) await ctx.db.patch(pageId, { [field]: now });
    }
  },
});

/**
 * Check every link on these pages by reading its target, take off the ones
 * that point at nothing, and stamp the pages. Every page's links are
 * verified as its turn comes round — not only the newest 500 pages, which
 * is all the old nightly pass could see.
 */
export const verifyLinksInternal = internalMutation({
  args: { companyId: v.optional(v.id("companies")), pageIds: v.array(v.id("wikiPages")) },
  handler: async (ctx, args): Promise<{ linksFixed: number; pagesChecked: number }> => {
    const now = Date.now();
    const kinds = new Set(["CUSTOMER", "PRODUCT", "POLICY", "ISSUE", "CLIENT", "SOURCE", "GOAL"]);
    const known = new Map<string, boolean>();
    let linksFixed = 0;
    let pagesChecked = 0;
    for (const pageId of args.pageIds) {
      const page = await ctx.db.get(pageId);
      // A Knowledge article's copy keeps its links as the article has them (utils/knowledgePageGuard.ts).
      if (!page || page.companyId !== args.companyId || isKnowledgeArticlePage(page)) continue;
      pagesChecked += 1;
      const kept: string[] = [];
      for (const link of new Set(page.links)) {
        const separator = link.indexOf(":");
        const kind = separator > 0 ? link.slice(0, separator) : "";
        const subjectKey = separator > 0 ? link.slice(separator + 1) : "";
        if (!kinds.has(kind) || !subjectKey || link === `${page.kind}:${page.subjectKey}`) {
          linksFixed += 1;
          continue;
        }
        let exists = known.get(link);
        if (exists === undefined) {
          const target = await ctx.db
            .query("wikiPages")
            .withIndex("by_company_kind_subject", (q) =>
              q
                .eq("companyId", args.companyId)
                .eq("kind", kind as Doc<"wikiPages">["kind"])
                .eq("subjectKey", subjectKey)
            )
            .unique();
          exists = target !== null;
          known.set(link, exists);
        }
        if (exists) kept.push(link);
        else linksFixed += 1;
      }
      await ctx.db.patch(page._id, {
        lastLinkCheckedAt: now,
        ...(kept.length !== page.links.length ? { links: kept } : {}),
      });
    }
    return { linksFixed, pagesChecked };
  },
});

/** The page detail a step needs, scoped: a page of another wiki is null. */
export const getPageForCheckupInternal = internalQuery({
  args: { companyId: v.optional(v.id("companies")), pageId: v.id("wikiPages") },
  handler: async (ctx, args) => {
    const page = await ctx.db.get(args.pageId);
    if (!page || page.companyId !== args.companyId) return null;
    return page;
  },
});

export const getPageByKeyInternal = internalQuery({
  args: { companyId: v.optional(v.id("companies")), pageKey: v.string() },
  handler: async (ctx, args) => {
    const separator = args.pageKey.indexOf(":");
    if (separator <= 0) return null;
    const kind = args.pageKey.slice(0, separator) as Doc<"wikiPages">["kind"];
    const subjectKey = args.pageKey.slice(separator + 1);
    return await ctx.db
      .query("wikiPages")
      .withIndex("by_company_kind_subject", (q) =>
        q.eq("companyId", args.companyId).eq("kind", kind).eq("subjectKey", subjectKey)
      )
      .unique();
  },
});

/**
 * The sources behind a page as the settling rules need them: each kept
 * document's text, when it was added or last changed, and whether it was
 * found on the web. Conversations are listed by kind only — they carry no
 * document to quote.
 */
export const getSettlingSourcesInternal = internalQuery({
  args: { pageId: v.id("wikiPages") },
  handler: async (
    ctx,
    args
  ): Promise<{
    documents: Array<{ documentId: string; title: string; at: number; fromWeb: boolean; text: string }>;
    conversationCount: number;
  }> => {
    const receipts = await ctx.db
      .query("wikiPageSources")
      .withIndex("by_page", (q) => q.eq("pageId", args.pageId))
      .take(30);
    // The parts of each source about this page, not the source's opening
    // (2026-11-12): a page written from page twelve of a long file used to
    // look unsupported by its own source, and could lose true facts.
    const page = await ctx.db.get(args.pageId);
    const words = page ? subjectWords(page.subjectKey, page.title) : [];
    const documents = [];
    let conversationCount = 0;
    for (const receipt of receipts) {
      if (receipt.kind !== "DOCUMENT") {
        if (receipt.kind !== "HUMAN") conversationCount += 1;
        continue;
      }
      if (documents.length >= 3) continue;
      let document: Doc<"knowledgeDocuments"> | null = null;
      try {
        document = await ctx.db.get(receipt.ref as Id<"knowledgeDocuments">);
      } catch {
        document = null;
      }
      if (!document || document.status !== "ready") continue;
      const text = (await documentFullText(ctx, document)).trim();
      if (!text) continue;
      documents.push({
        documentId: document._id,
        title: document.title,
        at: Math.max(document.createdAt, document.lastQueuedAt ?? 0),
        // Hakken never files web findings (wiki-sonae-catch-up-plan-2026-11-21.md, "Not brought over"): every source is the company's own.
        fromWeb: false,
        text: relevantPassages(text, words, WIKI_SOURCE_PASSAGE_CHARS),
      });
    }
    return { documents, conversationCount };
  },
});

// ---------------------------------------------------------------------------
// Questions already waiting: settled by the check-up when it may.
// ---------------------------------------------------------------------------

/** Open contradiction and out-of-date questions, oldest first. */
export const listOpenFactQuestionsInternal = internalQuery({
  args: { companyId: v.optional(v.id("companies")), limit: v.number() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("wikiOpenQuestions")
      .withIndex("by_company_status", (q) => q.eq("companyId", args.companyId).eq("status", "OPEN"))
      .take(100);
    return rows
      .filter((row) => row.kind === "CONTRADICTION" || row.kind === "FRESHNESS")
      .filter((row) => !row.dedupeKey.startsWith("GOAL-STALE::"))
      .slice(0, Math.max(0, args.limit))
      .map((row) => ({
        questionId: row._id,
        kind: row.kind,
        pageKeyA: row.pageKeyA,
        claimA: row.claimA,
        pageKeyB: row.pageKeyB ?? null,
        claimB: row.claimB ?? null,
        dedupeKey: row.dedupeKey,
      }));
  },
});

/** Close a question the check-up settled, on the record. */
export const resolveQuestionByCheckupInternal = internalMutation({
  args: { questionId: v.id("wikiOpenQuestions") },
  handler: async (ctx, args): Promise<void> => {
    const question = await ctx.db.get(args.questionId);
    if (!question || question.status !== "OPEN") return;
    const now = Date.now();
    await ctx.db.patch(question._id, { status: "RESOLVED", resolvedAt: now });
    await ctx.db.insert("auditLogs", {
      actionType: "WIKI_QUESTION_SETTLED_BY_CHECKUP",
      entityType: "wikiOpenQuestions",
      entityId: question._id.toString(),
      ...(question.companyId ? { companyId: question.companyId } : {}),
      timestamp: now,
      metadata: JSON.stringify({ kind: question.kind, pageKeyA: question.pageKeyA, pageKeyB: question.pageKeyB ?? null }),
    });
  },
});
