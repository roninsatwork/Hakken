"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Scale } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteLineChart } from "../../../_components/SiteCharts";
import { formatMonth, formatNumber, toCsv } from "../../../_components/siteFormat";
import { ListDownload } from "../../../_components/SiteDownloads";
import { useSite, useSiteId } from "../../../_components/useSite";
import { businessRecord, useSiteListHref, useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSitePager } from "../../../_components/useSitePagedTable";
import { useSiteSortedList, type SiteSortColumns } from "../../../_components/useSiteSort";
import { BusinessCell, FigureCell, LocalSetupNotice, OfficeSwitch, ratingText, useOfficeId, useOfficeName } from "../../local/_components/LocalParts";

type Row = {
  listingId: string;
  name: string;
  source: "GOOGLE" | "TRUSTPILOT" | "TRIPADVISOR";
  you: boolean;
  rating: number | null;
  reviews: number | null;
  newIn30: number | null;
  answered: number | null;
  daysToAnswer: number | null;
};

const SORTS: SiteSortColumns<Row, "business" | "rating" | "reviews" | "new" | "answered" | "days"> = {
  business: { value: (row) => row.name, first: "asc" },
  rating: { value: (row) => row.rating, first: "desc" },
  reviews: { value: (row) => row.reviews, first: "desc" },
  new: { value: (row) => row.newIn30, first: "desc" },
  answered: { value: (row) => row.answered, first: "desc" },
  days: { value: (row) => row.daysToAnswer, first: "asc" },
};
const nameOf = (row: Row) => `${row.name}${row.source}`;
/** As drawn, without a footer — until there is more than one page. */
const pagedOnly = <Footer extends { totalCount: number; pageSize: number }>(footer: Footer) => (footer.totalCount > footer.pageSize ? footer : undefined);

/**
 * Discovery → Reviews → Against rivals (docs/plans/active/discovery-local-
 * reputation-ai-plan.md, step 2, D18; drawn as "Reviews · Against rivals"):
 * an office's reviews beside the rivals watched against it — how many, how
 * good, how fast each answers — and how fast each collects them.
 */
export default function ReviewsAgainstRivalsPage() {
  const t = useTranslations("sites.reviews.rivals");
  const tr = useTranslations("sites.reviews");
  const tl = useTranslations("sites.local");
  const siteId = useSiteId();
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);
  const listHref = useSiteListHref(siteId);
  const site = useSite();
  const officeId = useOfficeId();
  const officeName = useOfficeName();
  const data = useQuery(api.siteReviews.reviewsAgainstRivals, { siteId, ...(officeId ? { officeId } : {}) });
  const rows = data?.rows as Row[] | undefined;
  const { rows: sorted, tableSort } = useSiteSortedList(rows, SORTS, { opening: "reviews", name: nameOf });
  const pager = useSitePager(sorted, { isLoading: data === undefined });

  const google = (rows ?? []).filter((row) => row.source === "GOOGLE");
  const you = google.find((row) => row.you);
  const byReviews = [...google].sort((left, right) => (right.reviews ?? 0) - (left.reviews ?? 0));
  const leader = byReviews[0];
  const place = you ? byReviews.indexOf(you) + 1 : null;
  const answering = google.filter((row) => row.daysToAnswer !== null).sort((left, right) => left.daysToAnswer! - right.daysToAnswer!);
  const fastest = answering[0];
  const best = [...google].filter((row) => row.rating !== null).sort((left, right) => right.rating! - left.rating!)[0];
  const rivals = (rows ?? []).filter((row) => !row.you && row.source === "GOOGLE").length;
  const chartRows = (data?.months ?? []).map((month, at) => ({
    label: formatMonth(month),
    ...Object.fromEntries((data?.lines ?? []).map((line) => [line.listingId, line.counts[at]])),
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Scale className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={t("description")}
        action={data ? <OfficeSwitch offices={data.offices} open={data.office?.listingId ?? null} /> : undefined}
      />
      {data && !data.office ? <LocalSetupNotice siteId={siteId} reason="noOffice" /> : null}

      {data?.office && you ? (
        <FigureRow>
          <Figure label={t("figures.place")} emphasis value={place === null ? "–" : t("figures.placeOf", { place, of: google.length })} detail={<span className="text-secondary">{t("figures.placeDetail", { office: officeName(data.office) })}</span>} />
          <Figure
            label={t("figures.gap")}
            value={leader && !leader.you ? formatNumber((leader.reviews ?? 0) - (you.reviews ?? 0)) : "0"}
            detail={<span className="text-secondary">{leader && !leader.you && (you.reviews ?? 0) > 0 ? t("figures.gapDetail", { name: leader.name, times: Math.round((leader.reviews ?? 0) / (you.reviews ?? 1)) }) : t("figures.youLead")}</span>}
          />
          <Figure
            label={t("figures.fastest")}
            value={fastest ? t("figures.days", { days: Math.round(fastest.daysToAnswer!) }) : "–"}
            detail={<span className="text-secondary">{fastest ? t("figures.fastestDetail", { name: fastest.you ? tl("youShort") : fastest.name, days: you.daysToAnswer === null ? "–" : Math.round(you.daysToAnswer) }) : t("figures.noReplies")}</span>}
          />
          <Figure label={t("figures.best")} value={ratingText(best?.rating)} detail={<span className="text-secondary">{best ? t("figures.bestDetail", { name: best.you ? tl("youShort") : best.name, rating: ratingText(you.rating) }) : "–"}</span>} />
        </FigureRow>
      ) : null}

      <SiteChartCard
        dated={false}
        title={t("chartTitle")}
        hint={t("chartHint")}
        exportName={`${site?.host ?? "site"}-reviews-against-rivals`}
        csv={() => toCsv([t("chartMonth"), ...(data?.lines ?? []).map((line) => line.name)], chartRows.map((row) => [row.label, ...(data?.lines ?? []).map((line) => (row as Record<string, unknown>)[line.listingId] as number | null)]))}
        enoughData={(data?.lines ?? []).some((line) => line.counts.filter((count) => count !== null).length > 1)}
      >
        <SiteLineChart
          sharedScale
          data={chartRows}
          series={(data?.lines ?? []).map((line, at) => ({
            key: line.listingId,
            name: `${line.you ? tl("youShort") : line.name} · ${formatNumber(line.counts[line.counts.length - 1] ?? 0)}`,
            colour: SITE_SERIES_COLOURS[at % SITE_SERIES_COLOURS.length],
          }))}
        />
      </SiteChartCard>

      <DataTable
        rows={pager.pageRows}
        rowKey={(row) => row.listingId}
        onRowClick={(row) => router.push(row.you ? listHref("reviews") : recordHref(businessRecord({ listingId: row.listingId })!))}
        cardHeader={<TableBar footer={pager.footer} noun="listings" actions={<ListDownload fileName={`${site?.host ?? "site"}-reviews-against-rivals`} rows={sorted ?? []} columns={[{ header: t("columns.business"), value: (row) => row.name }, { header: t("columns.listing"), value: (row) => tr(`sources.${row.source}`) }, { header: t("columns.rating"), value: (row) => row.rating }, { header: t("columns.reviews"), value: (row) => row.reviews }, { header: t("columns.new"), value: (row) => row.newIn30 }, { header: t("columns.answered"), value: (row) => (row.answered === null ? null : Math.round(row.answered * 100)) }, { header: t("columns.days"), value: (row) => (row.daysToAnswer === null ? null : Math.round(row.daysToAnswer)) }]} />}><span className="text-[13px] text-secondary">{t("youAndRivals", { count: rivals })}</span></TableBar>}
        empty={{ icon: <Scale className="h-8 w-8 text-muted/30" />, label: t("empty") }}
        footer={pagedOnly(pager.footer)}
        sort={tableSort}
        columns={[
          { key: "business", header: t("columns.business"), sortable: true, cell: (row) => <BusinessCell name={row.name} sub={null} you={row.you} href={row.you ? listHref("reviews") : recordHref(businessRecord({ listingId: row.listingId })!)} /> },
          { key: "listing", header: t("columns.listing"), cell: (row) => <TagLabel>{tr(`sources.${row.source}`)}</TagLabel> },
          { key: "rating", header: t("columns.rating"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.rating} text={ratingText(row.rating)} /> },
          { key: "reviews", header: t("columns.reviews"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.reviews} /> },
          { key: "new", header: t("columns.new"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.newIn30} /> },
          { key: "answered", header: t("columns.answered"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.answered} text={row.answered === null ? undefined : `${Math.round(row.answered * 100)}%`} /> },
          { key: "days", header: t("columns.days"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.daysToAnswer === null ? null : Math.round(row.daysToAnswer)} /> },
        ]}
      />
    </div>
  );
}
