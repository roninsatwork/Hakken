import { readWebsiteHost } from "./websiteIdentity";

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

export type SeoParamKind = "host" | "keyword" | "keywords" | "number";

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
};

/**
 * The starting set. Every path here was read from DataForSEO's own docs on
 * 2026-09-21 rather than remembered; a wrong path is a charged request that
 * returns nothing useful.
 */
export const SEO_OPERATIONS: readonly SeoOperation[] = [
  {
    id: "serp_google_organic",
    question: "Where does a website rank on Google for a given search, and who else is on that page?",
    family: "SERP",
    mode: "QUEUED",
    path: "/v3/serp/google/organic/task_post",
    resultPath: "/v3/serp/google/organic/task_get/advanced/$id",
    costBand: "low",
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
    const required = Object.entries(operation.params).filter(([, param]) => param.required);
    return required.length === 1 && required[0][1].kind === "host";
  });
}

/**
 * What a site-level operation is sent, with the registry's own defaults filled
 * in. Built here so the enqueue path and the send path cannot disagree about
 * what was asked — they hash this to decide whether it was already bought.
 */
export function seoSiteOperationParams(
  operation: SeoOperation,
  host: string,
): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  for (const [name, param] of Object.entries(operation.params)) {
    if (param.kind === "host") {
      params[name] = host;
      continue;
    }
    if (param.default !== undefined) params[name] = param.default;
  }
  return params;
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

  return { ok: true, operation, task };
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
