"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { MessageSquareText } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Change } from "@/src/ui/components/screens/Change";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { SiteChartCard } from "../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteBarChart } from "../../_components/SiteCharts";
import { formatDay, formatMonth, toCsv } from "../../_components/siteFormat";
import { ListDownload } from "../../_components/SiteDownloads";
import { useSite, useSiteId } from "../../_components/useSite";
import { useSitePager } from "../../_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../_components/useSiteSort";
import { FigureCell, LocalSetupNotice, OfficeSwitch, ratingText, useOfficeId } from "../local/_components/LocalParts";

type Row = { listingId: string; id: string; day: string; stars: number; text: string | null; name: string | null; guide: boolean; replyDay: string | null; replyRough: boolean };

const STARS = ["low", "high"] as const;
const ANSWERS = ["waiting", "answered"] as const;
const DAY_MS = 86_400_000;

const SORTS: SiteSortColumns<Row, "date" | "stars" | "answered"> = {
  date: { value: (row) => row.day, first: "desc" },
  stars: { value: (row) => row.stars, first: "desc" },
  answered: { value: (row) => row.replyDay, first: "desc" },
};
const idOf = (row: Row) => row.id;
const daysBetween = (from: string, to: string) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS));

/**
 * Discovery → Reviews → Your reviews (docs/plans/active/discovery-local-
 * reputation-ai-plan.md, step 2, D18; drawn as "Reviews · Your reviews"):
 * every review on the company's own listings, newest first, and whether it
 * was answered — the reviews a month and their stars above.
 */
export default function YourReviewsPage() {
  const t = useTranslations("sites.reviews.yours");
  const tr = useTranslations("sites.reviews");
  const siteId = useSiteId();
  const site = useSite();
  const officeId = useOfficeId();
  const data = useQuery(api.siteReviews.yourReviews, { siteId, ...(officeId ? { officeId } : {}) });
  const [search, setSearch, term] = useSiteSearch();
  const [listing, setListing] = useSiteParam<string>("listing", "");
  const [stars, setStars] = useSiteParam<(typeof STARS)[number] | "">("stars", "", STARS);
  const [answer, setAnswer] = useSiteParam<(typeof ANSWERS)[number] | "">("answered", "", ANSWERS);

  const listingName = (id: string) => {
    const entry = data?.listings.find((candidate) => candidate.listingId === id);
    if (!entry) return "";
    return entry.source === "GOOGLE" && entry.town ? `${tr("sources.GOOGLE")} · ${entry.town}` : tr(`sources.${entry.source}`);
  };
  const matches = wordStartMatcher(term);
  const matching = (data?.rows as Row[] | undefined)?.filter((row) => (!matches || matches(row.text, row.name))
    && (!listing || row.listingId === listing)
    && (!stars || (stars === "low" ? row.stars <= 3 : row.stars >= 4))
    && (!answer || (answer === "waiting" ? !row.replyDay : Boolean(row.replyDay))));
  const { rows: sorted, tableSort } = useSiteSortedList(matching, SORTS, { opening: "date", name: idOf });
  const pager = useSitePager(sorted, { isLoading: data === undefined });
  const figures = data?.figures;
  const today = new Date().toISOString().slice(0, 10);
  const fileBase = `${site?.host ?? "site"}-reviews`;
  const chartRows = (data?.months ?? []).map((month) => ({ label: formatMonth(month.month), reviews: month.reviews, stars: month.stars }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<MessageSquareText className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={t("description")}
        action={data ? <OfficeSwitch offices={data.offices} open={officeId ?? null} allOffices /> : undefined}
      />
      {data && data.listings.length === 0 ? <LocalSetupNotice siteId={siteId} reason="noOffice" /> : null}

      {figures ? (
        <FigureRow>
          <Figure
            label={t("figures.rating")}
            value={ratingText(figures.googleRating)}
            detail={<span className="text-secondary">{[t("figures.ratingGoogle", { offices: data.offices.length }), ...figures.otherRatings.map((other) => `${tr(`sources.${other.source}`)} ${ratingText(other.rating)}`)].join(" · ")}</span>}
          />
          <Figure
            label={t("figures.new")}
            emphasis
            value={figures.newIn30}
            detail={<><Change by={figures.newIn30 - figures.newBefore} arrow={figures.newIn30 >= figures.newBefore ? "up" : "down"} /> <span className="text-secondary">{t("figures.newBefore")}</span></>}
          />
          <Figure label={t("figures.waiting")} value={figures.waiting} detail={<span className="text-secondary">{figures.oldestWaitingDays === null ? t("figures.noneWaiting") : t("figures.oldestWaiting", { days: figures.oldestWaitingDays })}</span>} />
          <Figure label={t("figures.daysToAnswer")} value={figures.daysToAnswer === null ? "–" : Math.round(figures.daysToAnswer)} detail={<span className="text-secondary">{t("figures.daysToAnswerDetail")}</span>} />
        </FigureRow>
      ) : null}

      <SiteChartCard
        dated={false}
        title={t("chartTitle")}
        hint={t("chartHint")}
        exportName={`${fileBase}-a-month`}
        csv={() => toCsv([t("chartMonth"), t("chartReviews"), t("chartStars")], chartRows.map((row) => [row.label, row.reviews, row.stars === null ? null : Math.round(row.stars * 10) / 10]))}
        enoughData={chartRows.some((row) => row.reviews > 0)}
      >
        <SiteBarChart
          data={chartRows}
          series={[{ key: "reviews", name: t("chartReviewsLeft"), colour: SITE_SERIES_COLOURS[0] }]}
          line={{ key: "stars", name: t("chartStarsRight"), colour: SITE_SERIES_COLOURS[1], domain: [0, 5], formatScale: (value) => value.toFixed(1) }}
        />
      </SiteChartCard>

      <DataTable
        rows={pager.pageRows}
        rowKey={(row) => `${row.listingId}|${row.id}`}
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select chip={{ label: t("listingFilter"), choice: listing ? listingName(listing) : null }} value={listing} onChange={setListing}>
              <option value="">{t("everyListing")}</option>
              {(data?.listings ?? []).map((entry) => <option key={entry.listingId} value={entry.listingId}>{listingName(entry.listingId)}</option>)}
            </Select>
            <Select chip={{ label: t("starsFilter"), choice: stars ? t(`stars.${stars}`) : null }} value={stars} onChange={(value) => setStars(value as (typeof STARS)[number] | "")}>
              <option value="">{t("anyStars")}</option>
              {STARS.map((entry) => <option key={entry} value={entry}>{t(`stars.${entry}`)}</option>)}
            </Select>
            <Select chip={{ label: t("answeredFilter"), choice: answer ? t(`answers.${answer}`) : null }} value={answer} onChange={(value) => setAnswer(value as (typeof ANSWERS)[number] | "")}>
              <option value="">{t("answeredOrNot")}</option>
              {ANSWERS.map((entry) => <option key={entry} value={entry}>{t(`answers.${entry}`)}</option>)}
            </Select>
          </>
        }
        cardHeader={<TableBar footer={pager.footer} noun="reviews" actions={<ListDownload fileName={fileBase} rows={sorted ?? []} columns={[{ header: t("columns.date"), value: (row) => row.day }, { header: t("columns.listing"), value: (row) => listingName(row.listingId) }, { header: t("columns.stars"), value: (row) => row.stars }, { header: t("columns.review"), value: (row) => row.text }, { header: t("columns.reviewer"), value: (row) => row.name }, { header: t("columns.answered"), value: (row) => row.replyDay }]} />}>{answer === "waiting" ? <span className="text-[13px] text-secondary">{t("notAnsweredBar")}</span> : null}</TableBar>}
        empty={{ icon: <MessageSquareText className="h-8 w-8 text-muted/30" />, label: term || listing || stars || answer ? t("noMatch") : t("empty") }}
        footer={pager.footer}
        sort={tableSort}
        columns={[
          { key: "date", header: t("columns.date"), sortable: true, cell: (row) => <span className="whitespace-nowrap font-mono text-[12px] tabular-nums text-secondary">{formatDay(row.day)}</span> },
          { key: "listing", header: t("columns.listing"), cell: (row) => <span className="whitespace-nowrap text-[12px] text-secondary">{listingName(row.listingId)}</span> },
          { key: "stars", header: t("columns.stars"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.stars} /> },
          { key: "review", header: t("columns.review"), cell: (row) => <span className="text-[13px] text-foreground">{row.text ?? <span className="text-muted">{t("starsOnly")}</span>}</span> },
          {
            key: "reviewer",
            header: t("columns.reviewer"),
            cell: (row) => (
              <span className="flex flex-col">
                <span className="text-[12px] text-secondary">{row.name ?? "–"}</span>
                {row.guide ? <span className="text-[11px] text-muted">{t("localGuide")}</span> : null}
              </span>
            ),
          },
          {
            key: "answered",
            header: t("columns.answered"),
            sortable: true,
            cell: (row) => row.replyDay
              ? <StatusLabel tone="success">{row.replyRough ? t("answers.answered") : t("answeredAfter", { days: daysBetween(row.day, row.replyDay) })}</StatusLabel>
              : <StatusLabel tone="warning">{t("notYet", { days: daysBetween(row.day, today) })}</StatusLabel>,
          },
        ]}
      />
    </div>
  );
}
