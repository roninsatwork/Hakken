import { appError } from "./utils/appError";

/**
 * DataForSEO over plain HTTP.
 *
 * Thin wrappers over `fetch`, for the same reason `apifyRest.ts` is: vendor
 * SDKs assume Node and do not survive the Convex runtime. DataForSEO's REST
 * surface needs none of that — every endpoint is a POST with the same envelope.
 *
 * **Credentials never enter the database.** They are read from the environment
 * here and nowhere else; `connectorSecretPolicy.ts` actively rejects anything
 * that looks like a raw secret being stored, and this respects that rather than
 * working around it.
 */

const LIVE_ROOT = "https://api.dataforseo.com";
const SANDBOX_ROOT = "https://sandbox.dataforseo.com";

/**
 * Long enough for a live Labs or Backlinks call, which really can take this
 * long, and short enough not to hold a Convex action open indefinitely.
 */
const REQUEST_TIMEOUT_MS = 45_000;

export type DataForSeoCredentials = {
  login: string;
  password: string;
  /** True when pointed at the free sandbox, so the ledger can say it cost nothing. */
  sandbox: boolean;
};

/**
 * The account to call as, from the environment.
 *
 * `DATAFORSEO_SANDBOX=1` points everything at DataForSEO's free sandbox, which
 * takes the same credentials and returns the same shapes for no money. That is
 * the switch to use before anyone has seen a bill.
 */
export function readDataForSeoCredentials(): DataForSeoCredentials {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;

  if (!login || !password) {
    throw appError(
      "NOT_CONFIGURED",
      "DataForSEO is not connected. Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD in the backend environment.",
    );
  }

  return {
    login,
    password,
    sandbox: process.env.DATAFORSEO_SANDBOX === "1",
  };
}

/**
 * The response envelope every DataForSEO endpoint returns.
 *
 * `cost` is the figure the ledger records — DataForSEO's own number for what
 * the call cost, in USD. Reading it rather than estimating from a price list is
 * the difference between a spend report and a guess.
 */
export type DataForSeoEnvelope = {
  version?: string;
  status_code?: number;
  status_message?: string;
  cost?: number;
  tasks?: Array<{
    id?: string;
    status_code?: number;
    status_message?: string;
    cost?: number;
    data?: Record<string, unknown>;
    result?: unknown;
  }>;
};

/** DataForSEO's own "everything went fine" code. Anything else is a refusal. */
const OK_STATUS = 20000;
/** Task accepted into the queue; the result follows on the webhook. */
const TASK_CREATED_STATUS = 20100;

function authHeader(credentials: DataForSeoCredentials): string {
  // Basic auth, not a bearer token — DataForSEO's own scheme.
  const encoded = btoa(`${credentials.login}:${credentials.password}`);
  return `Basic ${encoded}`;
}

/**
 * Thrown when DataForSEO says "not now" rather than "no".
 *
 * A 429, or one of their 5xx replies, is a scheduling fact and not a failure of
 * the request: the tasks were never accepted, so nothing was charged and the
 * right answer is to put them back in the queue with a later due time. Telling
 * this apart from a refusal is what stops a rate limit burning a row's three
 * attempts and marking real work failed.
 */
export class DataForSeoBackoff extends Error {
  constructor(readonly status: number) {
    super(`DataForSEO replied ${status}; the batch was not accepted.`);
    this.name = "DataForSeoBackoff";
  }
}

/**
 * Post a batch of tasks to one endpoint.
 *
 * Every DataForSEO endpoint takes an array of task objects and answers with one
 * envelope holding a task entry per item, so one function serves the whole
 * registry. Batching is what keeps a hundred-thousand-task cycle down to a
 * thousand requests; the ledger still holds one row per pull, matched back by
 * the `tag` each task carries.
 *
 * All tasks in one call must be for the same endpoint, which is why the queue
 * claims a batch of one operation at a time.
 */
export async function postDataForSeoTasks(
  path: string,
  tasks: ReadonlyArray<Record<string, unknown>>,
  credentials: DataForSeoCredentials,
): Promise<DataForSeoEnvelope> {
  return await callDataForSeo(path, credentials, {
    method: "POST",
    body: JSON.stringify(tasks),
  });
}

/**
 * Post one task to one endpoint. The ad hoc path, and a thin wrapper over the
 * batch one so both cannot drift apart.
 */
export async function postDataForSeoTask(
  path: string,
  task: Record<string, unknown>,
  credentials: DataForSeoCredentials,
): Promise<DataForSeoEnvelope> {
  return await postDataForSeoTasks(path, [task], credentials);
}

/**
 * Collect a finished task, or ask which tasks are finished.
 *
 * Both are GETs and both are free — DataForSEO charged when the task was set.
 * That is why a pingback is never trusted with a result: fetching it ourselves
 * over authenticated HTTPS costs nothing and cannot be forged.
 */
export async function getDataForSeo(
  path: string,
  credentials: DataForSeoCredentials,
): Promise<DataForSeoEnvelope> {
  return await callDataForSeo(path, credentials, { method: "GET" });
}

async function callDataForSeo(
  path: string,
  credentials: DataForSeoCredentials,
  init: { method: string; body?: string },
): Promise<DataForSeoEnvelope> {
  const root = credentials.sandbox ? SANDBOX_ROOT : LIVE_ROOT;

  let response: Response;
  try {
    response = await fetch(`${root}${path}`, {
      method: init.method,
      headers: {
        Authorization: authHeader(credentials),
        "Content-Type": "application/json",
      },
      ...(init.body ? { body: init.body } : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : "the request did not complete";
    throw appError("UPSTREAM_FAILURE", `DataForSEO could not be reached: ${reason}`);
  }

  if (response.status === 429 || response.status >= 500) {
    await response.body?.cancel();
    throw new DataForSeoBackoff(response.status);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw appError(
      "UPSTREAM_FAILURE",
      `DataForSEO replied ${response.status} to ${path}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
    );
  }

  return await response.json() as DataForSeoEnvelope;
}

/**
 * One outcome per task in a batch, keyed by the `tag` we set.
 *
 * DataForSEO returns the tasks in an envelope with no promise about order, and
 * a batch of a hundred cannot be matched positionally without betting money on
 * that. The tag is our own pull id, so this is exact.
 *
 * **Cost is read per task, and taken even when that task was refused.**
 * DataForSEO charges for setting a task, not for liking the answer.
 */
export function readDataForSeoBatch(envelope: DataForSeoEnvelope): Map<string, DataForSeoOutcome> {
  const outcomes = new Map<string, DataForSeoOutcome>();

  for (const task of envelope.tasks ?? []) {
    const data = task.data && typeof task.data === "object"
      ? (task.data as { tag?: unknown })
      : undefined;
    const tag = typeof data?.tag === "string" ? data.tag : null;
    if (!tag) continue;

    const statusCode = task.status_code;
    const accepted = statusCode === OK_STATUS || statusCode === TASK_CREATED_STATUS;

    outcomes.set(tag, {
      costUsd: task.cost ?? 0,
      ...(task.id ? { taskId: task.id } : {}),
      ...(task.result === undefined || task.result === null ? {} : { result: task.result }),
      ...(accepted
        ? {}
        : { error: task.status_message ?? `DataForSEO returned status ${statusCode ?? "unknown"}` }),
    });
  }

  return outcomes;
}

export type DataForSeoOutcome = {
  /** What this cost, in USD, as DataForSEO reported it. */
  costUsd: number;
  /** Their task id, when they issued one. */
  taskId?: string;
  /** The result, for a live call. Absent for a queued one — it arrives later. */
  result?: unknown;
  /** Set when DataForSEO refused, in their own words. */
  error?: string;
};

/**
 * Read the envelope into something the ledger can store.
 *
 * **The cost is taken even when the call failed**, which is deliberate and is
 * the whole reason this is careful: DataForSEO charges for setting a task, not
 * for liking the answer, so a refused request can still cost money. A reader
 * who only recorded successful spend would under-report the bill.
 */
export function readDataForSeoOutcome(envelope: DataForSeoEnvelope): DataForSeoOutcome {
  const task = envelope.tasks?.[0];
  const costUsd = task?.cost ?? envelope.cost ?? 0;
  const statusCode = task?.status_code ?? envelope.status_code;

  const accepted = statusCode === OK_STATUS || statusCode === TASK_CREATED_STATUS;
  const error = accepted
    ? undefined
    : task?.status_message ?? envelope.status_message ?? `DataForSEO returned status ${statusCode ?? "unknown"}`;

  return {
    costUsd,
    ...(task?.id ? { taskId: task.id } : {}),
    ...(task?.result === undefined || task.result === null ? {} : { result: task.result }),
    ...(error ? { error } : {}),
  };
}

/**
 * The `tag` DataForSEO echoed back, from whichever shape it arrived in.
 *
 * A postback carries the whole envelope, and the tag we set lives on the task's
 * `data` object. Without it the result cannot be matched to the pull that asked
 * for it, so this is the one field the webhook genuinely cannot do without.
 */
export function readDataForSeoTag(envelope: DataForSeoEnvelope): string | null {
  const data = envelope.tasks?.[0]?.data;
  const tag = data && typeof data === "object" ? (data as { tag?: unknown }).tag : undefined;
  return typeof tag === "string" && tag.length > 0 ? tag : null;
}
