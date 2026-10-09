"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Store } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Change } from "@/src/ui/components/screens/Change";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { PageSection } from "../../../../_components/PageSection";
import { CUT_COLUMN } from "../../../_components/SiteCells";
import { ListDownload } from "../../../_components/SiteDownloads";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSitePager } from "../../../_components/useSitePagedTable";
import { useSiteSortedList, type SiteSortColumns } from "../../../_components/useSiteSort";
import { BusinessCell, FigureCell, LocalSetupNotice, OfficeSwitch, ratingText, useOfficeName } from "../_components/LocalParts";

type OfficeRow = {
  listingId: string;
  name: string;
  town: string | null;
  address: string | null;
  category: string | null;
  rating: number | null;
  reviews: number | null;
  photos: number | null;
  mapBox: { inBox: number; of: number };
  toFix: number;
  reviewsGained: number | null;
};
type SearchRow = { keyword: string; volume: number | null; places: Array<number | null>; top: string[] };

const OFFICE_SORTS: SiteSortColumns<OfficeRow, "office" | "rating" | "reviews" | "photos" | "mapBox" | "check"> = {
  office: { value: (row) => row.town ?? row.name, first: "asc" },
  rating: { value: (row) => row.rating, first: "desc" },
  reviews: { value: (row) => row.reviews, first: "desc" },
  photos: { value: (row) => row.photos, first: "desc" },
  mapBox: { value: (row) => row.mapBox.inBox, first: "desc" },
  check: { value: (row) => row.toFix, first: "asc" },
};
const searchSorts = (offices: number): SiteSortColumns<SearchRow, string> => ({
  search: { value: (row) => row.keyword, first: "asc" },
  volume: { value: (row) => row.volume, first: "desc" },
  ...Object.fromEntries(Array.from({ length: offices }, (_, at) => [`office${at}`, { value: (row: SearchRow) => (row.places[at] ? row.places[at] : null), first: "asc" as const }])),
});
const officeNameOf = (row: OfficeRow) => row.town ?? row.name;
const keywordOf = (row: SearchRow) => row.keyword;

/** Each office's place a search, ten columns at most: past that the table no longer fits the page. */
const OFFICE_COLUMNS = 10;

/**
 * Discovery → Local → Business profile, every office side by side
 * (docs/plans/active/discovery-local-reputation-ai-plan.md, D2, D6; drawn as
 * "Local · Business profile, every office"): the same figures for each
 * office's profile, so the weaker one shows, and every tracked search with
 * each office's place on Maps.
 */
export default function LocalOfficesPage() {
  const t = useTranslations("sites.local.offices");
  const tp = useTranslations("sites.local.profile");
  const siteId = useSiteId();
  const site = useSite();
  const router = useRouter();
  const officeName = useOfficeName();
  const data = useQuery(api.siteLocalProfile.everyOffice, { siteId });
  const options = useQuery(api.siteLocalProfile.businessProfile, { siteId });

  const offices = data?.offices as OfficeRow[] | undefined;
  const shown = (offices ?? []).slice(0, OFFICE_COLUMNS);
  const officesSorted = useSiteSortedList(offices, OFFICE_SORTS, { opening: "office", name: officeNameOf, table: "offices" });
  const officesPager = useSitePager(officesSorted.rows, { isLoading: data === undefined, table: "offices" });
  const searches = data?.searches;
  const searchesSorted = useSiteSortedList(searches, searchSorts(shown.length), { opening: "volume", name: keywordOf, table: "searches" });
  const searchesPager = useSitePager(searchesSorted.rows, { isLoading: data === undefined, table: "searches" });

  const reviews = (offices ?? []).reduce((sum, row) => sum + (row.reviews ?? 0), 0);
  const gained = (offices ?? []).some((row) => row.reviewsGained !== null)
    ? (offices ?? []).reduce((sum, row) => sum + (row.reviewsGained ?? 0), 0)
    : null;
  const inBox = (offices ?? []).reduce((sum, row) => sum + row.mapBox.inBox, 0);
  const of = (offices ?? []).reduce((sum, row) => sum + row.mapBox.of, 0);
  const toFix = (offices ?? []).reduce((sum, row) => sum + row.toFix, 0);
  const fileBase = `${site?.host ?? "site"}-offices`;
  const placeText = (place: number | null) => (place === null ? "–" : place === 0 ? t("notOnMap") : String(place));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Store className="h-6 w-6 text-brand" />}
        title={tp("title")}
        description={t("description")}
        action={options ? <OfficeSwitch offices={options.offices} open={null} profile every /> : undefined}
      />
      {offices && offices.length === 0 ? <LocalSetupNotice siteId={siteId} reason="noOffice" /> : null}

      <FigureRow>
        <Figure label={t("figures.offices")} value={offices?.length ?? "–"} detail={<span className="text-secondary">{t("figures.officesDetail")}</span>} />
        <Figure
          label={t("figures.reviews")}
          value={offices ? reviews : "–"}
          detail={gained === null ? <span className="text-secondary">{tp("figures.reviewsNoWeeks")}</span> : <><Change by={gained} arrow={gained >= 0 ? "up" : "down"} /> <span className="text-secondary">{tp("figures.inThirtyDays")}</span></>}
        />
        <Figure label={t("figures.mapBox")} emphasis value={tp("figures.of", { count: inBox, of })} detail={<span className="text-secondary">{t("figures.mapBoxDetail")}</span>} />
        <Figure label={t("figures.toFix")} value={offices ? toFix : "–"} detail={<span className="text-secondary">{t("figures.toFixDetail", { count: offices?.length ?? 0 })}</span>} />
      </FigureRow>

      <PageSection tight title={t("officesTitle")} description={t("officesDescription")}>
        <DataTable
          rows={officesPager.pageRows}
          rowKey={(row) => row.listingId}
          onRowClick={(row) => router.push(`/app/sites/${siteId}/local?office=${row.listingId}`)}
          cardHeader={<TableBar footer={officesPager.footer} noun="offices" actions={<ListDownload fileName={fileBase} rows={officesSorted.rows ?? []} columns={[{ header: t("columns.office"), value: (row) => officeName(row) }, { header: t("columns.rating"), value: (row) => row.rating }, { header: t("columns.reviews"), value: (row) => row.reviews }, { header: t("columns.photos"), value: (row) => row.photos }, { header: t("columns.mapBox"), value: (row) => `${row.mapBox.inBox}/${row.mapBox.of}` }, { header: t("columns.check"), value: (row) => row.toFix }]} />} />}
          empty={{ icon: <Store className="h-8 w-8 text-muted/30" />, label: t("officesEmpty") }}
          sort={officesSorted.tableSort}
          columns={[
            { key: "office", header: t("columns.office"), sortable: true, cell: (row) => <BusinessCell name={officeName(row)} sub={[row.address, row.category].filter(Boolean).join(" · ") || null} href={`/app/sites/${siteId}/local?office=${row.listingId}`} /> },
            { key: "rating", header: t("columns.rating"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.rating} text={ratingText(row.rating)} /> },
            { key: "reviews", header: t("columns.reviews"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.reviews} /> },
            // Answered: counted from the reviews themselves, with Reviews (plan step 2).
            { key: "answered", header: t("columns.answered"), cell: () => <FigureCell value={null} /> },
            { key: "photos", header: t("columns.photos"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.photos} /> },
            { key: "mapBox", header: t("columns.mapBox"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.mapBox.inBox} text={tp("figures.of", { count: row.mapBox.inBox, of: row.mapBox.of })} /> },
            { key: "check", header: t("columns.check"), sortable: true, cell: (row) => <StatusLabel tone={row.toFix > 0 ? "warning" : "success"}>{row.toFix > 0 ? t("toFix", { count: row.toFix }) : t("allGood")}</StatusLabel> },
          ]}
        />
      </PageSection>

      <PageSection tight title={t("searchesTitle")} description={t("searchesDescription")}>
        <DataTable
          rows={searchesPager.pageRows}
          rowKey={(row) => row.keyword}
          cardHeader={<TableBar footer={searchesPager.footer} noun="searches" actions={<ListDownload fileName={`${fileBase}-searches`} rows={searchesSorted.rows ?? []} columns={[{ header: t("columns.search"), value: (row) => row.keyword }, { header: t("columns.volume"), value: (row) => row.volume }, ...shown.map((office, at) => ({ header: office.town ?? office.name, value: (row: SearchRow) => placeText(row.places[at]) })), { header: t("columns.top"), value: (row) => row.top.join(" · ") }]} />} />}
          empty={{ icon: <Store className="h-8 w-8 text-muted/30" />, label: t("searchesEmpty") }}
          footer={searchesPager.footer}
          sort={searchesSorted.tableSort}
          columns={[
            { key: "search", header: t("columns.search"), sortable: true, className: CUT_COLUMN.first, cell: (row) => <span className="truncate text-[13px] text-foreground">{row.keyword}</span> },
            { key: "volume", header: t("columns.volume"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.volume} /> },
            ...shown.map((office, at) => ({
              key: `office${at}`,
              header: office.town ?? office.name,
              align: "right" as const,
              sortable: true,
              cell: (row: SearchRow) => <FigureCell value={row.places[at]} text={placeText(row.places[at])} />,
            })),
            { key: "top", header: t("columns.top"), cell: (row) => <span className="text-[12px] text-secondary">{row.top.join(" · ") || "–"}</span> },
          ]}
        />
      </PageSection>
    </div>
  );
}
