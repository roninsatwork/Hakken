"use client";

import { useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { AtSign, ExternalLink, Globe, Newspaper, PlayCircle, Sparkles, type LucideIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { NewsItemKind } from "@/convex/newsSchema";
import Header from "@/src/ui/components/layout/Header";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { Button } from "@/src/ui/components/screens/Button";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { formatDate } from "@/src/lib/dates";

type Item = FunctionReturnType<typeof api.news.listNewsItems>["page"][number];

/** Items read at a time; "Show more" reads the next as many. */
const PAGE = 20;

const KINDS: NewsItemKind[] = ["GOOGLE_UPDATE", "X", "YOUTUBE", "WEBSITE"];

const KIND_ICONS: Record<NewsItemKind, LucideIcon> = { GOOGLE_UPDATE: Sparkles, X: AtSign, YOUTUBE: PlayCircle, WEBSITE: Globe };

/**
 * News (docs/plans/active/knowledge-news-and-digest-plan.md, phase 3, D4):
 * every signed-in user's, newest first — Google updates, and what the News
 * Collector brings from X, YouTube and websites (phase 5) — each with its
 * source and date, a plain summary, what it means for them, and the original,
 * in their language once the Translator has it. "Who to follow" sits beside
 * it.
 */
export default function NewsPage() {
  const t = useTranslations("news");
  const language = useLocale();
  const [kind, setKind] = useState<NewsItemKind | "">("");
  const items = usePaginatedQuery(api.news.listNewsItems, kind ? { kind, language } : { language }, { initialNumItems: PAGE });
  const follows = useQuery(api.newsFollows.listFollows, { language });

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <PageHeader
          icon={<Newspaper className="h-6 w-6 text-brand" />}
          title={t("title")}
          description={t("description")}
          divider
          action={
            <Select chip={{ label: t("kindFilter"), choice: kind ? t(`kinds.${kind}`) : null }} value={kind} onChange={(value) => setKind(value as NewsItemKind | "")}>
              <option value="">{t("allKinds")}</option>
              {KINDS.map((entry) => (
                <option key={entry} value={entry}>{t(`kinds.${entry}`)}</option>
              ))}
            </Select>
          }
        />

        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section aria-label={t("feedLabel")} className="flex flex-col gap-4">
            {items.status === "LoadingFirstPage" ? (
              <div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />
            ) : items.results.length === 0 ? (
              <HakkenEmptyState icon={Newspaper} title={t("emptyTitle")} description={kind ? t("emptyKind") : t("empty")} />
            ) : (
              items.results.map((item) => <NewsCard key={item._id} item={item} />)
            )}
            {items.status === "CanLoadMore" ? (
              <Button variant="outline" onClick={() => items.loadMore(PAGE)} className="self-center">
                {t("loadMore")}
              </Button>
            ) : null}
          </section>

          <aside aria-labelledby="news-who-to-follow" className="flex flex-col gap-3">
            <h2 id="news-who-to-follow" className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">{t("whoToFollow")}</h2>
            {follows === undefined ? null : follows.length === 0 ? (
              <p className="text-[13px] text-secondary">{t("whoToFollowEmpty")}</p>
            ) : (
              follows.map((follow) => (
                <a
                  key={follow._id}
                  href={follow.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col gap-1 rounded-2xl border border-border-dim bg-card/40 px-4 py-3 transition-colors hover:bg-foreground/[0.03]"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[14px] font-medium text-foreground">{follow.name}</span>
                    <span className="text-[11px] text-secondary">{t(`followKinds.${follow.kind}`)}</span>
                  </span>
                  <span className="text-[12.5px] leading-relaxed text-secondary">{follow.why}</span>
                </a>
              ))
            )}
          </aside>
        </div>
      </div>
    </>
  );
}

/** One item: where it came from and when, what it says, what it means for the reader, and the way to the original. */
function NewsCard({ item }: { item: Item }) {
  const t = useTranslations("news");
  const Icon = KIND_ICONS[item.kind];
  const { summary, meaning } = item;
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-border-dim bg-card/40 px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-secondary">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{t(`kind.${item.kind}`)}</span>
        <span aria-hidden="true">·</span>
        <span>{item.sourceName}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={new Date(item.publishedAt).toISOString()}>{formatDate(item.publishedAt)}</time>
      </div>
      <h2 className="text-[15px] font-semibold leading-snug text-foreground">{item.title}</h2>
      {summary ? <p className="max-w-2xl text-[13.5px] leading-relaxed text-foreground/90">{summary}</p> : null}
      {meaning ? (
        <div className="max-w-2xl rounded-xl bg-foreground/[0.04] px-4 py-3">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">{t("meaning")}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-secondary">{meaning}</p>
        </div>
      ) : null}
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 self-start text-[12.5px] text-secondary underline underline-offset-4 hover:text-foreground"
      >
        {t("readOriginal")}
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </a>
    </article>
  );
}
