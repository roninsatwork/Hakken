/**
 * Apify over plain HTTP.
 *
 * The official `apify-client` SDK does not work inside Convex. Before its first
 * request it runs a Node-only setup step that dynamically imports
 * `proxy-agent`, and in this runtime that import does not yield a constructor —
 * every call fails with `e is not a constructor` from deep inside the client,
 * whatever it was asked to do.
 *
 * That fault is not new and it is not limited to any one feature: it broke
 * starting a scrape, reading a run's status and fetching its results alike, so
 * the Properties screen and the agent tool were both affected.
 *
 * Apify's REST API needs none of that machinery. These are thin wrappers over
 * `fetch`, which Convex supports directly, and they replace the SDK rather than
 * sitting alongside it — two ways of calling the same service is how one of
 * them silently rots.
 */

const API_ROOT = "https://api.apify.com/v2";

/** Long enough for a slow catalogue read, short enough not to hold an action open. */
const REQUEST_TIMEOUT_MS = 20_000;

async function apifyFetch(
  path: string,
  token: string,
  init?: { method?: string; body?: unknown; query?: Record<string, string | number | undefined> },
): Promise<unknown> {
  const url = new URL(`${API_ROOT}${path}`);
  for (const [key, value] of Object.entries(init?.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method: init?.method ?? "GET",
    headers: {
      // The token travels as a header, never in the query string: Apify logs
      // request URLs, and so does anything between here and them.
      Authorization: `Bearer ${token}`,
      ...(init?.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Apify replied ${response.status} to ${init?.method ?? "GET"} ${path}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
    );
  }

  // Apify wraps every successful payload in `data`.
  const parsed = await response.json() as { data?: unknown };
  return parsed?.data ?? parsed;
}

export type ApifyRunSummary = {
  id: string;
  actId: string;
  status: string;
  defaultDatasetId?: string;
};

/** Start a job. Returns as soon as Apify accepts it, not when it finishes. */
export async function startActorRun(args: {
  token: string;
  actorId: string;
  input: Record<string, unknown>;
  webhooks?: unknown[];
}): Promise<ApifyRunSummary> {
  // Apify takes the run's own options as query parameters and the actor's input
  // as the body, which is why the webhooks are encoded rather than passed
  // alongside the input.
  const query: Record<string, string> = {};
  if (args.webhooks && args.webhooks.length > 0) {
    query.webhooks = btoa(JSON.stringify(args.webhooks));
  }

  return await apifyFetch(`/acts/${encodeActorId(args.actorId)}/runs`, args.token, {
    method: "POST",
    body: args.input,
    query,
  }) as ApifyRunSummary;
}

export async function getRun(token: string, runId: string): Promise<ApifyRunSummary | null> {
  try {
    return await apifyFetch(`/actor-runs/${encodeURIComponent(runId)}`, token) as ApifyRunSummary;
  } catch {
    return null;
  }
}

export async function listDatasetItems(
  token: string,
  datasetId: string,
  limit?: number,
): Promise<unknown[]> {
  const url = new URL(`${API_ROOT}/datasets/${encodeURIComponent(datasetId)}/items`);
  if (limit !== undefined) url.searchParams.set("limit", String(limit));

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Apify replied ${response.status} when reading dataset ${datasetId}.`);
  }

  // Dataset items come back as a bare array rather than wrapped in `data`.
  const items = await response.json() as unknown;
  return Array.isArray(items) ? items : [];
}

export type ApifyActorSummary = {
  id: string;
  name?: string;
  username?: string;
  title?: string;
  description?: string;
  taggedBuilds?: Record<string, { buildId?: string } | undefined>;
};

export async function getActor(token: string, actorId: string): Promise<ApifyActorSummary | null> {
  try {
    return await apifyFetch(`/acts/${encodeActorId(actorId)}`, token) as ApifyActorSummary;
  } catch {
    return null;
  }
}

export async function getBuildInputSchema(token: string, buildId: string): Promise<unknown> {
  const build = await apifyFetch(`/actor-builds/${encodeURIComponent(buildId)}`, token) as {
    actorDefinition?: { input?: unknown };
    inputSchema?: string;
  };
  return build?.actorDefinition?.input ?? build?.inputSchema;
}

export async function searchStore(token: string, search: string, limit: number): Promise<ApifyActorSummary[]> {
  const data = await apifyFetch("/store", token, { query: { search, limit } }) as {
    items?: ApifyActorSummary[];
  };
  return data?.items ?? [];
}

/**
 * `username/name` is the readable way to name a job, and the slash has to
 * survive as a tilde rather than being read as another path segment.
 */
function encodeActorId(actorId: string) {
  return encodeURIComponent(actorId.replace("/", "~"));
}
