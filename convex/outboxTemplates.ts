import { v } from "convex/values";

import { internalQuery, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { readerFields } from "./contentTranslation";
import { renderEmail, type EmailContent } from "./emailLayoutService";
import { readerItem } from "./news";
import type { OutboxMessageType } from "./outboxSchema";
import { resolvePlatformName } from "./settingsService";
import { emailWording } from "./utils/emailWording";

/**
 * Each message type's template (docs/plans/active/knowledge-news-and-digest-
 * plan.md, "Templates by type"): what turns a row's payload into an email in
 * the reader's language, through the shared shell (`renderEmail`, which takes
 * content, never markup, and the email design system's look). The Sender
 * picks the template by the row's type; every later email type is one more
 * entry here, and one more sender address below.
 */

export type OutboxEmail = { subject: string; html: string; text: string };

type Brand = { platformName: string; appUrl: string };
type Template = (ctx: QueryCtx, row: Doc<"outboxMessages">, brand: Brand) => Promise<{ subject: string; content: EmailContent } | { skip: string }>;

/**
 * The environment variable that holds each type's sender address. Until it is
 * set the Sender refuses that type and says why on its run, rather than
 * sending from the unconfigured fallback (A11).
 */
export const SENDER_ADDRESS_VARIABLES: Record<OutboxMessageType, string> = {
  WEEKLY_NEWS_DIGEST: "NEWS_DIGEST_FROM_EMAIL",
};

/** Where links in an email lead: the app as its readers open it. */
export function appUrl(): string {
  return (process.env.SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

function payloadOf(row: Doc<"outboxMessages">): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(row.payloadJson);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

/** The week's issue: its opening in the reader's language, then each News item it carries as a card. */
const weeklyNewsDigest: Template = async (ctx, row, brand) => {
  const issueId = typeof payloadOf(row).issueId === "string" ? ctx.db.normalizeId("weeklyDigestIssues", payloadOf(row).issueId as string) : null;
  const issue = issueId ? await ctx.db.get(issueId) : null;
  if (!issue) return { skip: "Its week's issue no longer exists." };
  const wording = emailWording(row.language);
  const words = wording.weeklyNewsDigest;
  const { intro } = await readerFields(ctx, "weeklyDigestIssues", issue._id, { intro: issue.introEn }, row.language);
  const items = [];
  for (const itemId of issue.itemIds) {
    const item = await ctx.db.get(itemId);
    if (item) items.push(await readerItem(ctx, item, row.language));
  }
  const newsUrl = `${brand.appUrl}/app/news`;
  const date = (at: number) => new Date(at).toLocaleDateString(wording.dateLocale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return {
    subject: words.subject({ platformName: brand.platformName }),
    content: {
      kind: words.kind,
      verdict: words.verdict,
      ...(intro.trim() ? { paragraphs: [intro.trim()] } : {}),
      // The shell shows the first eight and links the rest.
      cards: items.map((item) => ({
        title: item.title,
        body: item.meaning ? `${item.summary} ${item.meaning}` : item.summary,
        meta: `${item.sourceName} · ${date(item.publishedAt)}`,
        link: { label: words.readOriginal, url: item.url },
      })),
      overflow: { label: words.seeAll({ count: items.length, platformName: brand.platformName }), url: newsUrl },
      actions: [{ label: words.openNews, url: newsUrl, emphasis: "primary" }],
      footer: { lines: [words.whyYouGetIt({ platformName: brand.platformName })] },
    },
  };
};

const TEMPLATES: Record<OutboxMessageType, Template> = {
  WEEKLY_NEWS_DIGEST: weeklyNewsDigest,
};

/**
 * A row as its reader will get it, or why it should not be sent: the reader
 * is no longer a user, or what it is about is gone. Shown as a preview on
 * Admin → Content → Outbox too.
 */
export async function renderOutboxRow(ctx: QueryCtx, row: Doc<"outboxMessages">): Promise<{ email: OutboxEmail } | { skip: string }> {
  const user = await ctx.db.get(row.userId);
  if (!user) return { skip: "The reader is no longer a user." };
  const settings = await ctx.db.query("systemSettings").first();
  const brand = { platformName: resolvePlatformName(settings?.platformName), appUrl: appUrl() };
  const made = await TEMPLATES[row.messageType](ctx, row, brand);
  if ("skip" in made) return made;
  const { html, text } = renderEmail(made.content, { platformName: brand.platformName });
  return { email: { subject: made.subject, html, text } };
}

export const renderOutboxMessage = internalQuery({
  args: { messageId: v.id("outboxMessages") },
  returns: v.union(
    v.object({ email: v.object({ subject: v.string(), html: v.string(), text: v.string() }) }),
    v.object({ skip: v.string() }),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.messageId);
    if (!row) return { skip: "The email is no longer in the outbox." };
    return await renderOutboxRow(ctx, row);
  },
});
