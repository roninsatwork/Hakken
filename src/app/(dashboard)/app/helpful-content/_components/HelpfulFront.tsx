"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import { Library } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { addDays, localDay } from "../../_learn/learnDates";
import { CountAside, Dateline, LEAD_PANEL, LEAD_SECTION, LEAD_TITLE, LIST_HEADING, PanelLink, ShowMore, StoryColumns, StoryList } from "../../_learn/StoryParts";
import { StoryKicker } from "../../news/_components/NewsStory";
import { useTopicNames } from "../../_learn/useTopicNames";
import { HelpfulBody, helpfulHref, helpfulStory } from "./HelpfulArticle";

/** Articles read at a time; "Show more" reads the next as many. */
export const HELPFUL_PAGE = 20;
/** The articles set in columns under the lead (R5). */
const COLUMNS = 3;

/**
 * Helpful content's front page (docs/plans/active/insights-helpful-content-
 * plan.md, IH5, board 1), as News's is: the dateline, the pinned article —
 * else the newest — leading with where they come from beside it, three in columns, then the rest
 * one to a line and Show more — read from the server a page at a time, the
 * numbers from the counts kept as the list changes (IH21).
 */
export function HelpfulFront() {
  const t = useTranslations("learn.helpful");
  const language = useLocale();
  const { platformName } = useSystemSettings();
  const weekFrom = Date.parse(`${addDays(localDay(), -6)}T00:00:00`);
  const feed = usePaginatedQuery(api.libraryArticles.listForReaders, { language }, { initialNumItems: HELPFUL_PAGE });
  const overview = useQuery(api.libraryArticles.getReaderOverview, {});
  const week = useQuery(api.libraryArticles.listForReadersSince, { language, since: weekFrom });
  const pinned = useQuery(api.libraryArticles.getPinnedForReaders, { language, today: localDay() });

  if (feed.status === "LoadingFirstPage" || pinned === undefined) return <div className="h-64 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />;
  // An article pinned to lead the News front page leads here too (IH11).
  const lead = pinned ?? feed.results[0];
  if (!lead) return <HakkenEmptyState icon={Library} title={t("emptyTitle")} description={t("empty")} />;
  const rest = feed.results.filter((article) => article._id !== lead._id);

  const columns = rest.slice(0, COLUMNS).map(helpfulStory);
  const wire = rest.slice(COLUMNS).map(helpfulStory);
  const publications = overview?.publications ?? [];

  return (
    <div className="flex flex-col">
      <Dateline
        left={<><span className="font-medium text-foreground">{t("articleCount", { count: overview?.all ?? feed.results.length })}</span>{" · "}{t("publicationCount", { count: publications.length })}</>}
        right={t("weekCount", { count: week?.length ?? 0 })}
      />

      <section data-part="lead-story" aria-label={t("leadLabel")} className={LEAD_SECTION}>
        <article className={LEAD_PANEL}>
          <StoryKicker kind="HELPFUL" sourceName={lead.publication} publishedAt={lead.addedAt} />
          <h2 className={LEAD_TITLE}>
            <PanelLink href={helpfulHref(lead._id)} className="transition-colors hover:text-foreground/80">{lead.title}</PanelLink>
          </h2>
          <HelpfulBody article={lead} />
        </article>
        <CountAside
          part="publications"
          icon={<Library className="h-3 w-3" aria-hidden="true" />}
          label={t("publicationsLabel")}
          title={t("publicationsTitle")}
          description={t("publicationsDescription", { platformName })}
          rows={publications.map((publication) => ({
            key: publication.name,
            label: publication.name,
            count: publication.count,
            href: `/app/helpful-content?publication=${encodeURIComponent(publication.name)}`,
          }))}
          countWords={(count) => t("articleCount", { count })}
          link={{ label: t("whoToFollow"), href: "/app/who-to-follow" }}
        />
      </section>

      <StoryColumns stories={columns} label={t("moreLabel")} />

      {wire.length > 0 || feed.status === "CanLoadMore" ? (
        <section data-part="earlier-stories" aria-labelledby="helpful-earlier" className="flex flex-col gap-2 pt-7">
          <h3 data-part-title id="helpful-earlier" className={LIST_HEADING}>{t("earlier")}</h3>
          <StoryList stories={wire} />
          <ShowMore feed={feed} pageSize={HELPFUL_PAGE} />
        </section>
      ) : null}
    </div>
  );
}

/** One topic's or one publication's articles alone, newest added first, with their summaries (IH6), from the server a page at a time. */
export function HelpfulList({ topic, publication }: { topic?: string; publication?: string }) {
  const t = useTranslations("learn.helpful");
  const language = useLocale();
  const topicName = useTopicNames();
  const feed = usePaginatedQuery(
    api.libraryArticles.listForReaders,
    { language, ...(topic ? { topic } : publication ? { publication } : {}) },
    { initialNumItems: HELPFUL_PAGE },
  );

  if (feed.status === "LoadingFirstPage") return <div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />;
  if (feed.results.length === 0) return <HakkenEmptyState icon={Library} title={t("emptyTitle")} description={t("emptyList")} />;

  return (
    <section aria-labelledby="helpful-list" className="flex flex-col gap-2">
      <h2 id="helpful-list" className={`border-b border-border-dim pb-3 ${LIST_HEADING}`}>{(topic ? topicName(topic) : publication) ?? t("title")}</h2>
      <StoryList stories={feed.results.map(helpfulStory)} withSummary />
      <ShowMore feed={feed} pageSize={HELPFUL_PAGE} />
    </section>
  );
}
