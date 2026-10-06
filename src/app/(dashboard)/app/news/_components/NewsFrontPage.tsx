"use client";

import Link from "next/link";
import { usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowRight, Newspaper } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { NewsItemKind } from "@/convex/newsSchema";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { GoogleMark } from "../../sites/_components/GoogleMark";
import { newsKindHref } from "../../_learn/LearnShell";
import { addDays, formatLongDay, formatShortDay, isoWeek, localDay } from "../../_learn/learnDates";
import { Dateline, LEAD_PANEL, LEAD_SECTION, LEAD_TITLE, LIST_HEADING, PanelLink, ShowMore, StoryColumns, StoryList, type Story } from "../../_learn/StoryParts";
import { HelpfulBody, helpfulHref } from "../../helpful-content/_components/HelpfulArticle";
import { KnowledgeLeadBody, knowledgeHref } from "../../knowledge/_components/KnowledgeFront";
import { StoryBody, StoryKicker, rolloutPlace, storyHref, type NewsItem } from "./NewsStory";

/** Stories read at a time; "Show more" reads the next as many. */
const PAGE = 20;
/** The stories set in columns under the lead (R5). */
const COLUMNS = 3;
/** The shortest scale the Google updates' lines are drawn against, in days: three weeks. */
const UPDATE_SCALE_DAYS = 21;

type Article = FunctionReturnType<typeof api.knowledgeArticles.listPublishedSince>[number];
type Helpful = FunctionReturnType<typeof api.libraryArticles.listForReadersSince>[number];
type LatestUpdate = FunctionReturnType<typeof api.googleUpdates.listLatestGoogleUpdates>[number];

function fromItem(item: Pick<NewsItem, "_id" | "kind" | "title" | "summary" | "sourceName" | "publishedAt">): Story {
  return { key: item._id, kind: item.kind, title: item.title, summary: item.summary, sourceName: item.sourceName, publishedAt: item.publishedAt, href: storyHref(item._id) };
}

function fromArticle(article: Article, platformName: string): Story {
  return { key: article._id, kind: "KNOWLEDGE", title: article.title, summary: article.excerpt, sourceName: platformName, publishedAt: article.publishedAt, href: knowledgeHref(article._id) };
}

/** A Helpful content article added this week (insights-helpful-content-plan.md, IH8): by when it was added, under its publication. */
function fromHelpful(article: Helpful): Story {
  return { key: article._id, kind: "HELPFUL", title: article.title, summary: article.summary, sourceName: article.publication, publishedAt: article.addedAt, href: helpfulHref(article._id) };
}

/**
 * News's front page (docs/plans/active/knowledge-news-and-digest-plan.md,
 * revised again 2026-10-01, R5–R7; the approved drawings are beside the
 * plan): the dateline; the lead story, large — a News story, or a Knowledge
 * or Helpful content article pinned to lead (IH11) — with the last three Google
 * updates beside it; three more stories in columns; then every other story,
 * one line each. No cards, no pills, no colour but Google's own "G". A
 * Knowledge or Helpful content article new this week takes its place among the
 * stories, each read from the server for the week alone; every panel and row
 * is one link that lights on hover (insights-helpful-content-plan.md, IH8,
 * IH17, IH21).
 */
export function NewsFrontPage() {
  const t = useTranslations("news.front");
  const language = useLocale();
  const { platformName } = useSystemSettings();
  const today = localDay();
  const weekFrom = Date.parse(`${addDays(today, -6)}T00:00:00`);
  const front = useQuery(api.news.getFrontPage, { language, today });
  const updates = useQuery(api.googleUpdates.listLatestGoogleUpdates, { language });
  const articles = useQuery(api.knowledgeArticles.listPublishedSince, { language, since: weekFrom });
  const helpful = useQuery(api.libraryArticles.listForReadersSince, { language, since: weekFrom });
  const feed = usePaginatedQuery(api.news.listNewsItems, { language }, { initialNumItems: PAGE });

  if (front === undefined || feed.status === "LoadingFirstPage") {
    return <div className="h-64 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />;
  }
  if (front.lead === null) return <HakkenEmptyState icon={Newspaper} title={t("emptyTitle")} description={t("empty")} />;

  const lead = front.lead;
  const leadId = lead.source === "NEWS" ? lead.item._id : lead.article._id;
  const newArticles = (articles ?? []).map((article) => fromArticle(article, platformName));
  const newHelpful = (helpful ?? []).map(fromHelpful);
  // The lead is not listed again below it, whichever list it came from.
  const stories = [...feed.results.map(fromItem), ...newArticles, ...newHelpful]
    .filter((story) => story.key !== leadId)
    .sort((left, right) => right.publishedAt - left.publishedAt);
  const columns = stories.slice(0, COLUMNS);
  const wire = stories.slice(COLUMNS);

  return (
    <div className="flex flex-col">
      {/* The week's count is every story it shows: News's, Knowledge's new articles and Helpful content's. */}
      <NewsDateline today={today} weekCount={front.weekCount + newArticles.length + newHelpful.length} />

      <section data-part="lead-story" aria-label={t("leadLabel")} className={LEAD_SECTION}>
        <LeadStory lead={lead} today={today} />
        <LatestGoogleUpdates updates={updates} today={today} />
      </section>

      <StoryColumns stories={columns} label={t("moreLabel")} />

      {wire.length > 0 ? (
        <section data-part="earlier-stories" aria-labelledby="news-earlier" className="flex flex-col gap-2 pt-7">
          <h3 data-part-title id="news-earlier" className={LIST_HEADING}>{t("earlier")}</h3>
          <StoryList stories={wire} />
          <ShowMore feed={feed} pageSize={PAGE} />
        </section>
      ) : null}
    </div>
  );
}

type FrontLead = NonNullable<FunctionReturnType<typeof api.news.getFrontPage>["lead"]>;

/**
 * The lead story's panel, the whole of it one link (IH17): a News story with
 * its rollout and what it means, or a Knowledge or Helpful content article
 * pinned to lead (insights-helpful-content-plan.md, IH11) with its own words
 * and links, as it leads its own page.
 */
function LeadStory({ lead, today }: { lead: FrontLead; today: string }) {
  const { platformName } = useSystemSettings();
  if (lead.source === "KNOWLEDGE") {
    const article = lead.article;
    return (
      <article className={LEAD_PANEL}>
        <StoryKicker kind="KNOWLEDGE" sourceName={platformName} publishedAt={article.publishedAt} />
        <h2 className={LEAD_TITLE}>
          <PanelLink href={knowledgeHref(article._id)} className="transition-colors hover:text-foreground/80">{article.title}</PanelLink>
        </h2>
        <KnowledgeLeadBody article={article} />
      </article>
    );
  }
  if (lead.source === "HELPFUL") {
    const article = lead.article;
    return (
      <article className={LEAD_PANEL}>
        <StoryKicker kind="HELPFUL" sourceName={article.publication} publishedAt={article.addedAt} />
        <h2 className={LEAD_TITLE}>
          <PanelLink href={helpfulHref(article._id)} className="transition-colors hover:text-foreground/80">{article.title}</PanelLink>
        </h2>
        <HelpfulBody article={article} />
      </article>
    );
  }
  const item = lead.item;
  return (
    <article className={LEAD_PANEL}>
      <StoryKicker kind={item.kind} sourceName={item.sourceName} publishedAt={item.publishedAt} />
      <h2 className={LEAD_TITLE}>
        <PanelLink href={storyHref(item._id)} className="transition-colors hover:text-foreground/80">{item.title}</PanelLink>
      </h2>
      <StoryBody item={item} today={today} />
    </article>
  );
}

/** One kind of News on its own — Google updates, or what came from YouTube, X or websites — newest first. */
export function NewsKindList({ kind }: { kind: NewsItemKind }) {
  const t = useTranslations("news.front");
  const language = useLocale();
  const feed = usePaginatedQuery(api.news.listNewsItems, { kind, language }, { initialNumItems: PAGE });

  if (feed.status === "LoadingFirstPage") return <div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />;
  if (feed.results.length === 0) return <HakkenEmptyState icon={Newspaper} title={t("emptyTitle")} description={t("emptyKind")} />;

  return (
    <section aria-labelledby="news-kind" className="flex flex-col gap-2">
      <h2 id="news-kind" className={`border-b border-border-dim pb-3 ${LIST_HEADING}`}>{t(`kindHeadings.${kind}`)}</h2>
      <StoryList stories={feed.results.map(fromItem)} withSummary />
      <ShowMore feed={feed} pageSize={PAGE} />
    </section>
  );
}

/** The day, as a newspaper prints it, over a double rule. */
function NewsDateline({ today, weekCount }: { today: string; weekCount: number }) {
  const t = useTranslations("news.front");
  const locale = useLocale();
  return (
    <Dateline
      left={<><span className="font-medium text-foreground">{formatLongDay(today, locale)}</span>{" · "}{t("week", { week: isoWeek(today) })}</>}
      right={t("weekCount", { count: weekCount })}
    />
  );
}

/**
 * The last three Google updates beside the lead (R5), each with its dates and
 * a line as long as it took, so the long ones stand out; one rolling out says
 * which day it is on, its line dashed for the days still to come. Each row is
 * one link to its story (IH17).
 */
function LatestGoogleUpdates({ updates, today }: { updates: LatestUpdate[] | undefined; today: string }) {
  const t = useTranslations("news.updates");
  const locale = useLocale();
  const scale = Math.max(UPDATE_SCALE_DAYS, ...(updates ?? []).map((update) => rolloutPlace(update, today).length));

  return (
    <aside data-part="latest-google-updates" aria-labelledby="news-google-updates" className="flex flex-col gap-1 border-t border-border-dim pt-7 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-5">
      <p className="flex items-center gap-2 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
        <GoogleMark size={12} />
        {t("label")}
      </p>
      <h3 data-part-title id="news-google-updates" className="mt-1.5 text-[15px] font-semibold text-foreground">{t("title")}</h3>
      <p className="pb-2 text-[12.5px] leading-relaxed text-secondary">{t("description")}</p>
      <div className="-mx-4">
        <CompactList
          rows={updates}
          rowKey={(update) => update._id}
          empty={t("empty")}
          rowLink={{ href: (update) => (update.itemId ? storyHref(update.itemId) : null), label: (update) => update.title }}
          columns={[
            {
              key: "update",
              cell: (update) => {
                const { end, length, day, done } = rolloutPlace(update, today);
                const finished = update.finishedOn !== null;
                return (
                  <span className="flex flex-col gap-1">
                    <span className="text-[13.5px] font-medium text-foreground">{update.title}</span>
                    <span className="flex items-center justify-between gap-3 text-[12px] tabular-nums text-secondary">
                      <span>
                        {finished
                          ? t("dates", { from: formatShortDay(update.startedOn, locale), to: formatShortDay(end, locale) })
                          : t("startedOn", { day: formatShortDay(update.startedOn, locale) })}
                      </span>
                      {finished ? <span>{t("days", { days: length })}</span> : <StatusLabel tone="warning" icon="working">{t("dayOf", { day })}</StatusLabel>}
                    </span>
                    <span aria-hidden="true" className="relative mt-1.5 block h-0.5">
                      <span className={finished ? "absolute left-0 top-0 border-t-2 border-foreground/45" : "absolute left-0 top-0 border-t-2 border-foreground/80"} style={{ width: `${((finished ? length : (day - 1)) / scale) * 100}%` }} />
                      {finished ? null : (
                        <span
                          className="absolute top-[0.5px] border-t border-dashed border-foreground/35"
                          style={{ left: `${((day - 1) / scale) * 100}%`, width: `${(Math.max(length - (day - 1), 0) / scale) * 100}%` }}
                        />
                      )}
                    </span>
                    <span className="sr-only">{done < 1 ? t("dayOf", { day }) : t("days", { days: length })}</span>
                  </span>
                );
              },
            },
          ]}
        />
      </div>
      <Link href={newsKindHref("GOOGLE_UPDATE")} className="mt-2 inline-flex items-center gap-1.5 self-start text-[13px] text-secondary transition-colors hover:text-foreground">
        {t("all")}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </aside>
  );
}
