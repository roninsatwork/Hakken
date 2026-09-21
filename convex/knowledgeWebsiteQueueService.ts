import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  KNOWLEDGE_WEBSITE_MAPS_PER_HOUR,
  KNOWLEDGE_WEBSITE_REQUEUE_WINDOW_MS,
  KNOWLEDGE_WEBSITE_URLS_PER_HOUR,
  KNOWLEDGE_WEBSITE_URLS_PER_REQUEST,
} from "./knowledgeImportPolicy";
import { buildKnowledgeDocumentRecord } from "./knowledgeService";
import { appError } from "./utils/appError";
import { validateSafeUrl } from "./utils/security";

type QuotaCtx = Pick<MutationCtx, "db">;

function getScopeKey(companyId: Id<"companies"> | undefined) {
  return companyId ? `company:${companyId}` : "platform";
}

export async function reserveKnowledgeImportQuota(
  ctx: QuotaCtx,
  args: {
    companyId: Id<"companies"> | undefined;
    queuedUrls?: number;
    mapRequests?: number;
  },
) {
  const now = Date.now();
  const scopeKey = getScopeKey(args.companyId);
  const quota = await ctx.db
    .query("knowledgeImportQuotas")
    .withIndex("by_scope", (q) => q.eq("scopeKey", scopeKey))
    .unique();
  const inCurrentWindow = quota && now - quota.windowStartedAt < KNOWLEDGE_WEBSITE_REQUEUE_WINDOW_MS;
  const queuedUrls = (inCurrentWindow ? quota.queuedUrls : 0) + (args.queuedUrls ?? 0);
  const mapRequests = (inCurrentWindow ? quota.mapRequests : 0) + (args.mapRequests ?? 0);

  if (queuedUrls > KNOWLEDGE_WEBSITE_URLS_PER_HOUR) {
    throw appError(
      "INVALID_INPUT",
      `This workspace can queue at most ${KNOWLEDGE_WEBSITE_URLS_PER_HOUR} website pages per hour.`,
    );
  }
  if (mapRequests > KNOWLEDGE_WEBSITE_MAPS_PER_HOUR) {
    throw appError(
      "INVALID_INPUT",
      `This workspace can map at most ${KNOWLEDGE_WEBSITE_MAPS_PER_HOUR} websites per hour.`,
    );
  }

  const next = {
    scopeKey,
    windowStartedAt: inCurrentWindow && quota ? quota.windowStartedAt : now,
    queuedUrls,
    mapRequests,
  };
  if (quota) {
    await ctx.db.patch(quota._id, next);
  } else {
    await ctx.db.insert("knowledgeImportQuotas", next);
  }
}

export async function queueWebsiteUrlsCore(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    companyId: Id<"companies"> | undefined;
    agentId: Id<"agents"> | undefined;
    urls: string[];
    forceRefresh: boolean | undefined;
    wikiReview: boolean | undefined;
  },
) {
  const uniqueUrls = [...new Set(args.urls.map((url) => url.trim()))];
  if (uniqueUrls.length > KNOWLEDGE_WEBSITE_URLS_PER_REQUEST) {
    throw appError(
      "INVALID_INPUT",
      `Import at most ${KNOWLEDGE_WEBSITE_URLS_PER_REQUEST} website pages at a time.`,
    );
  }

  const now = Date.now();
  const windowStart = now - KNOWLEDGE_WEBSITE_REQUEUE_WINDOW_MS;
  const candidates: Array<
    | { kind: "existing"; documentId: Id<"knowledgeDocuments"> }
    | { kind: "new"; url: string }
  > = [];

  for (const url of uniqueUrls) {
    validateSafeUrl(url, "Knowledge Base Import");
    const existing = await ctx.db
      .query("knowledgeDocuments")
      .withIndex("by_source_company", (q) =>
        q.eq("sourceUrl", url).eq("companyId", args.companyId).eq("agentId", args.agentId),
      )
      .first();

    if (existing) {
      if (args.forceRefresh && (existing.lastQueuedAt ?? 0) < windowStart) {
        candidates.push({ kind: "existing", documentId: existing._id });
      }
      continue;
    }
    candidates.push({ kind: "new", url });
  }

  if (candidates.length > 0) {
    await reserveKnowledgeImportQuota(ctx, {
      companyId: args.companyId,
      queuedUrls: candidates.length,
    });
  }

  const documentIds: Id<"knowledgeDocuments">[] = [];
  for (const candidate of candidates) {
    if (candidate.kind === "existing") {
      await ctx.db.patch(candidate.documentId, {
        status: "pending",
        lastQueuedAt: now,
        lastIngestionError: undefined,
      });
      documentIds.push(candidate.documentId);
      continue;
    }

    const documentId = await ctx.db.insert("knowledgeDocuments", buildKnowledgeDocumentRecord({
      title: candidate.url,
      sourceUrl: candidate.url,
      status: "pending",
      format: "url",
      createdBy: args.userId,
      createdAt: now,
      lastQueuedAt: now,
      companyId: args.companyId,
      agentId: args.agentId,
    }));
    if (args.wikiReview ?? (!args.companyId && !args.agentId)) {
      await ctx.db.patch(documentId, { wikiReviewRequested: true });
    }
    documentIds.push(documentId);
  }

  return documentIds;
}
