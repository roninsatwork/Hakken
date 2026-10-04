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
import { Button } from "@/src/ui/components/screens/Button";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { GoogleMark } from "../../sites/_components/GoogleMark";
import { newsKindHref } from "../../_learn/LearnShell";
import { addDays, formatLongDay, formatShortDay, formatWireDay, isoWeek, localDay } from "../../_learn/learnDates";
import { KindIcon, StoryBody, StoryKicker, rolloutPlace, storyHref, type NewsItem, type StoryKind } from "./NewsStory";

/** Stories read at a time; "Show more" reads the next as many. */
const PAGE = 20;
/** The stories set in columns under the lead (R5). */
const COLUMNS = 3;
/** The shortest scale the Google updates' lines are drawn against, in days: three weeks. */
const UPDATE_SCALE_DAYS = 21;

type Article = FunctionReturnType<typeof api.knowledgeArticles.listPublishedArticles>[number];
type LatestUpdate = FunctionReturnType<typeof api.googleUpdates.listLatestGoogleUpdates>[number];

/** A story below the lead: a News item, or a Knowledge article new this week. */
type Story = { key: string; kind: StoryKind; title: string; summary: string; sourceName: string; publishedAt: number; href: string };

function fromItem(item: Pick<NewsItem, "_id" | "kind" | "title" | "summary" | "sourceName" | "publishedAt">): Story {
  return { key: item._id, kind: item.kind, title: item.title, summary: item.summary, sourceName: item.sourceName, publishedAt: item.publishedAt, href: storyHref(item._id) };
}

function fromArticle(article: Article, platformName: string): Story {
  return {
    key: article._id,
    kind: "KNOWLEDGE",
    title: article.title,
    summary: article.excerpt,
    sourceName: platformName,
    publishedAt: article.publishedAt,
    href: `/app/knowledge/${article._id}`,
  };
}

/**
 * News's front page (docs/plans/active/knowledge-news-and-digest-plan.md,
 * revised again 2026-10-01, R5–R7; the approved drawings are beside the
 * plan): the dateline; the lead story, large, with the last three Google
 * updates beside it; three more stories in columns; then every other story,
 * one line each. No cards, no pills, no colour but Google's own "G".
 */
export function NewsFrontPage() {
  const t = useTranslations("news.front");
  const language = useLocale();
  const { platformName } = useSystemSettings();
  const today = localDay();
  const front = useQuery(api.news.getFrontPage, { language, today });
  const updates = useQuery(api.googleUpdates.listLatestGoogleUpdates, { language });
  const articles = useQuery(api.knowledgeArticles.listPublishedArticles, { language });
  const feed = usePaginatedQuery(api.news.listNewsItems, { language }, { initialNumItems: PAGE });

  if (front === undefined || feed.status === "LoadingFirstPage") {
    return <div className="h-64 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />;
  }
  if (front.lead === null) return <HakkenEmptyState icon={Newspaper} title={t("emptyTitle")} description={t("empty")} />;

  const lead = front.lead;
  // A Knowledge article published this week sits among the stories by its date.
  const weekFrom = Date.parse(`${addDays(today, -6)}T00:00:00`);
  const newArticles = (articles ?? []).filter((article) => article.publishedAt >= weekFrom).map((article) => fromArticle(article, platformName));
  const stories = [...feed.results.filter((item) => item._id !== lead._id).map(fromItem), ...newArticles]
    .sort((left, right) => right.publishedAt - left.publishedAt);
  const columns = stories.slice(0, COLUMNS);
  const wire = stories.slice(COLUMNS);

  return (
    <div className="flex flex-col">
      {/* The week's count is every story it shows: News's, and Knowledge's new articles. */}
      <Dateline today={today} weekCount={front.weekCount + newArticles.length} />

      <section data-part="lead-story" aria-label={t("leadLabel")} className="grid grid-cols-1 gap-8 border-b border-border-dim py-7 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-0">
        <article className="flex min-w-0 flex-col gap-4 lg:pr-9">
          <StoryKicker kind={lead.kind} sourceName={lead.sourceName} publishedAt={lead.publishedAt} />
          <h2 className="text-[28px] font-extrabold leading-[1.08] tracking-[-0.035em] text-foreground sm:text-[38px]">
            <Link href={storyHref(lead._id)} className="transition-colors hover:text-foreground/80">{lead.title}</Link>
          </h2>
          <StoryBody item={lead} today={today} />
        </article>
        <LatestGoogleUpdates updates={updates} today={today} />
      </section>

      {columns.length > 0 ? (
        <section data-part="story-columns" aria-label={t("moreLabel")} className="grid grid-cols-1 gap-6 border-b border-border-dim py-7 md:grid-cols-3 md:gap-0">
          {columns.map((story) => (
            <article key={story.key} className="flex min-w-0 flex-col gap-3 md:border-l md:border-border-dim md:px-6 md:first:border-l-0 md:first:pl-0 md:last:pr-0">
              <StoryKicker kind={story.kind} sourceName={story.sourceName} publishedAt={story.publishedAt} />
              <h3 className="text-[18px] font-bold leading-snug tracking-[-0.02em] text-foreground">
                <Link href={story.href} className="transition-colors hover:text-foreground/80">{story.title}</Link>
              </h3>
              {story.summary ? <p className="line-clamp-5 text-[13.5px] leading-relaxed text-secondary">{story.summary}</p> : null}
            </article>
          ))}
        </section>
      ) : null}

      {wire.length > 0 ? (
        <section data-part="earlier-stories" aria-labelledby="news-earlier" className="flex flex-col gap-2 pt-7">
          <h3 data-part-title id="news-earlier" className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">{t("earlier")}</h3>
          <StoryList stories={wire} />
          <ShowMore feed={feed} />
        </section>
      ) : null}
    </div>
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
      <h2 id="news-kind" className="border-b border-border-dim pb-3 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">{t(`kindHeadings.${kind}`)}</h2>
      <StoryList stories={feed.results.map(fromItem)} withSummary />
      <ShowMore feed={feed} />
    </section>
  );
}

/** The day, as a newspaper prints it, over a double rule. */
function Dateline({ today, weekCount }: { today: string; weekCount: number }) {
  const t = useTranslations("news.front");
  const locale = useLocale();
  return (
    <div data-part="dateline" className="flex flex-col gap-2.5">
      <p className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 font-mono text-[11px] uppercase tracking-[0.2em] text-secondary">
        <span>
          <span className="font-medium text-foreground">{formatLongDay(today, locale)}</span>
          {" · "}
          {t("week", { week: isoWeek(today) })}
        </span>
        <span>{t("weekCount", { count: weekCount })}</span>
      </p>
      <div aria-hidden="true" className="h-1 border-y border-b-border-dim border-t-foreground/25" />
    </div>
  );
}

/**
 * The last three Google updates beside the lead (R5), each with its dates and
 * a line as long as it took, so the long ones stand out; one rolling out says
 * which day it is on, its line dashed for the days still to come.
 */
function LatestGoogleUpdates({ updates, today }: { updates: LatestUpdate[] | undefined; today: string }) {
  const t = useTranslations("news.updates");
  const locale = useLocale();
  const scale = Math.max(UPDATE_SCALE_DAYS, ...(updates ?? []).map((update) => rolloutPlace(update, today).length));

  return (
    <aside data-part="latest-google-updates" aria-labelledby="news-google-updates" className="flex flex-col gap-1 border-t border-border-dim pt-7 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-1">
      <p className="flex items-center gap-2 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
        <GoogleMark size={12} />
        {t("label")}
      </p>
      <h3 data-part-title id="news-google-updates" className="mt-1.5 text-[15px] font-semibold text-foreground">{t("title")}</h3>
      <p className="pb-2 text-[12.5px] leading-relaxed text-secondary">{t("description")}</p>
      <CompactList
        rows={updates}
        rowKey={(update) => update._id}
        empty={t("empty")}
        columns={[
          {
            key: "update",
            className: "pl-0 pr-0",
            cell: (update) => {
              const { end, length, day, done } = rolloutPlace(update, today);
              const finished = update.finishedOn !== null;
              return (
                <span className="flex flex-col gap-1">
                  {update.itemId ? (
                    <Link href={storyHref(update.itemId)} className="text-[13.5px] font-medium text-foreground transition-colors hover:text-foreground/80">{update.title}</Link>
                  ) : (
                    <span className="text-[13.5px] font-medium text-foreground">{update.title}</span>
                  )}
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
      <Link href={newsKindHref("GOOGLE_UPDATE")} className="mt-2 inline-flex items-center gap-1.5 self-start text-[13px] text-secondary transition-colors hover:text-foreground">
        {t("all")}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </aside>
  );
}

/** Stories one to a line: when, what kind, the headline — and, for one kind on its own, its summary — and where from. */
function StoryList({ stories, withSummary = false }: { stories: Story[]; withSummary?: boolean }) {
  const locale = useLocale();
  return (
    <CompactList
      rows={stories}
      rowKey={(story) => story.key}
      empty=""
      columns={[
        {
          key: "when",
          className: "w-28 whitespace-nowrap pl-0 align-top text-[12px] tabular-nums text-muted",
          cell: (story) => <time dateTime={new Date(story.publishedAt).toISOString()}>{formatWireDay(story.publishedAt, locale)}</time>,
        },
        { key: "kind", className: "w-6 pl-0 pr-0 align-top pt-[13px]", cell: (story) => <KindIcon kind={story.kind} size={15} /> },
        {
          key: "story",
          className: "w-full max-w-0 align-top",
          cell: (story) => (
            <span className="flex flex-col gap-1">
              <Link href={story.href} className="block truncate text-[14px] text-foreground transition-colors hover:text-foreground/80">{story.title}</Link>
              {withSummary && story.summary ? <span className="line-clamp-2 text-[13px] leading-relaxed text-secondary">{story.summary}</span> : null}
            </span>
          ),
        },
        {
          key: "source",
          align: "right",
          className: "hidden whitespace-nowrap pr-0 align-top text-[12.5px] text-secondary sm:table-cell",
          cell: (story) => story.sourceName,
        },
      ]}
    />
  );
}

function ShowMore({ feed }: { feed: { status: string; loadMore: (count: number) => void } }) {
  const t = useTranslations("news.front");
  if (feed.status !== "CanLoadMore") return null;
  return (
    <Button data-part="show-more" variant="ghost" onClick={() => feed.loadMore(PAGE)} className="self-start px-0 text-[13px] text-secondary hover:bg-transparent hover:text-foreground">
      {t("showMore")}
    </Button>
  );
}
