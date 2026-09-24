import { readWebsiteHost } from "./websiteIdentity";
import {
  AI_ENGINES,
  AI_ENGINE_CALLS,
  aiCitationOperationId,
  type AiEngine,
} from "./seoAiEngines";
import { SITE_LINK_OPERATIONS } from "./dataForSeoLinkOperations";
import { CRAWL_OPERATIONS } from "./dataForSeoCrawlOperations";
import { KEYWORD_LIST_OPERATIONS } from "./dataForSeoKeywordListOperations";
import { appError } from "./utils/appError";

/**
 * What Hakken can ask DataForSEO, as a list.
 *
 * DataForSEO has a dozen API families and well over fifty endpoints. Two shapes
 * were rejected before this one:
 *
 *   - **A tool per endpoint.** Fifty tools in an agent's list, and a model's
 *     tool choice degrades badly past about twenty. Also a handler each,
 *     forever.
 *   - **One "call any endpoint" tool.** The model would have to recall
 *     DataForSEO's paths and body shapes from memory, and every time it
 *     misremembered one it would cost money — DataForSEO charges for the
 *     attempt, not the success.
 *
 * So: a registry of *operations*, and two tools over it. The agent searches
 * this list in plain words, names one operation and its parameters, and the
 * handler builds the request. The agent never types a path and never composes
 * a body, so the ways it can be wrong are all caught here, locally, before any
 * money is spent.
 *
 * **Adding a family is adding entries.** No new tool, no new handler, no new
 * screen, and the agent's tool list never grows.
 */

/**
 * Whether DataForSEO will queue this endpoint or only answer live.
 *
 * Not our choice. SERP, Keywords Data and On-Page publish `task_post`
 * endpoints, which are cheaper and are what a nightly fetcher should use.
 * DataForSEO Labs and Backlinks publish `/live` only — there is no `task_post`
 * for them, verified against their docs on 2026-09-21, both 404. So the mode
 * is a fact about the endpoint and belongs on the entry, rather than being a
 * setting someone can get wrong.
 */
export type SeoOperationMode = "QUEUED" | "LIVE";

export type SeoParamKind = "host" | "hosts" | "keyword" | "keywords" | "number" | "text";

export type SeoOperationParam = {
  kind: SeoParamKind;
  required: boolean;
  /** Written for the model to read, so it knows what to put here. */
  description: string;
  default?: string | number;
};

export type SeoOperation = {
  id: string;
  /** The question this answers, in plain words. What the model searches on. */
  question: string;
  family: string;
  mode: SeoOperationMode;
  /** The DataForSEO path, ending `task_post` for queued or `live` for live. */
  path: string;
  /**
   * Where a queued result is collected from, with `$id` standing for
   * DataForSEO's task id.
   *
   * We fetch the result ourselves rather than letting DataForSEO post it to
   * us. Their callback cannot carry a header, so a posted result would arrive
   * on an unauthenticated URL and a forged one would poison the record. A
   * *ping* saying "task ready" is safe to trust with nothing, because all it
   * can make us do is ask DataForSEO — over authenticated HTTPS — what it
   * actually says. Collecting a result costs nothing: the charge was taken when
   * the task was set.
   */
  resultPath?: string;
  params: Record<string, SeoOperationParam>;
  /**
   * Rough cost, for an agent deciding whether it needs this. Not a price —
   * DataForSEO returns the real figure with every response and that is what
   * the ledger records.
   */
  costBand: "low" | "medium" | "high";
  /**
   * How many hosts one call can ask about, when the endpoint takes a list.
   *
   * **The number that decides the bill.** Every operation above asks about one
   * host and is charged once. DataForSEO's bulk endpoints accept up to a
   * thousand targets in a single request for a single charge, so a thousand
   * tracked sites costs one call rather than a thousand. Absent means this
   * operation is about one host, which is the shape everything started as.
   *
   * The parameter carrying the list is named here too, because it differs
   * between families and guessing it is a charged request that returns nothing.
   */
  bulk?: { targetsParam: string; maxTargets: number };
  /**
   * Set when this operation asks one AI engine one question.
   *
   * The fourth cost shape. Not per site and not per keyword but per *prompt*,
   * and what makes it affordable is that the answer names whoever it names:
   * one purchase serves every tracked site that appears in it, the same trick
   * as one row per host. See `seoAiEngines.ts` for how each engine is asked.
   */
  aiEngine?: AiEngine;
  /**
   * How often one website's answer is bought again: `{ everyDays }` holds a
   * bought answer for that many days, whatever the cycle's own cadence.
   * Absent: every cycle, as everything began. See
   * docs/plans/active/user-sites-plan.md, "Collecting more".
   */
  refresh?: { everyDays: number };
  /** Settings sent with every call exactly as written: filters, sort order, grouping. */
  fixed?: Record<string, unknown>;
};

/**
 * The starting set. Every path here was read from DataForSEO's own docs on
 * 2026-09-21 rather than remembered; a wrong path is a charged request that
 * returns nothing useful.
 */
/**
 * One operation per AI engine, built from the engine table.
 *
 * Built rather than written out four times, because the four differ in exactly
 * the ways the table records — queued or live, location or not — and a fifth
 * engine should be one row there, not a fifth hand-copied block here.
 *
 * `user_prompt` is what every engine's endpoint calls the question. The
 * prompt is `text`, not `keyword`: it is a sentence somebody would type, and
 * the keyword coercion would mangle it.
 */
const AI_CITATION_OPERATIONS: readonly SeoOperation[] = AI_ENGINES.map((engine) => {
  const call = AI_ENGINE_CALLS[engine];
  const base = `/v3/ai_optimization/${call.platform}/llm_responses`;
  return {
    id: aiCitationOperationId(engine),
    question: `What does ${engine} answer when asked this, and who does it name?`,
    family: "AI Optimization",
    mode: call.mode,
    path: call.mode === "QUEUED" ? `${base}/task_post` : `${base}/live`,
    ...(call.mode === "QUEUED" ? { resultPath: `${base}/task_get/$id` } : {}),
    costBand: "low" as const,
    aiEngine: engine,
    params: {
      user_prompt: {
        kind: "text",
        required: true,
        description: "The question, as a person would ask it.",
      },
    },
  };
});

export const SEO_OPERATIONS: readonly SeoOperation[] = [
  ...AI_CITATION_OPERATIONS,
  ...SITE_LINK_OPERATIONS,
  ...CRAWL_OPERATIONS,
  ...KEYWORD_LIST_OPERATIONS,
  {
    id: "serp_google_organic",
    question: "Where does a website rank on Google for a given search, and who else is on that page?",
    family: "SERP",
    mode: "QUEUED",
    path: "/v3/serp/google/organic/task_post",
    resultPath: "/v3/serp/google/organic/task_get/advanced/$id",
    costBand: "low",
    // The first hundred results, not the first ten (Anthony, 2026-09-24:
    // "store whatever we can"), so a site on page four has a position rather
    // than "not on page one". DataForSEO's default depth is ten, and each ten
    // results is charged as one page: $0.0006 a page in the standard queue,
    // so a check of a hundred is up to $0.006 — read from their docs and
    // pricing page on 2026-09-24, to be confirmed on the first charged check.
    fixed: { depth: 100 },
    params: {
      keyword: {
        kind: "keyword",
        required: true,
        description: "The search someone would type, in their own words — 'emergency plumber leeds'.",
      },
      location_code: {
        kind: "number",
        required: false,
        description: "Where to search from. Leave unset for the United Kingdom.",
        default: 2826,
      },
      language_code: {
        kind: "keyword",
        required: false,
        description: "The language to search in. Leave unset for English.",
        default: "en",
      },
    },
  },
  {
    id: "keyword_search_volume",
    question: "How many people search for these terms each month, and what do advertisers pay for them?",
    family: "Keywords Data",
    mode: "QUEUED",
    path: "/v3/keywords_data/google_ads/search_volume/task_post",
    resultPath: "/v3/keywords_data/google_ads/search_volume/task_get/$id",
    costBand: "low",
    params: {
      keywords: {
        kind: "keywords",
        required: true,
        description: "The searches to measure, separated by commas.",
      },
      location_code: {
        kind: "number",
        required: false,
        description: "Where the searches are made. Leave unset for the United Kingdom.",
        default: 2826,
      },
      language_code: {
        kind: "keyword",
        required: false,
        description: "The language of the searches. Leave unset for English.",
        default: "en",
      },
    },
  },
  {
    id: "domain_ranked_keywords",
    question: "What does this website already rank for, and how much traffic is that worth?",
    family: "DataForSEO Labs",
    // Labs publishes no task_post. Live is the only way to ask it.
    mode: "LIVE",
    path: "/v3/dataforseo_labs/google/ranked_keywords/live",
    costBand: "medium",
    params: {
      target: {
        kind: "host",
        required: true,
        description: "The website to look up, as a domain — 'example.com'.",
      },
      limit: {
        kind: "number",
        required: false,
        description: "How many keywords to return. Leave unset for 100.",
        default: 100,
      },
      location_code: {
        kind: "number",
        required: false,
        description: "Which country's results to read. Leave unset for the United Kingdom.",
        default: 2826,
      },
      language_code: {
        kind: "keyword",
        required: false,
        description: "Which language's results to read. Leave unset for English.",
        default: "en",
      },
    },
  },
  {
    id: "bulk_backlinks",
    question: "How many links point at each of these websites?",
    family: "Backlinks",
    mode: "LIVE",
    path: "/v3/backlinks/bulk_backlinks/live",
    costBand: "low",
    bulk: { targetsParam: "targets", maxTargets: 1000 },
    params: {
      targets: {
        kind: "hosts",
        required: true,
        description: "The websites to look up, as domains.",
      },
    },
  },
  {
    id: "bulk_referring_domains",
    question: "How many different sites link to each of these websites?",
    family: "Backlinks",
    mode: "LIVE",
    path: "/v3/backlinks/bulk_referring_domains/live",
    costBand: "low",
    bulk: { targetsParam: "targets", maxTargets: 1000 },
    params: {
      targets: {
        kind: "hosts",
        required: true,
        description: "The websites to look up, as domains.",
      },
    },
  },
  {
    id: "bulk_ranks",
    question: "How strong is each of these websites, as a single score?",
    family: "Backlinks",
    mode: "LIVE",
    path: "/v3/backlinks/bulk_ranks/live",
    costBand: "low",
    bulk: { targetsParam: "targets", maxTargets: 1000 },
    params: {
      targets: {
        kind: "hosts",
        required: true,
        description: "The websites to look up, as domains.",
      },
    },
  },
  {
    id: "domain_competitors",
    question: "Which websites compete with this one for the same searches?",
    family: "DataForSEO Labs",
    mode: "LIVE",
    path: "/v3/dataforseo_labs/google/competitors_domain/live",
    costBand: "medium",
    params: {
      target: {
        kind: "host",
        required: true,
        description: "The website to find competitors for, as a domain.",
      },
      limit: {
        kind: "number",
        required: false,
        description: "How many competitors to return. Leave unset for 50.",
        default: 50,
      },
      location_code: {
        kind: "number",
        required: false,
        description: "Which country's results to read. Leave unset for the United Kingdom.",
        default: 2826,
      },
      language_code: {
        kind: "keyword",
        required: false,
        description: "Which language's results to read. Leave unset for English.",
        default: "en",
      },
    },
  },
  {
    id: "backlinks_summary",
    question: "How many sites link to this one, and how strong are they?",
    family: "Backlinks",
    // Backlinks publishes no task_post either.
    mode: "LIVE",
    path: "/v3/backlinks/summary/live",
    costBand: "medium",
    params: {
      target: {
        kind: "host",
        required: true,
        description: "The website to look up, as a domain — 'example.com'.",
      },
    },
  },
];

/**
 * The operations that ask about many websites in one paid call.
 *
 * Derived the same way the per-site set is, and separated from it because the
 * pipeline has to do something different with them: a bulk operation is not one
 * pull per website but one pull per *batch* of websites, and every website's
 * cycle line points at that single pull.
 *
 * This is the cheapest thing in the registry by a wide margin. A thousand
 * tracked sites is four bulk calls a cycle instead of a thousand charges.
 */
export function seoBulkOperations(): readonly SeoOperation[] {
  return SEO_OPERATIONS.filter((operation) => operation.bulk !== undefined);
}

/**
 * The operations a collection cycle runs for every website, with no further
 * input than the host itself.
 *
 * Derived rather than listed, so registering a new whole-site operation puts
 * it into the cycle without a second edit somewhere else — a list kept by hand
 * is a list that goes stale the first time someone is in a hurry.
 *
 * The test is that the host is the only thing the operation requires. That is
 * what separates "ask about this site" from `serp_google_organic`, which needs
 * a keyword and so is one task *per keyword per site*: a site with ten
 * thousand tracked keywords is ten thousand paid tasks a cycle, which is a
 * plan decision and not something a cycle may start doing by itself.
 */
export function seoSiteOperations(): readonly SeoOperation[] {
  return SEO_OPERATIONS.filter((operation) => {
    if (operation.bulk || operation.aiEngine) return false;
    const required = Object.entries(operation.params).filter(([, param]) => param.required);
    return required.length === 1 && required[0][1].kind === "host";
  });
}

/**
 * What an AI citation pull is sent.
 *
 * The model name comes from the engine table, never from a caller — it is the
 * cheapest on DataForSEO's list that supports web search, and web search is
 * switched on wherever the switch exists, because an answer with no sources is
 * an answer with nothing to cite. Location is passed only to engines that take
 * one; an engine with no location parameters refuses the whole request
 * otherwise.
 */
export function seoAiCitationParams(
  engine: AiEngine,
  prompt: string,
  location: { countryIso: string; city?: string } | null,
): Record<string, unknown> {
  const call = AI_ENGINE_CALLS[engine];
  return {
    user_prompt: prompt,
    model_name: call.modelName,
    ...(call.hasWebSearchSwitch ? { web_search: true } : {}),
    ...(call.takesLocation && location
      ? {
        web_search_country_iso_code: location.countryIso,
        ...(location.city ? { web_search_city: location.city } : {}),
      }
      : {}),
  };
}

/** The operations that ask an AI engine a question. One per engine. */
export function seoAiCitationOperations(): readonly SeoOperation[] {
  return SEO_OPERATIONS.filter((operation) => operation.aiEngine !== undefined);
}

/**
 * What a bulk operation is sent: the hosts, plus the registry's own defaults.
 *
 * Refuses a batch over the endpoint's cap rather than truncating it, because a
 * request over the limit is rejected whole and a silent truncation would leave
 * the missing websites looking collected.
 */
export function seoBulkOperationParams(
  operation: SeoOperation,
  hosts: readonly string[],
): Record<string, unknown> {
  if (!operation.bulk) {
    throw appError("INVALID_INPUT", `${operation.id} is not a bulk operation.`);
  }
  if (hosts.length === 0) {
    throw appError("INVALID_INPUT", `${operation.id} was given no websites.`);
  }
  if (hosts.length > operation.bulk.maxTargets) {
    throw appError(
      "INVALID_INPUT",
      `${operation.id} takes at most ${operation.bulk.maxTargets} websites, not ${hosts.length}.`,
    );
  }

  const params: Record<string, unknown> = { [operation.bulk.targetsParam]: [...hosts] };
  for (const [name, param] of Object.entries(operation.params)) {
    if (param.kind === "hosts") continue;
    if (param.default !== undefined) params[name] = param.default;
  }
  return params;
}

/**
 * What a site-level operation is sent, with the registry's own defaults filled
 * in. Built here so the enqueue path and the send path cannot disagree about
 * what was asked — they hash this to decide whether it was already bought.
 */
export function seoSiteOperationParams(
  operation: SeoOperation,
  host: string,
  place: SeoPlace = {},
): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const [name, param] of Object.entries(operation.params)) {
    if (param.kind === "host") {
      params[name] = host;
      continue;
    }
    if (name === "location_code" && place.locationCode !== undefined) {
      params[name] = place.locationCode;
      continue;
    }
    if (param.default !== undefined) params[name] = param.default;
  }
  // Settings every call sends as written: filters, sort order, grouping.
  return { ...params, ...operation.fixed };
}

/**
 * Where a watcher asks from.
 *
 * Passed wherever an operation takes a `location_code`, which is every
 * ranking operation. It was stored on the company's hold and read by nothing
 * for ranking pulls — the questions asked the AI engines from Leeds while the
 * rankings for the same client came from the United Kingdom as a whole.
 * Absent keeps the registry default, so a site nobody placed is asked exactly
 * as it always was, and its old pulls are still the same question.
 */
export type SeoPlace = { locationCode?: number };

/** The operation that checks where every site ranks for one search. */
export const SEO_KEYWORD_CHECK_OPERATION = "serp_google_organic";

/**
 * What a keyword check is sent: the search, and the place it is made from.
 *
 * Built here with the other param builders so the defaults cannot drift: two
 * cycles asking the same search from the same place must send byte-identical
 * arguments, because that is what makes them one purchase.
 */
export function seoKeywordCheckParams(
  keyword: string,
  place: SeoPlace = {},
): Record<string, string | number> {
  const operation = findSeoOperation(SEO_KEYWORD_CHECK_OPERATION);
  if (!operation) {
    throw appError("NOT_CONFIGURED", `${SEO_KEYWORD_CHECK_OPERATION} is missing from the registry.`);
  }
  const params: Record<string, string | number> = {};
  for (const [name, param] of Object.entries(operation.params)) {
    if (param.kind === "keyword" && name === "keyword") {
      params[name] = keyword;
      continue;
    }
    if (name === "location_code" && place.locationCode !== undefined) {
      params[name] = place.locationCode;
      continue;
    }
    if (param.default !== undefined) params[name] = param.default;
  }
  // How far down the page to read, sent as written like every operation's settings.
  return { ...params, ...(operation.fixed as Record<string, string | number> | undefined) };
}

/** Where to collect a finished queued task from, or null if it is not queued. */
export function seoResultPath(operation: SeoOperation, taskId: string): string | null {
  if (operation.mode !== "QUEUED" || !operation.resultPath) return null;
  return operation.resultPath.replace("$id", encodeURIComponent(taskId));
}

export function findSeoOperation(id: string): SeoOperation | null {
  return SEO_OPERATIONS.find((operation) => operation.id === id) ?? null;
}

/**
 * Search the registry in plain words.
 *
 * Matches the question, the family and the id, because an agent may arrive
 * with any of the three — "backlinks", "how strong is this site", or an id it
 * saw in an earlier step. A blank search returns everything: the list is short
 * enough to read, and an agent that does not know what to ask for should see
 * the menu rather than nothing.
 */
export function searchSeoOperations(term?: string): SeoOperation[] {
  const needle = term?.trim().toLowerCase();
  if (!needle) return [...SEO_OPERATIONS];

  const words = needle.split(/\s+/).filter(Boolean);
  return SEO_OPERATIONS.filter((operation) => {
    const haystack = `${operation.id} ${operation.question} ${operation.family}`.toLowerCase();
    return words.some((word) => haystack.includes(word));
  });
}

/** What the model is shown for one operation. Never the path — it cannot use it. */
export function describeSeoOperation(operation: SeoOperation) {
  return {
    operation: operation.id,
    answers: operation.question,
    family: operation.family,
    cost: operation.costBand,
    // "Queued" is the honest word for a result that arrives later. An agent
    // told this will not sit waiting for numbers that cannot come yet.
    resultArrives: operation.mode === "QUEUED" ? "later, separately" : "in this reply",
    parameters: Object.entries(operation.params).map(([name, param]) => ({
      name,
      required: param.required,
      description: param.description,
      ...(param.default === undefined ? {} : { default: param.default }),
    })),
  };
}

export type SeoTaskProblem =
  | { field: "operation"; message: string }
  | { field: string; message: string };

export type SeoTaskBuildResult =
  | { ok: true; operation: SeoOperation; task: Record<string, unknown> }
  | { ok: false; problem: SeoTaskProblem };

/**
 * Turn an operation id and the agent's arguments into a DataForSEO task body.
 *
 * Every refusal here is a request that never leaves the building, and so a
 * charge that never happens. That is the whole reason the agent names an
 * operation instead of composing a request: an unknown id, a missing
 * parameter, a domain that is not a domain — all of them stop here.
 */
export function buildSeoTask(
  operationId: string,
  args: Record<string, unknown>,
): SeoTaskBuildResult {
  const operation = findSeoOperation(operationId);
  if (!operation) {
    return {
      ok: false,
      problem: {
        field: "operation",
        message:
          `There is no operation called "${operationId}". `
          + `Use describe_seo_operations to see what can be asked for.`,
      },
    };
  }

  const task: Record<string, unknown> = {};

  for (const [name, param] of Object.entries(operation.params)) {
    const raw = args[name];
    const missing = raw === undefined || raw === null || raw === "";

    if (missing) {
      if (param.required) {
        return {
          ok: false,
          problem: { field: name, message: `${operationId} needs "${name}": ${param.description}` },
        };
      }
      if (param.default !== undefined) task[name] = param.default;
      continue;
    }

    const coerced = coerceParam(param, raw);
    if (!coerced.ok) {
      return { ok: false, problem: { field: name, message: coerced.message } };
    }
    task[name] = coerced.value;
  }

  return { ok: true, operation, task: { ...task, ...operation.fixed } };
}

type Coerced = { ok: true; value: unknown } | { ok: false; message: string };

function coerceParam(param: SeoOperationParam, raw: unknown): Coerced {
  switch (param.kind) {
    case "host": {
      // The same normaliser the Websites screens use, so a target here and a
      // website record there are the same string — otherwise a pull could not
      // be matched to the site it was for.
      const parsed = readWebsiteHost(String(raw));
      if (!parsed.ok) {
        return { ok: false, message: `"${String(raw)}" is not a website address.` };
      }
      return { ok: true, value: parsed.host };
    }
    case "text": {
      // A sentence, kept as typed. Trimmed and bounded because it is sent
      // verbatim to an engine that charges by the token.
      const text = String(raw).trim().replace(/\s+/g, " ");
      if (text.length === 0) return { ok: false, message: "Write the question out." };
      if (text.length > 500) return { ok: false, message: "A question can be at most 500 characters." };
      return { ok: true, value: text };
    }
    case "hosts": {
      // A list of websites for one bulk call. Each is normalised the same way a
      // single host is, so a bulk result can be matched back to the records it
      // was about — and one bad entry refuses the batch rather than quietly
      // dropping a website that would then look collected.
      const list = Array.isArray(raw) ? raw : String(raw).split(",");
      if (list.length === 0) return { ok: false, message: "Give at least one website." };

      const hosts: string[] = [];
      for (const entry of list) {
        const parsed = readWebsiteHost(String(entry));
        if (!parsed.ok) {
          return { ok: false, message: `"${String(entry)}" is not a website address.` };
        }
        hosts.push(parsed.host);
      }
      return { ok: true, value: hosts };
    }
    case "keyword": {
      const text = String(raw).trim();
      if (!text) return { ok: false, message: "This cannot be empty." };
      if (text.length > 700) return { ok: false, message: "This is too long for DataForSEO (700 characters)." };
      return { ok: true, value: text };
    }
    case "keywords": {
      const list = (Array.isArray(raw) ? raw : String(raw).split(","))
        .map((entry) => String(entry).trim())
        .filter(Boolean);
      if (list.length === 0) return { ok: false, message: "Give at least one search term." };
      // DataForSEO refuses more than 1,000 keywords in one task, and a task
      // that is refused is still a task somebody waited for.
      if (list.length > 1000) return { ok: false, message: "That is more than 1,000 search terms." };
      return { ok: true, value: list };
    }
    case "number": {
      const value = Number(raw);
      if (!Number.isFinite(value)) return { ok: false, message: `"${String(raw)}" is not a number.` };
      return { ok: true, value: Math.trunc(value) };
    }
  }
}

/** Every family in the registry, for a screen or a summary that lists them. */
export function seoOperationFamilies(): string[] {
  return [...new Set(SEO_OPERATIONS.map((operation) => operation.family))].sort();
}
