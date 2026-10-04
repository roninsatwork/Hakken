"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useTranslations } from "next-intl";
import { Layers } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { CUT_COLUMN, PageLinkCell, PositionCell, RecordLinkCell } from "../../../../_components/SiteCells";
import { ListDownload } from "../../../../_components/SiteDownloads";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { formatNumber, formatShortDay } from "../../../../_components/siteFormat";
import { useRecordBack, useRecordKey, useSiteRecordHref } from "../../../../_components/siteRecordLinks";
import { useSite, useSiteId } from "../../../../_components/useSite";
import { useSitePager } from "../../../../_components/useSitePagedTable";
import { useSiteSortedList, type SiteSortColumns } from "../../../../_components/useSiteSort";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";

const BANDS = ["p01_03", "p04_10", "p11_20", "p21_50", "p51_up"] as const;
type Band = (typeof BANDS)[number];
type From = Band | "none";

type MovedRow = FunctionReturnType<typeof api.siteBands.listBandMoves>["rows"][number];

/** The columns that sort: the search A to Z, where it was and is from the top, and the most searched first — the order it opens on. */
const SORTS: SiteSortColumns<MovedRow, "keyword" | "was" | "now" | "volume"> = {
  keyword: { value: (row) => row.keyword, first: "asc" },
  was: { value: (row) => row.was, first: "asc" },
  now: { value: (row) => row.now, first: "asc" },
  volume: { value: (row) => row.volume, first: "desc" },
};
const keywordOf = (row: MovedRow) => row.keyword;

const isBand = (value: string): value is Band => (BANDS as readonly string[]).includes(value);

/** The move a square names — `p04_10.p01_03`, or `none.p51_up` for searches newly ranking — or null when it names none. */
function readMove(move: string): { from: From; to: Band } | null {
  const [from, to] = move.split(".");
  if (!from || !to || !isBand(to) || from === to || (from !== "none" && !isBand(from))) return null;
  return { from, to };
}

/**
 * One square of Position bands' grid: the searches that moved from one band
 * to another at the newest check, the most searched first — a screen of its
 * own with a way back, like every click in Sites (Anthony, 2026-09-24).
 */
export default function SiteBandMovePage() {
  const t = useTranslations("sites.bands");
  const tb = useTranslations("sites.overview.bands");
  const siteId = useSiteId();
  const site = useSite();
  const router = useRouter();
  const back = useRecordBack("bandMove");
  const recordHref = useSiteRecordHref(siteId);
  const move = readMove(useRecordKey("bandMove"));
  const moved = useQuery(api.siteBands.listBandMoves, move ? { siteId, from: move.from, to: move.to } : "skip");
  const { rows: sorted, tableSort } = useSiteSortedList(moved?.rows, SORTS, { opening: "volume", name: keywordOf });
  const pager = useSitePager(sorted, { isLoading: moved === undefined, cut: moved?.cut });

  if (!move) {
    return <DetailHeader back={back} icon={<Layers className="h-6 w-6 text-brand" />} title={t("cell.missingTitle")} description={t("cell.missingBody")} />;
  }

  const title = move.from === "none" ? t("cell.titleNew", { to: tb(move.to) }) : t("cell.title", { from: tb(move.from), to: tb(move.to) });
  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        back={back}
        icon={<Layers className="h-6 w-6 text-brand" />}
        title={title}
        description={moved?.day ? t("cell.description", { day: formatShortDay(moved.day) }) : undefined}
      />

      <DataTable
        rows={pager.pageRows}
        rowKey={(row) => row.keyword}
        onRowClick={(row) => router.push(recordHref({ kind: "keyword", keyword: row.keyword }))}
        minWidthClassName="min-w-[640px]"
        cardHeader={<TableBar
          footer={pager.footer}
          noun="searches"
          actions={(
            <ListDownload
              fileName={`${site?.host ?? "site"}-${move.from}-to-${move.to}`}
              rows={sorted}
              columns={[
                { header: t("moved.columns.keyword"), value: (row) => row.keyword },
                { header: t("moved.columns.was"), value: (row) => row.was },
                { header: t("moved.columns.now"), value: (row) => row.now },
                { header: t("moved.columns.volume"), value: (row) => row.volume },
                { header: t("closest.columns.page"), value: (row) => row.page },
              ]}
            />
          )}
        />}
        empty={{ icon: <Layers className="h-8 w-8 text-muted/30" />, label: t("moved.empty") }}
        footer={pager.footer}
        sort={tableSort}
        columns={[
          { key: "keyword", header: t("moved.columns.keyword"), sortable: true, className: CUT_COLUMN.first, cell: (row) => <RecordLinkCell cut href={recordHref({ kind: "keyword", keyword: row.keyword })}>{row.keyword}</RecordLinkCell> },
          { key: "was", header: t("moved.columns.was"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.was ?? "–"}</span> },
          { key: "now", header: t("moved.columns.now"), align: "right", sortable: true, cell: (row) => <PositionCell position={row.now} /> },
          { key: "volume", header: t("moved.columns.volume"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.volume)}</span> },
          {
            key: "page",
            header: t("closest.columns.page"),
            className: CUT_COLUMN.second,
            cell: (row) => (row.page ? <PageLinkCell href={recordHref({ kind: "page", page: row.page })} page={row.page} /> : <NoFigure />),
          },
        ]}
      />
    </div>
  );
}
