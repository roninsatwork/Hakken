"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { AtSign, Briefcase, CirclePlay, ExternalLink, Globe, Users, type LucideIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { FollowKind } from "@/convex/newsSchema";
import useDebounce from "@/src/hooks/useDebounce";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { PaginationFooter, SearchBar } from "@/src/ui/components/screens/Table";
import { cn } from "@/src/ui/lib/utils";
import { LearnShell } from "../_learn/LearnShell";
import { ABOVE_PANEL, Dateline, LIST_HEADING, PANEL, PanelLink } from "../_learn/StoryParts";
import { useSiteListPage } from "../sites/_components/useSitePagedTable";

type Follow = FunctionReturnType<typeof api.newsFollows.listPicks>[number];

const KINDS: FollowKind[] = ["X", "YOUTUBE", "LINKEDIN", "WEBSITE"];
const KIND_ICONS: Record<FollowKind, LucideIcon> = { X: AtSign, YOUTUBE: CirclePlay, LINKEDIN: Briefcase, WEBSITE: Globe };

/**
 * Who to follow (docs/plans/active/insights-helpful-content-plan.md, IH13,
 * board 8 — option C): the dateline; "Our picks", up to four in the order
 * Anthony picked them, hidden when none; then everyone, searched and filtered
 * by Where and Topic on the server, A to Z in two close columns, one numbered
 * page at a time with its exact total (IH21). Clicking anyone opens their page
 * in a new tab.
 */
export default function WhoToFollowPage() {
  const t = useTranslations("learn.follow");
  const tKinds = useTranslations("news.followKinds");
  const language = useLocale();
  const { platformName } = useSystemSettings();
  const picks = useQuery(api.newsFollows.listPicks, { language });
  const totals = useQuery(api.newsFollows.getFollowTotals, {});
  const topics = useQuery(api.topics.listTopics, { language });
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [topic, setTopic] = useState("");
  const searched = useDebounce(search, 300).trim();
  const { pageRows, footer } = useSiteListPage(api.newsFollows.listFollowsByPage, {
    language,
    ...(searched ? { search: searched } : {}),
    ...(kind ? { kind: kind as FollowKind } : {}),
    ...(topic ? { topic } : {}),
  });
  // A new search or filter starts at page one.
  const narrow = (set: (value: string) => void) => (value: string) => {
    set(value);
    if (footer.page > 1) footer.onPageChange(1);
  };
  const places = totals ? KINDS.filter((entry) => (totals.byKind[entry] ?? 0) > 0).length : 0;
  const half = Math.ceil((pageRows?.length ?? 0) / 2);
  const narrowed = Boolean(searched || kind || topic);

  return (
    <LearnShell header={<PageHeader icon={<Users className="h-6 w-6 text-brand" />} title={t("title")} description={t("description")} divider />}>
      {totals !== undefined && totals.all === 0 ? (
        <HakkenEmptyState icon={Users} title={t("emptyTitle")} description={t("empty")} />
      ) : (
        <div className="flex flex-col">
          <Dateline
            left={<><span className="font-medium text-foreground">{t("peopleCount", { count: totals?.all ?? 0 })}</span>{" · "}{t("placeCount", { count: places })}</>}
            right={t("chosenBy", { platformName })}
          />

          <OurPicks picks={picks} />

          <div className="flex flex-col gap-4 pt-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-[240px] flex-1">
                <SearchBar value={search} onChange={narrow(setSearch)} placeholder={t("searchPlaceholder")} />
              </div>
              <Select chip={{ label: t("filters.where"), choice: kind ? tKinds(kind) : null }} value={kind} onChange={narrow(setKind)} aria-label={t("filters.where")}>
                <option value="">{t("filters.allPlaces")}</option>
                {KINDS.map((entry) => (
                  <option key={entry} value={entry}>{tKinds(entry)}</option>
                ))}
              </Select>
              <Select
                chip={{ label: t("filters.topic"), choice: topic ? topics?.find((entry) => entry.key === topic)?.name ?? null : null }}
                value={topic}
                onChange={narrow(setTopic)}
                aria-label={t("filters.topic")}
              >
                <option value="">{t("filters.allTopics")}</option>
                {(topics ?? []).map((entry) => (
                  <option key={entry.key} value={entry.key}>{entry.name}</option>
                ))}
              </Select>
            </div>

            {pageRows === undefined ? (
              <div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />
            ) : pageRows.length === 0 ? (
              <p className="py-6 text-[13px] text-secondary">{narrowed ? t("noMatch") : t("empty")}</p>
            ) : (
              <div data-part="follow-columns" className="grid grid-cols-1 gap-x-10 md:grid-cols-2">
                <FollowColumn follows={pageRows.slice(0, half)} />
                <FollowColumn follows={pageRows.slice(half)} />
              </div>
            )}

            <PaginationFooter {...footer} />
          </div>
        </div>
      )}
    </LearnShell>
  );
}

/** "Our picks": up to four, side by side, each panel one link to their page in a new tab (IH13, IH17); nothing when none. */
function OurPicks({ picks }: { picks: Follow[] | undefined }) {
  const t = useTranslations("learn.follow");
  const tKinds = useTranslations("news.followKinds");
  if (!picks || picks.length === 0) return null;
  return (
    <section data-part="our-picks" aria-labelledby="follow-picks" className="flex flex-col gap-4 border-b border-border-dim py-6">
      <h3 data-part-title id="follow-picks" className={LIST_HEADING}>{t("picks")}</h3>
      <div className="-mx-5 grid grid-cols-1 md:grid-cols-4">
        {picks.map((pick) => {
          const Icon = KIND_ICONS[pick.kind];
          return (
            <article key={pick._id} className={cn(PANEL, "flex min-w-0 flex-col gap-1.5 px-5 py-4 md:border-l md:border-border-dim md:first:border-l-0")}>
              <p className="flex items-center gap-2 whitespace-nowrap text-[12px] text-secondary">
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-foreground/85">{tKinds(pick.kind)}</span>
              </p>
              <h4 className="text-[15px] font-semibold text-foreground">
                <PanelLink href={pick.url} external className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground/80">
                  {pick.name}
                  <ExternalLink className="h-3.5 w-3.5 text-secondary" aria-hidden="true" />
                </PanelLink>
              </h4>
              <p className="line-clamp-2 text-[13px] leading-relaxed text-secondary">{pick.why}</p>
              <a
                href={pick.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`${ABOVE_PANEL} mt-0.5 inline-flex items-center gap-1.5 self-start text-[12.5px] text-secondary underline decoration-foreground/25 underline-offset-4 transition-colors hover:text-foreground`}
              >
                {t(`visit.${pick.kind}`)}
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** One of the two close columns: where they post, their name, and why on one line; each row opens their page in a new tab. */
function FollowColumn({ follows }: { follows: Follow[] }) {
  const tKinds = useTranslations("news.followKinds");
  if (follows.length === 0) return null;
  return (
    <div className="-mx-4">
      <CompactList
        rows={follows}
        rowKey={(follow) => follow._id}
        empty=""
        rowLink={{ href: (follow) => follow.url, label: (follow) => follow.name, external: true }}
        columns={[
          {
            key: "person",
            className: "w-full max-w-0",
            cell: (follow) => {
              const Icon = KIND_ICONS[follow.kind];
              return (
                <span className="flex flex-col gap-0.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon className="h-3.5 w-3.5 shrink-0 text-secondary" aria-label={tKinds(follow.kind)} />
                    <span className="truncate text-[14px] text-foreground">{follow.name}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-secondary" aria-hidden="true" />
                  </span>
                  <span className="block truncate pl-6 text-[12.5px] text-secondary">{follow.why}</span>
                </span>
              );
            },
          },
        ]}
      />
    </div>
  );
}
