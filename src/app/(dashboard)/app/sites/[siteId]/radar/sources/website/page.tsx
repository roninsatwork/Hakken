"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Globe } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { SegmentedChoice } from "@/src/ui/components/screens/SettingsCard";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { CUT_COLUMN, ExternalUrlCell, RecordLinkCell } from "../../../../_components/SiteCells";
import { ListDownload } from "../../../../_components/SiteDownloads";
import { SiteSees } from "../../../../_components/SiteSees";
import { VisitLink } from "../../../../_components/VisitLink";
import { formatNumber } from "../../../../_components/siteFormat";
import { useRecordBack, useRecordKey, useSiteListHref, useSiteRecordHref } from "../../../../_components/siteRecordLinks";
import { useSite, useSiteId } from "../../../../_components/useSite";
import { useSitePager } from "../../../../_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../../_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../../_components/useSiteSort";
import { FigureCell } from "../../../local/_components/LocalParts";

type Question = { question: string; volume: number; named: Array<{ host: string; you: boolean }>; page: string | null };
type Page = { url: string; times: number; besideYou: number; besideRivals: number };
type Business = { host: string; you: boolean; on: "LINKS" | "NAMES" | "NOT_LINKED" | "UNKNOWN"; quotedBeside: number };

const VIEWS = ["questions", "pages", "who"] as const;
type View = (typeof VIEWS)[number];
const QUESTION_SORTS: SiteSortColumns<Question, "question" | "volume"> = {
  question: { value: (row) => row.question, first: "asc" },
  volume: { value: (row) => row.volume, first: "desc" },
};
const PAGE_SORTS: SiteSortColumns<Page, "page" | "times" | "you" | "rivals"> = {
  page: { value: (row) => row.url, first: "asc" },
  times: { value: (row) => row.times, first: "desc" },
  you: { value: (row) => row.besideYou, first: "desc" },
  rivals: { value: (row) => row.besideRivals, first: "desc" },
};
const WHO_SORTS: SiteSortColumns<Business, "business" | "beside"> = {
  business: { value: (row) => row.host, first: "asc" },
  beside: { value: (row) => row.quotedBeside, first: "desc" },
};
const ON_TONE = { LINKS: "success", NAMES: "success", NOT_LINKED: "warning" } as const;
/** An address without its scheme or "www.", as the tables show pages. */
const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "");

/**
 * Discovery → One website (docs/plans/active/discovery-detail-and-hakken-sees-
 * plan.md §3, DS2–DS3; drawn as "Detail · One website"): a website Google's
 * AI answers quote — how often beside the business and beside its rivals, the
 * questions it is quoted for, its pages, and who it links to. Opened from
 * Websites AI cites, Where to get listed, Your assets and Suggested
 * competitors; never as a modal.
 */
export default function OneWebsitePage() {
  const t = useTranslations("sites.websiteRecord");
  const tk = useTranslations("sites.radar.sources.kinds");
  const tr = useTranslations("sites.record");
  const siteId = useSiteId();
  const site = useSite();
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);
  const listHref = useSiteListHref(siteId);
  const back = useRecordBack("website");
  const asked = useRecordKey("website");
  const data = useQuery(api.siteRadarDetails.websiteDetail, asked ? { siteId, host: asked } : "skip");
  const [view, setView] = useSiteParam<View>("view", "questions", VIEWS);
  const [search, setSearch, term] = useSiteSearch();
  const matches = wordStartMatcher(term);

  const questions = useSiteSortedList(data?.questions.filter((row) => !matches || matches(row.question)), QUESTION_SORTS, { opening: "volume", name: (row) => row.question, table: "questions" });
  const questionsPager = useSitePager(questions.rows, { isLoading: data === undefined, table: "questions" });
  const pages = useSiteSortedList(data?.pages.filter((row) => !matches || matches(row.url)), PAGE_SORTS, { opening: "times", name: (row) => row.url, table: "pages" });
  const pagesPager = useSitePager(pages.rows, { isLoading: data === undefined, table: "pages" });
  const who = useSiteSortedList(data?.businesses.filter((row) => !matches || matches(row.host)), WHO_SORTS, { opening: "beside", name: (row) => row.host, table: "who" });
  const whoPager = useSitePager(who.rows, { isLoading: data === undefined, table: "who" });

  const icon = <Globe className="h-6 w-6 text-brand" />;
  if (!asked) return <DetailHeader back={back} icon={icon} title={t("missingTitle")} description={t("missingBody")} />;

  const host = data?.host ?? asked;
  const namedWords = (row: Question) => row.named.map((entry) => (entry.you ? t("you") : entry.host)).join(" · ") || "–";
  const onWords = (row: Business) => (row.on === "UNKNOWN" ? null : t(`on.${row.on}`));
  const fileBase = `${site?.host ?? "site"}-${host}`;
  const views = data ? (
    <SegmentedChoice
      size="compact"
      label={t("viewLabel")}
      value={view}
      onChange={(next) => setView(next)}
      options={[
        { value: "questions", label: t("views.questions", { count: data.questions.length }) },
        { value: "pages", label: t("views.pages", { count: data.pages.length }) },
        { value: "who", label: t("views.who", { count: data.businesses.length }) },
      ]}
    />
  ) : undefined;
  const searchBox = { value: search, onChange: setSearch, placeholder: t("searchPlaceholder") };

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        back={back}
        icon={icon}
        title={host}
        description={data ? t("description", { kind: tk(data.kind) }) : t("descriptionLoading")}
        pills={data
          ? data.namesYou > 0
            ? <StatusLabel tone="success">{t("labels.namesYou")}</StatusLabel>
            : data.linksTo.length > 0
              ? <StatusLabel tone="warning">{t("labels.rivalsNotYou", { count: data.linksTo.length })}</StatusLabel>
              : undefined
          : undefined}
        action={<VisitLink icon href={`https://${host}`}>{t("visit", { host })}</VisitLink>}
      />
      <SiteSees screen="website" seen={data?.seen} />

      {data === undefined ? (
        <div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" aria-label={tr("loading")} />
      ) : (
        <>
          <FigureRow>
            <Figure label={t("figures.besideRivals")} emphasis value={formatNumber(data.besideRivals)} detail={<span className="text-secondary">{t("figures.besideRivalsDetail", { you: formatNumber(data.besideYou) })}</span>} />
            <Figure label={t("figures.linksTo")} value={t("figures.linksToValue", { count: data.linksTo.length, of: data.rivals })} detail={<span className="text-secondary">{data.linksTo.length > 0 ? t("figures.linksToDetail") : t("figures.linksToNone")}</span>} />
            <Figure label={t("figures.questions")} value={formatNumber(data.questions.length)} detail={<span className="text-secondary">{t("figures.questionsDetail", { asks: formatNumber(data.asks) })}</span>} />
            <Figure label={t("figures.strength")} value={data.strength === null ? "–" : formatNumber(data.strength)} detail={<span className="text-secondary">{t("figures.strengthDetail")}</span>} />
          </FigureRow>

          {view === "questions" ? (
            <DataTable
              rows={questionsPager.pageRows}
              rowKey={(row) => row.question}
              views={views}
              search={searchBox}
              onRowClick={(row) => router.push(recordHref({ kind: "question", question: row.question }))}
              cardHeader={<TableBar footer={questionsPager.footer} noun="questions" actions={<ListDownload fileName={`${fileBase}-questions`} rows={questions.rows ?? []} columns={[{ header: t("columns.question"), value: (row) => row.question }, { header: t("columns.asked"), value: (row) => row.volume }, { header: t("columns.named"), value: namedWords }, { header: t("columns.page"), value: (row) => row.page }]} />} />}
              empty={{ icon: <Globe className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : t("questionsEmpty") }}
              footer={questionsPager.footer}
              sort={questions.tableSort}
              columns={[
                { key: "question", header: t("columns.question"), sortable: true, className: CUT_COLUMN.first, cell: (row) => <RecordLinkCell cut href={recordHref({ kind: "question", question: row.question })}>{row.question}</RecordLinkCell> },
                { key: "volume", header: t("columns.asked"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.volume} /> },
                { key: "named", header: t("columns.named"), cell: (row) => <span className="text-[12px] text-secondary">{namedWords(row)}</span> },
                { key: "page", header: t("columns.page"), className: CUT_COLUMN.second, cell: (row) => (row.page ? <ExternalUrlCell cut url={row.page} label={shortUrl(row.page)} /> : <NoFigure />) },
              ]}
            />
          ) : view === "pages" ? (
            <DataTable
              rows={pagesPager.pageRows}
              rowKey={(row) => row.url}
              views={views}
              search={searchBox}
              onRowClick={(row) => router.push(recordHref({ kind: "aiPage", url: row.url }))}
              cardHeader={<TableBar footer={pagesPager.footer} noun="pages" actions={<ListDownload fileName={`${fileBase}-pages`} rows={pages.rows ?? []} columns={[{ header: t("columns.page"), value: (row) => row.url }, { header: t("columns.times"), value: (row) => row.times }, { header: t("columns.besideYou"), value: (row) => row.besideYou }, { header: t("columns.besideRivals"), value: (row) => row.besideRivals }]} />} />}
              empty={{ icon: <Globe className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : t("pagesEmpty") }}
              footer={pagesPager.footer}
              sort={pages.tableSort}
              columns={[
                { key: "page", header: t("columns.page"), sortable: true, className: CUT_COLUMN.first, cell: (row) => <RecordLinkCell cut href={recordHref({ kind: "aiPage", url: row.url })} className="text-[12px] text-info">{shortUrl(row.url)}</RecordLinkCell> },
                { key: "times", header: t("columns.times"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.times} /> },
                { key: "you", header: t("columns.besideYou"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.besideYou} /> },
                { key: "rivals", header: t("columns.besideRivals"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.besideRivals} /> },
              ]}
            />
          ) : (
            <DataTable
              rows={whoPager.pageRows}
              rowKey={(row) => row.host}
              views={views}
              search={searchBox}
              rowClassName={(row) => (row.you ? "bg-brand/5" : "")}
              onRowClick={(row) => router.push(row.you ? listHref("local") : recordHref({ kind: "business", business: row.host }))}
              cardHeader={<TableBar footer={whoPager.footer} noun="businesses" actions={<ListDownload fileName={`${fileBase}-businesses`} rows={who.rows ?? []} columns={[{ header: t("columns.business"), value: (row) => (row.you ? t("youName", { name: row.host }) : row.host) }, { header: t("columns.on"), value: (row) => onWords(row) ?? "" }, { header: t("columns.beside"), value: (row) => row.quotedBeside }]} />} />}
              empty={{ icon: <Globe className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : t("whoEmpty") }}
              footer={whoPager.footer}
              sort={who.tableSort}
              columns={[
                { key: "business", header: t("columns.business"), sortable: true, cell: (row) => <RecordLinkCell href={row.you ? listHref("local") : recordHref({ kind: "business", business: row.host })}>{row.you ? t("youName", { name: row.host }) : row.host}</RecordLinkCell> },
                { key: "on", header: t("columns.on"), cell: (row) => (row.on === "UNKNOWN" ? <NoFigure /> : <StatusLabel tone={ON_TONE[row.on]}>{onWords(row)}</StatusLabel>) },
                { key: "beside", header: t("columns.beside"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.quotedBeside} /> },
              ]}
            />
          )}
        </>
      )}
    </div>
  );
}
