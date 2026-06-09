export type RetryHeaders = Pick<Headers, "get">;

export type ProviderRetryPolicy = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;
  maxElapsedMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
  random?: () => number;
};

export type ProviderRetryContext = {
  providerKey?: string;
  providerName: string;
  operation: string;
  policy?: Partial<ProviderRetryPolicy>;
  onRetry?: (event: ProviderRetryEvent) => void;
};

export type ProviderRetryEvent = {
  providerKey?: string;
  providerName: string;
  operation: string;
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  status?: number;
  code?: string;
  message: string;
};

export type ProviderErrorMetadata = {
  providerKey?: string;
  providerName?: string;
  operation?: string;
  status?: number;
  code?: string;
  retryable?: boolean;
  retryAfterMs?: number;
  safeProviderMessage?: string;
};

const DEFAULT_RETRY_POLICY: ProviderRetryPolicy = {
  maxAttempts: 4,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterRatio: 0.2,
};

const RETRYABLE_HTTP_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const NON_RETRYABLE_HTTP_STATUSES = new Set([400, 401, 403, 404, 422]);
const RETRYABLE_ERROR_CODES = new Set([
  "RESOURCE_EXHAUSTED",
  "UNAVAILABLE",
  "DEADLINE_EXCEEDED",
  "INTERNAL",
  "ABORTED",
]);

function sleep(delayMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function coercePositiveInteger(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : undefined;
}

function getRecordValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : null;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Provider request failed.";
}

function getNestedErrorRecord(error: unknown) {
  const record = asRecord(error);
  const nested = record ? getRecordValue(record, ["error", "cause", "response"]) : undefined;
  return asRecord(nested);
}

function extractStatus(error: unknown) {
  if (error instanceof ProviderRuntimeError && typeof error.status === "number") return error.status;

  const record = asRecord(error);
  const nested = getNestedErrorRecord(error);
  const rawStatus = record
    ? getRecordValue(record, ["status", "statusCode", "code"])
    : undefined;
  const nestedStatus = nested
    ? getRecordValue(nested, ["status", "statusCode", "code"])
    : undefined;

  for (const value of [rawStatus, nestedStatus]) {
    if (typeof value === "number") return value;
    if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  }

  return undefined;
}

function extractCode(error: unknown) {
  if (error instanceof ProviderRuntimeError && error.code) return error.code;

  const record = asRecord(error);
  const nested = getNestedErrorRecord(error);
  const rawCode = record ? getRecordValue(record, ["code", "statusText", "reason"]) : undefined;
  const nestedCode = nested ? getRecordValue(nested, ["code", "statusText", "reason"]) : undefined;

  for (const value of [rawCode, nestedCode]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return undefined;
}

function hasTransientMessage(message: string) {
  return /\b(rate limit|rate-limit|throttl|quota|temporar|timeout|timed out|overload|unavailable|try again|resource exhausted|deadline exceeded)\b/i.test(message);
}

export class ProviderRuntimeError extends Error {
  providerKey?: string;
  providerName?: string;
  operation?: string;
  status?: number;
  code?: string;
  retryable: boolean;
  retryAfterMs?: number;
  safeProviderMessage?: string;

  constructor(message: string, metadata: ProviderErrorMetadata = {}) {
    super(message);
    this.name = "ProviderRuntimeError";
    this.providerKey = metadata.providerKey;
    this.providerName = metadata.providerName;
    this.operation = metadata.operation;
    this.status = metadata.status;
    this.code = metadata.code;
    this.retryable = metadata.retryable ?? false;
    this.retryAfterMs = metadata.retryAfterMs;
    this.safeProviderMessage = metadata.safeProviderMessage;
  }
}

export function isRetryableHttpStatus(status: number) {
  return RETRYABLE_HTTP_STATUSES.has(status);
}

export function parseRetryAfterMs(headers?: RetryHeaders | null, nowMs = Date.now()) {
  const rawValue = headers?.get("retry-after") ?? headers?.get("Retry-After");
  if (!rawValue) return undefined;

  const trimmed = rawValue.trim();
  if (!trimmed) return undefined;

  const seconds = Number(trimmed);
  if (Number.isFinite(seconds)) {
    return coercePositiveInteger(seconds * 1000);
  }

  const dateMs = Date.parse(trimmed);
  if (Number.isNaN(dateMs)) return undefined;
  return coercePositiveInteger(dateMs - nowMs);
}

export function classifyProviderError(error: unknown): ProviderErrorMetadata {
  if (error instanceof ProviderRuntimeError) {
    return {
      providerKey: error.providerKey,
      providerName: error.providerName,
      operation: error.operation,
      status: error.status,
      code: error.code,
      retryable: error.retryable,
      retryAfterMs: error.retryAfterMs,
      safeProviderMessage: error.safeProviderMessage ?? error.message,
    };
  }

  const status = extractStatus(error);
  const code = extractCode(error);
  const message = getErrorMessage(error);
  const normalizedCode = code?.toUpperCase();

  let retryable = false;
  if (typeof status === "number") {
    retryable = isRetryableHttpStatus(status);
    if (NON_RETRYABLE_HTTP_STATUSES.has(status)) retryable = false;
  } else if (normalizedCode && RETRYABLE_ERROR_CODES.has(normalizedCode)) {
    retryable = true;
  } else if (error instanceof TypeError) {
    retryable = true;
  } else if (hasTransientMessage(message)) {
    retryable = true;
  }

  return {
    status,
    code,
    retryable,
    safeProviderMessage: message,
  };
}

export function resolveRetryPolicy(policy?: Partial<ProviderRetryPolicy>): ProviderRetryPolicy {
  const maxAttempts = Math.max(1, Math.floor(policy?.maxAttempts ?? DEFAULT_RETRY_POLICY.maxAttempts));
  const baseDelayMs = Math.max(0, Math.floor(policy?.baseDelayMs ?? DEFAULT_RETRY_POLICY.baseDelayMs));
  const maxDelayMs = Math.max(baseDelayMs, Math.floor(policy?.maxDelayMs ?? DEFAULT_RETRY_POLICY.maxDelayMs));
  const jitterRatio = clamp(policy?.jitterRatio ?? DEFAULT_RETRY_POLICY.jitterRatio, 0, 1);

  return {
    ...DEFAULT_RETRY_POLICY,
    ...policy,
    maxAttempts,
    baseDelayMs,
    maxDelayMs,
    jitterRatio,
  };
}

export function calculateRetryDelayMs(args: {
  attempt: number;
  retryAfterMs?: number;
  policy: ProviderRetryPolicy;
}) {
  const exponentialDelayMs = args.policy.baseDelayMs * (2 ** Math.max(0, args.attempt - 1));
  const delayBeforeJitter = args.retryAfterMs ?? exponentialDelayMs;
  const boundedDelay = clamp(delayBeforeJitter, 0, args.policy.maxDelayMs);

  if (boundedDelay === 0 || args.policy.jitterRatio === 0) return Math.round(boundedDelay);

  const random = args.policy.random ?? Math.random;
  const jitterMultiplier = 1 + ((random() * 2 - 1) * args.policy.jitterRatio);
  return Math.round(clamp(boundedDelay * jitterMultiplier, 0, args.policy.maxDelayMs));
}

export async function withProviderRetry<T>(
  context: ProviderRetryContext,
  operation: (attempt: number) => Promise<T>
) {
  const policy = resolveRetryPolicy(context.policy);
  const sleepImpl = policy.sleep ?? sleep;
  const startedAt = Date.now();
  let lastError: unknown;

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      const classification = classifyProviderError(error);
      const canRetry = classification.retryable === true && attempt < policy.maxAttempts;
      const delayMs = calculateRetryDelayMs({
        attempt,
        retryAfterMs: classification.retryAfterMs,
        policy,
      });
      const wouldExceedElapsed = typeof policy.maxElapsedMs === "number"
        && Date.now() - startedAt + delayMs > policy.maxElapsedMs;

      if (!canRetry || wouldExceedElapsed) {
        const message = classification.safeProviderMessage ?? getErrorMessage(error);
        throw error instanceof ProviderRuntimeError
          ? error
          : new ProviderRuntimeError(message, {
              providerKey: context.providerKey,
              providerName: context.providerName,
              operation: context.operation,
              status: classification.status,
              code: classification.code,
              retryable: classification.retryable,
              safeProviderMessage: message,
            });
      }

      context.onRetry?.({
        providerKey: context.providerKey,
        providerName: context.providerName,
        operation: context.operation,
        attempt,
        maxAttempts: policy.maxAttempts,
        delayMs,
        status: classification.status,
        code: classification.code,
        message: classification.safeProviderMessage ?? getErrorMessage(error),
      });
      await sleepImpl(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Provider request failed after retry attempts.");
}
