"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Store } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { Change } from "@/src/ui/components/screens/Change";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { ExternalUrlCell } from "../../../_components/SiteCells";
import { ListDownload } from "../../../_components/SiteDownloads";
import { useSite, useSiteId } from "../../../_components/useSite";
import { businessRecord, useSiteListHref, useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSitePager } from "../../../_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../_components/useSiteSort";
import { FigureCell, ratingText } from "../../local/_components/LocalParts";

type Row = {
  name: string;
  host: string | null;
  you: boolean;
  prompts: string[];
  usualPlace: number | null;
  rating: number | null;
  reviews: number | null;
  map: "BOX" | "BELOW" | "OFF" | "UNKNOWN";
  boxSearches: number;
};

const SORTS: SiteSortColumns<Row & { shown: number }, "business" | "shown" | "place" | "rating" | "reviews" | "map"> = {
  business: { value: (row) => row.name, first: "asc" },
  shown: { value: (row) => row.shown, first: "desc" },
  place: { value: (row) => row.usualPlace, first: "asc" },
  rating: { value: (row) => row.rating, first: "desc" },
  reviews: { value: (row) => row.reviews, first: "desc" },
  map: { value: (row) => row.boxSearches, first: "desc" },
};
const nameOf = (row: Row) => `${row.host ?? ""}${row.name}`;

/**
 * Discovery → AI answers → Businesses recommended (docs/plans/active/
 * discovery-local-reputation-ai-plan.md, step 3, D5, D18; drawn as "AI
 * answers · Businesses recommended"): the businesses the ChatGPT app puts in
 * front of people for the website's questions, how often and how high, beside
 * where each sits on Google Maps for the website's tracked searches.
 */
export default function BusinessesRecommendedPage() {
  const t = useTranslations("sites.aiApps.businesses");
  const siteId = useSiteId();
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);
  const listHref = useSiteListHref(siteId);
  const site = useSite();
  const data = useQuery(api.siteAiApps.businessesRecommended, { siteId });
  const [search, setSearch, term] = useSiteSearch();
  const [question, setQuestion] = useSiteParam<string>("question", "");

  // Shown in so many of the answers that showed businesses, as drawn ("8 of 9").
  const answers = question ? 1 : data?.showingBusinesses ?? 0;
  const matches = wordStartMatcher(term);
  const rows = data?.rows
    .map((row) => ({ ...row, shown: question ? (row.prompts.includes(question) ? 1 : 0) : row.prompts.length }))
    .filter((row) => (!question || row.shown > 0 || row.prompts.length === 0) && (!matches || matches(row.name, row.host)));
  const { rows: sorted, tableSort } = useSiteSortedList(rows, SORTS, { opening: "shown", name: nameOf });
  const pager = useSitePager(sorted, { isLoading: data === undefined });
  const most = [...(data?.rows ?? [])].sort((left, right) => right.prompts.length - left.prompts.length)[0];
  const mapWords = (row: Row) => {
    if (row.map === "BOX") return t("map.box", { count: row.boxSearches });
    if (row.map === "BELOW") return t("map.below");
    if (row.map === "OFF") return t("map.off", { town: data?.town ?? "" });
    return t("map.unknown");
  };
  const fileBase = `${site?.host ?? "site"}-businesses-recommended`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Store className="h-6 w-6 text-brand" />} title={t("title")} description={t("description")} />

      {data ? (
        <FigureRow>
          <Figure label={t("figures.showing")} value={t("of", { count: data.showingBusinesses, of: data.answers })} detail={<span className="text-secondary">{t("figures.showingDetail")}</span>} />
          <Figure
            label={t("figures.showingYou")}
            emphasis
            value={t("of", { count: data.showingYou, of: data.showingBusinesses })}
            detail={data.showingYouBefore === null ? <span className="text-secondary">{t("figures.noCheckBefore")}</span> : <><Change by={data.showingYou - data.showingYouBefore} arrow={data.showingYou >= data.showingYouBefore ? "up" : "down"} /> <span className="text-secondary">{t("figures.checkBefore")}</span></>}
          />
          <Figure label={t("figures.most")} value={most && most.prompts.length > 0 ? most.name : "–"} detail={<span className="text-secondary">{most && most.prompts.length > 0 ? t("figures.mostDetail", { count: most.prompts.length, of: data.showingBusinesses }) : t("figures.noneShown")}</span>} />
          <Figure
            label={t("figures.skipped")}
            href={`/app/sites/${siteId}/local/maps`}
            value={data.inBoxSkipped}
            detail={<span className="text-secondary">{t("figures.skippedDetail")}</span>}
          />
        </FigureRow>
      ) : null}
      <Notice>{t("notice")}</Notice>

      <DataTable
        rows={pager.pageRows}
        rowKey={(row) => nameOf(row)}
        rowClickable={(row) => row.you || Boolean(businessRecord({ host: row.host, listingId: null }))}
        onRowClick={(row) => router.push(row.you ? listHref("local") : recordHref(businessRecord({ host: row.host, listingId: null })!))}
        rowClassName={(row) => (row.you ? "bg-brand/5" : "")}
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <Select chip={{ label: t("questionFilter"), choice: question || null }} value={question} onChange={setQuestion}>
            <option value="">{t("everyQuestion")}</option>
            {(data?.questions ?? []).map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </Select>
        }
        cardHeader={<TableBar footer={pager.footer} noun="businesses" actions={<ListDownload fileName={fileBase} rows={sorted ?? []} columns={[{ header: t("columns.business"), value: (row) => row.name }, { header: t("columns.website"), value: (row) => row.host }, { header: t("columns.shown"), value: (row) => row.shown }, { header: t("columns.place"), value: (row) => (row.usualPlace === null ? null : Math.round(row.usualPlace * 10) / 10) }, { header: t("columns.rating"), value: (row) => row.rating }, { header: t("columns.reviews"), value: (row) => row.reviews }, { header: t("columns.map"), value: mapWords }]} />} />}
        empty={{ icon: <Store className="h-8 w-8 text-muted/30" />, label: term || question ? t("noMatch") : t("empty") }}
        footer={pager.footer}
        sort={tableSort}
        columns={[
          {
            key: "business",
            header: t("columns.business"),
            sortable: true,
            cell: (row) => (
              <span className="flex min-w-0 flex-col">
                <span className="text-[13px] text-foreground">{row.you ? t("you", { name: row.name }) : row.name}</span>
                {row.host ? <ExternalUrlCell url={`https://${row.host}`} label={row.host} /> : <span className="text-[12px] text-muted">{t("noWebsite")}</span>}
              </span>
            ),
          },
          { key: "shown", header: t("columns.shown"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.shown} text={t("of", { count: row.shown, of: answers })} /> },
          { key: "place", header: t("columns.place"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.usualPlace} text={row.usualPlace === null ? undefined : row.usualPlace.toFixed(1)} /> },
          { key: "rating", header: t("columns.rating"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.rating} text={ratingText(row.rating)} /> },
          { key: "reviews", header: t("columns.reviews"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.reviews} /> },
          {
            key: "map",
            header: t("columns.map"),
            sortable: true,
            cell: (row) => (row.map === "BOX"
              ? <Link href={`/app/sites/${siteId}/local/maps`} className="whitespace-nowrap text-[12px] text-info hover:underline">{mapWords(row)}</Link>
              : <span className="whitespace-nowrap text-[12px] text-secondary">{mapWords(row)}</span>),
          },
        ]}
      />
    </div>
  );
}
