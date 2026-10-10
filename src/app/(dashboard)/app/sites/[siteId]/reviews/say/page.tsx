"use client";

import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { ArrowRight, MessagesSquare } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { Button } from "@/src/ui/components/screens/Button";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { FieldHint, SettingsCard } from "@/src/ui/components/screens/SettingsCard";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { PageSection } from "../../../../_components/PageSection";
import { formatDay } from "../../../_components/siteFormat";
import { ListDownload } from "../../../_components/SiteDownloads";
import { useSite, useSiteId } from "../../../_components/useSite";
import { businessRecord, useSiteListHref, useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSitePager } from "../../../_components/useSitePagedTable";
import { useSiteSortedList, type SiteSortColumns } from "../../../_components/useSiteSort";
import { FigureCell, OfficeSwitch, ratingText, useOfficeId } from "../../local/_components/LocalParts";

type Topic = { topic: string; praise: number; complaints: number; complaintsThisYear: number; rivalsPraised: number; topRival: { name: string; reviews: number } | null };
type Verdict = "losing" | "complaints" | "own" | "strength" | "mixed";

const TOPIC_SORTS: SiteSortColumns<Topic, "topic" | "praise" | "complaints" | "rivals"> = {
  topic: { value: (row) => row.topic, first: "asc" },
  praise: { value: (row) => row.praise, first: "desc" },
  complaints: { value: (row) => row.complaints, first: "desc" },
  rivals: { value: (row) => row.rivalsPraised, first: "desc" },
};
const topicOf = (row: Topic) => row.topic;
type Split = { listingId: string; name: string; you: boolean; counts: number[]; rating: number | null };
const starsAt = (row: Split, star: number) => (row.counts.length > 0 ? row.counts[star - 1] ?? 0 : null);
const SPLIT_SORTS: SiteSortColumns<Split, string> = {
  business: { value: (row) => row.name, first: "asc" },
  ...Object.fromEntries([5, 4, 3, 2, 1].map((star) => [`star${star}`, { value: (row: Split) => starsAt(row, star), first: "desc" as const }])),
  rating: { value: (row) => row.rating, first: "desc" },
};
const splitName = (row: Split) => row.name;
const STAR_COLUMNS = [5, 4, 3, 2, 1] as const;
/** Rivals' reviews praising a topic this many times over yours: it is theirs. */
const LOSING_TIMES = 5;

/** Where a topic stands against rivals: losing it to them, complained about, rarely won by rivals, a strength — else mixed. */
function topicVerdict(topic: Pick<Topic, "praise" | "complaints" | "rivalsPraised">): Verdict {
  if (topic.rivalsPraised > 0 && topic.rivalsPraised >= LOSING_TIMES * Math.max(1, topic.praise)) return "losing";
  if (topic.complaints > topic.praise) return "complaints";
  if (topic.praise > 0 && topic.praise > topic.rivalsPraised) return "own";
  if (topic.praise > topic.complaints) return "strength";
  return "mixed";
}
const VERDICT_TONE = { losing: "danger", complaints: "warning", own: "success", strength: "success", mixed: "neutral" } as const;
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);
/** A fraction of a dollar to one figure that counts; whole cents above a cent. */
const dollars = (usd: number) => (usd < 0.01 ? `$${Number(usd.toPrecision(1))}` : `$${usd.toFixed(2)}`);

/**
 * Discovery → Reviews → What customers say (docs/plans/active/discovery-
 * local-reputation-ai-plan.md, step 2, D4, D18; drawn as "More · What
 * customers say"): what the company's own reviews praise and complain about,
 * as its AI read them, beside what rivals' reviews talk about; how each
 * business's stars split; and a reply drafted for each review still waiting.
 */
export default function WhatCustomersSayPage() {
  const t = useTranslations("sites.reviews.say");
  const tr = useTranslations("sites.reviews");
  const tl = useTranslations("sites.local");
  const siteId = useSiteId();
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);
  const listHref = useSiteListHref(siteId);
  const site = useSite();
  const officeId = useOfficeId();
  const data = useQuery(api.siteReviews.whatCustomersSay, { siteId, ...(officeId ? { officeId } : {}) });
  const topicsSorted = useSiteSortedList(data?.topics, TOPIC_SORTS, { opening: "praise", name: topicOf, table: "topics" });
  const topicsPager = useSitePager(topicsSorted.rows, { isLoading: data === undefined, table: "topics" });
  const splitSorted = useSiteSortedList(data?.stars, SPLIT_SORTS, { opening: "star5", name: splitName, table: "stars" });
  const [copied, setCopied] = useState<string | null>(null);
  const { platformName } = useSystemSettings();

  const topics = data?.topics ?? [];
  const praised = [...topics].sort((left, right) => right.praise - left.praise)[0];
  const complained = [...topics].sort((left, right) => right.complaints - left.complaints)[0];
  const rivalsFor = [...topics].sort((left, right) => right.rivalsPraised - left.rivalsPraised)[0];
  const own = (data?.stars ?? []).filter((entry) => entry.you);
  const rivals = (data?.stars ?? []).filter((entry) => !entry.you);
  const sum = (entries: typeof own, star: number) => entries.reduce((total, entry) => total + (entry.counts[star - 1] ?? 0), 0);
  const all = (entries: typeof own) => STAR_COLUMNS.reduce((total, star) => total + sum(entries, star), 0);
  const fiveStar = share(sum(own, 5), all(own));
  const rivalsFive = share(sum(rivals, 5), all(rivals));
  const oneStar = share(sum(own, 1), all(own));
  const reviewsRead = data ? data.read + data.unread : 0;
  const fileBase = `${site?.host ?? "site"}-what-customers-say`;
  const verdictWords = (topic: Topic) => t(`verdicts.${topicVerdict(topic)}`);
  const reviewsHref = `/app/sites/${siteId}/reviews${officeId ? `?office=${officeId}` : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<MessagesSquare className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={t("description")}
        action={data ? <OfficeSwitch offices={data.offices} open={officeId ?? null} allOffices /> : undefined}
      />
      {data && data.unread > 0 ? <Notice>{t("reading", { count: data.unread })}</Notice> : null}

      {data ? (
        <FigureRow>
          <Figure label={t("figures.praised")} value={praised && praised.praise > 0 ? capital(praised.topic) : "–"} detail={<span className="text-secondary">{praised && praised.praise > 0 ? t("figures.inReviews", { count: praised.praise }) : t("figures.nothingYet")}</span>} />
          <Figure
            label={t("figures.complained")}
            emphasis
            value={complained && complained.complaints > 0 ? capital(complained.topic) : "–"}
            detail={<span className="text-secondary">{complained && complained.complaints > 0 ? t("figures.complainedDetail", { count: complained.complaints, thisYear: complained.complaintsThisYear }) : t("figures.noComplaints")}</span>}
          />
          <Figure
            label={t("figures.rivalsFor")}
            value={rivalsFor && rivalsFor.rivalsPraised > 0 ? capital(rivalsFor.topic) : "–"}
            detail={<span className="text-secondary">{rivalsFor?.topRival && rivalsFor.rivalsPraised > 0 ? t("figures.rivalsForDetail", { name: rivalsFor.topRival.name, count: rivalsFor.topRival.reviews, yours: rivalsFor.praise }) : t("figures.noRivals")}</span>}
          />
          <Figure
            label={t("figures.fiveStar")}
            value={fiveStar === null ? "–" : `${fiveStar}%`}
            detail={<span className="text-secondary">{[rivalsFive === null ? null : t("figures.rivalsShare", { share: rivalsFive }), oneStar === null ? null : t("figures.oneStar", { share: oneStar })].filter(Boolean).join(" · ") || "–"}</span>}
          />
        </FigureRow>
      ) : null}

      <PageSection tight title={t("topics.title")} description={t("topics.description")}>
        <DataTable
          rows={topicsPager.pageRows}
          rowKey={(row) => row.topic}
          onRowClick={(row) => router.push(listHref("reviews", { q: row.topic }))}
          cardHeader={<TableBar footer={topicsPager.footer} noun="topics" actions={<ListDownload fileName={`${fileBase}-topics`} rows={topicsSorted.rows ?? []} columns={[{ header: t("topics.columns.topic"), value: (row) => row.topic }, { header: t("topics.columns.praise"), value: (row) => row.praise }, { header: t("topics.columns.complaints"), value: (row) => row.complaints }, { header: t("topics.columns.rivals"), value: (row) => row.rivalsPraised }, { header: t("topics.columns.against"), value: verdictWords }]} />}>{reviewsRead > 0 ? <span className="text-[13px] text-secondary">{t("topics.from", { count: reviewsRead })}</span> : null}</TableBar>}
          empty={{ icon: <MessagesSquare className="h-8 w-8 text-muted/30" />, label: t("topics.empty") }}
          footer={topicsPager.footer.totalCount > topicsPager.footer.pageSize ? topicsPager.footer : undefined}
          sort={topicsSorted.tableSort}
          columns={[
            { key: "topic", header: t("topics.columns.topic"), sortable: true, cell: (row) => <Link href={`${reviewsHref}${reviewsHref.includes("?") ? "&" : "?"}q=${encodeURIComponent(row.topic)}`} className="text-[13px] text-foreground hover:underline">{row.topic}</Link> },
            { key: "praise", header: t("topics.columns.praise"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.praise} /> },
            { key: "complaints", header: t("topics.columns.complaints"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.complaints} /> },
            { key: "rivals", header: t("topics.columns.rivals"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.rivalsPraised} /> },
            { key: "against", header: t("topics.columns.against"), cell: (row) => <StatusLabel tone={VERDICT_TONE[topicVerdict(row)]}>{verdictWords(row)}</StatusLabel> },
          ]}
        />
      </PageSection>

      <PageSection tight title={t("stars.title")} description={t("stars.description")}>
        <DataTable
          rows={splitSorted.rows}
          rowKey={(row) => row.listingId}
          onRowClick={(row) => router.push(row.you ? listHref("reviews") : recordHref(businessRecord({ listingId: row.listingId })!))}
          sort={splitSorted.tableSort}
          rowClassName={(row) => (row.you ? "bg-brand/5" : "")}
          empty={{ icon: <MessagesSquare className="h-8 w-8 text-muted/30" />, label: t("stars.empty") }}
          columns={[
            { key: "business", header: t("stars.columns.business"), sortable: true, cell: (row) => <span className="text-[13px] text-foreground">{row.you ? tl("you", { name: row.name }) : row.name}</span> },
            ...STAR_COLUMNS.map((star) => ({
              key: `star${star}`,
              header: t("stars.columns.stars", { count: star }),
              align: "right" as const,
              sortable: true,
              cell: (row: Split) => <FigureCell value={starsAt(row, star)} />,
            })),
            { key: "rating", header: t("stars.columns.rating"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.rating} text={ratingText(row.rating)} /> },
          ]}
        />
      </PageSection>

      {data && data.waiting > 0 ? (
        <SettingsCard title={t("drafts.title")}>
          <FieldHint>{data.perReplyUsd === null ? t("drafts.hintUnpriced", { platformName }) : t("drafts.hint", { platformName, cost: dollars(data.perReplyUsd) })}</FieldHint>
          {data.drafts.length === 0 ? <p className="text-[12px] text-secondary">{t("drafts.none")}</p> : null}
          {data.drafts.map((draft, at) => {
            const key = `${draft.listingId}|${draft.reviewId}`;
            const where = draft.source === "GOOGLE" && draft.town ? `${tr("sources.GOOGLE")} · ${draft.town}` : tr(`sources.${draft.source}`);
            return (
              <Fragment key={key}>
                <div className={at > 0 ? "mt-2 flex flex-col gap-1.5" : "flex flex-col gap-1.5"}>
                  <p className="text-[13px] leading-relaxed text-foreground">“{draft.text}”</p>
                  <p className="text-[12px] text-secondary">{[draft.name, t("drafts.stars", { count: draft.stars }), where, formatDay(draft.day)].filter(Boolean).join(" · ")}</p>
                </div>
                <Notice
                  action={(
                    <Button
                      variant="quiet"
                      onClick={() => {
                        void navigator.clipboard?.writeText(draft.reply);
                        setCopied(key);
                      }}
                    >
                      {copied === key ? t("drafts.copied") : t("drafts.copy")}
                    </Button>
                  )}
                >
                  {draft.reply}
                </Notice>
              </Fragment>
            );
          })}
          <Link href={`${reviewsHref}${reviewsHref.includes("?") ? "&" : "?"}answered=waiting`} className="inline-flex items-center gap-1.5 text-[12px] text-secondary hover:text-foreground">
            {t("drafts.seeAll", { count: data.waiting })}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </SettingsCard>
      ) : null}
    </div>
  );
}
