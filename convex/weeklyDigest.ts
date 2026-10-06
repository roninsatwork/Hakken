import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { queueOutboxMessage } from "./outbox";
import { ensureReaderPreferences } from "./readerPreferences";
import { startRoleRun } from "./roleRuns";

/**
 * The Weekly Digest agent's reads and writes (docs/plans/active/knowledge-
 * news-and-digest-plan.md, phase 9); its job is `weeklyDigestRun.ts`. It
 * writes the week's issue once and adds one outbox row per subscribed reader
 * — it sends nothing; the Email Sender does. In Test, the issue goes only to
 * super admins, so it is seen before any customer gets it.
 */

/** The most News items one issue carries; the email shows the first eight and links the rest. */
export const ISSUE_ITEMS = 20;
/** The most Helpful content articles one issue carries (IH19): as many as the email shows. */
export const ISSUE_HELPFUL = 8;

/** Readers queued per page: a big list takes more pages, each its own transaction. */
const READERS_PER_PAGE = 200;

/** The ISO week a moment falls in: "2026-W40". */
export function isoWeekKey(at: number): string {
  const date = new Date(at);
  const day = (date.getUTCDay() + 6) % 7;
  const thursday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day + 3));
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((thursday.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const modeValidator = v.union(v.literal("TEST"), v.literal("LIVE"));

/** The agent's mode (the Role card's Test or Live), instructions and model. */
export const readDigestSetup = internalQuery({
  args: { runId: v.id("agentRuns") },
  returns: v.union(v.null(), v.object({ mode: modeValidator, instructions: v.string(), requestedModelId: v.optional(v.string()) })),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    const agent = run ? await ctx.db.get(run.agentId) : null;
    if (!agent) return null;
    return {
      mode: agent.plannerMode ?? "TEST",
      instructions: agent.systemPrompt ?? "",
      ...(agent.modelSelectionMode === "inherit" ? {} : { requestedModelId: agent.modelId }),
    };
  },
});

/** Whether this week's live issue is already written: one per week, however often the agent runs. */
export const liveIssueFor = internalQuery({
  args: { weekKey: v.string() },
  returns: v.union(v.null(), v.id("weeklyDigestIssues")),
  handler: async (ctx, args) => {
    const issues = await ctx.db.query("weeklyDigestIssues").withIndex("by_week", (q) => q.eq("weekKey", args.weekKey)).take(50);
    return issues.find((issue) => issue.mode === "LIVE")?._id ?? null;
  },
});

/**
 * What went into News since `since`, Google updates first and then the
 * newest, the Knowledge articles published since, and the Helpful content
 * added since that readers can see (IH19) — what the week's issue carries and
 * its opening is written from.
 */
export const readDigestMaterial = internalQuery({
  args: { since: v.number() },
  returns: v.object({
    items: v.array(v.object({ _id: v.id("newsItems"), kind: v.string(), sourceName: v.string(), title: v.string(), summary: v.string() })),
    articles: v.array(v.string()),
    helpful: v.array(v.object({ _id: v.id("libraryArticles"), title: v.string(), publication: v.string(), summary: v.string() })),
  }),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("newsItems").withIndex("by_published", (q) => q.gte("publishedAt", args.since)).order("desc").take(200);
    const ordered = [...rows.filter((row) => row.kind === "GOOGLE_UPDATE"), ...rows.filter((row) => row.kind !== "GOOGLE_UPDATE")].slice(0, ISSUE_ITEMS);
    const articles = await ctx.db
      .query("knowledgeArticles")
      .withIndex("by_status_published", (q) => q.eq("status", "PUBLISHED").gte("publishedAt", args.since))
      .take(20);
    const helpful = await ctx.db
      .query("libraryArticles")
      .withIndex("by_shown_created", (q) => q.eq("shown", true).gte("createdAt", args.since))
      .order("desc")
      .take(ISSUE_HELPFUL);
    return {
      items: ordered.map((row) => ({ _id: row._id, kind: row.kind, sourceName: row.sourceName, title: row.titleEn, summary: row.summaryEn })),
      articles: articles.map((article) => article.titleEn),
      helpful: helpful.map((article) => ({ _id: article._id, title: article.title, publication: article.publication, summary: article.summaryEn ?? "" })),
    };
  },
});

export const saveIssue = internalMutation({
  args: {
    weekKey: v.string(),
    introEn: v.string(),
    itemIds: v.array(v.id("newsItems")),
    helpfulIds: v.optional(v.array(v.id("libraryArticles"))),
    mode: modeValidator,
    runId: v.id("agentRuns"),
  },
  returns: v.id("weeklyDigestIssues"),
  handler: async (ctx, args) => await ctx.db.insert("weeklyDigestIssues", {
    weekKey: args.weekKey,
    introEn: args.introEn,
    itemIds: args.itemIds,
    ...(args.helpfulIds?.length ? { helpfulIds: args.helpfulIds } : {}),
    mode: args.mode,
    writtenByRunId: args.runId,
    createdAt: Date.now(),
  }),
});

/**
 * A page of readers, each given one outbox row for the issue — not a reader
 * who turned the digest off, nor one with no address. Live goes to every
 * user, once a week each (the idempotency key is the week's); Test only to
 * super admins, once per test issue.
 */
export const queueDigestPage = internalMutation({
  args: {
    issueId: v.id("weeklyDigestIssues"),
    runId: v.id("agentRuns"),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.object({ queued: v.number(), skipped: v.number(), cursor: v.union(v.string(), v.null()), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const issue = await ctx.db.get(args.issueId);
    if (!issue) return { queued: 0, skipped: 0, cursor: null, isDone: true };
    let readers: Array<Doc<"users">>;
    let cursor: string | null = null;
    let isDone = true;
    if (issue.mode === "TEST") {
      readers = await ctx.db.query("users").withIndex("by_role_lastLogin", (q) => q.eq("role", "SUPER_ADMIN")).take(100);
    } else {
      const page = await ctx.db.query("users").paginate({ numItems: READERS_PER_PAGE, cursor: args.cursor });
      readers = page.page;
      cursor = page.continueCursor;
      isDone = page.isDone;
    }
    let queued = 0;
    let skipped = 0;
    for (const reader of readers) {
      if (!reader.email) {
        skipped += 1;
        continue;
      }
      const preferences = await ensureReaderPreferences(ctx, reader._id);
      if (!preferences.newsDigest) {
        skipped += 1;
        continue;
      }
      const key = issue.mode === "LIVE"
        ? `WEEKLY_NEWS_DIGEST:${issue.weekKey}:${reader._id}`
        : `WEEKLY_NEWS_DIGEST:TEST:${issue._id}:${reader._id}`;
      const rowId = await queueOutboxMessage(ctx, {
        messageType: "WEEKLY_NEWS_DIGEST",
        userId: reader._id,
        email: reader.email,
        language: preferences.language ?? "en",
        payload: { issueId: issue._id },
        idempotencyKey: key,
        queuedByRunId: args.runId,
      });
      if (rowId) queued += 1;
      else skipped += 1;
    }
    return { queued, skipped, cursor, isDone };
  },
});

/** Start the Email Sender to send what was queued — unless one is already sending, which sends it too. */
export const startEmailSender = internalMutation({
  args: { issueWeek: v.string() },
  returns: v.union(v.literal("STARTED"), v.literal("ALREADY_GOING"), v.literal("NO_AGENT"), v.literal("AGENT_OFF")),
  handler: async (ctx, args) => await startRoleRun(ctx, "EMAIL_SENDER", {
    objective: `Send the Weekly News Digest for ${args.issueWeek}.`,
    title: `Weekly News Digest — ${args.issueWeek}`,
  }),
});
