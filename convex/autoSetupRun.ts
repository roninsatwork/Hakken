"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import { getAgentProviderAdapter, isAgentCapableProvider } from "./agentProviderRegistry";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import type { ResolvedAiModelConfig } from "./aiRuntimeTypes";
import { parseDomainRankedKeywords } from "./dataForSeoParsers";
import { argsToSend, findSeoOperation, seoSiteOperationParams } from "./dataForSeoRegistry";
import { LIVE_REQUEST_TIMEOUT_MS, postDataForSeoTasks, readDataForSeoBatch, readDataForSeoCredentials } from "./dataForSeoRest";
import { rowsReturnedIn, slimSeoResult } from "./dataForSeoSlim";
import { keepAnswerFile } from "./seoPullAnswers";
import { appErrorMessage } from "./utils/appError";
import {
  MOST_STEPS,
  OWN_PAGES_READ,
  PAGE_WORDS,
  RIVAL_RANKINGS_READ,
  type Doing,
  ownPieces,
  pageReadCostUsd,
  rivalPieces,
  sourceCode,
  webSearchCostUsd,
} from "./utils/autoSetupAgent";
import { mainPagesOf, readJson } from "./utils/autoSetupText";
import { metadataText } from "./utils/pageMetadata";
import { fetchPage } from "./webScrapeActions";

/**
 * One step of a company's Auto Setup run (docs/plans/active/auto-setup-plan.md,
 * AS4–AS12). A step sets up one of the company's own websites — reads up to
 * six of its pages, searches the web for how people name it and what they ask,
 * reads what its rivals rank for (bought once when none are held), and has
 * the model write its empty boxes — or names up to eight rivals from their
 * home pages. Then it hands on to the next step until nothing is left, and
 * ends with what is left for a person.
 *
 * Every model call, web search, page read and rankings lookup is priced on the
 * run (`roleRuns.recordRunModelCall`, `recordRunServiceCall`), so the agent's
 * cap per run stops it; its cap per day is read before each step. It stops,
 * saying why, rather than go round.
 */

type CompanyId = Id<"companies">;
type RunId = Id<"agentRuns">;
type Job = NonNullable<Awaited<ReturnType<typeof readJob>>>;
type OwnJob = NonNullable<Job["own"]>;
type Page = { path: string; title: string; text: string };
type Run = { runId: RunId; companyId: CompanyId; pressedBy?: Id<"users"> };

async function readJob(ctx: ActionCtx, companyId: CompanyId, runId: RunId) {
  return await ctx.runQuery(internal.autoSetupSteps.stepWork, { companyId, runId });
}

const count = (n: number, one: string, many: string) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
const usd = (value: number) => `$${value.toFixed(2)}`;

// ── Reading pages ──────────────────────────────────────────────────────────

const words = (text: string, most: number) => text.replace(/\s+/g, " ").trim().split(" ").slice(0, most).join(" ");

/** A page as the writer reads it: its address, its title and its words, cut to a length. */
function pageOf(url: string, fetched: Extract<Awaited<ReturnType<typeof fetchPage>>, { status: "success" }>): Page {
  const path = (() => {
    try {
      return new URL(url).pathname || "/";
    } catch {
      return "/";
    }
  })();
  return { path, title: metadataText(fetched.metadata, "title", "ogTitle", "og:title") ?? "", text: words(fetched.markdown, PAGE_WORDS) };
}

/** A website's home page and up to five of its main pages, read at once; how many could not be read. */
async function readSite(host: string, most: number): Promise<{ pages: Page[]; unread: number }> {
  const homeUrl = `https://${host}/`;
  const home = await fetchPage({ url: homeUrl, withLinks: true });
  if (home.status !== "success") return { pages: [], unread: 1 };
  const more = mainPagesOf(host, home.links, most - 1);
  const read = await Promise.all(more.map(async (url) => ({ url, page: await fetchPage({ url }) })));
  const pages = [pageOf(homeUrl, home)];
  let unread = 0;
  for (const { url, page } of read) {
    if (page.status === "success") pages.push(pageOf(url, page));
    else unread += 1;
  }
  return { pages, unread };
}

// ── Pricing on the run ─────────────────────────────────────────────────────

/** A paid call other than a model's, on the run; whether the run has reached its cap. */
async function charge(ctx: ActionCtx, runId: RunId, providerKey: string, actionContext: string, costUsd: number): Promise<boolean> {
  const cost = await ctx.runMutation(internal.roleRuns.recordRunServiceCall, { runId, providerKey, actionContext, costUsd });
  return cost.limitReached;
}

// ── The page's bar ─────────────────────────────────────────────────────────

type DoingNow = { what: Doing; host?: string; at?: number; of?: number };
type Bar = ReturnType<typeof progressBar>;

/**
 * A step's pieces of work as the Auto Setup page's bar counts them
 * (`ownPieces`, `rivalPieces`): `now` finishes the piece in hand and starts
 * the next, saying what it is; `skip` counts pieces found unneeded, such as
 * rankings already held; `settle` is what the step's last write counts done —
 * the piece in hand and every piece of its plan not yet counted.
 */
function progressBar(ctx: ActionCtx, run: Run, planned: number) {
  let counted = 0;
  let inHand = false;
  let skipped = 0;
  return {
    async now(doing: DoingNow) {
      const finished = (inHand ? 1 : 0) + skipped;
      counted += finished;
      skipped = 0;
      inHand = true;
      await ctx.runMutation(internal.autoSetupSteps.stepProgress, { companyId: run.companyId, runId: run.runId, doing, finished });
    },
    skip(pieces: number) {
      skipped += Math.max(0, pieces);
    },
    settle(): number {
      const rest = Math.max(0, planned - counted);
      counted = planned;
      inHand = false;
      skipped = 0;
      return rest;
    },
  };
}

// ── Searching the web ──────────────────────────────────────────────────────

const RESEARCH_INSTRUCTION = [
  "You research one business on the web for the people who set up its search tracking.",
  "Search the web, then answer in plain English notes, short lines, no headings.",
  "Say only what the business's own pages or other websites show; never guess, never praise.",
].join(" ");

/**
 * One web search by the agent's model, with its answer as notes, priced on the
 * run: the model's tokens and the search. Null when the model cannot search
 * the web or did not answer; "LIMIT" when the run's cap is reached.
 */
async function searchTheWeb(
  ctx: ActionCtx,
  model: ResolvedAiModelConfig,
  run: { runId: RunId; companyId: CompanyId },
  heading: string,
  ask: string,
): Promise<string | null | "LIMIT"> {
  if (!isAgentCapableProvider(model.providerKey)) return null;
  let text = "";
  let usage = { inputTokens: 0, outputTokens: 0 };
  let failed = false;
  try {
    const response = await getAgentProviderAdapter(model.providerKey).streamTurn(
      {
        model: { modelId: model.modelId, providerKey: model.providerKey, providerModelId: model.providerModelId },
        systemInstruction: RESEARCH_INSTRUCTION,
        turns: [{ role: "user", parts: [{ text: ask }] }],
        tools: [],
        temperature: 0.2,
        webSearch: true,
      },
      { operation: "Auto Setup: searching the web" },
    );
    text = response.text ?? "";
    usage = { inputTokens: response.inputTokens ?? 0, outputTokens: response.outputTokens ?? 0 };
  } catch (error: unknown) {
    failed = true;
    text = appErrorMessage(error, String(error));
  }
  const cost = await ctx.runMutation(internal.roleRuns.recordRunModelCall, {
    runId: run.runId,
    companyId: run.companyId,
    actionContext: heading,
    modelId: model.modelId,
    providerKey: model.providerKey,
    providerModelId: model.providerModelId,
    ...usage,
    promptContent: ask,
    responseContent: text,
    ...(failed ? { failed: true } : {}),
  });
  if (failed) return cost.limitReached ? "LIMIT" : null;
  const capped = await charge(ctx, run.runId, model.providerKey, `${heading}: 1 web search`, webSearchCostUsd());
  return cost.limitReached || capped ? "LIMIT" : text.trim() || null;
}

// ── Rivals' rankings ───────────────────────────────────────────────────────

/**
 * What each rival ranks for: as held already, or bought once through the
 * Collector's own request and filed as its own (AS8). A rival bought lately or
 * waiting is not bought again; with DataForSEO not set up, none is bought.
 */
async function rivalsRankFor(
  ctx: ActionCtx,
  own: OwnJob,
  run: Run,
  bar: Bar,
): Promise<{ byKeyword: Map<string, string[]>; bought: number; held: number; limit: boolean }> {
  const byKeyword = new Map<string, string[]>();
  if (own.rivals.length === 0 || own.searchesRoom === 0) return { byKeyword, bought: 0, held: 0, limit: false };
  const add = (keyword: string, host: string) => {
    const key = keyword.trim().toLowerCase();
    if (!key) return;
    byKeyword.set(key, [...new Set([...(byKeyword.get(key) ?? []), host])]);
  };
  const stored = await ctx.runQuery(internal.autoSetupSteps.rivalRankings, {
    websiteIds: own.rivals.map((rival) => rival.websiteId),
    place: own.place,
    most: RIVAL_RANKINGS_READ,
  });
  let held = 0;
  const toBuy: typeof own.rivals = [];
  for (const rival of own.rivals) {
    const found = stored.find((entry) => entry.websiteId === rival.websiteId);
    if (found && found.keywords.length > 0) {
      held += 1;
      for (const keyword of found.keywords) add(keyword, rival.host);
    } else if (!found?.boughtLately) {
      toBuy.push(rival);
    }
  }
  // Held, or bought lately and not bought again: nothing to look up for them.
  bar.skip(own.rivals.length - toBuy.length);
  const operation = findSeoOperation("domain_ranked_keywords");
  let credentials: ReturnType<typeof readDataForSeoCredentials> | null = null;
  try {
    credentials = readDataForSeoCredentials();
  } catch {
    credentials = null;
  }
  let bought = 0;
  if (!operation || !credentials || toBuy.length === 0) {
    bar.skip(toBuy.length);
    return { byKeyword, bought, held, limit: false };
  }
  for (const [index, rival] of toBuy.entries()) {
    await bar.now({ what: "RANKINGS", host: rival.host, at: index + 1, of: toBuy.length });
    const params = seoSiteOperationParams(operation, rival.host, { locationCode: own.place });
    const tag = `auto-setup-${run.runId}-${rival.websiteId}`;
    let outcome: ReturnType<typeof readDataForSeoBatch> extends Map<string, infer O> ? O | undefined : never;
    try {
      const envelope = await postDataForSeoTasks(operation.path, [{ ...argsToSend(operation, params), tag }], credentials, { timeoutMs: LIVE_REQUEST_TIMEOUT_MS });
      outcome = readDataForSeoBatch(envelope).get(tag);
    } catch (error: unknown) {
      await ctx.runMutation(internal.autoSetupSteps.noteStep, {
        companyId: run.companyId,
        runId: run.runId,
        heading: `Could not look up ${rival.host}'s rankings`,
        detail: appErrorMessage(error, String(error)).slice(0, 300),
        failed: true,
      });
      continue;
    }
    if (!outcome) continue;
    const costUsd = credentials.sandbox ? 0 : outcome.costUsd;
    const answer = outcome.result !== undefined && !outcome.error
      ? await keepAnswerFile(ctx, JSON.stringify(slimSeoResult(operation.id, outcome.result) ?? null))
      : null;
    const rowsReturned = outcome.result !== undefined ? rowsReturnedIn(operation.id, outcome.result) : undefined;
    await ctx.runMutation(internal.autoSetupSteps.fileBoughtRankings, {
      websiteId: rival.websiteId,
      companyId: run.companyId,
      family: operation.family,
      host: rival.host,
      taskArgsJson: JSON.stringify(params),
      tag,
      costUsd,
      sandbox: credentials.sandbox,
      ...(outcome.taskId ? { taskId: outcome.taskId } : {}),
      answer,
      ...(rowsReturned !== undefined ? { rowsReturned } : {}),
      ...(outcome.error ? { error: outcome.error } : {}),
      ...(run.pressedBy ? { requestedBy: run.pressedBy } : {}),
    });
    bought += 1;
    if (outcome.result !== undefined && !outcome.error) {
      for (const position of parseDomainRankedKeywords(outcome.result).positions ?? []) add(position.keyword, rival.host);
    }
    if (await charge(ctx, run.runId, "dataforseo", `Bought ${rival.host}'s Google rankings`, costUsd)) return { byKeyword, bought, held, limit: true };
  }
  return { byKeyword, bought, held, limit: false };
}

// ── Writing ────────────────────────────────────────────────────────────────

const WRITE_OPENING = [
  "You fill in the setup of one business's website for a platform that tracks how the business is found on Google and in AI assistants.",
  "Write in plain UK English, in the words its customers use, never in marketing language. Never praise the business and never invent a fact: use only what the pages and the research notes say.",
];

/** Its names and profile, written straight after the web searches (2026-10-19). */
const PROFILE_INSTRUCTION = [
  ...WRITE_OPENING,
  "names: the names people use for the business, the full name first, then short names or initials people really use; add a common misspelling only when the research shows one, marked MISSPELLING. At most five.",
  "sector: what kind of business it is, in a few words. market: where it sells, in a few words. description: what it sells and to whom, in one or two sentences, at most 600 characters.",
  "countries: the countries it plainly trades in, as Google's three-letter lowercase codes (gbr for the United Kingdom), only when its pages say so plainly — an address, prices in a currency, delivery or exam rules of one country. Otherwise an empty list.",
  "companyLine: one line saying what the company is, at most 120 characters. companyAbout: a short paragraph for the company's own team: what it does, for whom, how, and who it competes with.",
  "Write only the boxes listed in write; leave every other field empty.",
].join(" ");

const PROFILE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    names: { type: "array", items: { type: "object", properties: { name: { type: "string" }, kind: { type: "string", enum: ["NAME", "MISSPELLING"] } }, required: ["name", "kind"] } },
    sector: { type: "string" },
    market: { type: "string" },
    description: { type: "string" },
    countries: { type: "array", items: { type: "string" } },
    companyLine: { type: "string" },
    companyAbout: { type: "string" },
  },
  required: ["names", "sector", "market", "description", "countries", "companyLine", "companyAbout"],
};

type Profile = {
  names: Array<{ name: string; kind: "NAME" | "MISSPELLING" }>;
  sector: string;
  market: string;
  description: string;
  countries: string[];
  companyLine: string;
  companyAbout: string;
};

/** Its Google searches and AI questions, written once the rivals' rankings are read. */
const LISTS_INSTRUCTION = [
  ...WRITE_OPENING,
  "searches: searches a customer would type into Google to find what this business sells, lowercase, as people type them, never the business's own wording. Prefer searches from the rivalSearches list that fit this business; use from RIVALS for those, PAGES for ones taken from its pages, WEB for ones from the research notes, and OWN_NAME for its own name, which is always one of them.",
  "questions: questions a customer might ask an AI assistant when choosing what this business sells, in full sentences as people ask them; include one that names the business. Use from PAGES, WEB or OWN_NAME.",
  "Write only the lists named in write; leave the other empty. Keep to the counts given.",
].join(" ");

const LISTS_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    searches: { type: "array", items: { type: "object", properties: { text: { type: "string" }, from: { type: "string", enum: ["RIVALS", "PAGES", "WEB", "OWN_NAME"] } }, required: ["text", "from"] } },
    questions: { type: "array", items: { type: "object", properties: { text: { type: "string" }, from: { type: "string", enum: ["PAGES", "WEB", "OWN_NAME"] } }, required: ["text", "from"] } },
  },
  required: ["searches", "questions"],
};

type Lists = {
  searches: Array<{ text: string; from: "RIVALS" | "PAGES" | "WEB" | "OWN_NAME" }>;
  questions: Array<{ text: string; from: "PAGES" | "WEB" | "OWN_NAME" }>;
};

/** One call to the agent's model for a JSON answer, priced on the run; the answer, or null, and whether the cap is reached. */
async function writeWithModel<T>(
  ctx: ActionCtx,
  model: ResolvedAiModelConfig,
  run: { runId: RunId; companyId: CompanyId },
  heading: string,
  instruction: string,
  schema: Record<string, unknown>,
  input: unknown,
): Promise<{ answer: T | null; limit: boolean }> {
  const prompt = JSON.stringify(input, null, 1);
  let text = "";
  let usage = { inputTokens: 0, outputTokens: 0 };
  let failed = false;
  try {
    const response = await generateTextWithResolvedModel({ model, systemInstruction: instruction, contents: [{ type: "text", text: prompt }], jsonSchema: schema, temperature: 0.2 });
    text = response.text ?? "";
    usage = { inputTokens: response.inputTokens ?? 0, outputTokens: response.outputTokens ?? 0 };
  } catch (error: unknown) {
    failed = true;
    text = appErrorMessage(error, String(error));
  }
  const cost = await ctx.runMutation(internal.roleRuns.recordRunModelCall, {
    runId: run.runId,
    companyId: run.companyId,
    actionContext: heading,
    modelId: model.modelId,
    providerKey: model.providerKey,
    providerModelId: model.providerModelId,
    ...usage,
    promptContent: prompt,
    responseContent: text,
    ...(failed ? { failed: true } : {}),
  });
  return { answer: failed ? null : readJson<T>(text), limit: cost.limitReached };
}

/** Where a search came from, as kept under it: the rivals that rank for it named from the rankings held, never from the model's say. */
function searchSource(search: Lists["searches"][number], host: string, rankedBy: Map<string, string[]>): string {
  const rivals = rankedBy.get(search.text.trim().toLowerCase()) ?? [];
  if (rivals.length > 0) return sourceCode("RIVALS", rivals.slice(0, 5));
  if (search.from === "OWN_NAME") return sourceCode("OWN_NAME");
  if (search.from === "WEB") return sourceCode("WEB");
  return sourceCode("PAGES", [host]);
}

// ── The steps ──────────────────────────────────────────────────────────────

/**
 * One of the company's own websites set up: read, searched, its names and
 * profile written and saved, its rivals' rankings read, then its searches and
 * questions written and saved. Each piece moves the page's bar on and says
 * what it is doing. "LIMIT" when a cap stopped it.
 */
async function setUpOwnWebsite(ctx: ActionCtx, job: Job, own: OwnJob, model: ResolvedAiModelConfig, run: Run): Promise<"DONE" | "LIMIT"> {
  const note = (heading: string, detail: string, failed = false) =>
    ctx.runMutation(internal.autoSetupSteps.noteStep, { companyId: run.companyId, runId: run.runId, heading, detail, failed });
  const companyEmpty = own.companyEmpty.description || own.companyEmpty.overview;
  const bar = progressBar(ctx, run, ownPieces({ gaps: own.gaps, companyEmpty, rivals: own.rivals.length, webSearchesLeft: job.webSearchesLeft }));

  await bar.now({ what: "READ_PAGES", host: own.host });
  const site = await readSite(own.host, OWN_PAGES_READ);
  const readCost = (site.pages.length + site.unread) * pageReadCostUsd();
  if (site.pages.length === 0) {
    await note(`Could not read ${own.host}`, `Its home page did not answer, so nothing was written for it. Its boxes stay empty for a person, or for the next press of Auto Setup.`, true);
    if (await charge(ctx, run.runId, "firecrawl", `Tried to read ${own.host}`, readCost)) return "LIMIT";
    await ctx.runMutation(internal.autoSetupSteps.skipOwn, { companyId: run.companyId, runId: run.runId, holdId: own.holdId, finished: bar.settle() });
    return "DONE";
  }
  await note(
    `Read ${own.host}`,
    `Read ${count(site.pages.length, "page", "pages")}: ${site.pages.map((page) => page.title || page.path).slice(0, 6).join("; ")}.${site.unread > 0 ? ` ${count(site.unread, "more page", "more pages")} could not be read.` : ""}`,
  );
  if (await charge(ctx, run.runId, "firecrawl", `Read ${count(site.pages.length + site.unread, "page", "pages")} of ${own.host}`, readCost)) return "LIMIT";

  // The web: how people name it, and what customers ask and search, within the run's searches left.
  const notes: string[] = [];
  let searches = 0;
  const wantsNames = own.gaps.includes("names");
  const wantsAsks = own.gaps.includes("searches") || own.gaps.includes("questions");
  const business = site.pages[0]?.title ?? own.host;
  const topics: Array<{ doing: Doing; heading: string; ask: string }> = [
    ...(wantsNames ? [{ doing: "SEARCH_NAMES" as const, heading: "Searched the web: how people name it", ask: `How do people refer to the business at ${own.host}? Its full name, the short names and initials people use, and any common misspelling of its name. Business: ${business}.` }] : []),
    ...(wantsAsks ? [{ doing: "SEARCH_ASKS" as const, heading: "Searched the web: what customers ask", ask: `What do customers ask and search for when choosing what ${own.host} offers (${site.pages[0]?.title ?? ""})? The questions they put to AI assistants, forums and Q&A pages, and how they phrase their Google searches, in ${own.placeLabel}.` }] : []),
  ].slice(0, job.webSearchesLeft);
  for (const topic of topics) {
    await bar.now({ what: topic.doing, host: own.host });
    const found = await searchTheWeb(ctx, model, run, topic.heading, topic.ask);
    if (found === "LIMIT") return "LIMIT";
    searches += 1;
    if (found) notes.push(found);
  }
  const pagesFrom = sourceCode(notes.length > 0 ? "PAGES_WEB" : "PAGES", [own.host]);
  const ownFrom = sourceCode("PAGES", [own.host]);
  const rivalHosts = own.rivals.map((rival) => rival.host);

  // Its names, profile, where it trades and the company's description, saved straight away, so the page shows them while the rankings are read.
  const profileWrite = [
    ...(own.gaps.includes("names") ? ["names"] : []),
    ...(own.gaps.includes("profile") ? ["sector", "market", "description"] : []),
    ...(own.countriesRoom > 0 ? ["countries"] : []),
    ...(own.companyEmpty.description ? ["companyLine"] : []),
    ...(own.companyEmpty.overview ? ["companyAbout"] : []),
  ];
  let names = own.names;
  let description = "";
  if (profileWrite.length > 0) {
    await bar.now({ what: "WRITE_PROFILE", host: own.host });
    const { answer, limit } = await writeWithModel<Profile>(ctx, model, run, `Writing ${own.host}'s names and profile`, PROFILE_INSTRUCTION, PROFILE_SCHEMA, {
      business: { website: own.host, company: job.companyName, place: own.placeLabel, namesAlready: own.names },
      write: profileWrite,
      counts: { countries: own.countriesRoom },
      pages: site.pages,
      researchNotes: notes,
      rivals: rivalHosts,
    });
    if (answer) {
      const wanted = (box: string, value: string | undefined) => (profileWrite.includes(box) && value ? value : undefined);
      const [sector, market, about, companyLine, companyAbout] = [
        wanted("sector", answer.sector),
        wanted("market", answer.market),
        wanted("description", answer.description),
        wanted("companyLine", answer.companyLine),
        wanted("companyAbout", answer.companyAbout),
      ];
      await ctx.runMutation(internal.autoSetupSteps.writeOwnProfile, {
        companyId: run.companyId,
        runId: run.runId,
        holdId: own.holdId,
        names: profileWrite.includes("names") ? (answer.names ?? []).filter((entry) => entry.name?.trim()) : [],
        namesFrom: pagesFrom,
        ...(sector ? { sector } : {}),
        ...(market ? { market } : {}),
        ...(about ? { description: about } : {}),
        profileFrom: pagesFrom,
        countries: profileWrite.includes("countries") ? answer.countries ?? [] : [],
        countriesFrom: ownFrom,
        ...(companyLine ? { companyLine } : {}),
        ...(companyAbout ? { companyAbout } : {}),
        companyFrom: ownFrom,
      });
      if (names.length === 0) names = (answer.names ?? []).map((entry) => entry.name).filter(Boolean);
      description = answer.description ?? "";
    } else {
      await note(`The model wrote no names or profile for ${own.host}`, "Its answer could not be read, so those boxes stay empty for a person, or for the next press of Auto Setup.", true);
    }
    if (limit) return "LIMIT";
  }

  const ranked = await rivalsRankFor(ctx, own, run, bar);
  if (ranked.held > 0 || ranked.bought > 0) {
    await note(
      "Looked up what the rivals rank for",
      `Google rankings for ${count(ranked.held + ranked.bought, "rival", "rivals")} in ${own.placeLabel}: ${ranked.held > 0 ? `${count(ranked.held, "already held", "already held")}` : ""}${ranked.held > 0 && ranked.bought > 0 ? ", " : ""}${ranked.bought > 0 ? `${count(ranked.bought, "bought now and kept", "bought now and kept")}` : ""}. ${count(ranked.byKeyword.size, "search", "searches")} they rank for.`,
    );
  }
  if (ranked.limit) return "LIMIT";

  // Its searches and questions, only into lists still empty, within each list's room.
  const listsWrite = [...(own.searchesRoom > 0 ? ["searches"] : []), ...(own.questionsRoom > 0 ? ["questions"] : [])];
  let lists: Lists | null = null;
  let limit = false;
  if (listsWrite.length > 0) {
    await bar.now({ what: "WRITE_LISTS", host: own.host });
    const rivalSearches = [...ranked.byKeyword.entries()]
      .sort((left, right) => right[1].length - left[1].length)
      .slice(0, 150)
      .map(([keyword, hosts]) => ({ search: keyword, rivals: hosts.length }));
    ({ answer: lists, limit } = await writeWithModel<Lists>(ctx, model, run, `Writing ${own.host}'s searches and questions`, LISTS_INSTRUCTION, LISTS_SCHEMA, {
      business: { website: own.host, company: job.companyName, place: own.placeLabel, names, ...(description ? { description } : {}) },
      write: listsWrite,
      counts: { searches: own.searchesRoom, questions: own.questionsRoom },
      pages: site.pages,
      researchNotes: notes,
      rivals: rivalHosts,
      rivalSearches,
    }));
    if (!lists) await note(`The model wrote no searches or questions for ${own.host}`, "Its answer could not be read, so those lists stay empty for a person, or for the next press of Auto Setup.", true);
  }
  // Saved even with nothing written, to move the run on; a run a newer one took over stops quietly at its next step.
  await ctx.runMutation(internal.autoSetupSteps.writeOwnLists, {
    companyId: run.companyId,
    runId: run.runId,
    holdId: own.holdId,
    searches: listsWrite.includes("searches")
      ? (lists?.searches ?? []).filter((search) => search.text?.trim()).slice(0, own.searchesRoom).map((search) => ({ text: search.text, from: searchSource(search, own.host, ranked.byKeyword) }))
      : [],
    questions: listsWrite.includes("questions")
      ? (lists?.questions ?? []).filter((question) => question.text?.trim()).slice(0, own.questionsRoom).map((question) => ({
        text: question.text,
        from: question.from === "OWN_NAME" ? sourceCode("OWN_NAME") : question.from === "WEB" ? sourceCode("WEB") : ownFrom,
      }))
      : [],
    webSearches: searches,
    finished: bar.settle(),
  });
  return limit ? "LIMIT" : "DONE";
}

const RIVAL_INSTRUCTION = [
  "You name a business's rivals for a platform that counts how often each is named in AI assistants' answers.",
  "For each rival website, from its home page, give the names people use for it: its full name first, then a short name only when people really use one. Never invent a name; leave a rival out when its page does not say.",
].join(" ");

const RIVAL_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    rivals: { type: "array", items: { type: "object", properties: { website: { type: "string" }, names: { type: "array", items: { type: "string" } } }, required: ["website", "names"] } },
  },
  required: ["rivals"],
};

/** Up to eight rivals named from their home pages. "LIMIT" when a cap stopped it. */
async function nameRivals(ctx: ActionCtx, job: Job, model: ResolvedAiModelConfig, run: Run): Promise<"DONE" | "LIMIT"> {
  const bar = progressBar(ctx, run, rivalPieces(job.rivals.length));
  await bar.now({ what: "READ_RIVALS", of: job.rivals.length });
  const read = await Promise.all(job.rivals.map(async (rival) => ({ rival, page: await fetchPage({ url: `https://${rival.host}/` }) })));
  const pages = read.flatMap(({ rival, page }) => (page.status === "success" ? [{ website: rival.host, ...pageOf(`https://${rival.host}/`, page), text: words(page.markdown, 400) }] : []));
  if (await charge(ctx, run.runId, "firecrawl", `Read ${count(job.rivals.length, "rival's home page", "rivals' home pages")}`, job.rivals.length * pageReadCostUsd())) return "LIMIT";
  if (pages.length > 0) await bar.now({ what: "NAME_RIVALS", of: job.rivals.length });
  const { answer, limit } = pages.length > 0
    ? await writeWithModel<{ rivals: Array<{ website: string; names: string[] }> }>(ctx, model, run, "Naming the rivals", RIVAL_INSTRUCTION, RIVAL_SCHEMA, { business: job.companyName, rivals: pages })
    : { answer: null, limit: false };
  const named = job.rivals.flatMap((rival) => {
    const found = answer?.rivals.find((entry) => entry.website.replace(/^www\./, "") === rival.host.replace(/^www\./, ""));
    const names = (found?.names ?? []).map((name) => name.trim()).filter(Boolean).slice(0, 3);
    return names.length > 0 ? [{ holdId: rival.holdId, names: names.map((name) => ({ name, kind: "NAME" as const })), from: sourceCode("HOME", [rival.host]) }] : [];
  });
  await ctx.runMutation(internal.autoSetupSteps.writeRivalNames, {
    companyId: run.companyId,
    runId: run.runId,
    handled: job.rivals.map((rival) => rival.holdId),
    named,
    finished: bar.settle(),
  });
  return limit ? "LIMIT" : "DONE";
}

/** What the run wrote, and what is left for a person, as its last line and the run's summary (board 3, AS10). */
function reportOf(job: Job, forPerson: string[]): string {
  const wrote = job.wrote;
  const said = [
    wrote.ownNames > 0 ? `${count(wrote.ownNames, "name", "names")} for the company's own websites` : "",
    wrote.profiles > 0 ? `${count(wrote.profiles, "profile", "profiles")}` : "",
    wrote.company ? "the company's description" : "",
    wrote.countries.length > 0 ? `where it trades (${wrote.countries.join(", ").toUpperCase()})` : "",
    wrote.searches > 0 ? `${count(wrote.searches, "Google search", "Google searches")}` : "",
    wrote.questions > 0 ? `${count(wrote.questions, "AI question", "AI questions")}` : "",
    wrote.rivalNames > 0 ? `names for ${count(wrote.rivalNames, "rival", "rivals")}` : "",
  ].filter(Boolean);
  const list = (all: string[]) => (all.length <= 1 ? all.join("") : `${all.slice(0, -1).join(", ")} and ${all[all.length - 1]}`);
  return [
    said.length > 0 ? `Set up ${job.companyName}: wrote ${list(said)}.` : `Nothing was written for ${job.companyName}: every box was filled, or nothing found would read.`,
    wrote.rivalsKept > 0 ? `${count(wrote.rivalsKept, "rival", "rivals")} already had names a person wrote; they were kept.` : "",
    forPerson.length > 0 ? `Still for a person: ${list(forPerson)}.` : "",
  ].filter(Boolean).join(" ");
}

const FOR_PERSON_WORDS: Record<string, string> = {
  COLLECTION: "switch collection on in Schedules",
  SEARCH_CONSOLE: "connect Search Console",
  ANALYTICS: "connect Google Analytics",
  COUNTRIES: "check where it trades on Market",
};

export const setupStep = internalAction({
  args: {
    companyId: v.id("companies"),
    runId: v.id("agentRuns"),
    workflowExecutionId: v.optional(v.id("workflowExecutions")),
    steps: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { companyId, runId } = args;
    const finish = (outcome: "DONE" | "STOPPED", failed: boolean, summary: string) =>
      ctx.runMutation(internal.autoSetupSteps.finishCompanyRun, {
        companyId,
        runId,
        ...(args.workflowExecutionId ? { workflowExecutionId: args.workflowExecutionId } : {}),
        outcome,
        failed,
        summary,
      });
    const steps = (args.steps ?? 0) + 1;
    const next = () => ctx.scheduler.runAfter(0, internal.autoSetupRun.setupStep, { ...args, steps });
    const capped = "Auto Setup reached its spend cap for a run, so it stopped. Raise the cap on its Settings in Agents, or press Auto Setup again: it fills only what is still empty.";

    try {
      const job = await readJob(ctx, companyId, runId);
      if (!job || job.status !== "WORKING") return null;
      if (job.queued) await ctx.runMutation(internal.roleRuns.markRunStarted, { runId });
      if (steps > MOST_STEPS) {
        await finish("STOPPED", true, `Stopped after ${MOST_STEPS} steps with websites still to set up. Press Auto Setup again: it fills only what is still empty.`);
        return null;
      }
      const day = await ctx.runQuery(internal.autoSetupStart.dayBudgetNow, {});
      if (day.spent >= day.cap) {
        await finish("STOPPED", false, `Auto Setup has spent ${usd(day.spent)} today, its cap for a day of ${usd(day.cap)}, so it stopped. It can carry on after midnight, or as soon as the cap is raised on its Settings in Agents.`);
        return null;
      }
      if (job.skipOwn) {
        await ctx.runMutation(internal.autoSetupSteps.skipOwn, { companyId, runId, holdId: job.skipOwn });
        await next();
        return null;
      }
      if (!job.own && job.rivals.length === 0) {
        const forPerson: string[] = await ctx.runQuery(internal.autoSetupSteps.leftForPerson, { companyId });
        await finish("DONE", false, reportOf(job, forPerson.map((code) => FOR_PERSON_WORDS[code] ?? code)));
        return null;
      }

      let model: ResolvedAiModelConfig;
      try {
        model = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, { useCase: "agent", companyId, ...(job.model ? { requestedModelId: job.model } : {}) });
      } catch (error: unknown) {
        await finish("STOPPED", true, `No model is set up for agents, so nothing was written: ${appErrorMessage(error, String(error)).slice(0, 200)}`);
        return null;
      }
      const run = { runId, companyId, ...(job.pressedBy ? { pressedBy: job.pressedBy } : {}) };
      const outcome = job.own ? await setUpOwnWebsite(ctx, job, job.own, model, run) : await nameRivals(ctx, job, model, run);
      if (outcome === "LIMIT") {
        await finish("STOPPED", false, capped);
        return null;
      }
      await next();
    } catch (error: unknown) {
      await finish("STOPPED", true, appErrorMessage(error, String(error)).replace(/\s+/g, " ").trim().slice(0, 400) || "It stopped on an error.");
    }
    return null;
  },
});
