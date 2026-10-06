import { v } from "convex/values";

import { internalQuery, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { readerFields } from "./contentTranslation";
import { renderEmail, type EmailContent } from "./emailLayoutService";
import { readerItem } from "./news";
import { readerRow as helpfulReaderRow } from "./libraryArticles";
import type { OutboxMessageType } from "./outboxSchema";
import { resolvePlatformName } from "./settingsService";
import { emailWording } from "./utils/emailWording";
import { suppressionOf } from "./emailSuppressions";
import { readerPreferencesOf } from "./readerPreferences";

/**
 * Each message type's template (docs/plans/active/knowledge-news-and-digest-
 * plan.md, "Templates by type"): what turns a row's payload into an email in
 * the reader's language, through the shared shell (`renderEmail`, which takes
 * content, never markup, and the email design system's look). The Sender
 * picks the template by the row's type; every later email type is one more
 * entry here, and one more sender address below.
 */

export type OutboxEmail = { subject: string; html: string; text: string; headers: Record<string, string> };

type Brand = { platformName: string; appUrl: string };
type Template = (ctx: QueryCtx, row: Doc<"outboxMessages">, brand: Brand) => Promise<
  { subject: string; content: EmailContent; headers?: Record<string, string> } | { skip: string }
>;

/**
 * The environment variable that holds each type's sender address. Until it is
 * set the Sender refuses that type and says why on its run, rather than
 * sending from the unconfigured fallback (A11).
 */
export const SENDER_ADDRESS_VARIABLES: Record<OutboxMessageType, string> = {
  WEEKLY_NEWS_DIGEST: "NEWS_DIGEST_FROM_EMAIL",
  COLLECTION_NEEDS_YOU: "ALERTS_FROM_EMAIL",
};

/**
 * Where a mail client's one-click unsubscribe goes (RFC 8058): the platform's
 * own HTTP route (`emailHttp.ts`), which takes a POST and nothing else.
 */
function oneClickUnsubscribeUrl(token: string): string | null {
  const site = process.env.CONVEX_SITE_URL?.trim().replace(/\/+$/, "");
  return site ? `${site}/api/email/unsubscribe?token=${token}` : null;
}

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

/**
 * The week's issue: its opening in the reader's language, then each News item
 * it carries as a card, then the Helpful content added that week under its
 * own heading (insights-helpful-content-plan.md, IH19), and the way to stop — a link in the email and the
 * `List-Unsubscribe` headers Gmail and Yahoo require of bulk senders. Never
 * sent to a reader who turned it off, and never without a way to stop.
 */
const weeklyNewsDigest: Template = async (ctx, row, brand) => {
  const preferences = await readerPreferencesOf(ctx, row.userId);
  if (!preferences.newsDigest) return { skip: "The reader turned the Weekly News Digest off." };
  if (!preferences.unsubscribeToken) return { skip: "It has no way to unsubscribe yet, so it is not sent." };
  const unsubscribeUrl = `${brand.appUrl}/unsubscribe?token=${preferences.unsubscribeToken}`;
  const oneClick = oneClickUnsubscribeUrl(preferences.unsubscribeToken);
  const headers: Record<string, string> = oneClick
    ? { "List-Unsubscribe": `<${oneClick}>, <${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
    : { "List-Unsubscribe": `<${unsubscribeUrl}>` };
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
  // Helpful content added that week (IH19): Hakken's summary in the reader's language and the original — never the article's words.
  const helpful = [];
  for (const articleId of issue.helpfulIds ?? []) {
    const article = await ctx.db.get(articleId);
    if (article?.shown) helpful.push(await helpfulReaderRow(ctx, article, row.language));
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
      sections: [{
        heading: words.helpfulHeading,
        cards: helpful.map((article) => ({
          title: article.title,
          body: article.summary,
          meta: article.publication,
          link: { label: words.readOriginal, url: article.url },
        })),
      }],
      actions: [{ label: words.openNews, url: newsUrl, emphasis: "primary" }],
      footer: {
        lines: [words.whyYouGetIt({ platformName: brand.platformName })],
        links: [{ label: words.unsubscribe, url: unsubscribeUrl }],
      },
    },
    headers,
  };
};

/**
 * To a super admin: collecting stopped for something only a person can fix
 * (docs/plans/active/finish-off-plan.md, item 13) — the reason in the
 * Collector's own words, and the way to the pipeline.
 */
const collectionNeedsYou: Template = async (_ctx, row, brand) => {
  const reason = typeof payloadOf(row).reason === "string" ? (payloadOf(row).reason as string) : "";
  if (!reason) return { skip: "It says nothing of why collecting stopped." };
  const words = emailWording(row.language).collectionNeedsYou;
  const pipelineUrl = `${brand.appUrl}/admin/websites/collection`;
  return {
    subject: words.subject({ platformName: brand.platformName }),
    content: {
      kind: words.kind,
      verdict: words.verdict,
      paragraphs: [reason],
      actions: [{ label: words.open, url: pipelineUrl, emphasis: "primary" }],
      footer: { lines: [words.whyYouGetIt({ platformName: brand.platformName })] },
    },
  };
};

const TEMPLATES: Record<OutboxMessageType, Template> = {
  WEEKLY_NEWS_DIGEST: weeklyNewsDigest,
  COLLECTION_NEEDS_YOU: collectionNeedsYou,
};

/**
 * A row as its reader will get it, or why it should not be sent: the reader
 * is no longer a user, or what it is about is gone. Shown as a preview on
 * Admin → Content → Outbox too.
 */
export async function renderOutboxRow(ctx: QueryCtx, row: Doc<"outboxMessages">): Promise<{ email: OutboxEmail } | { skip: string }> {
  const user = await ctx.db.get(row.userId);
  if (!user) return { skip: "The reader is no longer a user." };
  const suppressed = await suppressionOf(ctx, row.email);
  if (suppressed) {
    return { skip: suppressed === "BOUNCED" ? "This address bounced, so nothing more is sent to it." : "This reader marked an email as spam, so nothing more is sent to them." };
  }
  const settings = await ctx.db.query("systemSettings").first();
  const brand = { platformName: resolvePlatformName(settings?.platformName), appUrl: appUrl() };
  const made = await TEMPLATES[row.messageType](ctx, row, brand);
  if ("skip" in made) return made;
  const { html, text } = renderEmail(made.content, { platformName: brand.platformName });
  return { email: { subject: made.subject, html, text, headers: made.headers ?? {} } };
}

export const renderOutboxMessage = internalQuery({
  args: { messageId: v.id("outboxMessages") },
  returns: v.union(
    v.object({ email: v.object({ subject: v.string(), html: v.string(), text: v.string(), headers: v.record(v.string(), v.string()) }) }),
    v.object({ skip: v.string() }),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.messageId);
    if (!row) return { skip: "The email is no longer in the outbox." };
    return await renderOutboxRow(ctx, row);
  },
});
