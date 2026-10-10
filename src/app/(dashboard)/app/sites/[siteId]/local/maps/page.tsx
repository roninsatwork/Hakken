"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { MapPin } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Change } from "@/src/ui/components/screens/Change";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { CUT_COLUMN, PositionCell } from "../../../_components/SiteCells";
import { ListDownload } from "../../../_components/SiteDownloads";
import { useSite, useSiteId } from "../../../_components/useSite";
import { SiteSees } from "../../../_components/SiteSees";
import { useSitePager } from "../../../_components/useSitePagedTable";
import { sharedSiteQuery, useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../_components/useSiteSort";
import { FigureCell, LocalSetupNotice, OfficeSwitch, useOfficeId, useOfficeName } from "../_components/LocalParts";
import { useSearchParams } from "next/navigation";

type Row = {
  keyword: string;
  volume: number | null;
  place: number | null;
  change: number | null;
  googlePosition: number | null;
  top: string | null;
  topIsYou: boolean;
  checkedDay: string | null;
};

const BOXES = ["in", "below", "off"] as const;
type Box = (typeof BOXES)[number];
const MOVES = ["up", "down"] as const;
type Move = (typeof MOVES)[number];

/** Where a place leaves an office: in Google's map box (the top three), below it, or not among those read. */
function boxOf(place: number | null): Box | null {
  if (place === null) return null;
  if (place === 0) return "off";
  return place <= 3 ? "in" : "below";
}

const SORTS: SiteSortColumns<Row, "search" | "volume" | "onMaps" | "change" | "box" | "position" | "top"> = {
  search: { value: (row) => row.keyword, first: "asc" },
  volume: { value: (row) => row.volume, first: "desc" },
  onMaps: { value: (row) => (row.place ? row.place : null), first: "asc" },
  change: { value: (row) => row.change, first: "desc" },
  box: { value: (row) => (row.place ? row.place : null), first: "asc" },
  position: { value: (row) => row.googlePosition, first: "asc" },
  top: { value: (row) => row.top, first: "asc" },
};
const keywordOf = (row: Row) => row.keyword;

/**
 * Discovery → Local → Map rankings (docs/plans/active/discovery-local-
 * reputation-ai-plan.md, D6, D18; drawn as "Local · Map rankings"): where an
 * office sits on Google Maps for each tracked search, checked from its own
 * address, against Google's map box and the business first on the map.
 */
export default function LocalMapsPage() {
  const t = useTranslations("sites.local.maps");
  const tl = useTranslations("sites.local");
  const siteId = useSiteId();
  const site = useSite();
  const router = useRouter();
  const params = useSearchParams();
  const officeId = useOfficeId();
  const officeName = useOfficeName();
  const data = useQuery(api.siteLocalMaps.mapRankings, { siteId, ...(officeId ? { officeId } : {}) });
  const [search, setSearch, term] = useSiteSearch();
  const [box, setBox] = useSiteParam<Box | "">("box", "", BOXES);
  const [move, setMove] = useSiteParam<Move | "">("moved", "", MOVES);

  const matches = wordStartMatcher(term);
  const matching = data?.rows.filter((row) => (!matches || matches(row.keyword, row.top))
    && (!box || boxOf(row.place) === box)
    && (!move || (move === "up" ? (row.change ?? 0) > 0 : (row.change ?? 0) < 0)));
  const { rows: sorted, tableSort } = useSiteSortedList(matching, SORTS, { opening: "onMaps", name: keywordOf });
  const pager = useSitePager(sorted, { isLoading: data === undefined });
  const office = data?.office ?? null;
  const figures = data?.figures;
  const recordHref = (keyword: string) => {
    const query = new URLSearchParams(sharedSiteQuery(params).replace(/^\?/, ""));
    query.set("keyword", keyword);
    if (office) query.set("office", office.listingId);
    return `/app/sites/${siteId}/local/maps/search?${query}`;
  };
  const boxWords = (place: number | null) => {
    const where = boxOf(place);
    return where === null ? null : t(`boxes.${where}`);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<MapPin className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={t("description")}
        action={data ? <OfficeSwitch offices={data.offices} open={office?.listingId ?? null} /> : undefined}
      />
      <SiteSees screen="localMaps" seen={data?.seen} />
      {data && !office ? <LocalSetupNotice siteId={siteId} reason="noOffice" /> : null}

      {office && figures ? (
        <>
          <FigureRow>
            <Figure
              label={t("figures.mapBox")}
              emphasis
              value={tl("of", { count: figures.inBox, of: figures.of })}
              detail={figures.inBoxChange === null ? <span className="text-secondary">{t("figures.firstCheck")}</span> : <><Change by={figures.inBoxChange} arrow={figures.inBoxChange >= 0 ? "up" : "down"} /> <span className="text-secondary">{t("figures.onLastCheck")}</span></>}
            />
            <Figure label={t("figures.average")} value={figures.averagePlace === null ? "–" : figures.averagePlace.toFixed(1)} detail={<span className="text-secondary">{t("figures.averageDetail", { count: figures.onMap })}</span>} />
            <Figure label={t("figures.notOnMap")} value={figures.notOnMap} detail={<span className="text-secondary">{t("figures.notOnMapDetail", { depth: data.depth })}</span>} />
            <Figure
              label={t("figures.topMost")}
              value={figures.topMost ? (figures.topMost.you ? tl("you", { name: figures.topMost.name }) : figures.topMost.name) : "–"}
              detail={<span className="text-secondary">{figures.topMost ? t("figures.topMostDetail", { count: figures.topMost.first, of: figures.of }) : t("figures.notChecked")}</span>}
            />
          </FigureRow>
          <Notice>{t("notice", { office: officeName(office) })}</Notice>
        </>
      ) : null}

      <DataTable
        rows={pager.pageRows}
        rowKey={(row) => row.keyword}
        onRowClick={(row) => router.push(recordHref(row.keyword))}
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select chip={{ label: t("boxFilter"), choice: box ? t(`boxes.${box}`) : null }} value={box} onChange={(value) => setBox(value as Box | "")}>
              <option value="">{t("everySearch")}</option>
              {BOXES.map((entry) => <option key={entry} value={entry}>{t(`boxes.${entry}`)}</option>)}
            </Select>
            <Select chip={{ label: t("moveFilter"), choice: move ? t(`moves.${move}`) : null }} value={move} onChange={(value) => setMove(value as Move | "")}>
              <option value="">{t("anyMove")}</option>
              {MOVES.map((entry) => <option key={entry} value={entry}>{t(`moves.${entry}`)}</option>)}
            </Select>
          </>
        }
        cardHeader={<TableBar footer={pager.footer} noun="searches" actions={<ListDownload fileName={`${site?.host ?? "site"}-map-rankings`} rows={sorted ?? []} columns={[{ header: t("columns.search"), value: (row) => row.keyword }, { header: t("columns.volume"), value: (row) => row.volume }, { header: t("columns.onMaps"), value: (row) => (row.place === 0 ? null : row.place) }, { header: t("columns.change"), value: (row) => row.change }, { header: t("columns.box"), value: (row) => boxWords(row.place) }, { header: t("columns.position"), value: (row) => row.googlePosition }, { header: t("columns.top"), value: (row) => row.top }]} />} />}
        empty={{ icon: <MapPin className="h-8 w-8 text-muted/30" />, label: term || box || move ? t("noMatch") : office ? t("empty") : t("noOffice") }}
        footer={pager.footer}
        sort={tableSort}
        columns={[
          { key: "search", header: t("columns.search"), sortable: true, className: CUT_COLUMN.first, cell: (row) => <span className="truncate text-[13px] text-foreground">{row.keyword}</span> },
          { key: "volume", header: t("columns.volume"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.volume} /> },
          { key: "onMaps", header: t("columns.onMaps"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.place ? row.place : null} /> },
          { key: "change", header: t("columns.change"), align: "right", sortable: true, cell: (row) => <Change by={row.change} same={row.place !== null && row.place > 0} /> },
          {
            key: "box",
            header: t("columns.box"),
            sortable: true,
            cell: (row) => {
              const where = boxOf(row.place);
              if (where === null) return <span className="text-[12px] text-muted">{t("notChecked")}</span>;
              return <StatusLabel tone={where === "in" ? "success" : where === "below" ? "info" : "neutral"}>{t(`boxes.${where}`)}</StatusLabel>;
            },
          },
          { key: "position", header: t("columns.position"), align: "right", sortable: true, cell: (row) => <PositionCell position={row.googlePosition} /> },
          { key: "top", header: t("columns.top"), sortable: true, cell: (row) => <span className="text-[12px] text-secondary">{row.top ? (row.topIsYou ? tl("youShort") : row.top) : "–"}</span> },
        ]}
      />
    </div>
  );
}
