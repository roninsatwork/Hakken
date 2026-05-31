import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { getActiveCompanyId } from "./authz";
import { validateChatAttachmentMetadata } from "./utils/uploadPolicy";
import type { PiiConfig } from "./utils/pii";

type DbCtx = Pick<QueryCtx, "db">;
type StorageCtx = Pick<MutationCtx, "db" | "storage">;

const defaultPiiConfig: PiiConfig = {
  enabled: false,
  maskEmails: true,
  maskCreditCards: true,
  maskPhones: false,
  maskNinos: true,
};

function isTestEnvironment() {
  return process.env.IS_TEST === "true" || process.env.VITEST === "true" || process.env.NODE_ENV === "test";
}

function isAnonymousWidgetThread(thread: Doc<"threads">) {
  return Boolean(thread.widgetId && !thread.userId);
}

export async function canAccessThread(
  ctx: DbCtx,
  thread: Doc<"threads">,
  current: { userId: Id<"users"> } | null
) {
  if (isAnonymousWidgetThread(thread)) {
    const widget = thread.widgetId ? await ctx.db.get(thread.widgetId) : null;
    return Boolean(widget?.isActive);
  }

  return Boolean(current && thread.userId === current.userId);
}

export async function assertCanAccessThread(
  ctx: DbCtx,
  thread: Doc<"threads">,
  current: { userId: Id<"users"> } | null,
  inactiveWidgetMessage = "Unauthorized: Widget is inactive"
) {
  if (isAnonymousWidgetThread(thread)) {
    const widget = thread.widgetId ? await ctx.db.get(thread.widgetId) : null;
    if (!widget?.isActive) throw new Error(inactiveWidgetMessage);
    return;
  }

  if (!current || thread.userId !== current.userId) {
    throw new Error("Unauthorized");
  }
}

async function getAttachmentMetadata(ctx: StorageCtx, storageId: Id<"_storage">) {
  let metadata: { size: number; contentType?: string | null } | null = null;
  try {
    metadata = await ctx.storage.getMetadata(storageId);
  } catch {
    // Some test storage shims do not implement getMetadata.
  }

  if (!metadata && isTestEnvironment()) {
    const mock = await ctx.db
      .query("mockStorageMetadata")
      .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
      .first();
    metadata = mock ? { size: mock.size, contentType: mock.contentType } : null;
  }

  return metadata;
}

async function deleteRejectedAttachment(ctx: StorageCtx, storageId: Id<"_storage">) {
  try {
    await ctx.storage.delete(storageId);
  } catch {
    // Handle test environments lacking storage delete syscall.
  }

  if (!isTestEnvironment()) return;

  const mock = await ctx.db
    .query("mockStorageMetadata")
    .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
    .first();
  if (mock) {
    await ctx.db.delete(mock._id);
  }
}

export async function validateChatAttachments(ctx: StorageCtx, storageIds?: Id<"_storage">[]) {
  if (!storageIds?.length) return;

  for (const storageId of storageIds) {
    const metadata = await getAttachmentMetadata(ctx, storageId);
    if (!metadata) {
      throw new Error("Attached file not found in storage");
    }

    try {
      validateChatAttachmentMetadata(metadata);
    } catch (error) {
      await deleteRejectedAttachment(ctx, storageId);
      if (error instanceof Error) throw error;
      throw new Error("Invalid attachment");
    }
  }
}

export function countRecentUserMessages(
  messages: Pick<Doc<"messages">, "role" | "createdAt">[],
  now = Date.now(),
  windowMs = 60000
) {
  const threshold = now - windowMs;
  return messages.filter((message) => message.role === "user" && message.createdAt >= threshold).length;
}

export function assertWithinMessageRateLimit(
  messages: Pick<Doc<"messages">, "role" | "createdAt">[],
  now = Date.now(),
  maxMessages = 10
) {
  if (countRecentUserMessages(messages, now) >= maxMessages) {
    throw new Error("429 Too Many Requests: Please wait a moment before sending more messages.");
  }
}

export type ChatQuota = {
  messageLimit: number;
  messagesUsed: number;
  usageTarget?: { type: "user"; id: Id<"users"> } | { type: "company"; id: Id<"companies"> };
};

export async function resolveChatQuota(
  ctx: Pick<MutationCtx, "db">,
  user: Doc<"users"> | null,
  thread: Doc<"threads">
): Promise<ChatQuota> {
  const resolvingCompanyId = user ? getActiveCompanyId(user) : thread.companyId;

  if (user?.planOverrideId) {
    const userPlan = await ctx.db.get(user.planOverrideId);
    if (userPlan) {
      return {
        messageLimit: userPlan.messageLimit,
        messagesUsed: user.messagesUsedThisPeriod || 0,
        usageTarget: { type: "user", id: user._id },
      };
    }
  }

  if (resolvingCompanyId) {
    const company = await ctx.db.get(resolvingCompanyId);
    if (company?.planId) {
      const companyPlan = await ctx.db.get(company.planId);
      if (companyPlan) {
        return {
          messageLimit: companyPlan.messageLimit,
          messagesUsed: company.messagesUsedThisPeriod || 0,
          usageTarget: { type: "company", id: resolvingCompanyId },
        };
      }
    }
  }

  return { messageLimit: -1, messagesUsed: 0 };
}

export function isChatQuotaExceeded(quota: ChatQuota) {
  return quota.messageLimit !== -1 && quota.messagesUsed >= quota.messageLimit;
}

export async function incrementChatQuota(ctx: Pick<MutationCtx, "db">, quota: ChatQuota) {
  if (!quota.usageTarget) return;
  await ctx.db.patch(quota.usageTarget.id, { messagesUsedThisPeriod: quota.messagesUsed + 1 });
}

export async function loadPiiConfig(ctx: Pick<MutationCtx, "db">): Promise<PiiConfig> {
  const piiConfigEntry = await ctx.db
    .query("systemConfig")
    .withIndex("by_key", (q) => q.eq("key", "PII_REDACTION_CONFIG"))
    .first();

  if (!piiConfigEntry?.value) return defaultPiiConfig;

  try {
    return { ...defaultPiiConfig, ...(JSON.parse(piiConfigEntry.value) as Partial<PiiConfig>) };
  } catch {
    return defaultPiiConfig;
  }
}

export function resolveTargetAgentId(
  currentAgentId: Id<"agents"> | undefined,
  dynamicAgentId: Id<"agents"> | null | undefined
) {
  if (dynamicAgentId === undefined) return currentAgentId;
  return dynamicAgentId === null ? undefined : dynamicAgentId;
}
