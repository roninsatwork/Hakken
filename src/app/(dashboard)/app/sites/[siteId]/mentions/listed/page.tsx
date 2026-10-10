"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { MapPinPlus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { ExternalUrlCell, RecordLinkCell } from "../../../_components/SiteCells";
import { useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { ListDownload } from "../../../_components/SiteDownloads";
import { useSite, useSiteId } from "../../../_components/useSite";
import { SiteSees } from "../../../_components/SiteSees";
import { useSitePager } from "../../../_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../_components/useSiteSort";
import { FigureCell } from "../../local/_components/LocalParts";

type Kind = "DIRECTORY" | "REVIEWS" | "NEWS" | "FORUM" | "VIDEO" | "REFERENCE" | "WEBSITE";
type Row = { host: string; kind: Kind; quoted: number; linksTo: string[]; rivals: string[]; strength: number | null; there: boolean };

const KINDS = ["DIRECTORY", "REVIEWS", "NEWS", "WEBSITE"] as const;
const STATUSES = ["missing", "there"] as const;
/** Best first: quoted by AI, and linking to more rivals. */
const worth = (row: Row) => row.quoted + row.linksTo.length * 10;
const SORTS: SiteSortColumns<Row, "website" | "best" | "rivals" | "strength"> = {
  website: { value: (row) => row.host, first: "asc" },
  best: { value: worth, first: "desc" },
  rivals: { value: (row) => row.rivals.length, first: "desc" },
  strength: { value: (row) => row.strength, first: "desc" },
};
const hostOf = (row: Row) => row.host;
/** Rivals named in a cell before it says how many. */
const RIVALS_NAMED = 3;

/**
 * Discovery → Web mentions → Where to get listed (docs/plans/active/
 * discovery-local-reputation-ai-plan.md, step 6, D18; drawn as "Web mentions
 * · Where to get listed"): the directories, review sites and press that
 * Google's AI answers quote or that link to two rivals or more, where the
 * rivals are and the business is not — best first.
 */
export default function WhereToGetListedPage() {
  const t = useTranslations("sites.mentions.listed");
  const tk = useTranslations("sites.radar.sources");
  const siteId = useSiteId();
  const site = useSite();
  const data = useQuery(api.siteWebMentions.whereToGetListed, { siteId });
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);
  // Each place opens One website (discovery-detail-and-hakken-sees-plan.md §4); Visit still leaves for it.
  const websiteHref = (row: Row) => recordHref({ kind: "website", host: row.host });
  const [search, setSearch, term] = useSiteSearch();
  const [kind, setKind] = useSiteParam<(typeof KINDS)[number] | "">("kind", "", KINDS);
  const [status, setStatus] = useSiteParam<(typeof STATUSES)[number] | "">("status", "missing", STATUSES);

  const all = (data?.rows ?? []) as Row[];
  const matches = wordStartMatcher(term);
  const rows = data ? all.filter((row) => (!kind || row.kind === kind) && (!status || (status === "there") === row.there) && (!matches || matches(row.host))) : undefined;
  const { rows: sorted, tableSort } = useSiteSortedList(rows, SORTS, { opening: "best", name: hostOf });
  const pager = useSitePager(sorted, { isLoading: data === undefined });
  const missing = all.filter((row) => !row.there);
  const why = (row: Row) => [row.quoted > 0 ? t("why.quoted", { count: row.quoted }) : null, row.linksTo.length > 0 ? t("why.links", { count: row.linksTo.length }) : null].filter(Boolean).join(" · ") || "–";
  const rivalsWords = (row: Row) => (row.rivals.length > RIVALS_NAMED ? t("rivalsCount", { count: row.rivals.length }) : row.rivals.join(" · ") || "–");
  const fileBase = `${site?.host ?? "site"}-where-to-get-listed`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<MapPinPlus className="h-6 w-6 text-brand" />} title={t("title")} description={t("description")} />
      <SiteSees screen="mentionsListed" seen={data?.seen} />

      {data ? (
        <FigureRow>
          <Figure label={t("figures.places")} emphasis value={missing.length} detail={<span className="text-secondary">{t("figures.placesDetail")}</span>} />
          <Figure label={t("figures.quoted")} value={missing.filter((row) => row.quoted > 0).length} detail={<span className="text-secondary">{t("figures.quotedDetail")}</span>} />
          <Figure label={t("figures.links", { count: 2 })} value={missing.filter((row) => row.linksTo.length >= 2).length} detail={<span className="text-secondary">{t("figures.linksDetail")}</span>} />
          <Figure label={t("figures.there")} value={all.filter((row) => row.there).length} detail={<span className="text-secondary">{t("figures.thereDetail")}</span>} />
        </FigureRow>
      ) : null}

      <DataTable
        rows={pager.pageRows}
        rowKey={hostOf}
        onRowClick={(row) => router.push(websiteHref(row))}
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select chip={{ label: t("kindFilter"), choice: kind ? t(`kindFilters.${kind}`) : null }} value={kind} onChange={(value) => setKind(value as (typeof KINDS)[number] | "")}>
              <option value="">{t("everyKind")}</option>
              {KINDS.map((entry) => <option key={entry} value={entry}>{t(`kindFilters.${entry}`)}</option>)}
            </Select>
            <Select chip={{ label: t("statusFilter"), choice: status ? t(`statuses.${status}`) : null }} value={status} onChange={(value) => setStatus(value as (typeof STATUSES)[number] | "")}>
              <option value="">{t("everyStatus")}</option>
              {STATUSES.map((entry) => <option key={entry} value={entry}>{t(`statuses.${entry}`)}</option>)}
            </Select>
          </>
        }
        cardHeader={<TableBar footer={pager.footer} noun="places" actions={<ListDownload fileName={fileBase} rows={sorted ?? []} columns={[{ header: t("columns.website"), value: (row) => row.host }, { header: t("columns.kind"), value: (row) => tk(`kinds.${row.kind}`) }, { header: t("columns.why"), value: why }, { header: t("columns.rivals"), value: (row) => row.rivals.join(" · ") }, { header: t("columns.strength"), value: (row) => row.strength }]} />}><span className="text-[13px] text-secondary">{t("bestFirst")}</span></TableBar>}
        empty={{ icon: <MapPinPlus className="h-8 w-8 text-muted/30" />, label: term || kind || status ? t("noMatch") : t("empty") }}
        footer={pager.footer}
        sort={tableSort}
        columns={[
          { key: "website", header: t("columns.website"), sortable: true, cell: (row) => <RecordLinkCell href={websiteHref(row)}>{row.host}</RecordLinkCell> },
          { key: "kind", header: t("columns.kind"), cell: (row) => <TagLabel>{tk(`kinds.${row.kind}`)}</TagLabel> },
          { key: "best", header: t("columns.why"), sortable: true, cell: (row) => <span className="text-[12px] text-secondary">{why(row)}</span> },
          { key: "rivals", header: t("columns.rivals"), sortable: true, cell: (row) => <span className="text-[12px] text-secondary">{rivalsWords(row)}</span> },
          { key: "strength", header: t("columns.strength"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.strength} /> },
          { key: "actions", header: t("columns.actions"), cell: (row) => <ExternalUrlCell url={`https://${row.host}`} label={t("visit")} /> },
        ]}
      />
    </div>
  );
}
