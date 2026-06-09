import {
  ProviderRuntimeError,
  parseRetryAfterMs,
  withProviderRetry,
  type ProviderRetryPolicy,
} from "./aiProviderRetryService";

export type ProviderFetch = typeof fetch;

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
