import {
  ProviderRuntimeError,
  parseRetryAfterMs,
  withProviderRetry,
  type ProviderRetryPolicy,
} from "./aiProviderRetryService";

export type ProviderFetch = typeof fetch;

/**
 * Split an SSE chunk into the JSON payloads it carries.
 *
 * Every streaming provider frames its stream the same way — `data:` lines,
 * blank-line separators, and a terminating `[DONE]` sentinel — so the framing
 * belongs here rather than in each adapter. `anthropicStreamService` predates
 * this helper and carries its own copy; it can adopt this one whenever that path
 * is next touched.
 *
 * The trailing partial line is handed back rather than parsed, because a chunk
 * boundary lands mid-line often enough that parsing it would drop frames.
 */
export function parseProviderSseChunk(chunk: string, buffer: string) {
  const combined = buffer + chunk;
  const lines = combined.split("\n");
  const remainder = lines.pop() ?? "";

  const payloads: unknown[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;

    const payload = trimmed.slice("data:".length).trim();
    if (payload.length === 0 || payload === "[DONE]") continue;

    try {
      payloads.push(JSON.parse(payload));
    } catch {
      // A frame that will not parse is skipped rather than failing the run.
      // Aborting a half-delivered answer over one malformed frame is worse for
      // the reader than a missing fragment.
      continue;
    }
  }

  return { payloads, remainder };
}

export function assertTextOnlyContents(contents: Array<{ type: string }>, providerName: string) {
  const unsupported = contents.find((part) => part.type !== "text");
  if (unsupported) {
    throw new Error(`${providerName} adapter currently supports text-only generation for this runtime path.`);
  }
}

function safeParseJson(text: string) {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function truncateProviderMessage(value: string) {
  return value.length > 1000 ? `${value.slice(0, 1000)}...` : value;
}

function getProviderErrorMessage(payload: unknown, text: string, providerName: string) {
  if (payload && typeof payload === "object" && "error" in payload) {
    return truncateProviderMessage(JSON.stringify((payload as { error: unknown }).error));
  }

  return truncateProviderMessage(text || `${providerName} request failed.`);
}

export async function parseProviderJsonResponse(response: Response, providerName: string) {
  const text = await response.text();
  const payload = safeParseJson(text);

  if (!response.ok) {
    const errorMessage = getProviderErrorMessage(payload, text, providerName);
    throw new ProviderRuntimeError(`${providerName} request failed: ${errorMessage}`, {
      providerName,
      status: response.status,
      retryable: response.status === 408 ||
        response.status === 409 ||
        response.status === 425 ||
        response.status === 429 ||
        response.status >= 500,
      retryAfterMs: parseRetryAfterMs(response.headers),
      safeProviderMessage: errorMessage,
    });
  }

  if (text && payload === null) {
    throw new ProviderRuntimeError(`${providerName} returned invalid JSON.`, {
      providerName,
      retryable: false,
      safeProviderMessage: `${providerName} returned invalid JSON.`,
    });
  }

  return payload;
}

export async function requestProviderJson(args: {
  providerKey: string;
  providerName: string;
  operation: string;
  fetchImpl: ProviderFetch;
  url: string;
  init: RequestInit;
  retryPolicy?: Partial<ProviderRetryPolicy>;
}) {
  return await withProviderRetry({
    providerKey: args.providerKey,
    providerName: args.providerName,
    operation: args.operation,
    policy: args.retryPolicy,
    onRetry: (event) => {
      console.warn("Provider retry", {
        providerKey: event.providerKey,
        providerName: event.providerName,
        operation: event.operation,
        attempt: event.attempt,
        maxAttempts: event.maxAttempts,
        delayMs: event.delayMs,
        status: event.status,
        code: event.code,
      });
    },
  }, async () => {
    const response = await args.fetchImpl(args.url, args.init);
    return await parseProviderJsonResponse(response, args.providerName);
  });
}
