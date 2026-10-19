import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { companyNotesAfterChange } from "./companies";
import { doingNowValidator } from "./autoSetupSchema";
import { comparedWith, findAutoSetup, forPersonOf, setupWorkOf, type OwnGap } from "./autoSetupStart";
import { readFanOutLimits } from "./fanOutLimits";
import { holdQuestions, holdSearches } from "./holdLists";
import { MAX_BUSINESS_DESCRIPTION, MAX_PROFILE_LABEL, holdProfileOf, writeProfile } from "./holdProfiles";
import { closeRoleRun, writeRunLine } from "./roleRuns";
import { storePullAnswer } from "./seoPullAnswers";
import { UNKNOWN_COUNTRY } from "./searchConsoleCountries";
import { isGoogleCountry } from "./utils/countryCodes";
import { RIVALS_PER_STEP, SEARCHES_WRITTEN, WEB_SEARCHES_PER_RUN } from "./utils/autoSetupAgent";
import { readBrandNames } from "./utils/websiteBrands";
import { DEFAULT_LOCATION_CODE, findSeoLocation } from "./utils/seoLocations";
import { isTrackedHold } from "./utils/websitePairing";
import { addWebsiteKeywordCore, addWebsiteQuestionCore } from "./websiteCanonical";

/**
 * The reads and writes of an Auto Setup run's steps (docs/plans/active/
 * auto-setup-plan.md, AS4, AS5, AS11): what a step works on, a website's boxes
 * written — only those still empty, each marked as Hakken's with what it was
 * written from — its rivals named, and the run's end. The step itself, which
 * reads the pages, searches the web and asks the model, is `autoSetupRun.ts`.
 */

type HoldId = Id<"companyWebsites">;

/** The run's row, when this run is still the company's and still working. */
async function liveRow(ctx: { db: MutationCtx["db"] }, companyId: Id<"companies">, runId: Id<"agentRuns">) {
  const state = await ctx.db.query("autoSetupRuns").withIndex("by_company", (q) => q.eq("companyId", companyId)).first();
  return state && state.agentRunId === runId && state.status === "WORKING" ? state : null;
}

/** The pieces of work done once `finished` more are, never past the run's whole. */
const piecesAfter = (state: Doc<"autoSetupRuns">, finished: number) => Math.min(state.pieces ?? Number.POSITIVE_INFINITY, (state.piecesDone ?? 0) + finished);

const hostOf = async (ctx: { db: QueryCtx["db"] }, hold: Doc<"companyWebsites">) => {
  const website = await ctx.db.get(hold.websiteId);
  return website?.displayHost ?? website?.host ?? "";
};

/**
 * What the next step works on, or null when this run is no longer the
 * company's: the next of its own websites with what is still empty there,
 * how much room its lists have, and the rivals it is compared with — or, once
 * those are done, the next rivals to name.
 */
export const stepWork = internalQuery({
  args: { companyId: v.id("companies"), runId: v.id("agentRuns") },
  handler: async (ctx, args) => {
    const [state, run, company, agent] = await Promise.all([
      ctx.db.query("autoSetupRuns").withIndex("by_company", (q) => q.eq("companyId", args.companyId)).first(),
      ctx.db.get(args.runId),
      ctx.db.get(args.companyId),
      findAutoSetup(ctx),
    ]);
    if (!state || !run || !company || state.agentRunId !== args.runId) return null;
    const base = {
      status: state.status,
      queued: run.status === "QUEUED",
      companyName: company.name,
      done: state.done,
      total: state.total,
      webSearchesLeft: agent?.allowInternetAccess === false ? 0 : Math.max(0, WEB_SEARCHES_PER_RUN - state.webSearches),
      model: agent?.modelSelectionMode === "override" && agent.modelId ? agent.modelId : null,
      pressedBy: state.pressedBy ?? null,
      wrote: state.wrote,
    };

    const nextOwn = state.ownLeft[0];
    if (nextOwn) {
      const hold = await ctx.db.get(nextOwn);
      if (!hold || isTrackedHold(hold)) return { ...base, own: null, skipOwn: nextOwn, rivals: [] };
      const host = await hostOf(ctx, hold);
      const work = await setupWorkOf(ctx, args.companyId);
      const gaps: OwnGap[] = work.own.find((site) => site.hold._id === hold._id)?.gaps ?? [];
      const limits = await readFanOutLimits(ctx, args.companyId, hold._id);
      const searches = await holdSearches(ctx, hold._id, limits.trackedPerSite + 1);
      const questions = await holdQuestions(ctx, hold._id, limits.promptsPerSite + 1);
      const profile = await holdProfileOf(ctx, hold._id);
      // The rivals it is compared with; a company with one own website compares every rival with it.
      const allRivals = (await ctx.db.query("companyWebsites").withIndex("by_company", (q) => q.eq("companyId", args.companyId)).take(300)).filter(isTrackedHold);
      const rivals = [];
      for (const rival of comparedWith(allRivals, hold, work.own.length)) {
        const website = await ctx.db.get(rival.websiteId);
        if (website) rivals.push({ websiteId: website._id, host: website.displayHost ?? website.host });
      }
      const place = hold.locationCode ?? DEFAULT_LOCATION_CODE;
      return {
        ...base,
        own: {
          holdId: hold._id,
          host,
          websiteId: hold.websiteId,
          place,
          placeLabel: hold.locationLabel ?? findSeoLocation(place)?.label ?? "United Kingdom",
          gaps,
          companyEmpty: { description: !company.description, overview: !company.overview },
          searchesRoom: gaps.includes("searches") ? Math.min(SEARCHES_WRITTEN, Math.max(0, limits.trackedPerSite - searches.length)) : 0,
          questionsRoom: gaps.includes("questions") ? Math.max(0, limits.promptsPerSite - questions.length) : 0,
          countriesRoom: gaps.includes("countries") ? limits.consoleCountriesPerSite : 0,
          names: (profile?.brandNames ?? []).map((entry) => entry.name),
          rivals,
        },
        skipOwn: null,
        rivals: [],
      };
    }

    const batch = [];
    for (const holdId of state.rivalsLeft.slice(0, RIVALS_PER_STEP)) {
      const hold = await ctx.db.get(holdId);
      if (!hold) continue;
      batch.push({ holdId, host: await hostOf(ctx, hold) });
    }
    return { ...base, own: null, skipOwn: null, rivals: batch, rivalsLeft: state.rivalsLeft.length };
  },
});

/** A line on the run's timeline and in its log, with the run kept moving. False when the run is no longer the company's. */
export const noteStep = internalMutation({
  args: { companyId: v.id("companies"), runId: v.id("agentRuns"), heading: v.string(), detail: v.string(), failed: v.boolean(), webSearches: v.optional(v.number()) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const state = await liveRow(ctx, args.companyId, args.runId);
    if (!state) return false;
    await ctx.db.patch(state._id, { lastStepAt: Date.now(), ...(args.webSearches ? { webSearches: state.webSearches + args.webSearches } : {}) });
    await writeRunLine(ctx, { runId: args.runId, companyId: args.companyId, heading: args.heading, detail: args.detail, failed: args.failed });
    return true;
  },
});

/**
 * What the run starts on now, and the pieces of work it finished since it last
 * said, for the bar and the line under it on the Auto Setup page; the run kept
 * moving. False when the run is no longer the company's.
 */
export const stepProgress = internalMutation({
  args: { companyId: v.id("companies"), runId: v.id("agentRuns"), doing: v.optional(doingNowValidator), finished: v.number() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const state = await liveRow(ctx, args.companyId, args.runId);
    if (!state) return false;
    await ctx.db.patch(state._id, { piecesDone: piecesAfter(state, args.finished), ...(args.doing ? { doing: args.doing } : {}), lastStepAt: Date.now() });
    return true;
  },
});

/** One of the company's own websites taken off the list without writing: gone, no longer the company's own, or its home page not answering. */
export const skipOwn = internalMutation({
  args: { companyId: v.id("companies"), runId: v.id("agentRuns"), holdId: v.id("companyWebsites"), finished: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await liveRow(ctx, args.companyId, args.runId);
    if (!state) return null;
    await ctx.db.patch(state._id, { ownLeft: state.ownLeft.filter((id) => id !== args.holdId), done: state.done + 1, piecesDone: piecesAfter(state, args.finished ?? 0), lastStepAt: Date.now() });
    return null;
  },
});

const nameValidator = v.object({ name: v.string(), kind: v.union(v.literal("NAME"), v.literal("MISSPELLING")) });
const listedValidator = v.object({ text: v.string(), from: v.string() });

/** Names as they are kept: the first the main one, at most five, or none when they would not read. */
function readNames(names: ReadonlyArray<{ name: string; kind: "NAME" | "MISSPELLING" }>) {
  const firstName = names.findIndex((entry) => entry.kind === "NAME");
  if (firstName < 0) return null;
  const ordered = [names[firstName], ...names.filter((_, index) => index !== firstName)];
  for (let keep = Math.min(ordered.length, 5); keep >= 1; keep -= 1) {
    const read = readBrandNames(ordered.slice(0, keep).map((entry, index) => ({ name: entry.name, kind: entry.kind, isPrimary: index === 0 })));
    if (read.ok) return read.names;
  }
  return null;
}

const tidy = (value: string | undefined, most: number) => {
  const read = (value ?? "").replace(/\s+/g, " ").trim();
  return read.length > 0 ? read.slice(0, most) : undefined;
};

const listOf = (said: string[]) => (said.length === 1 ? said[0] : `${said.slice(0, -1).join(", ")} and ${said[said.length - 1]}`);

/**
 * One of the company's own websites' names and profile written, straight
 * after its web searches so the page shows them while its rivals' rankings
 * are looked up (2026-10-19): each box only while it is still empty, marked
 * with what it was written from (AS4, AS5) — its names, its business, where it
 * trades, the company's description and About — with a line saying what was
 * written. What it wrote is the pressing person's in the audit trail.
 */
export const writeOwnProfile = internalMutation({
  args: {
    companyId: v.id("companies"),
    runId: v.id("agentRuns"),
    holdId: v.id("companyWebsites"),
    names: v.array(nameValidator),
    namesFrom: v.string(),
    sector: v.optional(v.string()),
    market: v.optional(v.string()),
    description: v.optional(v.string()),
    profileFrom: v.string(),
    countries: v.array(v.string()),
    countriesFrom: v.string(),
    companyLine: v.optional(v.string()),
    companyAbout: v.optional(v.string()),
    companyFrom: v.string(),
  },
  returns: v.union(v.null(), v.object({ names: v.number(), profile: v.boolean(), countries: v.array(v.string()), company: v.boolean() })),
  handler: async (ctx, args) => {
    const state = await liveRow(ctx, args.companyId, args.runId);
    const hold = await ctx.db.get(args.holdId);
    if (!state || !hold || isTrackedHold(hold)) return null;
    const host = await hostOf(ctx, hold);
    const profile = await holdProfileOf(ctx, hold._id);

    // Names, only when it has none.
    let names = 0;
    if ((profile?.brandNames ?? []).length === 0) {
      const read = readNames(args.names);
      if (read) {
        await writeProfile(ctx, hold, { brandNames: read }, { brandNames: args.namesFrom });
        names = read.length;
      }
    }

    // The business, box by box: a box a person filled stays theirs.
    const fields: { sector?: string; marketLabel?: string; businessDescription?: string } = {};
    const wrote: { sector?: string; marketLabel?: string; businessDescription?: string } = {};
    const fresh = await holdProfileOf(ctx, hold._id);
    const sector = tidy(args.sector, MAX_PROFILE_LABEL);
    const market = tidy(args.market, MAX_PROFILE_LABEL);
    const description = tidy(args.description, MAX_BUSINESS_DESCRIPTION);
    if (!fresh?.sector && sector) {
      fields.sector = sector;
      wrote.sector = args.profileFrom;
    }
    if (!fresh?.marketLabel && market) {
      fields.marketLabel = market;
      wrote.marketLabel = args.profileFrom;
    }
    if (!fresh?.businessDescription && description) {
      fields.businessDescription = description;
      wrote.businessDescription = args.profileFrom;
    }
    const profileWritten = Object.keys(fields).length > 0;
    if (profileWritten) await writeProfile(ctx, hold, fields, wrote);

    // Where it trades, only when the site said so plainly and none is set (decision 2).
    const countries: string[] = [];
    if ((hold.searchConsoleCountries ?? []).length === 0 && args.countries.length > 0) {
      const { consoleCountriesPerSite } = await readFanOutLimits(ctx, hold.companyId, hold._id);
      for (const raw of args.countries) {
        const code = raw.trim().toLowerCase();
        if (isGoogleCountry(code) && code !== UNKNOWN_COUNTRY && !countries.includes(code) && countries.length < consoleCountriesPerSite) countries.push(code);
      }
      if (countries.length > 0) await ctx.db.patch(hold._id, { searchConsoleCountries: countries, searchConsoleCountriesBy: args.countriesFrom, updatedAt: Date.now() });
    }

    // The company's own description and About, each only while empty.
    const company = await ctx.db.get(args.companyId);
    let companyWritten = false;
    if (company) {
      const line = !company.description ? tidy(args.companyLine, 160) : undefined;
      const about = !company.overview ? tidy(args.companyAbout, 2_000) : undefined;
      if (line || about) {
        const notes = { ...(companyNotesAfterChange(company, {}) ?? {}), ...(line ? { description: args.companyFrom } : {}), ...(about ? { overview: args.companyFrom } : {}) };
        await ctx.db.patch(company._id, { ...(line ? { description: line } : {}), ...(about ? { overview: about } : {}), hakkenWrote: notes });
        companyWritten = true;
      }
    }

    await ctx.db.patch(state._id, {
      wrote: {
        ...state.wrote,
        ownNames: state.wrote.ownNames + names,
        profiles: state.wrote.profiles + (profileWritten ? 1 : 0),
        company: state.wrote.company || companyWritten,
        countries: [...new Set([...state.wrote.countries, ...countries])],
      },
      lastStepAt: Date.now(),
    });
    const said = [
      names > 0 ? `${names} ${names === 1 ? "name" : "names"}` : "",
      profileWritten ? "its profile" : "",
      countries.length > 0 ? `where it trades (${countries.join(", ").toUpperCase()})` : "",
      companyWritten ? "the company's description" : "",
    ].filter(Boolean);
    await writeRunLine(ctx, {
      runId: args.runId,
      companyId: args.companyId,
      heading: `Wrote ${host}'s names and profile`,
      detail: said.length > 0
        ? `Wrote ${listOf(said)}. A box a person had filled was left as it was.`
        : "Nothing was left empty to write, or nothing written would read; every box was left as it was.",
      failed: false,
    });
    return { names, profile: profileWritten, countries, company: companyWritten };
  },
});

/**
 * One of the company's own websites' Google searches and AI questions
 * written, once its rivals' rankings are read: only into an empty list, each
 * within the website's limit and marked with what it was written from (AS5);
 * then the run moved on to its next website, with a line saying what was
 * written.
 */
export const writeOwnLists = internalMutation({
  args: {
    companyId: v.id("companies"),
    runId: v.id("agentRuns"),
    holdId: v.id("companyWebsites"),
    searches: v.array(listedValidator),
    questions: v.array(listedValidator),
    /** Web searches this step made, added to the run's. */
    webSearches: v.number(),
    /** Pieces of work this step finished since it last said, with those it found unneeded. */
    finished: v.optional(v.number()),
  },
  returns: v.union(v.null(), v.object({ searches: v.number(), questions: v.number() })),
  handler: async (ctx, args) => {
    const state = await liveRow(ctx, args.companyId, args.runId);
    const hold = await ctx.db.get(args.holdId);
    if (!state || !hold || isTrackedHold(hold)) return null;
    const host = await hostOf(ctx, hold);
    const actor = state.pressedBy;

    // Searches and questions, only into an empty list, each within the website's limit; a duplicate or one past it is left out.
    let searches = 0;
    if ((await holdSearches(ctx, hold._id, 1)).length === 0) {
      for (const search of args.searches.slice(0, SEARCHES_WRITTEN)) {
        try {
          await addWebsiteKeywordCore(ctx, { companyWebsiteId: hold._id, keyword: search.text, ...(actor ? { userId: actor } : {}), addedFrom: "AUTO_SETUP", writtenFrom: search.from });
          searches += 1;
        } catch {
          // Already tracked, not a search Google would take, or past the limit.
        }
      }
    }
    let questions = 0;
    if ((await holdQuestions(ctx, hold._id, 1)).length === 0) {
      for (const question of args.questions) {
        try {
          await addWebsiteQuestionCore(ctx, { companyWebsiteId: hold._id, prompt: question.text, ...(actor ? { userId: actor } : {}), autoSetup: { writtenFrom: question.from } });
          questions += 1;
        } catch {
          // Already asked, too short to send, or past the website's limit.
        }
      }
    }

    await ctx.db.patch(state._id, {
      ownLeft: state.ownLeft.filter((id) => id !== hold._id),
      done: state.done + 1,
      piecesDone: piecesAfter(state, args.finished ?? 0),
      webSearches: state.webSearches + args.webSearches,
      wrote: { ...state.wrote, searches: state.wrote.searches + searches, questions: state.wrote.questions + questions },
      lastStepAt: Date.now(),
    });
    const said = [
      searches > 0 ? `${searches} Google ${searches === 1 ? "search" : "searches"}` : "",
      questions > 0 ? `${questions} AI ${questions === 1 ? "question" : "questions"}` : "",
    ].filter(Boolean);
    await writeRunLine(ctx, {
      runId: args.runId,
      companyId: args.companyId,
      heading: `Wrote ${host}'s searches and questions`,
      detail: said.length > 0
        ? `Wrote ${listOf(said)}. A list a person had started was left as it was.`
        : "Nothing was left empty to write, or nothing written would read; every list was left as it was.",
      failed: false,
    });
    return { searches, questions };
  },
});

/**
 * Rivals named from their home pages, each only while it still has no names
 * (AS4), then the run moved on: the rivals in this batch done, those a person
 * named meanwhile counted as kept.
 */
export const writeRivalNames = internalMutation({
  args: {
    companyId: v.id("companies"),
    runId: v.id("agentRuns"),
    handled: v.array(v.id("companyWebsites")),
    named: v.array(v.object({ holdId: v.id("companyWebsites"), names: v.array(nameValidator), from: v.string() })),
    /** Pieces of work this step finished since it last said. */
    finished: v.optional(v.number()),
  },
  returns: v.union(v.null(), v.object({ named: v.number(), kept: v.number() })),
  handler: async (ctx, args) => {
    const state = await liveRow(ctx, args.companyId, args.runId);
    if (!state) return null;
    let named = 0;
    let kept = 0;
    const handled = new Set<HoldId>(args.handled);
    for (const holdId of handled) {
      const hold = await ctx.db.get(holdId);
      if (!hold || hold.companyId !== args.companyId) continue;
      const profile = await holdProfileOf(ctx, hold._id);
      if ((profile?.brandNames ?? []).length > 0) {
        kept += 1;
        continue;
      }
      const found = args.named.find((entry) => entry.holdId === holdId);
      const read = found ? readNames(found.names) : null;
      if (!found || !read) continue;
      await writeProfile(ctx, hold, { brandNames: read }, { brandNames: found.from });
      named += 1;
    }
    await ctx.db.patch(state._id, {
      rivalsLeft: state.rivalsLeft.filter((id) => !handled.has(id)),
      done: state.done + handled.size,
      piecesDone: piecesAfter(state, args.finished ?? 0),
      wrote: { ...state.wrote, rivalNames: state.wrote.rivalNames + named, rivalsKept: state.wrote.rivalsKept + kept },
      lastStepAt: Date.now(),
    });
    const missed = handled.size - named - kept;
    await writeRunLine(ctx, {
      runId: args.runId,
      companyId: args.companyId,
      heading: "Wrote the rivals' names",
      detail: [
        `Names for ${named} ${named === 1 ? "rival" : "rivals"}.`,
        kept > 0 ? `${kept} already had names a person wrote; they were kept as they are.` : "",
        missed > 0 ? `${missed} could not be named: their home page did not say. They stay empty for a person.` : "",
      ].filter(Boolean).join(" "),
      failed: false,
    });
    return { named, kept };
  },
});

/**
 * The run's end: DONE when everything has been worked through, STOPPED when it
 * could not go on (switched off, a spend cap reached, the model not
 * answering), with its summary as the run's last step.
 */
export const finishCompanyRun = internalMutation({
  args: {
    companyId: v.id("companies"),
    runId: v.id("agentRuns"),
    workflowExecutionId: v.optional(v.id("workflowExecutions")),
    outcome: v.union(v.literal("DONE"), v.literal("STOPPED")),
    failed: v.boolean(),
    summary: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await ctx.db.query("autoSetupRuns").withIndex("by_company", (q) => q.eq("companyId", args.companyId)).first();
    const now = Date.now();
    if (state && state.agentRunId === args.runId) {
      await ctx.db.patch(state._id, {
        status: args.outcome,
        finishedAt: now,
        lastStepAt: now,
        doing: undefined,
        ...(args.outcome === "DONE" ? { report: args.summary, stopped: undefined } : { stopped: args.summary }),
      });
    }
    await closeRoleRun(ctx, {
      runId: args.runId,
      ...(args.workflowExecutionId ? { workflowExecutionId: args.workflowExecutionId } : {}),
      status: args.failed ? "FAILED" : "SUCCESS",
      summary: args.summary,
    });
    return null;
  },
});

// ── Rivals' rankings (AS8) ─────────────────────────────────────────────────

/** A lookup this recent, or one still waiting, is not bought again: the Collector buys rankings monthly at most. */
const BOUGHT_WITHIN_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The searches each rival ranks for, the ones bringing it the most visits, as
 * Hakken already holds them — shared by every company that watches it, so free
 * to read — and whether a rival with none had rankings bought recently (or
 * waiting), so it is never bought twice.
 */
export const rivalRankings = internalQuery({
  args: { websiteIds: v.array(v.id("websites")), place: v.number(), most: v.number() },
  returns: v.array(v.object({ websiteId: v.id("websites"), keywords: v.array(v.string()), boughtLately: v.boolean() })),
  handler: async (ctx, args) => {
    const now = Date.now();
    return await Promise.all(args.websiteIds.map(async (websiteId) => {
      const ranks = await ctx.db
        .query("siteKeywordRanks")
        .withIndex("by_site_traffic", (q) => q.eq("websiteId", websiteId).eq("locationCode", args.place))
        .order("desc")
        .take(args.most);
      const lately = await ctx.db
        .query("seoDataPulls")
        .withIndex("by_website_operation_submitted", (q) => q.eq("websiteId", websiteId).eq("operationId", "domain_ranked_keywords").gte("submittedAt", now - BOUGHT_WITHIN_MS))
        .first();
      return { websiteId, keywords: ranks.map((row) => row.keyword), boughtLately: lately !== null };
    }));
  },
});

/**
 * A rival's rankings Auto Setup bought, filed as the Collector files its own:
 * a DataForSEO request, answered, with its answer kept, then read by the
 * Collector's own filing — so the rankings are kept for collection, show on
 * the Sites screens, and are not bought again (AS8).
 */
export const fileBoughtRankings = internalMutation({
  args: {
    websiteId: v.id("websites"),
    companyId: v.id("companies"),
    family: v.string(),
    host: v.string(),
    taskArgsJson: v.string(),
    tag: v.string(),
    costUsd: v.number(),
    sandbox: v.boolean(),
    taskId: v.optional(v.string()),
    answer: v.union(v.null(), v.object({ file: v.id("_storage"), bytes: v.number() })),
    rowsReturned: v.optional(v.number()),
    error: v.optional(v.string()),
    requestedBy: v.optional(v.id("users")),
  },
  returns: v.id("seoDataPulls"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const pullId = await ctx.db.insert("seoDataPulls", {
      operationId: "domain_ranked_keywords",
      family: args.family,
      mode: "LIVE",
      target: args.host,
      websiteId: args.websiteId,
      companyId: args.companyId,
      taskArgsJson: args.taskArgsJson,
      status: args.error || !args.answer ? "FAILED" : "READY",
      tag: args.tag,
      costUsd: args.costUsd,
      sandbox: args.sandbox,
      ...(args.taskId ? { taskId: args.taskId } : {}),
      ...(args.rowsReturned !== undefined ? { rowsReturned: args.rowsReturned } : {}),
      ...(args.error ? { error: args.error } : {}),
      ...(args.requestedBy ? { requestedBy: args.requestedBy } : {}),
      submittedAt: now,
      sentAt: now,
      completedAt: now,
    });
    if (args.answer && !args.error) {
      await storePullAnswer(ctx, pullId, args.answer);
      await ctx.scheduler.runAfter(0, internal.seoCollectionParse.parseSeoResult, { pullId });
    }
    return pullId;
  },
});

/** What is left for a person once the run is done, as codes its last line words (AS10). */
export const leftForPerson = internalQuery({
  args: { companyId: v.id("companies") },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const [state, work] = await Promise.all([
      ctx.db.query("autoSetupRuns").withIndex("by_company", (q) => q.eq("companyId", args.companyId)).first(),
      setupWorkOf(ctx, args.companyId),
    ]);
    return await forPersonOf(ctx, args.companyId, work.own.map((site) => site.hold), (state?.wrote.countries.length ?? 0) > 0);
  },
});
