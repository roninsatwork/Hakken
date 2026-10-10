"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Users } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/src/ui/components/screens/Button";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { formatDay } from "../../../_components/siteFormat";
import { ListDownload } from "../../../_components/SiteDownloads";
import { useSite, useSiteId } from "../../../_components/useSite";
import { businessRecord, useSiteListHref, useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSitePager } from "../../../_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../_components/useSiteSort";
import { BusinessCell, FigureCell, LocalSetupNotice, OfficeSwitch, ratingText, useOfficeId } from "../_components/LocalParts";

type Row = {
  listingId: Id<"listings">;
  name: string;
  websiteHost: string | null;
  category: string | null;
  metres: number | null;
  rating: number | null;
  reviews: number | null;
  claimed: boolean | null;
  mapBox: number;
  you: boolean;
  watched: boolean;
  url: string;
};

/** The distances a reader may narrow to, in kilometres. */
const DISTANCES = ["5", "10", "25"] as const;
const CLAIMS = ["claimed", "notClaimed"] as const;
/** Reviews and rating past which a business stands out. */
const MANY_REVIEWS = 100;
const HIGH_RATING = 4.5;

const SORTS: SiteSortColumns<Row, "business" | "category" | "distance" | "rating" | "reviews" | "mapBox"> = {
  business: { value: (row) => row.name, first: "asc" },
  category: { value: (row) => row.category, first: "asc" },
  distance: { value: (row) => row.metres, first: "asc" },
  rating: { value: (row) => row.rating, first: "desc" },
  reviews: { value: (row) => row.reviews, first: "desc" },
  mapBox: { value: (row) => row.mapBox, first: "desc" },
};
const nameOf = (row: Row) => row.name;

/**
 * Discovery → Local → Local market (docs/plans/active/discovery-local-
 * reputation-ai-plan.md, D9, D18; drawn as "More · Local market"): every
 * business Google lists as the office's kind round it — who they are, how
 * they look on Google, and who is in its map box without being watched.
 */
export default function LocalMarketPage() {
  const t = useTranslations("sites.local.market");
  const tl = useTranslations("sites.local");
  const siteId = useSiteId();
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);
  const listHref = useSiteListHref(siteId);
  const site = useSite();
  const officeId = useOfficeId();
  const data = useQuery(api.siteLocalMarket.localMarket, { siteId, ...(officeId ? { officeId } : {}) });
  const link = useMutation(api.siteLocalListings.linkListing);
  const action = useAdminAction({ scope: "site-local-market" });
  const [search, setSearch, term] = useSiteSearch();
  const [category, setCategory] = useSiteParam<string>("category", "");
  const [distance, setDistance] = useSiteParam<(typeof DISTANCES)[number] | "">("within", "", DISTANCES);
  const [claimed, setClaimed] = useSiteParam<(typeof CLAIMS)[number] | "">("claimed", "", CLAIMS);

  const rows = data?.rows as Row[] | undefined;
  const categories = useMemo(() => [...new Set((rows ?? []).flatMap((row) => (row.category ? [row.category] : [])))].sort(), [rows]);
  const matches = wordStartMatcher(term);
  const matching = rows?.filter((row) => (!matches || matches(row.name, row.websiteHost))
    && (!category || row.category === category)
    && (!distance || row.you || (row.metres !== null && row.metres <= Number(distance) * 1000))
    && (!claimed || (claimed === "claimed" ? row.claimed === true : row.claimed === false)));
  const { rows: sorted, tableSort } = useSiteSortedList(matching, SORTS, { opening: "reviews", name: nameOf });
  const pager = useSitePager(sorted, { isLoading: data === undefined });

  const others = (rows ?? []).filter((row) => !row.you);
  const many = (rows ?? []).filter((row) => (row.reviews ?? 0) >= MANY_REVIEWS);
  const high = (rows ?? []).filter((row) => (row.rating ?? 0) >= HIGH_RATING).length;
  const unwatched = others.filter((row) => row.mapBox > 0 && !row.watched).length;
  const km = (metres: number | null) => (metres === null ? "–" : t("km", { km: (metres / 1000).toFixed(1) }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Users className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={data?.day ? t("descriptionRead", { day: formatDay(data.day) }) : t("description")}
        action={data ? <OfficeSwitch offices={data.offices} open={officeId ?? data.offices[0]?.listingId ?? null} /> : undefined}
      />
      {data && data.offices.length === 0 ? <LocalSetupNotice siteId={siteId} reason="noOffice" /> : null}
      {data && data.offices.length > 0 && data.total === null ? <LocalSetupNotice siteId={siteId} reason="notChecked" /> : null}

      {data?.total !== null && data?.total !== undefined ? (
        <FigureRow>
          <Figure label={t("figures.businesses")} emphasis value={data.total} detail={<span className="text-secondary">{t("figures.businessesDetail", { km: data.km })}</span>} />
          <Figure label={t("figures.manyReviews", { count: MANY_REVIEWS })} value={many.length} detail={<span className="text-secondary">{many.some((row) => row.you) ? t("figures.youAmong") : t("figures.youNotAmong")}</span>} />
          <Figure label={t("figures.highRating", { rating: HIGH_RATING })} value={high} detail={<span className="text-secondary">{t("figures.highRatingDetail")}</span>} />
          <Figure label={t("figures.unwatched")} value={unwatched} detail={<span className="text-secondary">{t("figures.unwatchedDetail")}</span>} />
        </FigureRow>
      ) : null}

      <DataTable
        rows={pager.pageRows}
        rowKey={(row) => row.listingId}
        onRowClick={(row) => router.push(row.you ? listHref("local") : recordHref(businessRecord({ host: row.websiteHost, listingId: row.listingId })!))}
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select chip={{ label: t("categoryFilter"), choice: category || null }} value={category} onChange={setCategory}>
              <option value="">{t("everyCategory")}</option>
              {categories.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
            </Select>
            <Select chip={{ label: t("distanceFilter"), choice: distance ? t("within", { km: distance }) : null }} value={distance} onChange={(value) => setDistance(value as (typeof DISTANCES)[number] | "")}>
              <option value="">{t("anyDistance")}</option>
              {DISTANCES.map((entry) => <option key={entry} value={entry}>{t("within", { km: entry })}</option>)}
            </Select>
            <Select chip={{ label: t("claimedFilter"), choice: claimed ? t(`claims.${claimed}`) : null }} value={claimed} onChange={(value) => setClaimed(value as (typeof CLAIMS)[number] | "")}>
              <option value="">{t("claimedOrNot")}</option>
              {CLAIMS.map((entry) => <option key={entry} value={entry}>{t(`claims.${entry}`)}</option>)}
            </Select>
          </>
        }
        cardHeader={<TableBar footer={pager.footer} noun="businesses" actions={<ListDownload fileName={`${site?.host ?? "site"}-local-market`} rows={sorted ?? []} columns={[{ header: t("columns.business"), value: (row) => row.name }, { header: t("columns.website"), value: (row) => row.websiteHost }, { header: t("columns.category"), value: (row) => row.category }, { header: t("columns.distance"), value: (row) => (row.metres === null ? null : Math.round(row.metres / 100) / 10) }, { header: t("columns.rating"), value: (row) => row.rating }, { header: t("columns.reviews"), value: (row) => row.reviews }, { header: t("columns.claimed"), value: (row) => (row.claimed === null ? null : row.claimed ? t("claims.claimed") : t("claims.notClaimed")) }, { header: t("columns.mapBox"), value: (row) => row.mapBox }]} />} />}
        empty={{ icon: <Users className="h-8 w-8 text-muted/30" />, label: term || category || distance || claimed ? t("noMatch") : t("empty") }}
        footer={pager.footer}
        sort={tableSort}
        columns={[
          { key: "business", header: t("columns.business"), sortable: true, cell: (row) => <BusinessCell name={row.name} sub={row.websiteHost ?? t("noWebsite")} you={row.you} href={row.you ? listHref("local") : recordHref(businessRecord({ host: row.websiteHost, listingId: row.listingId })!)} /> },
          { key: "category", header: t("columns.category"), sortable: true, cell: (row) => (row.category ? <TagLabel>{row.category}</TagLabel> : <FigureCell value={null} />) },
          { key: "distance", header: t("columns.distance"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.metres} text={km(row.metres)} /> },
          { key: "rating", header: t("columns.rating"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.rating} text={ratingText(row.rating)} /> },
          { key: "reviews", header: t("columns.reviews"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.reviews} /> },
          { key: "claimed", header: t("columns.claimed"), cell: (row) => (row.claimed === null ? <FigureCell value={null} /> : <StatusLabel tone={row.claimed ? "success" : "neutral"}>{row.claimed ? t("claims.claimed") : t("claims.notClaimed")}</StatusLabel>) },
          { key: "mapBox", header: t("columns.mapBox"), sortable: true, cell: (row) => <span className="text-[12px] text-secondary">{row.mapBox > 0 ? t("mapBoxFor", { count: row.mapBox }) : "–"}</span> },
          {
            key: "actions",
            header: <span className="sr-only">{t("columns.actions")}</span>,
            cell: (row) => row.you ? null : row.watched ? (
              <StatusLabel tone="success">{tl("watched")}</StatusLabel>
            ) : (
              <Button variant="quiet" className="whitespace-nowrap" disabled={action.isBusy(`watch:${row.listingId}`)} onClick={(event) => { event.stopPropagation(); void action.run(() => link({ siteId, listingId: row.listingId, role: "RIVAL" }), { key: `watch:${row.listingId}`, fallbackMessage: tl("watchFailed") }); }}>
                {tl("watchAsRival")}
              </Button>
            ),
          },
        ]}
      />
    </div>
  );
}
