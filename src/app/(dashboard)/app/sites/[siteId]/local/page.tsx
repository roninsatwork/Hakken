"use client";

import { useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Store } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/src/ui/components/screens/Button";
import { Change } from "@/src/ui/components/screens/Change";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { Meter } from "@/src/ui/components/screens/Meter";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { PageSection } from "../../../_components/PageSection";
import { formatDay } from "../../_components/siteFormat";
import { ListDownload } from "../../_components/SiteDownloads";
import { useSiteId, useSite } from "../../_components/useSite";
import { useSitePager } from "../../_components/useSitePagedTable";
import { useSiteSortedList, type SiteSortColumns } from "../../_components/useSiteSort";
import { BusinessCell, FigureCell, LocalSetupNotice, OfficeSwitch, ratingText, useOfficeId } from "./_components/LocalParts";
import { useDetailWords, type DetailRow } from "./_components/profileDetails";

type Also = {
  key: string;
  listingId: string | null;
  name: string;
  websiteHost: string | null;
  category: string | null;
  rating: number | null;
  reviews: number | null;
  photos: number | null;
  booking: boolean | null;
  mapBox: number;
  you: boolean;
  watched: boolean;
};
type Topic = { topic: string; reviews: number; stars: number | null };

const DETAIL_SORTS: SiteSortColumns<DetailRow, "detail"> = { detail: { value: () => null, first: "asc" } };
const ALSO_SORTS: SiteSortColumns<Also, "business" | "category" | "rating" | "reviews" | "photos" | "mapBox"> = {
  business: { value: (row) => row.name, first: "asc" },
  category: { value: (row) => row.category, first: "asc" },
  rating: { value: (row) => row.rating, first: "desc" },
  reviews: { value: (row) => row.reviews, first: "desc" },
  photos: { value: (row) => row.photos, first: "desc" },
  mapBox: { value: (row) => row.mapBox, first: "desc" },
};
const TOPIC_SORTS: SiteSortColumns<Topic, "topic" | "reviews" | "share" | "stars"> = {
  topic: { value: (row) => row.topic, first: "asc" },
  reviews: { value: (row) => row.reviews, first: "desc" },
  share: { value: (row) => row.reviews, first: "desc" },
  stars: { value: (row) => row.stars, first: "desc" },
};
const nameOf = (row: { name: string }) => row.name;
const topicOf = (row: Topic) => row.topic;
const detailOrder = () => "";

/**
 * Discovery → Local → Business profile (docs/plans/active/discovery-local-
 * reputation-ai-plan.md, §7, D18; drawn as "Local · Business profile"): one
 * office's Google profile as people see it, each detail checked against the
 * businesses people also look at, and the words Google picks out of its
 * reviews.
 */
export default function LocalProfilePage() {
  const t = useTranslations("sites.local.profile");
  const tl = useTranslations("sites.local");
  const siteId = useSiteId();
  const site = useSite();
  const officeId = useOfficeId();
  const data = useQuery(api.siteLocalProfile.businessProfile, { siteId, ...(officeId ? { officeId } : {}) });
  const link = useMutation(api.siteLocalListings.linkListing);
  const action = useAdminAction({ scope: "site-local-profile" });
  const detailWords = useDetailWords();
  const office = data?.office ?? null;

  const details = useMemo(() => office?.details, [office]);
  const detailsSorted = useSiteSortedList(details, DETAIL_SORTS, { opening: "detail", name: detailOrder, table: "details" });
  const detailsPager = useSitePager(detailsSorted.rows, { isLoading: data === undefined, table: "details" });
  const alsoSorted = useSiteSortedList(office?.alsoLookAt as Also[] | undefined, ALSO_SORTS, { opening: "mapBox", name: nameOf, table: "also" });
  const alsoPager = useSitePager(alsoSorted.rows, { isLoading: data === undefined, table: "also" });
  const topicsSorted = useSiteSortedList(office?.topics, TOPIC_SORTS, { opening: "reviews", name: topicOf, table: "topics" });
  const topicsPager = useSitePager(topicsSorted.rows, { isLoading: data === undefined, table: "topics" });

  const toFix = office?.details.filter((row) => row.verdict === "FIX").length ?? 0;
  const reviewsTotal = office?.row.reviews ?? null;
  const fileBase = `${site?.host ?? "site"}-business-profile`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Store className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={office?.readAt ? t("descriptionRead", { day: formatDay(new Date(office.readAt).toISOString().slice(0, 10)) }) : t("description")}
        action={data ? (
          <div className="flex flex-wrap items-center gap-3">
            <OfficeSwitch offices={data.offices} open={office?.row.listingId ?? null} profile />
            {office ? (
              <a href={office.row.url} target="_blank" rel="noreferrer" className="rounded-[8px] border border-border-dim bg-white/[0.03] px-3 py-1.5 text-[12px] font-medium text-secondary transition-all hover:bg-white/[0.06] hover:text-foreground">
                {t("openOnGoogle")}
              </a>
            ) : null}
          </div>
        ) : undefined}
      />
      {data && !office ? <LocalSetupNotice siteId={siteId} reason="noOffice" /> : null}

      {office ? (
        <>
          <FigureRow>
            <Figure label={t("figures.rating")} value={ratingText(office.row.rating)} detail={<span className="text-secondary">{office.figures.rivalsRating === null ? t("figures.noRivals") : t("figures.rivalsAverage", { value: ratingText(office.figures.rivalsRating) })}</span>} />
            <Figure
              label={t("figures.reviews")}
              href={`/app/sites/${siteId}/reviews?office=${office.row.listingId}`}
              value={office.row.reviews ?? "–"}
              detail={office.figures.reviewsGained === null ? <span className="text-secondary">{t("figures.reviewsNoWeeks")}</span> : <><Change by={office.figures.reviewsGained} arrow={office.figures.reviewsGained >= 0 ? "up" : "down"} /> <span className="text-secondary">{t("figures.inThirtyDays")}</span></>}
            />
            <Figure
              label={t("figures.mapBox")}
              href={`/app/sites/${siteId}/local/maps?office=${office.row.listingId}`}
              emphasis
              value={t("figures.of", { count: office.figures.mapBox.inBox, of: office.figures.mapBox.of })}
              detail={<span className="text-secondary">{t("figures.mapBoxDetail")}</span>}
            />
            <Figure label={t("figures.photos")} value={office.row.photos ?? "–"} detail={<span className="text-secondary">{office.figures.rivalsPhotos === null ? t("figures.noRivals") : t("figures.rivalsAverage", { value: office.figures.rivalsPhotos })}</span>} />
          </FigureRow>

          <PageSection tight title={t("details.title")} description={t("details.description")}>
            <DataTable
              rows={detailsPager.pageRows}
              rowKey={(row) => row.detail}
              cardHeader={<TableBar footer={detailsPager.footer} noun="details" actions={<ListDownload fileName={`${fileBase}-details`} rows={details ?? []} columns={[{ header: t("details.columns.detail"), value: (row) => detailWords(row).detail }, { header: t("details.columns.shows"), value: (row) => detailWords(row).shows }, { header: t("details.columns.check"), value: (row) => detailWords(row).check }]} />}>{toFix > 0 ? <span className="text-[13px] text-secondary">{t("details.toFix", { count: toFix })}</span> : null}</TableBar>}
              empty={{ icon: <Store className="h-8 w-8 text-muted/30" />, label: t("details.empty") }}
              sort={detailsSorted.tableSort}
              columns={[
                { key: "detail", header: t("details.columns.detail"), cell: (row) => <span className="text-[13px] text-foreground">{detailWords(row).detail}</span> },
                { key: "shows", header: t("details.columns.shows"), cell: (row) => <span className="text-[13px] text-secondary">{detailWords(row).shows}</span> },
                { key: "check", header: t("details.columns.check"), cell: (row) => <StatusLabel tone={row.verdict === "GOOD" ? "success" : row.verdict === "FIX" ? "warning" : "neutral"}>{detailWords(row).check}</StatusLabel> },
              ]}
            />
          </PageSection>

          <PageSection tight title={t("also.title")} description={t("also.description")}>
            <DataTable
              rows={alsoPager.pageRows}
              rowKey={(row) => row.key}
              cardHeader={<TableBar footer={{ ...alsoPager.footer, totalCount: Math.max(0, alsoPager.footer.totalCount - 1) }} noun="businesses" actions={<ListDownload fileName={`${fileBase}-also`} rows={alsoSorted.rows ?? []} columns={[{ header: t("also.columns.business"), value: (row) => row.name }, { header: t("also.columns.category"), value: (row) => row.category }, { header: t("also.columns.rating"), value: (row) => row.rating }, { header: t("also.columns.reviews"), value: (row) => row.reviews }, { header: t("also.columns.photos"), value: (row) => row.photos }, { header: t("also.columns.booking"), value: (row) => (row.booking === null ? null : row.booking ? t("also.hasOne") : t("also.none")) }, { header: t("also.columns.mapBox"), value: (row) => row.mapBox }]} />}><span className="text-[13px] text-secondary">{t("also.andYou")}</span></TableBar>}
              empty={{ icon: <Store className="h-8 w-8 text-muted/30" />, label: t("also.empty") }}
              sort={alsoSorted.tableSort}
              columns={[
                { key: "business", header: t("also.columns.business"), sortable: true, cell: (row) => <BusinessCell name={row.name} sub={row.websiteHost} you={row.you} /> },
                { key: "category", header: t("also.columns.category"), sortable: true, cell: (row) => (row.category ? <TagLabel>{row.category}</TagLabel> : <FigureCell value={null} />) },
                { key: "rating", header: t("also.columns.rating"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.rating} text={ratingText(row.rating)} /> },
                { key: "reviews", header: t("also.columns.reviews"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.reviews} /> },
                { key: "photos", header: t("also.columns.photos"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.photos} /> },
                { key: "booking", header: t("also.columns.booking"), cell: (row) => (row.booking === null ? <FigureCell value={null} /> : <span className="text-[12px] text-secondary">{row.booking ? t("also.hasOne") : t("also.none")}</span>) },
                { key: "mapBox", header: t("also.columns.mapBox"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.mapBox} text={t("figures.of", { count: row.mapBox, of: office.figures.mapBox.of })} /> },
                {
                  key: "actions",
                  header: <span className="sr-only">{t("also.columns.actions")}</span>,
                  cell: (row) => row.you ? null : row.watched ? (
                    <StatusLabel tone="success">{tl("watched")}</StatusLabel>
                  ) : row.listingId ? (
                    <Button variant="quiet" className="whitespace-nowrap" disabled={action.isBusy(`watch:${row.key}`)} onClick={() => void action.run(() => link({ siteId, listingId: row.listingId as never, role: "RIVAL" }), { key: `watch:${row.key}`, fallbackMessage: tl("watchFailed") })}>
                      {tl("watchAsRival")}
                    </Button>
                  ) : null,
                },
              ]}
            />
          </PageSection>

          <PageSection tight title={t("topics.title")} description={t("topics.description")}>
            <DataTable
              rows={topicsPager.pageRows}
              rowKey={(row) => row.topic}
              cardHeader={<TableBar footer={topicsPager.footer} noun="topics">{reviewsTotal !== null ? <span className="text-[13px] text-secondary">{t("topics.from", { count: reviewsTotal })}</span> : null}</TableBar>}
              empty={{ icon: <Store className="h-8 w-8 text-muted/30" />, label: t("topics.empty") }}
              sort={topicsSorted.tableSort}
              columns={[
                { key: "topic", header: t("topics.columns.topic"), sortable: true, cell: (row) => <span className="text-[13px] text-foreground">{row.topic}</span> },
                { key: "reviews", header: t("topics.columns.reviews"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.reviews} /> },
                {
                  key: "share",
                  header: t("topics.columns.share"),
                  sortable: true,
                  cell: (row) => {
                    const share = reviewsTotal ? row.reviews / reviewsTotal : null;
                    return <span className="flex items-center gap-2"><Meter value={share} className="w-24" /><FigureCell value={share === null ? null : Math.round(share * 100)} text={share === null ? undefined : `${Math.round(share * 100)}%`} /></span>;
                  },
                },
                // Each topic's average stars, from the reviews the company's AI read it in (Reviews).
                { key: "stars", header: t("topics.columns.stars"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.stars} text={ratingText(row.stars)} /> },
              ]}
            />
          </PageSection>
        </>
      ) : null}
    </div>
  );
}
