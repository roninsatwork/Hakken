"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Globe } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { PageSection } from "../../../../_components/PageSection";
import { ExternalUrlCell } from "../../../_components/SiteCells";
import { ListDownload } from "../../../_components/SiteDownloads";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSitePager } from "../../../_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../_components/useSiteSort";
import { FigureCell } from "../../local/_components/LocalParts";

type Kind = "DIRECTORY" | "REVIEWS" | "FORUM" | "NEWS" | "VIDEO" | "REFERENCE" | "WEBSITE" | "RIVAL" | "YOURS";
type Website = { host: string; kind: Kind; times: number; besideYou: number; besideRivals: number; rivalsBeside: number };
type Page = { url: string; host: string; kind: Kind; times: number; citedFor: string };

const KINDS = ["DIRECTORY", "NEWS", "FORUM", "REVIEWS", "RIVAL"] as const;
const THERE = ["missing", "there"] as const;
const SORTS: SiteSortColumns<Website, "website" | "times" | "you" | "rivals"> = {
  website: { value: (row) => row.host, first: "asc" },
  times: { value: (row) => row.times, first: "desc" },
  you: { value: (row) => row.besideYou, first: "desc" },
  rivals: { value: (row) => row.besideRivals, first: "desc" },
};
const PAGE_SORTS: SiteSortColumns<Page, "times"> = { times: { value: (row) => row.times, first: "desc" } };
const hostOf = (row: Website) => row.host;
const urlOf = (row: Page) => row.url;
/** A place to be: cited beside rivals, not beside the website. */
const missing = (row: Website) => row.kind !== "YOURS" && row.kind !== "RIVAL" && row.besideYou === 0 && row.besideRivals > 0;
const pathOf = (url: string) => {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname}`;
  } catch {
    return url;
  }
};

/**
 * Discovery → Brand radar → Websites AI cites (docs/plans/active/discovery-
 * local-reputation-ai-plan.md, step 4, D18; drawn as "Brand radar · Websites
 * AI cites"): the websites Google's AI answers quote beside the website and
 * its rivals, and whether the website is cited beside them — the places to
 * get listed or mentioned.
 */
export default function RadarSourcesPage() {
  const t = useTranslations("sites.radar.sources");
  const tr = useTranslations("sites.radar");
  const siteId = useSiteId();
  const site = useSite();
  const data = useQuery(api.siteBrandRadar.radarSources, { siteId });
  const [search, setSearch, term] = useSiteSearch();
  const [kind, setKind] = useSiteParam<(typeof KINDS)[number] | "">("kind", "", KINDS);
  const [there, setThere] = useSiteParam<(typeof THERE)[number] | "">("there", "", THERE);

  const matches = wordStartMatcher(term);
  const rows = data?.websites.filter((row) => (!kind || row.kind === kind) && (!there || (there === "missing" ? missing(row) : row.besideYou > 0)) && (!matches || matches(row.host))) as Website[] | undefined;
  const { rows: sorted, tableSort } = useSiteSortedList(rows, SORTS, { opening: "times", name: hostOf });
  const pager = useSitePager(sorted, { isLoading: data === undefined });
  const pagesSorted = useSiteSortedList(data?.pages as Page[] | undefined, PAGE_SORTS, { opening: "times", name: urlOf, table: "pages" });
  const pagesPager = useSitePager(pagesSorted.rows, { isLoading: data === undefined, table: "pages" });
  const all = (data?.websites ?? []) as Website[];
  const others = all.filter((row) => row.kind !== "YOURS" && row.kind !== "RIVAL");
  const thereWords = (row: Website) => {
    if (row.kind === "YOURS" || row.kind === "RIVAL") return "–";
    if (row.besideYou > 0) return t("there.beside", { count: row.besideYou });
    if (row.rivalsBeside > 0) return t("there.missing", { count: row.rivalsBeside });
    return "–";
  };
  const fileBase = `${site?.host ?? "site"}-websites-ai-cites`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Globe className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={t("description")}
        action={site ? <TagLabel>{tr("where", { place: site.placeLabel })}</TagLabel> : undefined}
      />

      {data ? (
        <FigureRow>
          <Figure label={t("figures.cited")} value={all.length} detail={<span className="text-secondary">{t("figures.citedDetail")}</span>} />
          <Figure label={t("figures.there")} value={others.filter((row) => row.besideYou > 0).length} detail={<span className="text-secondary">{t("figures.thereDetail")}</span>} />
          <Figure label={t("figures.missing")} emphasis value={others.filter(missing).length} detail={<span className="text-secondary">{t("figures.missingDetail")}</span>} />
          <Figure label={t("figures.own")} value={data.yourTimes} detail={<span className="text-secondary">{t("figures.ownDetail", { count: data.yourPages })}</span>} />
        </FigureRow>
      ) : null}

      <DataTable
        rows={pager.pageRows}
        rowKey={(row) => row.host}
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select chip={{ label: t("kindFilter"), choice: kind ? t(`kindFilters.${kind}`) : null }} value={kind} onChange={(value) => setKind(value as (typeof KINDS)[number] | "")}>
              <option value="">{t("everyKind")}</option>
              {KINDS.map((entry) => <option key={entry} value={entry}>{t(`kindFilters.${entry}`)}</option>)}
            </Select>
            <Select chip={{ label: t("thereFilter"), choice: there ? t(`thereFilters.${there}`) : null }} value={there} onChange={(value) => setThere(value as (typeof THERE)[number] | "")}>
              <option value="">{t("either")}</option>
              {THERE.map((entry) => <option key={entry} value={entry}>{t(`thereFilters.${entry}`)}</option>)}
            </Select>
          </>
        }
        cardHeader={<TableBar footer={pager.footer} noun="websites" actions={<ListDownload fileName={fileBase} rows={sorted ?? []} columns={[{ header: t("columns.website"), value: (row) => row.host }, { header: t("columns.kind"), value: (row) => t(`kinds.${row.kind}`) }, { header: t("columns.times"), value: (row) => row.times }, { header: t("columns.you"), value: (row) => row.besideYou }, { header: t("columns.rivals"), value: (row) => row.besideRivals }, { header: t("columns.there"), value: thereWords }]} />} />}
        empty={{ icon: <Globe className="h-8 w-8 text-muted/30" />, label: term || kind || there ? t("noMatch") : t("empty") }}
        footer={pager.footer}
        sort={tableSort}
        columns={[
          { key: "website", header: t("columns.website"), sortable: true, cell: (row) => <ExternalUrlCell url={`https://${row.host}`} label={row.host} /> },
          { key: "kind", header: t("columns.kind"), cell: (row) => <TagLabel>{t(`kinds.${row.kind}`)}</TagLabel> },
          { key: "times", header: t("columns.times"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.times} /> },
          { key: "you", header: t("columns.you"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.besideYou} /> },
          { key: "rivals", header: t("columns.rivals"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.besideRivals} /> },
          { key: "there", header: t("columns.there"), cell: (row) => <span className="whitespace-nowrap text-[12px] text-secondary">{thereWords(row)}</span> },
        ]}
      />

      <PageSection tight title={t("pagesTitle")} description={t("pagesDescription")}>
        <DataTable
          rows={pagesPager.pageRows}
          rowKey={(row) => row.url}
          cardHeader={<TableBar footer={pagesPager.footer} noun="pages"><span className="text-[13px] text-secondary">{t("topPages")}</span></TableBar>}
          empty={{ icon: <Globe className="h-8 w-8 text-muted/30" />, label: t("pagesEmpty") }}
          sort={pagesSorted.tableSort}
          columns={[
            { key: "page", header: t("columns.page"), cell: (row) => <ExternalUrlCell url={row.url} label={pathOf(row.url)} /> },
            { key: "whose", header: t("columns.whose"), cell: (row) => <TagLabel>{row.kind === "RIVAL" ? row.host : t(`kinds.${row.kind}`)}</TagLabel> },
            { key: "times", header: t("columns.times"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.times} /> },
            { key: "for", header: t("columns.for"), cell: (row) => <span className="text-[12px] text-secondary">{row.citedFor}</span> },
          ]}
        />
      </PageSection>
    </div>
  );
}
