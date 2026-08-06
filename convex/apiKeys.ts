import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { adminMutation, adminQuery } from "./tenantFunctions";
import { assertAdminCanAccessCompany, getActiveCompanyId } from "./authz";

const API_KEY_NAME_MAX_LENGTH = 80;
const API_KEY_REASON_MAX_LENGTH = 240;
const API_KEY_DEFAULT_RATE_LIMIT_PER_MINUTE = 60;
const API_KEY_MAX_RATE_LIMIT_PER_MINUTE = 600;
const API_KEY_RATE_WINDOW_MS = 60 * 1000;

const apiKeyScopeValidator = v.union(
  v.literal("agent:run"),
  v.literal("workflow:run"),
  v.literal("run:read"),
  v.literal("webhook:deliver")
);

type ApiKeyScope = Doc<"apiKeys">["scopes"][number];
type PublicApiRequestStatus = Doc<"publicApiRequests">["status"];

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function normalizeName(name: string) {
  const normalized = name.trim().replace(/\s+/g, " ");
  if (!normalized) throw new Error("API key name is required.");
  if (normalized.length > API_KEY_NAME_MAX_LENGTH) {
    throw new Error(`API key name cannot exceed ${API_KEY_NAME_MAX_LENGTH} characters.`);
  }
  return normalized;
}

function normalizeReason(reason: string | undefined) {
  const normalized = reason?.trim().replace(/\s+/g, " ");
  if (!normalized) return undefined;
  return normalized.length > API_KEY_REASON_MAX_LENGTH
    ? `${normalized.slice(0, API_KEY_REASON_MAX_LENGTH)}...`
    : normalized;
}

function normalizeScopes(scopes: ApiKeyScope[]) {
  const uniqueScopes = Array.from(new Set(scopes));
  if (uniqueScopes.length === 0) throw new Error("At least one API key scope is required.");
  return uniqueScopes;
}

function normalizeRateLimit(value: number | undefined) {
  if (value === undefined) return API_KEY_DEFAULT_RATE_LIMIT_PER_MINUTE;
  const normalized = Math.floor(value);
  if (normalized < 1 || normalized > API_KEY_MAX_RATE_LIMIT_PER_MINUTE) {
    throw new Error(`API key rate limit must be between 1 and ${API_KEY_MAX_RATE_LIMIT_PER_MINUTE} requests per minute.`);
  }
  return normalized;
}

function getManagedCompanyId(user: Doc<"users">, companyId: Id<"companies"> | undefined) {
  if (user.role === "SUPER_ADMIN") {
    if (!companyId) throw new Error("Company is required for tenant-scoped API keys.");
    return companyId;
  }

  const activeCompanyId = getActiveCompanyId(user);
  if (!activeCompanyId) throw new Error("Unauthorized");
  if (companyId && companyId !== activeCompanyId) throw new Error("Unauthorized");
  return activeCompanyId;
}

async function digestApiKey(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getKeyPrefixFromSecret(value: string) {
  const parts = value.trim().split("_");
  return parts.length >= 3 && parts[0] === "sonae" && parts[1]
    ? `sonae_${parts[1]}`
    : "";
}

async function buildOneTimeApiKey() {
  const secret = `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
  const keyPrefix = `sonae_${secret.slice(0, 12)}`;
  const apiKey = `${keyPrefix}_${secret.slice(12)}`;
  const keyDigest = await digestApiKey(apiKey);
  return { apiKey, keyPrefix, keyDigest };
}

async function logPublicApiRequest(ctx: Pick<MutationCtx, "db">, args: {
  companyId?: Id<"companies">;
  apiKeyId?: Id<"apiKeys">;
  keyPrefix?: string;
  method: string;
  path: string;
  requiredScope?: ApiKeyScope;
  status: PublicApiRequestStatus;
  statusCode: number;
  error?: string;
  requestedAt: number;
}) {
  await ctx.db.insert("publicApiRequests", {
    companyId: args.companyId,
    apiKeyId: args.apiKeyId,
    keyPrefix: args.keyPrefix,
    method: args.method,
    path: args.path,
    requiredScope: args.requiredScope,
    status: args.status,
    statusCode: args.statusCode,
    error: args.error,
    requestedAt: args.requestedAt,
  });
}

async function enrichApiKey(ctx: Pick<QueryCtx, "db">, apiKey: Doc<"apiKeys">) {
  const company = await ctx.db.get(apiKey.companyId);
  const creator = apiKey.createdBy ? await ctx.db.get(apiKey.createdBy) : null;
  const revokedBy = apiKey.revokedBy ? await ctx.db.get(apiKey.revokedBy) : null;

  return {
    ...apiKey,
    companyName: company?.name ?? "Unknown company",
    createdByEmail: creator?.email,
    revokedByEmail: revokedBy?.email,
  };
}

export const list = adminQuery({
  args: {
    companyId: v.optional(v.id("companies")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { user } = ctx;

    const page = user.role === "SUPER_ADMIN" && !args.companyId
      ? await ctx.db.query("apiKeys").withIndex("by_created").order("desc").paginate(args.paginationOpts)
      : await ctx.db
        .query("apiKeys")
        .withIndex("by_company_created", (q) => q.eq("companyId", getManagedCompanyId(user, args.companyId)))
        .order("desc")
        .paginate(args.paginationOpts);

    return {
      ...page,
      page: await Promise.all(page.page.map((apiKey) => enrichApiKey(ctx, apiKey))),
    };
  },
});

export const create = adminMutation({
  args: {
    companyId: v.optional(v.id("companies")),
    name: v.string(),
    scopes: v.array(apiKeyScopeValidator),
    expiresAt: v.optional(v.number()),
    rateLimitPerMinute: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId, user } = ctx;
    const companyId = getManagedCompanyId(user, args.companyId);
    assertAdminCanAccessCompany(user, companyId);

    if (args.expiresAt !== undefined && args.expiresAt <= Date.now()) {
      throw new Error("API key expiration must be in the future.");
    }

    const name = normalizeName(args.name);
    const scopes = normalizeScopes(args.scopes);
    const rateLimitPerMinute = normalizeRateLimit(args.rateLimitPerMinute);
    const { apiKey, keyPrefix, keyDigest } = await buildOneTimeApiKey();
    const now = Date.now();

    const apiKeyId = await ctx.db.insert("apiKeys", {
      companyId,
      name,
      keyPrefix,
      keyDigest,
      scopes,
      status: "ACTIVE",
      rateLimitPerMinute,
      createdBy: userId,
      createdAt: now,
      expiresAt: args.expiresAt,
    });

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "CREATE_API_KEY",
      entityType: "apiKeys",
      entityId: apiKeyId,
      companyId,
      timestamp: now,
      metadata: JSON.stringify({
        name,
        keyPrefix,
        scopes,
        rateLimitPerMinute,
        expiresAt: args.expiresAt,
      }),
    });

    const record = await ctx.db.get(apiKeyId);
    if (!record) throw new Error("API key creation failed.");

    return {
      apiKey,
      record: await enrichApiKey(ctx, record),
    };
  },
});

export const revoke = adminMutation({
  args: {
    apiKeyId: v.id("apiKeys"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, user } = ctx;
    const apiKey = await ctx.db.get(args.apiKeyId);
    if (!apiKey) throw new Error("API key not found.");
    assertAdminCanAccessCompany(user, apiKey.companyId);

    if (apiKey.status === "REVOKED") return await enrichApiKey(ctx, apiKey);

    const now = Date.now();
    const revocationReason = normalizeReason(args.reason);
    await ctx.db.patch(args.apiKeyId, {
      status: "REVOKED",
      revokedBy: userId,
      revokedAt: now,
      revocationReason,
    });

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "REVOKE_API_KEY",
      entityType: "apiKeys",
      entityId: args.apiKeyId,
      companyId: apiKey.companyId,
      timestamp: now,
      metadata: JSON.stringify({
        name: apiKey.name,
        keyPrefix: apiKey.keyPrefix,
        reason: revocationReason,
      }),
    });

    const updated = await ctx.db.get(args.apiKeyId);
    if (!updated) throw new Error("API key not found.");
    return await enrichApiKey(ctx, updated);
  },
});

/**
 * How many refusals one key puts on the audit trail in a window.
 *
 * Small on purpose. The point of the entry is that somebody notices a key being
 * refused, and the tenth identical refusal in a minute adds nothing the first
 * one did not already say.
 */
const API_REFUSAL_AUDIT_LIMIT = 5;
const API_REFUSAL_AUDIT_WINDOW_MS = 15 * 60 * 1000;

async function isWithinApiRefusalAuditLimit(
  ctx: MutationCtx,
  apiKeyId: Id<"apiKeys"> | undefined,
  now: number,
) {
  // A request that never matched a key has nothing to count against. The API's
  // own log still records every one of them.
  if (!apiKeyId) return true;

  const recent = await ctx.db
    .query("auditLogs")
    .withIndex("by_timestamp", (q) => q.gt("timestamp", now - API_REFUSAL_AUDIT_WINDOW_MS))
    .order("desc")
    .take(200);

  const refusals = recent.filter(
    (log) => log.actionType === "API_REQUEST_REFUSED" && log.entityId === apiKeyId,
  );

  return refusals.length < API_REFUSAL_AUDIT_LIMIT;
}

export const authenticatePublicRequest = internalMutation({
  args: {
    apiKey: v.optional(v.string()),
    requiredScope: apiKeyScopeValidator,
    method: v.string(),
    path: v.string(),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const providedApiKey = args.apiKey?.trim();
    const keyPrefix = providedApiKey ? getKeyPrefixFromSecret(providedApiKey) : undefined;

    const deny = async (status: PublicApiRequestStatus, statusCode: number, error: string, apiKey?: Doc<"apiKeys">) => {
      await logPublicApiRequest(ctx, {
        companyId: apiKey?.companyId,
        apiKeyId: apiKey?._id,
        keyPrefix,
        method: args.method,
        path: args.path,
        requiredScope: args.requiredScope,
        status,
        statusCode,
        error,
        requestedAt: now,
      });

      /*
       * A refused request reaches the audit trail as well as the API's own log.
       *
       * `publicApiRequests` records every call and is its own screen with its
       * own retention. Somebody reading the audit trail to find out how a key
       * was being used would never reach it — and a key being refused is the
       * security event, where a key being accepted is routine traffic.
       *
       * Throttled per key prefix. This runs on an unauthenticated path, so a
       * caller hammering the API with a bad key could otherwise write unbounded
       * rows into the trail and bury everything else in it. The API's own log
       * keeps every one regardless.
       *
       * See docs/plans/active/audit-trail-plan.md.
       */
      if (await isWithinApiRefusalAuditLimit(ctx, apiKey?._id, now)) {
        await ctx.db.insert("auditLogs", {
          // No actor. A refused request has not proved who it is, which is the
          // whole reason it was refused.
          actionType: "API_REQUEST_REFUSED",
          entityType: "apiKeys",
          ...(apiKey ? { entityId: apiKey._id } : {}),
          ...(apiKey?.companyId ? { companyId: apiKey.companyId } : {}),
          timestamp: now,
          metadata: JSON.stringify({
            keyPrefix: keyPrefix ?? "none given",
            method: args.method,
            path: args.path,
            requiredScope: args.requiredScope,
            refusedBecause: error,
          }),
        });
      }

      return { ok: false as const, statusCode, error };
    };

    if (!providedApiKey || !keyPrefix) {
      return await deny("UNAUTHORIZED", 401, "Missing or malformed API key.");
    }

    const candidates = await ctx.db
      .query("apiKeys")
      .withIndex("by_prefix", (q) => q.eq("keyPrefix", keyPrefix))
      .take(2);
    const apiKey = candidates[0];
    if (!apiKey) {
      return await deny("UNAUTHORIZED", 401, "Invalid API key.");
    }

    const providedDigest = await digestApiKey(providedApiKey);
    if (!constantTimeEqual(providedDigest, apiKey.keyDigest)) {
      return await deny("UNAUTHORIZED", 401, "Invalid API key.", apiKey);
    }

    if (apiKey.status !== "ACTIVE") {
      return await deny("UNAUTHORIZED", 401, "API key has been revoked.", apiKey);
    }

    if (apiKey.expiresAt !== undefined && apiKey.expiresAt <= now) {
      return await deny("UNAUTHORIZED", 401, "API key has expired.", apiKey);
    }

    if (!apiKey.scopes.includes(args.requiredScope)) {
      return await deny("FORBIDDEN", 403, `API key is missing required scope: ${args.requiredScope}.`, apiKey);
    }

    const recentRequests = await ctx.db
      .query("publicApiRequests")
      .withIndex("by_api_key_requested", (q) => q.eq("apiKeyId", apiKey._id))
      .order("desc")
      .take(apiKey.rateLimitPerMinute);
    const recentAuthorizedRequests = recentRequests.filter((request) =>
      request.status === "AUTHORIZED" && request.requestedAt > now - API_KEY_RATE_WINDOW_MS
    );
    if (recentAuthorizedRequests.length >= apiKey.rateLimitPerMinute) {
      return await deny("RATE_LIMITED", 429, "API key rate limit exceeded.", apiKey);
    }

    /*
     * The moment a key comes alive, once.
     *
     * Every accepted call is routine traffic and belongs in the API's own log,
     * not here — mirroring it onto the trail would bury everything else within
     * a day. A key being used for the very first time is the governance event:
     * it is the point at which something issued months ago starts acting.
     */
    if (apiKey.lastUsedAt === undefined) {
      await ctx.db.insert("auditLogs", {
        actionType: "API_KEY_FIRST_USED",
        entityType: "apiKeys",
        entityId: apiKey._id,
        ...(apiKey.companyId ? { companyId: apiKey.companyId } : {}),
        timestamp: now,
        metadata: JSON.stringify({
          keyPrefix: apiKey.keyPrefix,
          name: apiKey.name,
          method: args.method,
          path: args.path,
        }),
      });
    }

    await ctx.db.patch(apiKey._id, { lastUsedAt: now });
    await logPublicApiRequest(ctx, {
      companyId: apiKey.companyId,
      apiKeyId: apiKey._id,
      keyPrefix: apiKey.keyPrefix,
      method: args.method,
      path: args.path,
      requiredScope: args.requiredScope,
      status: "AUTHORIZED",
      statusCode: 200,
      requestedAt: now,
    });

    return {
      ok: true as const,
      statusCode: 200,
      companyId: apiKey.companyId,
      apiKeyId: apiKey._id,
      keyPrefix: apiKey.keyPrefix,
      scopes: apiKey.scopes,
      rateLimitPerMinute: apiKey.rateLimitPerMinute,
    };
  },
});
