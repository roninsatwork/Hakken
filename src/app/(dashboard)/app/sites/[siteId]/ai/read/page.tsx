"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BookOpenCheck } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { RecordLinkCell } from "../../../_components/SiteCells";
import { useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { ListDownload } from "../../../_components/SiteDownloads";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSitePager } from "../../../_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../_components/useSiteSort";
import { FigureCell } from "../../local/_components/LocalParts";

type Row = { page: string; url: string; whose: "YOURS" | "RIVAL" | "OTHER"; host: string; read: number; cited: number };

const WHOSE = ["YOURS", "RIVAL", "OTHER"] as const;
const SORTS: SiteSortColumns<Row, "page" | "read" | "cited" | "wins"> = {
  page: { value: (row) => row.page, first: "asc" },
  read: { value: (row) => row.read, first: "desc" },
  cited: { value: (row) => row.cited, first: "desc" },
  wins: { value: (row) => (row.read > 0 ? row.cited / row.read : null), first: "desc" },
};
const pageOf = (row: Row) => row.page;
const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);

/**
 * Discovery → AI answers → Read but not cited (docs/plans/active/discovery-
 * local-reputation-ai-plan.md, step 3, D5, D18; drawn as "AI answers · Read
 * but not cited"): the pages the ChatGPT app opened while answering the
 * website's questions, and how often it then quoted each — a page read but
 * not cited was in the running and lost.
 */
export default function ReadNotCitedPage() {
  const t = useTranslations("sites.aiApps.read");
  const siteId = useSiteId();
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);
  const site = useSite();
  const data = useQuery(api.siteAiApps.readNotCited, { siteId });
  const [search, setSearch, term] = useSiteSearch();
  const [whose, setWhose] = useSiteParam<(typeof WHOSE)[number] | "">("whose", "", WHOSE);

  const matches = wordStartMatcher(term);
  const rows = data?.rows.filter((row) => (!whose || row.whose === whose) && (!matches || matches(row.page)));
  const { rows: sorted, tableSort } = useSiteSortedList(rows, SORTS, { opening: "read", name: pageOf });
  const pager = useSitePager(sorted, { isLoading: data === undefined });
  const yours = (data?.rows ?? []).filter((row) => row.whose === "YOURS");
  const rivals = (data?.rows ?? []).filter((row) => row.whose === "RIVAL");
  const readYours = yours.reduce((sum, row) => sum + row.read, 0);
  const citedYours = yours.reduce((sum, row) => sum + row.cited, 0);
  const rivalsShare = share(rivals.reduce((sum, row) => sum + row.cited, 0), rivals.reduce((sum, row) => sum + row.read, 0));
  const least = [...yours].sort((left, right) => (right.read - right.cited) - (left.read - left.cited))[0];
  const whoseWords = (row: Row) => (row.whose === "YOURS" ? t("whose.YOURS") : row.host);
  const fileBase = `${site?.host ?? "site"}-read-not-cited`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<BookOpenCheck className="h-6 w-6 text-brand" />} title={t("title")} description={t("description")} />

      {data ? (
        <FigureRow>
          <Figure label={t("figures.read")} value={readYours} detail={<span className="text-secondary">{t("figures.readDetail", { count: data.questions })}</span>} />
          <Figure
            label={t("figures.cited")}
            emphasis
            value={share(citedYours, readYours) === null ? "–" : `${share(citedYours, readYours)}%`}
            detail={<span className="text-secondary">{[t("figures.citedOf", { count: citedYours, of: readYours }), rivalsShare === null ? null : t("figures.rivalsShare", { share: rivalsShare })].filter(Boolean).join(" · ")}</span>}
          />
          <Figure label={t("figures.least")} value={least ? new URL(least.url).pathname : "–"} detail={<span className="text-secondary">{least ? t("figures.leastDetail", { read: least.read, cited: least.cited }) : t("figures.noneRead")}</span>} />
          <Figure label={t("figures.beats")} value={data.beatsYou?.host ?? "–"} detail={<span className="text-secondary">{data.beatsYou ? t("figures.beatsDetail", { count: data.beatsYou.answers }) : t("figures.noneRead")}</span>} />
        </FigureRow>
      ) : null}

      <DataTable
        rows={pager.pageRows}
        rowKey={(row) => row.page}
        // Each page opens One page: every answer that read it, and what won in its place (discovery-detail-and-hakken-sees-plan.md §4).
        onRowClick={(row) => router.push(recordHref({ kind: "aiPage", url: row.url }))}
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <Select chip={{ label: t("whoseFilter"), choice: whose ? t(`whoseFilters.${whose}`) : null }} value={whose} onChange={(value) => setWhose(value as (typeof WHOSE)[number] | "")}>
            <option value="">{t("everyone")}</option>
            {WHOSE.map((entry) => <option key={entry} value={entry}>{t(`whoseFilters.${entry}`)}</option>)}
          </Select>
        }
        cardHeader={<TableBar footer={pager.footer} noun="pages" actions={<ListDownload fileName={fileBase} rows={sorted ?? []} columns={[{ header: t("columns.page"), value: (row) => row.url }, { header: t("columns.whose"), value: whoseWords }, { header: t("columns.read"), value: (row) => row.read }, { header: t("columns.cited"), value: (row) => row.cited }, { header: t("columns.wins"), value: (row) => share(row.cited, row.read) }]} />} />}
        empty={{ icon: <BookOpenCheck className="h-8 w-8 text-muted/30" />, label: term || whose ? t("noMatch") : t("empty") }}
        footer={pager.footer}
        sort={tableSort}
        columns={[
          { key: "page", header: t("columns.page"), sortable: true, cell: (row) => <RecordLinkCell href={recordHref({ kind: "aiPage", url: row.url })} className="text-[12px] text-info">{row.page}</RecordLinkCell> },
          { key: "whose", header: t("columns.whose"), cell: (row) => <TagLabel>{whoseWords(row)}</TagLabel> },
          { key: "read", header: t("columns.read"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.read} /> },
          { key: "cited", header: t("columns.cited"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.cited} /> },
          { key: "wins", header: t("columns.wins"), align: "right", sortable: true, cell: (row) => <FigureCell value={share(row.cited, row.read)} text={`${share(row.cited, row.read) ?? 0}%`} /> },
        ]}
      />
    </div>
  );
}
