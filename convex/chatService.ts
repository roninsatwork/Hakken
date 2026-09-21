import { billingBlocksPaidAccess } from "./billingPolicy";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { getActiveCompanyId } from "./authz";
import { appError } from "./utils/appError";
import { validateChatAttachmentMetadata, validateStoredUpload } from "./utils/uploadPolicy";
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

export function isAnonymousWidgetThread(thread: Doc<"threads">) {
  return Boolean(thread.widgetId && !thread.userId);
}

/**
 * The analytics dimensions every message row copies from its thread.
 *
 * Denormalised onto the message so reporting does not have to join back to the
 * thread. Anything that inserts a message must use this, including recovery
 * paths outside `chat.ts` — a row written without them is invisible to the
 * dashboards.
 */
export function getThreadMessageDimensions(thread: Doc<"threads"> | null) {
  return {
    companyId: thread?.companyId,
    userId: thread?.userId,
    agentId: thread?.agentId,
    widgetId: thread?.widgetId,
    analyticsDimensionsVersion: 1,
  };
}

export async function digestWidgetAccessToken(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function isWidgetAccessTokenValid(thread: Doc<"threads">, token: string | undefined) {
  if (!thread.widgetAccessTokenHash || !token) return false;
  return await digestWidgetAccessToken(token.trim()) === thread.widgetAccessTokenHash;
}

export async function canAccessThread(
  ctx: DbCtx,
  thread: Doc<"threads">,
  current: { userId: Id<"users"> } | null,
  widgetAccessToken?: string
) {
  if (isAnonymousWidgetThread(thread)) {
    const widget = thread.widgetId ? await ctx.db.get(thread.widgetId) : null;
    return Boolean(widget?.isActive && (await isWidgetAccessTokenValid(thread, widgetAccessToken)));
  }

  return Boolean(current && thread.userId === current.userId);
}

export async function assertCanAccessThread(
  ctx: DbCtx,
  thread: Doc<"threads">,
  current: { userId: Id<"users"> } | null,
  widgetAccessToken?: string,
  inactiveWidgetMessage = "Unauthorized: Widget is inactive"
) {
  if (isAnonymousWidgetThread(thread)) {
    const widget = thread.widgetId ? await ctx.db.get(thread.widgetId) : null;
    if (!widget?.isActive) throw appError("MODULE_DISABLED", inactiveWidgetMessage);
    if (!(await isWidgetAccessTokenValid(thread, widgetAccessToken))) {
      throw appError("UNAUTHORIZED", "Unauthorized: Invalid widget session");
    }
    return;
  }

  if (!current || thread.userId !== current.userId) {
    throw appError("UNAUTHORIZED", "Unauthorized");
  }
}

export async function validateChatAttachments(ctx: StorageCtx, storageIds?: Id<"_storage">[]) {
  if (!storageIds?.length) return;

  for (const storageId of storageIds) {
    await validateStoredUpload(ctx, storageId, validateChatAttachmentMetadata);
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
    throw appError("INVALID_INPUT", "429 Too Many Requests: Please wait a moment before sending more messages.");
  }
}

/**
 * How many visitor messages one widget may send an hour, across every
 * thread it has open.
 *
 * The per-thread minute limit and the hourly thread ceiling bound each door
 * on its own, but multiplied together they still let one script drive
 * hundreds of model calls a minute through a single widget (2026-09 audit),
 * and a company on no plan has no message quota to stop it. This is the one
 * ceiling that holds regardless of plan: an attacker cannot create widgets,
 * so it caps the AI work a public widget can cause at a rate a real website
 * never reaches. Ten a minute on average; a busy hour still fits.
 */
export const WIDGET_MESSAGES_PER_HOUR = 600;

/**
 * Take one seat in the widget's hourly message window, or refuse.
 *
 * Same window shape as thread minting: the crossing is audit-logged exactly
 * once per window, so an attack leaves a mark without flooding the trail, and
 * an expired window reopens on the next message.
 */
export async function reserveWidgetMessageSeat(
  ctx: Pick<MutationCtx, "db">,
  widget: Doc<"widgets">,
  now = Date.now(),
): Promise<boolean> {
  const windowStart = widget.messageWindowStart ?? 0;
  const inWindow = now - windowStart < 60 * 60 * 1000 ? widget.messageCountInWindow ?? 0 : 0;
  if (inWindow >= WIDGET_MESSAGES_PER_HOUR) {
    if (inWindow === WIDGET_MESSAGES_PER_HOUR) {
      await ctx.db.insert("auditLogs", {
        actionType: "RATE_LIMITED_WIDGET_MESSAGES",
        entityId: widget._id.toString(),
        entityType: "widgets",
        companyId: widget.companyId,
        timestamp: now,
        metadata: JSON.stringify({ perHour: WIDGET_MESSAGES_PER_HOUR }),
      });
      await ctx.db.patch(widget._id, { messageCountInWindow: inWindow + 1 });
    }
    return false;
  }
  await ctx.db.patch(widget._id, {
    messageWindowStart: inWindow === 0 ? now : windowStart,
    messageCountInWindow: inWindow + 1,
  });
  return true;
}

/**
 * An anonymous visitor does not get to choose how their message is answered.
 *
 * The model, the thinking level and the swarm are the signed-in chat's
 * controls; the widget's agent and the company's defaults decide for a
 * visitor. A request that names any of them from a widget session is not a
 * widget talking, so it is refused rather than quietly ignored.
 */
export function assertWidgetTurnSettingsAllowed(
  thread: Doc<"threads">,
  args: { modelId?: string; thinkingLevel?: string },
) {
  if (!isAnonymousWidgetThread(thread)) return;
  if (args.modelId !== undefined || args.thinkingLevel !== undefined) {
    throw appError("UNAUTHORIZED", "Unauthorized: Widget conversations cannot choose a model or thinking level");
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
  if (resolvingCompanyId && await billingBlocksPaidAccess(ctx, resolvingCompanyId)) {
    return { messageLimit: 0, messagesUsed: 0 };
  }

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

/**
 * What a refused sender is told, which depends on who is asking.
 *
 * A signed-in user belongs to the company, so they are told the truth — the
 * plan is exhausted — and who can fix it. An anonymous widget visitor is a
 * stranger on the company's website: the company's billing state is not theirs
 * to see, and "ask your administrator" reads as nonsense when the reader has
 * no administrator. They get an apology with no reason, which is all a
 * stranger is owed.
 */
export function quotaRefusalMessage(thread: Doc<"threads">) {
  if (isAnonymousWidgetThread(thread)) {
    return "I'm sorry, but I can't take new messages right now. Please try again later.";
  }
  return "I apologise, but your company has exhausted its AI allocation for this period. Please ask your administrator to review your plan.";
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
