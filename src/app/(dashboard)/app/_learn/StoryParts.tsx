"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { LAYER } from "@/src/ui/lib/layers";
import { cn } from "@/src/ui/lib/utils";
import { Button } from "@/src/ui/components/screens/Button";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { KindIcon, StoryKicker, type StoryKind } from "../news/_components/NewsStory";
import { formatWireDay } from "./learnDates";

/**
 * Insights' shared parts (docs/plans/active/insights-helpful-content-plan.md):
 * the News front page's own pieces — its dateline, its story columns and its
 * one-line list — made one set for News, Knowledge, Helpful content and Who to
 * follow, each panel one link that lights when the mouse is over it (IH17).
 */

/** A story on a list: a News item, a Knowledge article or a Helpful content article. */
export type Story = { key: string; kind: StoryKind; title: string; summary: string; sourceName: string; publishedAt: number; href: string };

/** A panel that is one link and lights on hover (IH17): square, between the rules already there — no box. */
export const PANEL = "relative transition-colors hover:bg-hover";
/** What a link inside a panel wears to stay clickable above the panel's own link. */
export const ABOVE_PANEL = `relative ${LAYER.RAISED}`;

/** A panel's own link: its words, and an overlay over the whole panel. */
export function PanelLink({ href, external = false, className, children }: { href: string; external?: boolean; className?: string; children: ReactNode }) {
  const overlay = <span aria-hidden="true" className="absolute inset-0" />;
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {overlay}
      {children}
    </a>
  ) : (
    <Link href={href} className={className}>
      {overlay}
      {children}
    </Link>
  );
}

/** A page's dateline, as the News front page prints its day: what is on the page, over a double rule. */
export function Dateline({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div data-part="dateline" className="flex flex-col gap-2.5">
      <p className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 font-mono text-[11px] uppercase tracking-[0.2em] text-secondary">
        <span>{left}</span>
        <span>{right}</span>
      </p>
      <div aria-hidden="true" className="h-1 border-y border-b-border-dim border-t-foreground/25" />
    </div>
  );
}

/** Three stories in columns under a lead, divided by rules (R5), each column one link. */
export function StoryColumns({ stories, label }: { stories: Story[]; label: string }) {
  if (stories.length === 0) return null;
  return (
    <section data-part="story-columns" aria-label={label} className="border-b border-border-dim py-2">
      <div className="-mx-5 grid grid-cols-1 md:grid-cols-3">
        {stories.map((story) => (
          <article key={story.key} className={cn(PANEL, "flex min-w-0 flex-col gap-3 px-5 py-5 md:border-l md:border-border-dim md:first:border-l-0")}>
            <StoryKicker kind={story.kind} sourceName={story.sourceName} publishedAt={story.publishedAt} />
            <h3 className="text-[18px] font-bold leading-snug tracking-[-0.02em] text-foreground">
              <PanelLink href={story.href} className="transition-colors hover:text-foreground/80">{story.title}</PanelLink>
            </h3>
            {story.summary ? <p className="line-clamp-5 text-[13.5px] leading-relaxed text-secondary">{story.summary}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

/** Stories one to a line: when, what kind, the headline — and, on a list of one kind, its summary — and where from; each row one link. */
export function StoryList({ stories, withSummary = false }: { stories: Story[]; withSummary?: boolean }) {
  const locale = useLocale();
  return (
    <div className="-mx-4">
      <CompactList
        rows={stories}
        rowKey={(story) => story.key}
        empty=""
        rowLink={{ href: (story) => story.href, label: (story) => story.title }}
        columns={[
          {
            key: "when",
            className: "w-28 whitespace-nowrap align-top text-[12px] tabular-nums text-muted",
            cell: (story) => <time dateTime={new Date(story.publishedAt).toISOString()}>{formatWireDay(story.publishedAt, locale)}</time>,
          },
          { key: "kind", className: "w-6 pl-0 pr-0 align-top pt-[13px]", cell: (story) => <KindIcon kind={story.kind} size={15} /> },
          {
            key: "story",
            className: "w-full max-w-0 align-top",
            cell: (story) => (
              <span className="flex flex-col gap-1">
                <span className="block truncate text-[14px] text-foreground">{story.title}</span>
                {withSummary && story.summary ? <span className="line-clamp-2 text-[13px] leading-relaxed text-secondary">{story.summary}</span> : null}
              </span>
            ),
          },
          {
            key: "source",
            align: "right",
            className: "hidden whitespace-nowrap align-top text-[12.5px] text-secondary sm:table-cell",
            cell: (story) => story.sourceName,
          },
        ]}
      />
    </div>
  );
}

/** "Show more" under a list read a page at a time from the server (IH21). */
export function ShowMore({ feed, pageSize }: { feed: { status: string; loadMore: (count: number) => void }; pageSize: number }) {
  const t = useTranslations("news.front");
  if (feed.status !== "CanLoadMore") return null;
  return (
    <Button data-part="show-more" variant="ghost" onClick={() => feed.loadMore(pageSize)} className="self-start px-0 text-[13px] text-secondary hover:bg-transparent hover:text-foreground">
      {t("showMore")}
    </Button>
  );
}

/** A side panel of counts beside a lead — topics, or publications — each row one link (IH5, IH12). */
export function CountAside({
  part,
  icon,
  label,
  title,
  description,
  rows,
  countWords,
  link,
}: {
  part: string;
  icon?: ReactNode;
  label: string;
  title: string;
  description: string;
  rows: Array<{ key: string; label: string; count: number; href: string }>;
  countWords: (count: number) => string;
  link?: { label: string; href: string };
}) {
  return (
    <aside data-part={part} aria-label={title} className="flex flex-col gap-1 border-t border-border-dim pt-7 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-5">
      <p className="flex items-center gap-2 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
        {icon}
        {label}
      </p>
      <h3 data-part-title className="mt-1.5 text-[15px] font-semibold text-foreground">{title}</h3>
      <p className="pb-2 text-[12.5px] leading-relaxed text-secondary">{description}</p>
      <div className="-mx-4">
        <CompactList
          rows={rows}
          rowKey={(row) => row.key}
          empty=""
          rowLink={{ href: (row) => row.href, label: (row) => row.label }}
          columns={[
            { key: "label", cell: (row) => <span className="text-[13.5px] font-medium text-foreground">{row.label}</span> },
            { key: "count", align: "right", className: "whitespace-nowrap text-[12px] tabular-nums text-secondary", cell: (row) => countWords(row.count) },
          ]}
        />
      </div>
      {link ? (
        <Link href={link.href} className="mt-2 inline-flex items-center gap-1.5 self-start text-[13px] text-secondary transition-colors hover:text-foreground">
          {link.label}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      ) : null}
    </aside>
  );
}

/** An article's facts on one quiet line — its topic, how long it takes to read, when it was published. */
export function ArticleFacts({ facts }: { facts: Array<string | null | undefined | false> }) {
  const shown = facts.filter((fact): fact is string => Boolean(fact));
  if (shown.length === 0) return null;
  return (
    <p data-part="article-facts" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
      {shown.map((fact, index) => (
        <span key={fact} className="inline-flex items-center gap-2">
          {index > 0 ? <span aria-hidden="true">·</span> : null}
          {fact}
        </span>
      ))}
    </p>
  );
}

/** Words a minute an article's reading time is reckoned at, rounded up (the plan's limits). */
export const READING_WORDS_A_MINUTE = 230;
export const readingMinutes = (words: number) => Math.max(1, Math.ceil(words / READING_WORDS_A_MINUTE));

/** The panel a lead story sits in — the whole of it one link (IH17) — beside the side panel that follows it. */
export const LEAD_PANEL = cn(PANEL, "-ml-5 flex min-w-0 flex-col gap-4 py-5 pl-5 pr-5 lg:pr-9");
/** The section that holds a lead story and its side panel. */
export const LEAD_SECTION = "grid grid-cols-1 gap-8 border-b border-border-dim py-2 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-0";
/** A lead story's headline. */
export const LEAD_TITLE = "text-[28px] font-extrabold leading-[1.08] tracking-[-0.035em] text-foreground sm:text-[38px]";
/** A section heading over a one-line list, as News's "Earlier". */
export const LIST_HEADING = "text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted";
