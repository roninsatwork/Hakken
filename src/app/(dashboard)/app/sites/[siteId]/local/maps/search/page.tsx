"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { MapPin } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Change } from "@/src/ui/components/screens/Change";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { PageSection } from "../../../../../_components/PageSection";
import { formatDay, formatNumber } from "../../../../_components/siteFormat";
import { ListDownload } from "../../../../_components/SiteDownloads";
import { useSite, useSiteId } from "../../../../_components/useSite";
import { businessRecord, useSiteListHref, useSiteRecordHref } from "../../../../_components/siteRecordLinks";
import { useSitePager } from "../../../../_components/useSitePagedTable";
import { useSiteSortedList, type SiteSortColumns } from "../../../../_components/useSiteSort";
import { BusinessCell, FigureCell, ratingText, useOfficeId, useOfficeName } from "../../_components/LocalParts";

type Business = {
  listingId: string;
  name: string;
  websiteHost: string | null;
  rating: number | null;
  reviews: number | null;
  category: string | null;
  claimed: boolean | null;
  place: number;
  reason: string | null;
  you: boolean;
  watched: boolean;
  url: string;
};

const SORTS: SiteSortColumns<Business, "place" | "business" | "rating" | "reviews" | "category"> = {
  place: { value: (row) => row.place, first: "asc" },
  business: { value: (row) => row.name, first: "asc" },
  rating: { value: (row) => row.rating, first: "desc" },
  reviews: { value: (row) => row.reviews, first: "desc" },
  category: { value: (row) => row.category, first: "asc" },
};
const nameOf = (row: Business) => row.name;

/**
 * Discovery → Local → Map rankings → one search (docs/plans/active/discovery-
 * local-reputation-ai-plan.md, D18; drawn as "Local · One search on the
 * map"): everyone on Google Maps for one search from one office, in Google's
 * order, with Google's own reason for showing each.
 */
export default function LocalMapSearchPage() {
  const t = useTranslations("sites.local.mapSearch");
  const siteId = useSiteId();
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);
  const listHref = useSiteListHref(siteId);
  const site = useSite();
  const params = useSearchParams();
  const keyword = params.get("keyword") ?? "";
  const officeId = useOfficeId();
  const officeName = useOfficeName();
  const data = useQuery(api.siteLocalMaps.mapSearch, keyword ? { siteId, keyword, ...(officeId ? { officeId } : {}) } : "skip");
  const { rows: sorted, tableSort } = useSiteSortedList(data?.businesses as Business[] | undefined, SORTS, { opening: "place", name: nameOf });
  const pager = useSitePager(sorted, { isLoading: data === undefined });

  const placeWords = (place: number) => (place === 0 ? t("notOnMap") : String(place));
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<MapPin className="h-6 w-6 text-brand" />}
        title={keyword}
        description={data ? t("description", {
          office: officeName(data.office),
          day: formatDay(data.day),
          volume: data.volume === null ? t("volumeUnknown") : t("volume", { count: data.volume, shown: formatNumber(data.volume) }),
        }) : undefined}
      />
      {data === null ? <Notice>{t("notChecked")}</Notice> : null}

      {data ? (
        <FigureRow>
          <Figure
            label={t("figures.place")}
            emphasis
            value={placeWords(data.place)}
            detail={data.change === null ? <span className="text-secondary">{t("figures.firstCheck")}</span> : <><Change by={data.change} kind="places" same /> <span className="text-secondary">{t("figures.sinceBefore")}</span></>}
          />
          <Figure
            label={t("figures.results")}
            value={data.place > 0 && data.place <= 3 ? t("figures.inBox") : t("figures.notInBox")}
            detail={<span className="text-secondary">{data.googlePosition === null ? t("figures.websiteNotOnPage") : t("figures.websiteAt", { place: data.googlePosition })}</span>}
          />
          <Figure label={t("figures.rating")} value={ratingText(data.you?.rating)} detail={<span className="text-secondary">{data.boxRating === null ? "–" : t("figures.boxAverage", { value: ratingText(data.boxRating) })}</span>} />
          <Figure label={t("figures.reviews")} value={data.you?.reviews ?? "–"} detail={<span className="text-secondary">{data.boxReviews === null ? "–" : t("figures.boxAverage", { value: formatNumber(Math.round(data.boxReviews)) })}</span>} />
        </FigureRow>
      ) : null}

      {data ? (
        <PageSection tight title={t("tableTitle")} description={t("tableDescription")}>
          <DataTable
            rows={pager.pageRows}
            rowKey={(row) => row.listingId}
            onRowClick={(row) => router.push(row.you ? listHref("local") : recordHref(businessRecord({ host: row.websiteHost, listingId: row.listingId })!))}
            cardHeader={<TableBar footer={pager.footer} noun="businesses" actions={<ListDownload fileName={`${site?.host ?? "site"}-${keyword.replace(/\s+/g, "-")}-on-maps`} rows={sorted ?? []} columns={[{ header: t("columns.place"), value: (row) => row.place }, { header: t("columns.business"), value: (row) => row.name }, { header: t("columns.rating"), value: (row) => row.rating }, { header: t("columns.reviews"), value: (row) => row.reviews }, { header: t("columns.category"), value: (row) => row.category }, { header: t("columns.claimed"), value: (row) => (row.claimed === null ? null : row.claimed ? t("claimed") : t("notClaimed")) }, { header: t("columns.why"), value: (row) => row.reason }]} />} />}
            empty={{ icon: <MapPin className="h-8 w-8 text-muted/30" />, label: t("empty") }}
            footer={pager.footer}
            sort={tableSort}
            columns={[
              { key: "place", header: t("columns.place"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.place} /> },
              { key: "business", header: t("columns.business"), sortable: true, cell: (row) => <BusinessCell name={row.name} sub={row.websiteHost ?? t("noWebsite")} you={row.you} href={row.you ? listHref("local") : recordHref(businessRecord({ host: row.websiteHost, listingId: row.listingId })!)} /> },
              { key: "rating", header: t("columns.rating"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.rating} text={ratingText(row.rating)} /> },
              { key: "reviews", header: t("columns.reviews"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.reviews} /> },
              { key: "category", header: t("columns.category"), sortable: true, cell: (row) => (row.category ? <TagLabel>{row.category}</TagLabel> : <FigureCell value={null} />) },
              { key: "claimed", header: t("columns.claimed"), cell: (row) => (row.claimed === null ? <FigureCell value={null} /> : <StatusLabel tone={row.claimed ? "success" : "neutral"}>{row.claimed ? t("claimed") : t("notClaimed")}</StatusLabel>) },
              { key: "why", header: t("columns.why"), cell: (row) => <span className="text-[12px] text-secondary">{row.reason ?? "–"}</span> },
            ]}
          />
        </PageSection>
      ) : null}
    </div>
  );
}
