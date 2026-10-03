"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { FileStack } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { CUT_COLUMN, RecordLinkCell } from "../../_components/SiteCells";
import { TableDownload } from "../../_components/SiteDownloads";
import { formatDay, formatNumber } from "../../_components/siteFormat";
import { useSiteRecordHref } from "../../_components/siteRecordLinks";
import { useSite, useSiteId } from "../../_components/useSite";
import { TABLE_PAGE_KEY, useSiteParam, useSiteSearch } from "../../_components/useSiteParam";
import { useSiteListPage } from "../../_components/useSitePagedTable";
import { useSiteSort } from "../../_components/useSiteSort";

/** The four figures, each a filter of the list: in the sitemap, crawled, shown by Google, ranking. */
const FIGURES = ["sitemap", "crawled", "shown", "ranking"] as const;

/** Where the sources disagree: the "Where it differs" filter's own choices. */
const GAPS = ["neverShown", "notInSitemap", "crawledNotInSitemap", "notCrawled"] as const;

type Filter = (typeof FIGURES)[number] | (typeof GAPS)[number];
const FILTERS: readonly Filter[] = [...GAPS, ...FIGURES];

/**
 * The columns that sort, over the whole list (docs/plans/active/
 * sites-table-sorting-plan.md): the address, the group and the sitemap file A
 * to Z, the most clicks first — the order the page opens on. Crawled, shown
 * and ranks are yes or no, so they do not sort.
 */
const SORTS = { page: "asc", group: "asc", file: "asc", clicks: "desc" } as const;

/** The Group filter's choice for pages no classification catches (`NOT_SORTED` in `convex/yourPages.ts`). */
const NOT_SORTED = "none";

/** Yes or no in a narrow column: a tick or a dash, the words for a screen reader — never colour alone. */
function YesNo({ yes, words }: { yes: boolean; words: { yes: string; no: string } }) {
  return yes
    ? <StatusLabel tone="success"><span className="sr-only">{words.yes}</span></StatusLabel>
    : <span className="text-[12px] text-muted"><span aria-hidden="true">–</span><span className="sr-only">{words.no}</span></span>;
}

/**
 * Your pages (Sites › Site; docs/plans/active/page-groups-plan.md, decision
 * 4, drawn on board 23): every page of the company's own website once —
 * whether its sitemap lists it, whether the crawl reached it, whether Google
 * showed it in Search Console's last 90 days, and whether it ranks — with the
 * four figures, each a filter, and the gaps between them.
 *
 * Paged, searched, filtered and sorted on the server from the list's compact
 * copy (`convex/yourPages.ts`), so the counts are exact over the whole list.
 * A page's group is the company's own classification of it, or "Not sorted";
 * until the website has any classification, Hakken's own kind of page. Each
 * row opens the page's own screen. On a competitor the page says it is for
 * the company's own websites, and leads to the one the competitor is
 * measured against.
 */
export default function SiteYourPagesPage() {
  const t = useTranslations("sites.yourPages");
  const tc = useTranslations("sites.common");
  const tt = useTranslations("sites.common.pageTypes");
  const siteId = useSiteId();
  const site = useSite();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const recordHref = useSiteRecordHref(siteId);
  const [search, setSearch, term] = useSiteSearch();
  const [filter, setFilter] = useSiteParam<Filter | "">("filter", "", FILTERS);
  const [group, setGroup] = useSiteParam<string>("group", "");
  const order = useSiteSort(SORTS, "clicks");

  const table = useSiteListPage(api.yourPages.listYourPages, {
    siteId,
    ...(term ? { search: term } : {}),
    ...(filter ? { filter } : {}),
    ...(group ? { group } : {}),
    sort: order.key,
    direction: order.direction,
  });
  const result = table.result;
  const summary = result?.summary ?? null;
  const byClassification = result?.groupBy === "CLASSIFICATION";

  // A website whose list was never built — added since, or not collected yet — asks for it once.
  const ensure = useMutation(api.yourPages.ensureYourPages);
  useEffect(() => {
    if (table.preparing) void ensure({ siteId }).catch(() => undefined);
  }, [table.preparing, ensure, siteId]);

  /** This page, narrowed to one figure: where each figure leads. */
  const figureHref = (key: Filter) => {
    const next = new URLSearchParams(params.toString());
    next.set("filter", key);
    next.delete(TABLE_PAGE_KEY);
    return `${pathname}?${next.toString()}`;
  };

  const kindLabel = (kind: string) => (tt.has(kind) ? tt(kind) : tt("OTHER"));
  const groupLabel = (value: string) => {
    if (value === NOT_SORTED) return t("notSorted");
    const found = result?.groups.find((entry) => entry.value === value);
    if (!found) return value;
    return byClassification ? found.label : kindLabel(found.label);
  };
  const yesNo = { yes: tc("yes"), no: t("no") };

  // A gap is offered only where both its sides were read: no sitemap, or no Search Console, makes it every page.
  const sitemapRead = Boolean(summary?.sitemapRead && summary.sitemapSource !== "NONE");
  const offered = (key: Filter) => {
    if (key === "neverShown" || key === "notInSitemap") return sitemapRead && Boolean(summary?.console);
    if (key === "crawledNotInSitemap" || key === "notCrawled") return sitemapRead;
    return true;
  };
  // Each choice with how many pages it holds: "In the sitemap, never shown by Google (6)".
  const filterOption = (key: Filter) => (
    <option key={key} value={key}>{`${t(`filters.options.${key}`)} (${formatNumber(summary?.[key])})`}</option>
  );

  if (result?.own === false) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader icon={<FileStack className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
        <Notice
          action={site?.ofSiteId && site.ofHost ? (
            <Link href={`/app/sites/${site.ofSiteId}/your-pages`} className="text-[12.5px] text-info hover:underline">
              {t("notices.competitorLink", { host: site.ofHost })}
            </Link>
          ) : undefined}
        >
          {t("notices.competitor")}
        </Notice>
      </div>
    );
  }

  const figureDetail: Record<(typeof FIGURES)[number], string> = {
    sitemap: !summary?.sitemapRead
      ? t("figures.sitemapNotRead")
      : summary.sitemapSource === "NONE"
        ? t("figures.sitemapNone")
        : t("figures.sitemapDetail", { count: summary.sitemapFiles }),
    crawled: summary?.crawlDay ? t("figures.crawledDetail") : t("figures.crawledNone"),
    shown: summary?.console ? t("figures.shownDetail") : t("figures.shownNotConnected"),
    ranking: t("figures.rankingDetail"),
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<FileStack className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />

      <FigureRow>
        {FIGURES.map((key) => (
          <Figure
            key={key}
            label={t(`figures.${key}`)}
            value={summary && (key !== "shown" || summary.console) ? formatNumber(summary[key]) : "–"}
            detail={<span className="text-secondary">{figureDetail[key]}</span>}
            href={summary ? figureHref(key) : undefined}
          />
        ))}
      </FigureRow>

      {summary && !summary.sitemapRead ? <Notice>{t("notices.notReadYet")}</Notice> : null}
      {summary?.sitemapSource === "NONE" ? <Notice tone="warning">{t("notices.noSitemap")}</Notice> : null}
      {summary?.sitemapCut ? (
        <Notice tone="warning">{t("notices.cut", { limit: formatNumber(summary.sitemapLimit), day: formatDay(summary.sitemapDay) })}</Notice>
      ) : null}
      {summary && sitemapRead && summary.sitemapFailed > 0 ? (
        <Notice>{t("notices.filesFailed", { count: summary.sitemapFailed })}</Notice>
      ) : null}

      <DataTable
        rows={table.pageRows}
        rowKey={(row) => row.page}
        onRowClick={(row) => router.push(recordHref({ kind: "page", page: row.page }))}
        minWidthClassName="min-w-[820px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select chip={{ label: t("filters.differs"), choice: filter ? t(`filters.options.${filter}`) : null }} value={filter} onChange={(value) => setFilter(value as Filter | "")}>
              <option value="">{t("filters.everyPage")}</option>
              {GAPS.filter((key) => offered(key) || key === filter).map(filterOption)}
              {FIGURES.map(filterOption)}
            </Select>
            <Select chip={{ label: t("filters.group"), choice: group ? groupLabel(group) : null }} value={group} onChange={setGroup}>
              <option value="">{t("filters.everyGroup")}</option>
              {(result?.groups ?? []).map((entry) => (
                <option key={entry.value} value={entry.value}>{byClassification ? entry.label : kindLabel(entry.label)}</option>
              ))}
              {byClassification ? <option value={NOT_SORTED}>{t("notSorted")}</option> : null}
            </Select>
          </>
        }
        cardHeader={
          <TableBar footer={table.footer} noun="pages" actions={<TableDownload siteId={siteId} kind="yourPages" sort={order.tableSort} />}>
            {summary && table.footer.totalCount !== summary.pages ? (
              <span className="text-[12px] text-secondary">{t("ofAll", { count: summary.pages })}</span>
            ) : null}
          </TableBar>
        }
        empty={{ icon: <FileStack className="h-8 w-8 text-muted/30" />, label: term || filter || group ? t("noMatch") : t("empty") }}
        footer={table.footer}
        sort={order.tableSort}
        columns={[
          {
            key: "page",
            header: t("columns.page"),
            sortable: true,
            className: CUT_COLUMN.first,
            cell: (row) => <RecordLinkCell cut href={recordHref({ kind: "page", page: row.page })} className="text-[12px] text-info">{row.page}</RecordLinkCell>,
          },
          {
            key: "group",
            header: t("columns.group"),
            sortable: true,
            cell: (row) => byClassification
              ? (row.group ? <TagLabel>{row.group}</TagLabel> : <StatusLabel tone="warning">{t("notSorted")}</StatusLabel>)
              : <TagLabel>{kindLabel(row.kind)}</TagLabel>,
          },
          {
            key: "file",
            header: t("columns.file"),
            sortable: true,
            cell: (row) => (row.file
              ? <span className="font-mono text-[12px] text-secondary">{row.file}</span>
              : <StatusLabel tone="warning">{t("notInSitemap")}</StatusLabel>),
          },
          { key: "crawled", header: t("columns.crawled"), className: "w-[84px] text-center", cell: (row) => <YesNo yes={row.crawled} words={yesNo} /> },
          { key: "shown", header: t("columns.shown"), className: "w-[96px] text-center", cell: (row) => <YesNo yes={row.shown} words={yesNo} /> },
          { key: "ranks", header: t("columns.ranks"), className: "w-[72px] text-center", cell: (row) => <YesNo yes={row.ranks} words={yesNo} /> },
          {
            key: "clicks",
            header: t("columns.clicks"),
            align: "right",
            sortable: true,
            cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.clicks)}</span>,
          },
        ]}
      />
      <p className="text-[12px] leading-relaxed text-secondary">{t("footnote")}</p>
    </div>
  );
}
